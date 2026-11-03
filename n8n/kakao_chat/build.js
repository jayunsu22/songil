// 카톡_대화 n8n 흐름 JSON 을 만든다: node n8n/kakao_chat/build.js > n8n/kakao_chat/workflow.json
// 앱 🤖 비서 화면 ↔ Gemini. 저장 없음 — 대화·현장 상태는 앱이 매번 보낸다 (사장님 11/4).
// 설계 docs/superpowers/specs/2026-11-04-대화형비서-design.md · 시험 node n8n/kakao_chat/test.js
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const OWNER = { httpHeaderAuth: { id: 'Tm4pgTszEk1zUiQ8', name: '사장님 열쇠' } };
const GEM = { googlePalmApi: { id: 'DVT2g7GvXhSY4Y4b', name: 'Google Gemini(PaLM) Api account' } };
const code = (id, name, file, x) => ({ id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x, 0],
  parameters: { mode: 'runOnceForAllItems', jsCode: read(file) } });
const c = (n) => [[{ node: n, type: 'main', index: 0 }]];
const workflow = {
  name: '카톡_대화',
  nodes: [
    {
      id: 'w', name: '대화요청', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: '7e2d4b19-6c83-4a5f-9d17-3b8f0c6e2a51',
      parameters: { httpMethod: 'POST', path: 'kakao-chat', responseMode: 'responseNode', authentication: 'headerAuth', options: { allowedOrigins: '*' } },
      credentials: OWNER,
    },
    code('p', '프롬프트', 'prompt.js', 220),
    {
      id: 'g', name: 'Gemini', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [440, 0], continueOnFail: true, credentials: GEM,
      parameters: {
        method: 'POST', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json',
        jsonBody: "={{ JSON.stringify({ systemInstruction: { parts: [{ text: $json.system }] }, contents: $json.contents, generationConfig: { temperature: 0.4, responseMimeType: 'application/json' } }) }}",
        options: { timeout: 60000 },
      },
    },
    code('r', '결과정리', 'result.js', 660),
    { id: 'o', name: '응답', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [880, 0],
      parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}',
        options: { responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }] } } } },
  ],
  connections: { 대화요청: { main: c('프롬프트') }, 프롬프트: { main: c('Gemini') }, Gemini: { main: c('결과정리') }, 결과정리: { main: c('응답') } },
  settings: { executionOrder: 'v1', timezone: 'Asia/Seoul' },
};
process.stdout.write(JSON.stringify(workflow, null, 2));
