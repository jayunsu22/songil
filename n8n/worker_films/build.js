// 기사앱_필름번호 n8n 흐름 JSON 을 만든다: node n8n/worker_films/build.js > n8n/worker_films/workflow.json
// 기사 앱 품목 이름 옆 필름 번호 (사장님 11/16). GET worker-films?code=<현장업무 id> → { ok, films: [{place, code}], quote: [{품목명, 자재명}] }
// 시험 node n8n/worker_films/test.js
const fs = require('fs');
const path = require('path');
const AIR = { airtableTokenApi: { id: 'J5wefJCMalpjjm3Q', name: 'Airtable Personal Access Token account 2' } };
const CORS = { responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }] } };
// 현장관리 앱 백업 — 그 현장업무에 연결된 현장 (data 에 "adminId":"rec…")
const SITE_FORMULA = '={{ "FIND(\'\\"adminId\\":\\"" + String(($json.query || {}).code || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 40) + "\\"\', {data})" }}';
const workflow = {
  name: '기사앱_필름번호',
  nodes: [
    {
      id: 'w', name: '필름요청', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: '5a1d7c3e-8b2f-4e69-a0d4-3f6b9c1e7a52',
      parameters: { httpMethod: 'GET', path: 'worker-films', responseMode: 'responseNode', options: { allowedOrigins: '*' } },
    },
    {
      id: 'a1', name: '현장읽기', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [220, 0], executeOnce: true, alwaysOutputData: true, continueOnFail: true, credentials: AIR,
      parameters: { method: 'GET', url: 'https://api.airtable.com/v0/apprglBOGXhKQN4cl/' + encodeURIComponent('현장'), authentication: 'predefinedCredentialType', nodeCredentialType: 'airtableTokenApi',
        sendQuery: true, queryParameters: { parameters: [{ name: 'filterByFormula', value: SITE_FORMULA }, { name: 'pageSize', value: '20' }] }, options: { timeout: 20000 } },
    },
    {
      // 정산견적 표 — 최근 발행 50장 (링크 칸으로는 거를 수 없어 가져와서 거른다)
      id: 'a2', name: '견적읽기', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [440, 0], executeOnce: true, alwaysOutputData: true, continueOnFail: true, credentials: AIR,
      parameters: { method: 'GET', url: 'https://api.airtable.com/v0/appV2Qy61YVhyRkZV/tblx0TAdgkepUdiTz', authentication: 'predefinedCredentialType', nodeCredentialType: 'airtableTokenApi',
        sendQuery: true, queryParameters: { parameters: [
          { name: 'pageSize', value: '50' }, { name: 'sort[0][field]', value: '발행일시' }, { name: 'sort[0][direction]', value: 'desc' },
          { name: 'fields[]', value: '현장' }, { name: 'fields[]', value: '발행일시' }, { name: 'fields[]', value: '스냅샷' },
        ] }, options: { timeout: 20000 } },
    },
    { id: 'c', name: '정리', type: 'n8n-nodes-base.code', typeVersion: 2, position: [660, 0],
      parameters: { mode: 'runOnceForAllItems', jsCode: fs.readFileSync(path.join(__dirname, 'run.js'), 'utf8') } },
    { id: 'o', name: '응답', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [880, 0],
      parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: CORS } },
  ],
  connections: {
    필름요청: { main: [[{ node: '현장읽기', type: 'main', index: 0 }]] },
    현장읽기: { main: [[{ node: '견적읽기', type: 'main', index: 0 }]] },
    견적읽기: { main: [[{ node: '정리', type: 'main', index: 0 }]] },
    정리: { main: [[{ node: '응답', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1', timezone: 'Asia/Seoul', saveDataSuccessExecution: 'none' },
};
process.stdout.write(JSON.stringify(workflow, null, 2));
