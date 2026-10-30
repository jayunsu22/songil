// 견적사진_판단 n8n 흐름 JSON 을 만든다: node n8n/photo_classify/build.js > n8n/photo_classify/workflow.json
// 카톡 읽기 프로그램(kakao_reader/quote_bot.py)이 가견적에 사진을 붙이기 전에 '이 사진은 어느 품목?' 을 묻는다.
// 노드 코드는 prompt.js · result.js 가 원본. 사장님 열쇠(headerAuth) 필수.
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

const workflow = {
  name: '견적사진_판단',
  nodes: [
    {
      id: 'w', name: '받은사진', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0],
      webhookId: 'c3a9e1f4-7b2d-4e8a-9f61-5d0b2a7c8e14',
      parameters: { httpMethod: 'POST', path: 'photo-classify', responseMode: 'responseNode', authentication: 'headerAuth', options: {} },
      credentials: { httpHeaderAuth: { id: 'Tm4pgTszEk1zUiQ8', name: '사장님 열쇠' } },
    },
    { id: 'p', name: '프롬프트', type: 'n8n-nodes-base.code', typeVersion: 2, position: [220, 0], parameters: { mode: 'runOnceForAllItems', jsCode: read('prompt.js') } },
    {
      id: 'g', name: 'Gemini', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [440, 0], continueOnFail: true,
      parameters: {
        method: 'POST', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json',
        jsonBody: '={{ JSON.stringify($json.gemini) }}', options: { timeout: 90000 },
      },
      credentials: { googlePalmApi: { id: 'DVT2g7GvXhSY4Y4b', name: 'Google Gemini(PaLM) Api account' } },
    },
    { id: 'c', name: '결과정리', type: 'n8n-nodes-base.code', typeVersion: 2, position: [660, 0], parameters: { mode: 'runOnceForAllItems', jsCode: read('result.js') } },
    {
      id: 'r', name: '응답', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [880, 0],
      parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: {} },
    },
  ],
  connections: {
    받은사진: { main: [[{ node: '프롬프트', type: 'main', index: 0 }]] },
    프롬프트: { main: [[{ node: 'Gemini', type: 'main', index: 0 }]] },
    Gemini: { main: [[{ node: '결과정리', type: 'main', index: 0 }]] },
    결과정리: { main: [[{ node: '응답', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1' },
};
process.stdout.write(JSON.stringify(workflow, null, 2));
