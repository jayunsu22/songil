// 카톡_알림 n8n 흐름 JSON 을 만든다: node n8n/kakao_notify/build.js > n8n/kakao_notify/workflow.json
// 카톡 읽기 프로그램(kakao_reader/)이 가견적 발행·실패·사진 못 저장을 POST kakao-notify { text } 로 보내면
// 사장님 텔레그램(현장견적 봇)으로 그대로 보낸다. buttons 가 있으면 인라인 버튼(카톡_버튼 흐름이 받음). 챗ID 는 Airtable 가맹점 p_001 의 텔레그램_챗ID (현장견적_고객문의 와 같은 곳).
// $json[key] > than 인지 (If v2)
const cond = (key, than) => ({
  options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
  conditions: [{ id: key + than, leftValue: '={{ $json.' + key + ' }}', rightValue: than, operator: { type: 'number', operation: 'gt' } }],
  combinator: 'and',
});
// 텔레그램 보내기. buttons = [[글 칸, 콜백 칸], ...] 이면 한 줄짜리 인라인 버튼
const tg = (id, name, position, buttons) => ({
  id, name, type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position,
  parameters: Object.assign({
    resource: 'message', operation: 'sendMessage', chatId: '={{ $json.chat_id }}', text: '={{ $json.text }}',
    additionalFields: { appendAttribution: false, disable_web_page_preview: true, parse_mode: 'HTML' },
  }, buttons ? {
    replyMarkup: 'inlineKeyboard',
    inlineKeyboard: { rows: [{ row: { buttons: buttons.map(([t, d]) => ({
      text: '={{ $json.' + t + ' }}', additionalFields: { callback_data: '={{ $json.' + d + ' }}' } })) } }] },
  } : {}),
  credentials: { telegramApi: { id: '4iGW8eEwhNuTpFHa', name: 'Telegram - 견적서작성발송봇' } },
});

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
          "// 텔레그램이 글을 서식(마크다운)으로 읽으면 '[카톡]' 이 사라지고 _ * 가 섞이면 안 보내진다 → HTML 로 보내고 <>& 만 바꾼다 (10/31)",
          "const text = String(b.text || '').slice(0, 4000).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');",
          "if (!text) throw new Error('text 가 비어 있음');",
          "const r = $input.first().json || {};",
          "const chat = (r.fields || r).텔레그램_챗ID;",
          "if (!chat) throw new Error('가맹점 p_001 의 텔레그램_챗ID 가 비어 있음');",
          "// buttons: [[{text, data}]] (카톡 읽기 3단계 10/31) - 첫 줄의 버튼 두 개까지. data 는 텔레그램 한도 64바이트",
          "const row = (Array.isArray(b.buttons) && Array.isArray(b.buttons[0]) ? b.buttons[0] : []).slice(0, 2)",
          "  .filter((x) => x && x.text && x.data).map((x) => ({ t: String(x.text).slice(0, 30), d: String(x.data).slice(0, 64) }));",
          "return [{ json: { chat_id: String(chat), text, n: row.length,",
          "  b1t: row[0] ? row[0].t : '', b1d: row[0] ? row[0].d : '', b2t: row[1] ? row[1].t : '', b2d: row[1] ? row[1].d : '' } }];",
        ].join('\n'),
      },
    },
    {
      id: 'i1', name: '버튼있음', type: 'n8n-nodes-base.if', typeVersion: 2, position: [660, 0],
      parameters: { conditions: cond('n', 0), options: {} },
    },
    {
      id: 'i2', name: '버튼둘', type: 'n8n-nodes-base.if', typeVersion: 2, position: [880, -100],
      parameters: { conditions: cond('n', 1), options: {} },
    },
    tg('t', '텔레그램', [880, 120], null),
    tg('t1', '텔레그램_버튼1', [1100, 0], [['b1t', 'b1d']]),
    tg('t2', '텔레그램_버튼2', [1100, -200], [['b1t', 'b1d'], ['b2t', 'b2d']]),
    {
      id: 'r', name: '응답', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [1320, 0],
      parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: true }) }}', options: {} },
    },
  ],
  connections: {
    받은알림: { main: [[{ node: '가맹점_조회', type: 'main', index: 0 }]] },
    가맹점_조회: { main: [[{ node: '글만들기', type: 'main', index: 0 }]] },
    글만들기: { main: [[{ node: '버튼있음', type: 'main', index: 0 }]] },
    버튼있음: { main: [[{ node: '버튼둘', type: 'main', index: 0 }], [{ node: '텔레그램', type: 'main', index: 0 }]] },
    버튼둘: { main: [[{ node: '텔레그램_버튼2', type: 'main', index: 0 }], [{ node: '텔레그램_버튼1', type: 'main', index: 0 }]] },
    텔레그램: { main: [[{ node: '응답', type: 'main', index: 0 }]] },
    텔레그램_버튼1: { main: [[{ node: '응답', type: 'main', index: 0 }]] },
    텔레그램_버튼2: { main: [[{ node: '응답', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1' },
};
process.stdout.write(JSON.stringify(workflow, null, 2));
