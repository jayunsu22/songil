// 카톡_알림 n8n 흐름 JSON 을 만든다: node n8n/kakao_notify/build.js > n8n/kakao_notify/workflow.json
// 카톡 읽기 프로그램(kakao_reader/)이 가견적 발행·실패·사진 못 저장을 POST kakao-notify { text } 로 보내면
// 사장님 텔레그램(현장견적 봇)으로 그대로 보낸다. buttons 가 있으면 인라인 버튼(카톡_버튼 흐름이 받음). 챗ID 는 Airtable 가맹점 p_001 의 텔레그램_챗ID (현장견적_고객문의 와 같은 곳).
// 텔레그램 보내기 — n 개 버튼 (n8n 텔레그램 노드는 버튼 수가 고정이라 개수마다 노드를 하나씩 만든다).
// 세 개까지는 한 줄 [방1] [방2] [나중에], 넷부터는 두 개씩 여러 줄 (필름 주문 담당자, 11/1)
const MAX_BUTTONS = 10;
const tg = (id, name, position, n) => {
  const per = n <= 3 ? 3 : 2;
  const rows = [];
  for (let i = 0; i < n; i += per) {
    rows.push({ row: { buttons: Array.from({ length: Math.min(per, n - i) }, (_, j) => ({
      text: '={{ $json.b[' + (i + j) + '].t }}', additionalFields: { callback_data: '={{ $json.b[' + (i + j) + '].d }}' } })) } });
  }
  return {
    id, name, type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position,
    parameters: Object.assign({
      resource: 'message', operation: 'sendMessage', chatId: '={{ $json.chat_id }}', text: '={{ $json.text }}',
      additionalFields: { appendAttribution: false, disable_web_page_preview: true, parse_mode: 'HTML' },
    }, n ? { replyMarkup: 'inlineKeyboard', inlineKeyboard: { rows } } : {}),
    credentials: { telegramApi: { id: '4iGW8eEwhNuTpFHa', name: 'Telegram - 견적서작성발송봇' } },
  };
};
const sends = Array.from({ length: MAX_BUTTONS + 1 }, (_, n) => tg('t' + n, n ? '텔레그램_버튼' + n : '텔레그램', [880, -500 + n * 110], n));

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
          "// html: true 면 노트북이 이미 꾸민 글(굵게·'견적서 열기' 링크, 카톡 글은 노트북이 바꿔 넣음) → 그대로 (11/1). 사장님 열쇠로만 들어온다",
          "const raw = String(b.text || '');",
          "const text = b.html === true ? raw.slice(0, 4000) : raw.slice(0, 4000).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');",
          "if (!text) throw new Error('text 가 비어 있음');",
          "const r = $input.first().json || {};",
          "const chat = (r.fields || r).텔레그램_챗ID;",
          "if (!chat) throw new Error('가맹점 p_001 의 텔레그램_챗ID 가 비어 있음');",
          "// buttons: [[{text, data}]] (카톡 읽기 3단계 10/31) - 줄은 모아서 버튼 열 개까지 (11/1: 필름 주문 담당자 전부). 셋까지 한 줄, 넷부터 두 개씩. data 는 텔레그램 한도 64바이트",
          "const b2 = (Array.isArray(b.buttons) ? b.buttons : []).filter(Array.isArray).reduce((a, r) => a.concat(r), [])",
          "  .filter((x) => x && x.text && x.data).slice(0, " + MAX_BUTTONS + ").map((x) => ({ t: String(x.text).slice(0, 30), d: String(x.data).slice(0, 64) }));",
          "// 📝 사장님 11/13: 텔레그램 = 업무보고·기계 상태, 업무비서 앱 알림 = 거래처 카톡·문자·일정. to:'tg'|'app' 이 오면 그대로,",
          "// 없으면 노트북·서버 상태 글('[카톡읽기]·[카톡]·[비서]·[현장]' 실패 글, 🔴🟢 노트북, 🔋 서비스, 🤖 클로드 넘김)만 텔레그램",
          "const plain = (b.html === true ? raw.replace(/<a [^>]*>([\\s\\S]*?)<\\/a>/g, '$1').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '\"').replace(/&amp;/g, '&') : raw).trim();",
          "const machine = /^(\\[(카톡읽기|카톡|비서|현장)\\]|🔴|🟢|🔋|🤖 ?비서: 클로드)/.test(plain);",
          "const route = b.to === 'tg' ? 'tg' : b.to === 'app' ? 'app' : machine ? 'tg' : 'app';",
          "const lines = plain.split('\\n');",
          "const href = (raw.match(/href=\"(https:\\/\\/jayunsu22\\.github\\.io\\/sitenote\\/[^\"]+)\"/) || [])[1] || (plain.match(/https:\\/\\/jayunsu22\\.github\\.io\\/sitenote\\/\\S+/) || [])[0] || '';",
          "const item = { title: lines[0].slice(0, 120), text: lines.slice(1).join('\\n').trim().slice(0, 1500), buttons: b2.map((x) => ({ text: x.t, data: x.d })), url: href, image: String(b.image || '') };",
          "return [{ json: { chat_id: String(chat), text, n: b2.length, b: b2, route, item } }];",
        ].join('\n'),
      },
    },
    // 📝 업무비서 앱 알림 (11/13) — 현장관리_빈칸 hourly-report 'notify' 가 비서 대화 카드 + 폰 알림을 만든다. 등록된 폰이 없거나 실패하면 텔레그램으로
    {
      id: 'ia', name: '앱으로', type: 'n8n-nodes-base.if', typeVersion: 2, position: [550, -250],
      parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ id: 'ia1', leftValue: "={{ $json.route === 'app' }}", rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} },
    },
    {
      id: 'ha', name: '앱알림', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [660, -400], continueOnFail: true,
      credentials: { httpHeaderAuth: { id: 'Tm4pgTszEk1zUiQ8', name: '사장님 열쇠' } },
      parameters: { method: 'POST', url: 'https://primary-production-a6fa.up.railway.app/webhook/hourly-report', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        sendBody: true, specifyBody: 'json', jsonBody: "={{ JSON.stringify({ action: 'notify', item: $json.item }) }}", options: { timeout: 30000 } },
    },
    {
      id: 'ib', name: '앱됐나', type: 'n8n-nodes-base.if', typeVersion: 2, position: [880, -400],
      parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ id: 'ib1', leftValue: '={{ $json.ok === true }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} },
    },
    { id: 'cb', name: '텔레그램으로', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1100, -300],
      parameters: { mode: 'runOnceForAllItems', jsCode: "// 앱 알림을 못 보냄 (등록된 폰 없음·오류) → 텔레그램으로 그대로\nreturn [{ json: $('글만들기').first().json }];" } },
    {
      // 버튼 개수(n)대로 n 번째 출구 → 그 개수의 텔레그램 노드
      id: 'sw', name: '버튼개수', type: 'n8n-nodes-base.switch', typeVersion: 3, position: [660, 0],
      parameters: { mode: 'expression', numberOutputs: MAX_BUTTONS + 1, output: '={{ $json.n }}', options: {} },
    },
    ...sends,
    {
      id: 'r', name: '응답', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [1320, 0],
      parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: true }) }}', options: {} },
    },
  ],
  connections: {
    받은알림: { main: [[{ node: '가맹점_조회', type: 'main', index: 0 }]] },
    가맹점_조회: { main: [[{ node: '글만들기', type: 'main', index: 0 }]] },
    글만들기: { main: [[{ node: '앱으로', type: 'main', index: 0 }]] },
    앱으로: { main: [[{ node: '앱알림', type: 'main', index: 0 }], [{ node: '버튼개수', type: 'main', index: 0 }]] },
    앱알림: { main: [[{ node: '앱됐나', type: 'main', index: 0 }]] },
    앱됐나: { main: [[{ node: '응답', type: 'main', index: 0 }], [{ node: '텔레그램으로', type: 'main', index: 0 }]] },
    텔레그램으로: { main: [[{ node: '버튼개수', type: 'main', index: 0 }]] },
    버튼개수: { main: sends.map((t) => [{ node: t.name, type: 'main', index: 0 }]) },
    ...Object.fromEntries(sends.map((t) => [t.name, { main: [[{ node: '응답', type: 'main', index: 0 }]] }])),
  },
  settings: { executionOrder: 'v1' },
};
process.stdout.write(JSON.stringify(workflow, null, 2));
