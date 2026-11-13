// 카톡_비서 n8n 흐름 JSON 을 만든다: node n8n/kakao_assist/build.js > n8n/kakao_assist/workflow.json
// 노트북 카톡 읽기가 업체 방 새 글을 보내면(물어보지 않은 방도) Gemini 가 현장 정보·잔금·답장을 판단 (사장님 11/4 '능동 비서').
// 설계 docs/superpowers/specs/2026-11-04-능동비서-design.md · 시험 node n8n/kakao_assist/test.js
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const OWNER = { httpHeaderAuth: { id: 'Tm4pgTszEk1zUiQ8', name: '사장님 열쇠' } };
const AIR = { airtableTokenApi: { id: 'J5wefJCMalpjjm3Q', name: 'Airtable Personal Access Token account 2' } };
const GEM = { googlePalmApi: { id: 'DVT2g7GvXhSY4Y4b', name: 'Google Gemini(PaLM) Api account' } };
// 🗣 사장님 말투 (11/12): 사장님_말투 에서 평소·AS 예시를 받아 AI 에 묻기 전에 붙인다. 못 받아도 그대로 돈다
const toneFetch = (x) => ({
  id: 'tf', name: '말투가져오기', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x, 200], continueOnFail: true, alwaysOutputData: true, executeOnce: true, credentials: OWNER,
  parameters: { method: 'POST', url: 'https://primary-production-a6fa.up.railway.app/webhook/kakao-tone', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify({ action: "examples", n: 30, nAs: 12 }) }}', options: { timeout: 8000 } },
});
const toneAttach = (x, field) => ({
  id: 'ta', name: '말투붙이기', type: 'n8n-nodes-base.code', typeVersion: 2, position: [x, 200],
  parameters: { mode: 'runOnceForAllItems', jsCode: fs.readFileSync(path.join(__dirname, '..', 'kakao_tone', 'block.js'), 'utf8') + '\n' +
    "const p = $('프롬프트').first().json;\nlet t = {};\ntry { t = $('말투가져오기').first().json || {}; } catch (e) { t = {}; }\nconst block = toneBlock(t);\n" +
    (field === 'system'
      ? "return [{ json: Object.assign({}, p, { system: p.system + block }) }];"
      : "const mark = '\\n[그 방 최근 대화';\nconst i = String(p.prompt).indexOf(mark);\nreturn [{ json: Object.assign({}, p, { prompt: i < 0 ? p.prompt + block : p.prompt.slice(0, i) + block + p.prompt.slice(i) }) }];") },
});
const API = 'https://api.airtable.com/v0/apprglBOGXhKQN4cl/';
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
const code = (id, name, file, x) => ({ id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x, 0],
  parameters: { mode: 'runOnceForAllItems', jsCode: read(file) } });
const c = (n) => [[{ node: n, type: 'main', index: 0 }]];
const workflow = {
  name: '카톡_비서',
  nodes: [
    {
      id: 'w', name: '비서요청', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: '9c4e1a7b-2d58-4f36-8e0b-5a3c7d1e9f42',
      parameters: { httpMethod: 'POST', path: 'kakao-assist', responseMode: 'responseNode', authentication: 'headerAuth', options: {} },
      credentials: OWNER,
    },
    airRead('a1', '현장읽기', '현장', "AND(NOT({삭제}), IS_AFTER(DATETIME_PARSE({시작날짜}), DATEADD(TODAY(), -50, 'days')))", 220, 0),
    airRead('a2', '거래처읽기', '거래처', 'NOT({삭제})', 440, 0),
    code('p', '프롬프트', 'prompt.js', 660),
    toneFetch(660), toneAttach(770, 'prompt'),
    {
      id: 'g', name: 'Gemini', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [880, 0], continueOnFail: true, credentials: GEM,
      parameters: {
        method: 'POST', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json',
        jsonBody: "={{ JSON.stringify({ contents: [{ role: 'user', parts: [{ text: $json.prompt }] }], generationConfig: { temperature: 0.3, responseMimeType: 'application/json' } }) }}",
        options: { timeout: 90000 },
      },
    },
    code('r', '결과정리', 'result.js', 1100),
    { id: 'o', name: '응답', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [1320, 0],
      parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: {} } },
  ],
  connections: { 비서요청: { main: c('현장읽기') }, 현장읽기: { main: c('거래처읽기') }, 거래처읽기: { main: c('프롬프트') },
    프롬프트: { main: c('말투가져오기') }, 말투가져오기: { main: c('말투붙이기') }, 말투붙이기: { main: c('Gemini') }, Gemini: { main: c('결과정리') }, 결과정리: { main: c('응답') } },
  settings: { executionOrder: 'v1', timezone: 'Asia/Seoul' },
};
process.stdout.write(JSON.stringify(workflow, null, 2));
