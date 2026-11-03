// 현장관리_빈칸 n8n 흐름 JSON 을 만든다: node n8n/site_fill/build.js > n8n/site_fill/workflow.json
// 시공 1주 전 빈칸(공동현관·세대 비번·화장실·필름) 찾기 + 업체 답을 현장관리 앱에 넣는 우편함 (카톡 '비서' 4단계, 10/31).
// 우편함 넣기·꺼내기가 같은 저장 공간(staticData)을 써야 해서 한 흐름. 설계 docs/superpowers/specs/2026-10-31-현장빈칸-design.md
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const KEY = { httpHeaderAuth: { id: 'Tm4pgTszEk1zUiQ8', name: '사장님 열쇠' } };
const AIR = { airtableTokenApi: { id: 'J5wefJCMalpjjm3Q', name: 'Airtable Personal Access Token account 2' } };
const API = 'https://api.airtable.com/v0/apprglBOGXhKQN4cl/';
const CORS = { responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }] } };

const hook = (id, name, p, webhookId, y) => ({
  id, name, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, y], webhookId,
  parameters: { httpMethod: 'POST', path: p, responseMode: 'responseNode', authentication: 'headerAuth', options: { allowedOrigins: '*' } },
  credentials: KEY,
});
const code = (id, name, file, x, y) => ({ id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x, y], parameters: { mode: 'runOnceForAllItems', jsCode: read(file) } });
const answer = (id, name, x, y) => ({
  id, name, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [x, y],
  parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: CORS },
});
// fields[] 를 여러 번 주면 n8n 이 하나만 보내 data 가 빠진다 (10/31) → 모든 칸을 받는다 (현장 40여 줄이라 괜찮음)
const airRead = (id, name, table, formula, x, y) => ({
  id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x, y], executeOnce: true, credentials: AIR,
  parameters: {
    method: 'GET', url: API + encodeURIComponent(table), authentication: 'predefinedCredentialType', nodeCredentialType: 'airtableTokenApi',
    sendQuery: true,
    queryParameters: { parameters: [{ name: 'filterByFormula', value: formula }, { name: 'pageSize', value: '100' }] },
    options: { pagination: { pagination: {
      paginationMode: 'updateAParameterInEachRequest',
      parameters: { parameters: [{ type: 'qs', name: 'offset', value: '={{ $response.body.offset }}' }] },
      paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.offset }}',
    } } },
  },
});

const workflow = {
  name: '현장관리_빈칸',
  nodes: [
    hook('w1', '빈칸요청', 'site-gaps', '8a3e51c2-7d4b-4f19-9c6e-2b5a0d7e1f34', 0),
    airRead('a1', '현장읽기', '현장', "AND(NOT({삭제}), IS_AFTER(DATETIME_PARSE({시작날짜}), DATEADD(TODAY(), -2, 'days')))", 220, 0),
    airRead('a2', '거래처읽기', '거래처', 'NOT({삭제})', 440, 0),
    airRead('a3', '설정읽기', '설정', 'NOT({삭제})', 550, 150),   // 업체 확인 질문 (앱 설정, 2026-11-01)
    code('c1', '빈칸고르기', 'gaps.js', 660, 0),
    answer('r1', '빈칸응답', 880, 0),
    hook('w2', '우편함넣기요청', 'site-fill', '4c9d2e7a-1b3f-4a85-b6d0-9e8f7a6b5c41', 300),
    code('c2', '우편함넣기', 'put.js', 220, 300),
    answer('r2', '넣기응답', 440, 300),
    hook('w3', '우편함꺼내기요청', 'site-fill-take', '2f7b4a1d-6e3c-4b92-8a5f-0c1d2e3f4a57', 600),
    code('c3', '우편함꺼내기', 'take.js', 220, 600),
    answer('r3', '꺼내기응답', 440, 600),
    hook('w4', '내역요청', 'work-log', '5d1c8e3f-9a27-4b6c-8f40-7e2a1b9c3d68', 900),   // 📋 업무 내역 (11/4)
    code('c4', '내역', 'worklog.js', 220, 900),
    answer('r4', '내역응답', 440, 900),
  ],
  connections: {
    빈칸요청: { main: [[{ node: '현장읽기', type: 'main', index: 0 }]] },
    현장읽기: { main: [[{ node: '거래처읽기', type: 'main', index: 0 }]] },
    거래처읽기: { main: [[{ node: '설정읽기', type: 'main', index: 0 }]] },
    설정읽기: { main: [[{ node: '빈칸고르기', type: 'main', index: 0 }]] },
    빈칸고르기: { main: [[{ node: '빈칸응답', type: 'main', index: 0 }]] },
    우편함넣기요청: { main: [[{ node: '우편함넣기', type: 'main', index: 0 }]] },
    우편함넣기: { main: [[{ node: '넣기응답', type: 'main', index: 0 }]] },
    우편함꺼내기요청: { main: [[{ node: '우편함꺼내기', type: 'main', index: 0 }]] },
    우편함꺼내기: { main: [[{ node: '꺼내기응답', type: 'main', index: 0 }]] },
    내역요청: { main: [[{ node: '내역', type: 'main', index: 0 }]] },
    내역: { main: [[{ node: '내역응답', type: 'main', index: 0 }]] },
  },
  // 앱이 5분마다 부르고, 우편함엔 비번이 들어가므로 성공 실행은 저장하지 않는다
  settings: { executionOrder: 'v1', saveDataSuccessExecution: 'none' },
};
process.stdout.write(JSON.stringify(workflow, null, 2));
