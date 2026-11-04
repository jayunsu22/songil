// 문자_상태 n8n 흐름 JSON: node n8n/sms_status/build.js > n8n/sms_status/workflow.json
// 앱이 보낸 문자(사장님 폰 SMS Gateway)가 실제로 나갔는지 — POST sms-status { ids: [메시지 id] } → { ok, items: [{ id, state, error }] }
// state: Pending(폰이 아직 안 받음) · Processed(폰이 받음) · Sent(보냄) · Delivered(받는 폰에 도착) · Failed (사장님 11/4: 문자가 엄청 늦게 옴)
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const OWNER = { httpHeaderAuth: { id: 'Tm4pgTszEk1zUiQ8', name: '사장님 열쇠' } };
const SMS = { httpBasicAuth: { id: 'DXh5rioJUf4RGJEN', name: 'SMS Gateway (사장님 폰)' } };
const workflow = {
  name: '문자_상태',
  nodes: [
    { id: 'w', name: '상태요청', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: '3f6b1c2d-8e4a-4b7f-9a1c-5d2e7f8a9b0c',
      parameters: { httpMethod: 'POST', path: 'sms-status', responseMode: 'responseNode', authentication: 'headerAuth', options: { allowedOrigins: '*' } }, credentials: OWNER },
    { id: 'i', name: '아이디', type: 'n8n-nodes-base.code', typeVersion: 2, position: [220, 0], parameters: { mode: 'runOnceForAllItems', jsCode: read('ids.js') } },
    { id: 'g', name: '상태보기', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [440, 0], continueOnFail: true, alwaysOutputData: true, credentials: SMS,
      parameters: { method: 'GET', url: '={{ "https://api.sms-gate.app/3rdparty/v1/messages/" + encodeURIComponent($json.id) }}',
        authentication: 'genericCredentialType', genericAuthType: 'httpBasicAuth', options: { timeout: 15000 } } },
    { id: 'r', name: '정리', type: 'n8n-nodes-base.code', typeVersion: 2, position: [660, 0], parameters: { mode: 'runOnceForAllItems', jsCode: read('result.js') } },
    { id: 'o', name: '응답', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [880, 0],
      parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: {} } },
  ],
  connections: { 상태요청: { main: [[{ node: '아이디', type: 'main', index: 0 }]] }, 아이디: { main: [[{ node: '상태보기', type: 'main', index: 0 }]] },
    상태보기: { main: [[{ node: '정리', type: 'main', index: 0 }]] }, 정리: { main: [[{ node: '응답', type: 'main', index: 0 }]] } },
  settings: { executionOrder: 'v1', timezone: 'Asia/Seoul' },
};
process.stdout.write(JSON.stringify(workflow, null, 2));
