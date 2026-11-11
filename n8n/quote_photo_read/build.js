// 견적사진_읽기 n8n 흐름 JSON: node n8n/quote_photo_read/build.js > n8n/quote_photo_read/workflow.json · 시험 node n8n/quote_photo_read/test.js
// 방문견적 › 📷 사진으로 견적 (2026-11-11): 업자가 보낸 사진(위치·필름·메모 글씨) → 품목·수량·필름·메모.
// 노드 코드는 prompt.js · result.js 가 원본. 사장님 열쇠(headerAuth) 필수.
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

const workflow = {
  name: '견적사진_읽기',
  nodes: [
    {
      id: 'w', name: '받은사진', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0],
      webhookId: 'e81f4c2a-6d3b-4a97-b5e0-1c9d7f3a2b68',
      parameters: { httpMethod: 'POST', path: 'quote-photo-read', responseMode: 'responseNode', authentication: 'headerAuth', options: { allowedOrigins: '*' } },
      credentials: { httpHeaderAuth: { id: 'Tm4pgTszEk1zUiQ8', name: '사장님 열쇠' } },
    },
    { id: 'p', name: '프롬프트', type: 'n8n-nodes-base.code', typeVersion: 2, position: [220, 0], parameters: { mode: 'runOnceForAllItems', jsCode: read('prompt.js') } },
    {
      id: 'g', name: 'Gemini', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [440, 0], continueOnFail: true,
      parameters: {
        method: 'POST', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json',
        jsonBody: '={{ JSON.stringify($json.gemini) }}', options: { timeout: 120000 },
      },
      credentials: { googlePalmApi: { id: 'DVT2g7GvXhSY4Y4b', name: 'Google Gemini(PaLM) Api account' } },
    },
    { id: 'c', name: '결과정리', type: 'n8n-nodes-base.code', typeVersion: 2, position: [660, 0], parameters: { mode: 'runOnceForAllItems', jsCode: read('result.js') } },
    {
      id: 'r', name: '응답', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [880, 0],
      parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: { responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }] } } },
    },
  ],
  connections: {
    받은사진: { main: [[{ node: '프롬프트', type: 'main', index: 0 }]] },
    프롬프트: { main: [[{ node: 'Gemini', type: 'main', index: 0 }]] },
    Gemini: { main: [[{ node: '결과정리', type: 'main', index: 0 }]] },
    결과정리: { main: [[{ node: '응답', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1', timezone: 'Asia/Seoul' },
};
process.stdout.write(JSON.stringify(workflow, null, 2));
