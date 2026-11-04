// 카톡_보내기 n8n 흐름 JSON: node n8n/kakao_send/build.js > n8n/kakao_send/workflow.json — 처리는 api.js
const fs = require('fs');
const path = require('path');
const OWNER = { httpHeaderAuth: { id: 'Tm4pgTszEk1zUiQ8', name: '사장님 열쇠' } };
const workflow = {
  name: '카톡_보내기',
  nodes: [
    { id: 'w', name: '요청', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: '5a9e3c71-4d2b-4f8e-b6a1-7c0d2e9f3a48',
      parameters: { httpMethod: 'POST', path: 'kakao-send', responseMode: 'responseNode', authentication: 'headerAuth', options: { allowedOrigins: '*' } }, credentials: OWNER },
    { id: 'p', name: '처리', type: 'n8n-nodes-base.code', typeVersion: 2, position: [220, 0], parameters: { mode: 'runOnceForAllItems', jsCode: fs.readFileSync(path.join(__dirname, 'api.js'), 'utf8') } },
    { id: 'o', name: '응답', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [440, 0], parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: {} } },
  ],
  connections: { 요청: { main: [[{ node: '처리', type: 'main', index: 0 }]] }, 처리: { main: [[{ node: '응답', type: 'main', index: 0 }]] } },
  settings: { executionOrder: 'v1', timezone: 'Asia/Seoul' },
};
process.stdout.write(JSON.stringify(workflow, null, 2));
