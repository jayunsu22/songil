// 인원모집 n8n 흐름 JSON 을 만든다: node n8n/crew_recruit/build.js > n8n/crew_recruit/workflow.json
// 앱(crew-recruit)·사장님 폰 답장(sms-in-…)·텔레그램 버튼(crew-act, 카톡_버튼이 넘김)·10분 시계가 같은 저장 공간을 쓴다.
// 코드 노드는 { resp, sms[], notify[], fills[] } 한 줄을 내고, 뒤의 세 갈래가 문자·텔레그램·우편함으로 보낸다.
// 설계 docs/superpowers/specs/2026-11-01-인원모집-design.md · 시험 node n8n/crew_recruit/test.js
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const OWNER = { httpHeaderAuth: { id: 'Tm4pgTszEk1zUiQ8', name: '사장님 열쇠' } };
const SMS = { httpBasicAuth: { id: 'DXh5rioJUf4RGJEN', name: 'SMS Gateway (사장님 폰)' } };
const BASE = 'https://primary-production-a6fa.up.railway.app/webhook/';
// 사장님 폰 답장 주소 — 열쇠 대신 아무도 모르는 주소로 (SMS Gateway 웹훅은 머리글을 못 붙인다)
const SMS_IN = 'sms-in-7f3c9a2e5d1b';

const hook = (id, name, p, webhookId, y, owner) => ({
  id, name, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, y], webhookId,
  parameters: Object.assign({ httpMethod: 'POST', path: p, responseMode: 'responseNode', options: owner ? { allowedOrigins: '*' } : {} },
    owner ? { authentication: 'headerAuth' } : {}),
  credentials: owner ? OWNER : undefined,
});
const code = (id, name, file, x, y) => ({
  id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x, y],
  parameters: { mode: 'runOnceForAllItems', jsCode: file ? read('lib.js') + '\n' + read(file) : '' },
});
const split = (id, name, x, y, js) => ({ id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x, y], parameters: { mode: 'runOnceForAllItems', jsCode: js } });
const respond = (id, name, x, y) => ({
  id, name, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [x, y],
  parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json.resp) }}', options: {} },
});
const post = (id, name, x, y, url, cred, body) => ({
  id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x, y], continueOnFail: true,
  parameters: {
    method: 'POST', url, authentication: 'genericCredentialType', genericAuthType: Object.keys(cred)[0],
    sendBody: true, specifyBody: 'json', jsonBody: body, options: { timeout: 20000 },
  },
  credentials: cred,
});

const SOURCES = ['모집', '답장', '버튼', '시계'];
const workflow = {
  name: '인원모집',
  nodes: [
    hook('w1', '모집요청', 'crew-recruit', '5e2a9c4d-7b1f-4e3a-9d6c-2a8b0f1e3c57', 0, true),
    code('c1', '모집', 'start.js', 220, 0),
    respond('r1', '모집응답', 440, -80),
    hook('w2', '답장받음', SMS_IN, '8b4d1f6a-3c9e-4a72-b5d0-6e1f2a3b4c58', 200, false),
    code('c2', '답장', 'reply.js', 220, 200),
    respond('r2', '답장응답', 440, 280),
    hook('w3', '버튼요청', 'crew-act', '1d7e3b9c-5a2f-4c86-8e1d-9f0a2b3c4d59', 400, true),
    code('c3', '버튼', 'act.js', 220, 400),
    respond('r3', '버튼응답', 440, 480),
    {
      id: 'tk', name: '10분마다', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 600],
      parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 10 }] } },
    },
    code('c4', '시계', 'clock.js', 220, 600),
    // 세 갈래 — 비어 있으면 아무것도 안 나가서 뒤 노드가 돌지 않는다
    split('s1', '문자목록', 700, 100, "return ($input.first().json.sms || []).map((x) => ({ json: x }));"),
    post('h1', '문자보내기', 920, 100, 'https://api.sms-gate.app/3rdparty/v1/messages', SMS,
      '={{ JSON.stringify({ textMessage: { text: $json.text }, phoneNumbers: [$json.phone] }) }}'),
    split('s2', '알림목록', 700, 300, "return ($input.first().json.notify || []).map((x) => ({ json: x }));"),
    post('h2', '알림보내기', 920, 300, BASE + 'kakao-notify', OWNER, '={{ JSON.stringify($json) }}'),
    split('s3', '우편목록', 700, 500, "const f = $input.first().json.fills || []; return f.length ? [{ json: { fills: f } }] : [];"),
    post('h3', '우편넣기', 920, 500, BASE + 'site-fill', OWNER, '={{ JSON.stringify({ fills: $json.fills }) }}'),
    // 처음 한 번: SMS Gateway 에 '받은 문자 → 이 흐름' 웹훅 등록 (POST crew-sms-hook, 사장님 열쇠)
    hook('w4', '답장주소등록요청', 'crew-sms-hook', '3f8a2d6b-9c1e-4b57-a0d3-7e2f1a9b8c60', 800, true),
    post('h4', '답장주소등록', 220, 800, 'https://api.sms-gate.app/3rdparty/v1/webhooks', SMS,
      "={{ JSON.stringify({ url: '" + BASE + SMS_IN + "', event: 'sms:received' }) }}"),
    {
      id: 'r4', name: '등록응답', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [440, 800],
      parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: {} },
    },
  ],
  connections: {
    모집요청: { main: [[{ node: '모집', type: 'main', index: 0 }]] },
    답장받음: { main: [[{ node: '답장', type: 'main', index: 0 }]] },
    버튼요청: { main: [[{ node: '버튼', type: 'main', index: 0 }]] },
    '10분마다': { main: [[{ node: '시계', type: 'main', index: 0 }]] },
    문자목록: { main: [[{ node: '문자보내기', type: 'main', index: 0 }]] },
    알림목록: { main: [[{ node: '알림보내기', type: 'main', index: 0 }]] },
    우편목록: { main: [[{ node: '우편넣기', type: 'main', index: 0 }]] },
    답장주소등록요청: { main: [[{ node: '답장주소등록', type: 'main', index: 0 }]] },
    답장주소등록: { main: [[{ node: '등록응답', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1', saveDataSuccessExecution: 'all' },
};
const fan = ['문자목록', '알림목록', '우편목록'].map((n) => ({ node: n, type: 'main', index: 0 }));
const resp = { 모집: '모집응답', 답장: '답장응답', 버튼: '버튼응답' };
SOURCES.forEach((s) => { workflow.connections[s] = { main: [(resp[s] ? [{ node: resp[s], type: 'main', index: 0 }] : []).concat(fan)] }; });
workflow.nodes.forEach((n) => { if (!n.credentials) delete n.credentials; });
process.stdout.write(JSON.stringify(workflow, null, 2));
