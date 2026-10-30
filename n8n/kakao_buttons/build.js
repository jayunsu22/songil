// 카톡_버튼 n8n 흐름 JSON 을 만든다: node n8n/kakao_buttons/build.js > n8n/kakao_buttons/workflow.json
// 텔레그램 요약의 버튼(카톡_알림 이 붙임)을 받는 쪽과, 노트북이 '할 일' 을 가져가는 쪽을 한 흐름에 둔다
// (두 쪽이 같은 저장 공간 staticData 를 써야 해서). 설계 docs/superpowers/specs/2026-10-31-카톡버튼-design.md
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const BOT = { telegramApi: { id: '4iGW8eEwhNuTpFHa', name: 'Telegram - 견적서작성발송봇' } };

const workflow = {
  name: '카톡_버튼',
  nodes: [
    {
      id: 'tr', name: '버튼누름', type: 'n8n-nodes-base.telegramTrigger', typeVersion: 1.2, position: [0, 0],
      webhookId: '3b7e9c21-5f4a-4d8b-9e6c-1a2f3d4b5c6e',
      parameters: { updates: ['callback_query'], additionalFields: {} }, credentials: BOT,
    },
    {
      id: 'a', name: '가맹점_조회', type: 'n8n-nodes-base.airtable', typeVersion: 2.1, position: [220, 0],
      executeOnce: true, alwaysOutputData: true,
      parameters: {
        operation: 'search',
        base: { __rl: true, value: 'appAMNZv9V41mNjsY', mode: 'id' },
        table: { __rl: true, value: 'tblOu4laeXOR8Wmm5', mode: 'id' },
        filterByFormula: "={업체코드} = 'p_001'", returnAll: false, limit: 1, options: {},
      },
      credentials: { airtableTokenApi: { id: 'J5wefJCMalpjjm3Q', name: 'Airtable Personal Access Token account 2' } },
    },
    { id: 'p', name: '버튼정리', type: 'n8n-nodes-base.code', typeVersion: 2, position: [440, 0], parameters: { mode: 'runOnceForAllItems', jsCode: read('pressed.js') } },
    {
      id: 'q', name: '받았다고_답', type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [660, 0], continueOnFail: true,
      parameters: { resource: 'callback', operation: 'answerQuery', queryId: '={{ $json.query_id }}', additionalFields: { text: '={{ $json.answer }}' } },
      credentials: BOT,
    },
    {
      id: 'e', name: '버튼지우고_표시', type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [880, 0], continueOnFail: true,
      parameters: {
        resource: 'message', operation: 'editMessageText', messageType: 'message',
        chatId: "={{ $('버튼정리').item.json.chat_id }}", messageId: "={{ $('버튼정리').item.json.message_id }}",
        text: "={{ $('버튼정리').item.json.text }}", additionalFields: { disable_web_page_preview: true, parse_mode: 'HTML' },
      },
      credentials: BOT,
    },
    {
      id: 'w', name: '할일요청', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 300],
      webhookId: '6d1c8a4e-2b9f-4e7a-8c3d-5f0a1b2c3d4e',
      parameters: { httpMethod: 'POST', path: 'kakao-jobs', responseMode: 'responseNode', authentication: 'headerAuth', options: {} },
      credentials: { httpHeaderAuth: { id: 'Tm4pgTszEk1zUiQ8', name: '사장님 열쇠' } },
    },
    { id: 't', name: '할일꺼내기', type: 'n8n-nodes-base.code', typeVersion: 2, position: [220, 300], parameters: { mode: 'runOnceForAllItems', jsCode: read('take.js') } },
    {
      id: 'r', name: '할일응답', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [440, 300],
      parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: {} },
    },
  ],
  connections: {
    버튼누름: { main: [[{ node: '가맹점_조회', type: 'main', index: 0 }]] },
    가맹점_조회: { main: [[{ node: '버튼정리', type: 'main', index: 0 }]] },
    버튼정리: { main: [[{ node: '받았다고_답', type: 'main', index: 0 }]] },
    받았다고_답: { main: [[{ node: '버튼지우고_표시', type: 'main', index: 0 }]] },
    할일요청: { main: [[{ node: '할일꺼내기', type: 'main', index: 0 }]] },
    할일꺼내기: { main: [[{ node: '할일응답', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1' },
};
process.stdout.write(JSON.stringify(workflow, null, 2));
