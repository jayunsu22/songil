// 카톡_버튼 n8n 흐름 JSON 을 만든다: node n8n/kakao_buttons/build.js > n8n/kakao_buttons/workflow.json
// 텔레그램 요약의 버튼(카톡_알림 이 붙임)을 받는 쪽과, 노트북이 '할 일' 을 가져가는 쪽을 한 흐름에 둔다
// (두 쪽이 같은 저장 공간 staticData 를 써야 해서). 설계 docs/superpowers/specs/2026-10-31-카톡버튼-design.md
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const OWNER = { httpHeaderAuth: { id: 'Tm4pgTszEk1zUiQ8', name: '사장님 열쇠' } };
// If v2: 식이 참인가
const isTrue = (expr) => ({
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ id: 'c', leftValue: expr, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
  combinator: 'and',
});
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
        chatId: "={{ $('표시').item.json.chat_id }}", messageId: "={{ $('표시').item.json.message_id }}",
        text: "={{ $('표시').item.json.text }}", additionalFields: { disable_web_page_preview: true, parse_mode: 'HTML' },
      },
      credentials: BOT,
    },
    // 필름 주문 문자 (2026-11-01): 버튼정리가 sms 를 넘기면 사장님 폰(SMS Gateway 클라우드)으로 보내고 결과를 붙인다
    { id: 'si', name: '문자인가', type: 'n8n-nodes-base.if', typeVersion: 2, position: [440, 200], parameters: { conditions: isTrue('={{ !!$json.sms }}'), options: {} } },
    {
      id: 'ss', name: '문자보내기', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [660, 200], continueOnFail: true,
      parameters: {
        method: 'POST', url: 'https://api.sms-gate.app/3rdparty/v1/messages',
        authentication: 'genericCredentialType', genericAuthType: 'httpBasicAuth',
        sendBody: true, specifyBody: 'json',
        jsonBody: '={{ JSON.stringify({ textMessage: { text: $json.sms.text }, phoneNumbers: [$json.sms.phone] }) }}',
        options: { timeout: 20000 },
      },
      credentials: { httpBasicAuth: { id: 'DXh5rioJUf4RGJEN', name: 'SMS Gateway (사장님 폰)' } },
    },
    { id: 'sr', name: '문자결과', type: 'n8n-nodes-base.code', typeVersion: 2, position: [880, 200], parameters: { mode: 'runOnceForAllItems', jsCode: read('sms_result.js') } },
    { id: 'so', name: '보냄인가', type: 'n8n-nodes-base.if', typeVersion: 2, position: [1100, 200], parameters: { conditions: isTrue('={{ $json.ok }}'), options: {} } },
    {
      id: 'sf', name: '주문표시', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1320, 140], continueOnFail: true,
      parameters: {
        method: 'POST', url: 'https://primary-production-a6fa.up.railway.app/webhook/site-fill',
        authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify({ fills: $json.fills }) }}', options: {},
      },
      credentials: OWNER,
    },
    { id: 'sh', name: '표시', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1540, 0], parameters: { mode: 'runOnceForAllItems', jsCode: read('shown.js') } },
    // 앱이 필요량을 다 고르면 POST film-order → 주문 정보를 저장 공간에 두고 카톡_알림 으로 담당자 버튼을 띄운다
    {
      id: 'ow', name: '주문요청', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 600],
      webhookId: '9c4e2a7b-1d3f-4b6a-8e5c-2f7a9b0c1d2e',
      parameters: { httpMethod: 'POST', path: 'film-order', responseMode: 'responseNode', authentication: 'headerAuth', options: { allowedOrigins: '*' } },
      credentials: OWNER,
    },
    { id: 'oa', name: '주문받기', type: 'n8n-nodes-base.code', typeVersion: 2, position: [220, 600], parameters: { mode: 'runOnceForAllItems', jsCode: read('order_ask.js') } },
    {
      id: 'on', name: '주문알림', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [440, 600],
      parameters: {
        method: 'POST', url: 'https://primary-production-a6fa.up.railway.app/webhook/kakao-notify',
        authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json) }}', options: {},
      },
      credentials: OWNER,
    },
    {
      id: 'or', name: '주문응답', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [660, 600],
      parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: true }) }}', options: {} },
    },
    {
      id: 'w', name: '할일요청', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 300],
      webhookId: '6d1c8a4e-2b9f-4e7a-8c3d-5f0a1b2c3d4e',
      parameters: { httpMethod: 'POST', path: 'kakao-jobs', responseMode: 'responseNode', authentication: 'headerAuth', options: {} },
      credentials: OWNER,
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
    버튼정리: { main: [[{ node: '문자인가', type: 'main', index: 0 }]] },
    문자인가: { main: [[{ node: '문자보내기', type: 'main', index: 0 }], [{ node: '표시', type: 'main', index: 0 }]] },
    문자보내기: { main: [[{ node: '문자결과', type: 'main', index: 0 }]] },
    문자결과: { main: [[{ node: '보냄인가', type: 'main', index: 0 }]] },
    보냄인가: { main: [[{ node: '주문표시', type: 'main', index: 0 }], [{ node: '표시', type: 'main', index: 0 }]] },
    주문표시: { main: [[{ node: '표시', type: 'main', index: 0 }]] },
    표시: { main: [[{ node: '받았다고_답', type: 'main', index: 0 }]] },
    주문요청: { main: [[{ node: '주문받기', type: 'main', index: 0 }]] },
    주문받기: { main: [[{ node: '주문알림', type: 'main', index: 0 }]] },
    주문알림: { main: [[{ node: '주문응답', type: 'main', index: 0 }]] },
    받았다고_답: { main: [[{ node: '버튼지우고_표시', type: 'main', index: 0 }]] },
    할일요청: { main: [[{ node: '할일꺼내기', type: 'main', index: 0 }]] },
    할일꺼내기: { main: [[{ node: '할일응답', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1' },
};
process.stdout.write(JSON.stringify(workflow, null, 2));
