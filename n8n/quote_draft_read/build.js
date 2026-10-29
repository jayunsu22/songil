// 견적초안_읽기 n8n 흐름 JSON 을 만든다: node n8n/quote_draft_read/build.js [--auth]
// 노드 코드는 같은 폴더의 prompt.js · result.js 가 원본이다 (n8n 에서 고치지 말고 여기서 고쳐 다시 올린다).
// --auth 를 붙이면 webhook 에 사장님 열쇠(headerAuth)를 건다. 처음엔 열쇠 없이 시험하고 나서 켠다.
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const auth = process.argv.includes('--auth');

const webhook = {
  id: 'w', name: '받은요청', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0],
  webhookId: 'b7d2e4a1-3c58-4f9e-a6b0-2d1c9e8f7a43',
  parameters: Object.assign({ httpMethod: 'POST', path: 'quote-draft-read', responseMode: 'responseNode', options: { allowedOrigins: '*' } },
    auth ? { authentication: 'headerAuth' } : {}),
};
if (auth) webhook.credentials = { httpHeaderAuth: { id: 'Tm4pgTszEk1zUiQ8', name: '사장님 열쇠' } };

const workflow = {
  name: '견적초안_읽기',
  nodes: [
    webhook,
    {
      id: 'a', name: '동의어_조회', type: 'n8n-nodes-base.airtable', typeVersion: 2.1, position: [220, 0], alwaysOutputData: true,
      parameters: {
        operation: 'search',
        base: { __rl: true, value: 'appAMNZv9V41mNjsY', mode: 'list', cachedResultName: '자동견적_MVP2' },
        table: { __rl: true, value: 'tblq06KeU2IK9HmSg', mode: 'list', cachedResultName: '시공품목정보' },
        returnAll: true, options: { fields: ['시공_품목명', '동의어'] },
      },
      credentials: { airtableTokenApi: { id: 'J5wefJCMalpjjm3Q', name: 'Airtable Personal Access Token account 2' } },
    },
    { id: 'p', name: '프롬프트', type: 'n8n-nodes-base.code', typeVersion: 2, position: [440, 0], parameters: { mode: 'runOnceForAllItems', jsCode: read('prompt.js') } },
    {
      id: 'g', name: 'Gemini', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [660, 0], continueOnFail: true,
      parameters: {
        method: 'POST', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json',
        jsonBody: "={{ JSON.stringify({ contents: [{ role: 'user', parts: [{ text: $json.prompt }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }) }}",
        options: { timeout: 90000 },
      },
      credentials: { googlePalmApi: { id: 'DVT2g7GvXhSY4Y4b', name: 'Google Gemini(PaLM) Api account' } },
    },
    { id: 'c', name: '결과정리', type: 'n8n-nodes-base.code', typeVersion: 2, position: [880, 0], parameters: { mode: 'runOnceForAllItems', jsCode: read('result.js') } },
    {
      id: 'r', name: '응답', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [1100, 0],
      parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: { responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }] } } },
    },
  ],
  connections: {
    받은요청: { main: [[{ node: '동의어_조회', type: 'main', index: 0 }]] },
    동의어_조회: { main: [[{ node: '프롬프트', type: 'main', index: 0 }]] },
    프롬프트: { main: [[{ node: 'Gemini', type: 'main', index: 0 }]] },
    Gemini: { main: [[{ node: '결과정리', type: 'main', index: 0 }]] },
    결과정리: { main: [[{ node: '응답', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1' },
};
process.stdout.write(JSON.stringify(workflow, null, 2));
