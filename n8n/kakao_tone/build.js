// 사장님_말투 n8n 흐름 JSON 을 만든다: node n8n/kakao_tone/build.js > n8n/kakao_tone/workflow.json
// 카톡 노트북이 모은 사장님 줄을 쌓고(add), 비서가 말투 예시로 가져간다(list). 시험 node n8n/kakao_tone/test.js
const fs = require('fs');
const path = require('path');
const OWNER = { httpHeaderAuth: { id: 'Tm4pgTszEk1zUiQ8', name: '사장님 열쇠' } };
const workflow = {
  name: '사장님_말투',
  nodes: [
    {
      id: 'w', name: '말투요청', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: '4b8e2f61-7c3a-4d95-a1e6-9f2c5b7d3e18',
      parameters: { httpMethod: 'POST', path: 'kakao-tone', responseMode: 'responseNode', authentication: 'headerAuth', options: {} },
      credentials: OWNER,
    },
    { id: 'a', name: '쌓기', type: 'n8n-nodes-base.code', typeVersion: 2, position: [220, 0],
      parameters: { mode: 'runOnceForAllItems', jsCode: fs.readFileSync(path.join(__dirname, 'api.js'), 'utf8') } },
    { id: 'o', name: '응답', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [440, 0],
      parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: {} } },
  ],
  connections: { 말투요청: { main: [[{ node: '쌓기', type: 'main', index: 0 }]] }, 쌓기: { main: [[{ node: '응답', type: 'main', index: 0 }]] } },
  settings: { executionOrder: 'v1', timezone: 'Asia/Seoul', saveDataSuccessExecution: 'none' },   // 실행 기록에 말투 글을 남기지 않는다
};
process.stdout.write(JSON.stringify(workflow, null, 2));
