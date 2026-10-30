// 카톡_알림 n8n 흐름 JSON 을 만든다: node n8n/kakao_notify/build.js > n8n/kakao_notify/workflow.json
// 카톡 읽기 프로그램(kakao_reader/)이 가견적 발행·실패·사진 못 저장을 POST kakao-notify { text } 로 보내면
// 사장님 텔레그램(현장견적 봇)으로 그대로 보낸다. 챗ID 는 Airtable 가맹점 p_001 의 텔레그램_챗ID (현장견적_고객문의 와 같은 곳).
const workflow = {
  name: '카톡_알림',
  nodes: [
    {
      id: 'w', name: '받은알림', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0],
      webhookId: '8d2f6b1e-3c7a-4e95-a0b4-7f1c9e2d5a63',
      parameters: { httpMethod: 'POST', path: 'kakao-notify', responseMode: 'responseNode', authentication: 'headerAuth', options: {} },
      credentials: { httpHeaderAuth: { id: 'Tm4pgTszEk1zUiQ8', name: '사장님 열쇠' } },
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
    {
      id: 'c', name: '글만들기', type: 'n8n-nodes-base.code', typeVersion: 2, position: [440, 0],
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: [
          "// 카톡_알림 › 글만들기: 받은 text 를 텔레그램 글로. 4000자 넘으면 자른다 (텔레그램 한도 4096).",
          "const b = $('받은알림').first().json.body || {};",
          "const text = String(b.text || '').slice(0, 4000);",
          "if (!text) throw new Error('text 가 비어 있음');",
          "const r = $input.first().json || {};",
          "const chat = (r.fields || r).텔레그램_챗ID;",
          "if (!chat) throw new Error('가맹점 p_001 의 텔레그램_챗ID 가 비어 있음');",
          "return [{ json: { chat_id: String(chat), text } }];",
        ].join('\n'),
      },
    },
    {
      id: 't', name: '텔레그램', type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [660, 0],
      parameters: {
        resource: 'message', operation: 'sendMessage', chatId: '={{ $json.chat_id }}', text: '={{ $json.text }}',
        additionalFields: { appendAttribution: false, disable_web_page_preview: true },
      },
      credentials: { telegramApi: { id: '4iGW8eEwhNuTpFHa', name: 'Telegram - 견적서작성발송봇' } },
    },
    {
      id: 'r', name: '응답', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [880, 0],
      parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: true }) }}', options: {} },
    },
  ],
  connections: {
    받은알림: { main: [[{ node: '가맹점_조회', type: 'main', index: 0 }]] },
    가맹점_조회: { main: [[{ node: '글만들기', type: 'main', index: 0 }]] },
    글만들기: { main: [[{ node: '텔레그램', type: 'main', index: 0 }]] },
    텔레그램: { main: [[{ node: '응답', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1' },
};
process.stdout.write(JSON.stringify(workflow, null, 2));
