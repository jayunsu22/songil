// 카톡_받은글 n8n 흐름 JSON 을 만든다: node n8n/kakao_inbox/build.js [--auth] > n8n/kakao_inbox/workflow.json
// 카톡 읽기 프로그램(kakao_reader/)이 정한 방의 새 글·사진을 POST kakao-inbox 로 보낸다.
// 지금은 받아서 정리·응답만 한다 (실행 기록에 남음). 견적 문의 가르기·초안은 다음 단계.
// --auth 를 붙이면 webhook 에 사장님 열쇠(headerAuth)를 건다. 처음엔 열쇠 없이 시험하고 나서 켠다.
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const auth = process.argv.includes('--auth');

const webhook = {
  id: 'w', name: '받은글', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0],
  webhookId: '5e0c7a1d-8b2f-4c63-9d4e-1a7f3b6c2e90',
  parameters: Object.assign({ httpMethod: 'POST', path: 'kakao-inbox', responseMode: 'responseNode', options: {} },
    auth ? { authentication: 'headerAuth' } : {}),
};
if (auth) webhook.credentials = { httpHeaderAuth: { id: 'Tm4pgTszEk1zUiQ8', name: '사장님 열쇠' } };

const workflow = {
  name: '카톡_받은글',
  nodes: [
    webhook,
    { id: 't', name: '정리', type: 'n8n-nodes-base.code', typeVersion: 2, position: [220, 0], parameters: { mode: 'runOnceForAllItems', jsCode: read('tidy.js') } },
    {
      id: 'r', name: '응답', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [440, 0],
      parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: true, count: $json.count, photos: $json.photos }) }}', options: {} },
    },
  ],
  connections: {
    받은글: { main: [[{ node: '정리', type: 'main', index: 0 }]] },
    정리: { main: [[{ node: '응답', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1', saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all' },
};
process.stdout.write(JSON.stringify(workflow, null, 2));
