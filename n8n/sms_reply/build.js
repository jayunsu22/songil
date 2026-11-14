// 문자_답장 n8n 흐름 JSON: node n8n/sms_reply/build.js > n8n/sms_reply/workflow.json · 시험 node n8n/sms_reply/test.js
// 앱 비서가 보낸 문자의 답 → AI 판단 → 우편함·앱 비서 대화·텔레그램. 설계 docs/superpowers/specs/2026-11-05-답장띄우기-design.md
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const OWNER = { httpHeaderAuth: { id: 'Tm4pgTszEk1zUiQ8', name: '사장님 열쇠' } };
const BASE = 'https://primary-production-a6fa.up.railway.app/webhook/';
const SMS = { httpBasicAuth: { id: 'DXh5rioJUf4RGJEN', name: 'SMS Gateway (사장님 폰)' } };
const code = (id, name, x, y, js) => ({ id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x, y], parameters: { mode: 'runOnceForAllItems', jsCode: js } });
const post = (id, name, x, y, url, body) => ({
  id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x, y], continueOnFail: true, credentials: OWNER,
  parameters: { method: 'POST', url, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json', jsonBody: body, options: { timeout: 60000 } },
});
const c = (...names) => [names.map((node) => ({ node, type: 'main', index: 0 }))];
const workflow = {
  name: '문자_답장',
  nodes: [
    { id: 'w', name: '요청', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: '2c7f9e14-3b6a-4d58-a1e7-8f4b0d6c2e93',
      parameters: { httpMethod: 'POST', path: 'sms-reply', responseMode: 'responseNode', authentication: 'headerAuth', options: { allowedOrigins: '*' } }, credentials: OWNER },
    code('p', '처리', 220, 0, read('api.js')),
    { id: 'o', name: '응답', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [440, -120],
      parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json.resp) }}', options: { responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }] } } } },
    code('g', '답장만', 440, 60, "return $input.first().json.go ? $input.all() : [];"),
    { id: 'i', name: 'AI물을까', type: 'n8n-nodes-base.if', typeVersion: 2, position: [660, 60],
      parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ id: 'ic', leftValue: '={{ !!$json.ai }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} } },
    post('a', '비서판단', 880, 0, "={{ '" + BASE + "' + ($json.digest ? 'kakao-digest' : 'kakao-assist') }}", '={{ JSON.stringify($json.body) }}'),   // 번호 질문의 답은 kakao-digest (11/6)
    // 📋 앱의 지금 빈칸 (11/14) — 정리가 '아직 못 받음' 을 이걸로 거른다 (받았거나 시작한 현장은 안 적음)
    Object.assign(post('gp', '지금빈칸', 990, 200, BASE + 'site-gaps', '={{ JSON.stringify({ days: 30 }) }}'), { alwaysOutputData: true }),
    code('r', '정리', 1100, 60, read('result.js')),
    code('s1', '우편목록', 1320, -60, "const f = $input.first().json.fills || []; return f.length ? [{ json: { fills: f } }] : [];"),
    post('h1', '우편넣기', 1540, -60, BASE + 'site-fill', '={{ JSON.stringify({ fills: $json.fills }) }}'),
    post('h2', '비서대화', 1320, 60, BASE + 'work-log', '={{ JSON.stringify({ action: "feed_add", items: [$json.feed] }) }}'),
    post('h3', '알림', 1320, 180, BASE + 'kakao-notify', '={{ JSON.stringify($json.notify) }}'),
    code('s2', '감사목록', 1320, 300, "return ($input.first().json.sms || []).map((x) => ({ json: x }));"),
    Object.assign(post('h4', '감사문자', 1540, 300, 'https://api.sms-gate.app/3rdparty/v1/messages', '={{ JSON.stringify({ textMessage: { text: $json.text }, phoneNumbers: [$json.phone] }) }}'), { credentials: SMS, parameters: Object.assign({}, post('x', 'x', 0, 0, 'https://api.sms-gate.app/3rdparty/v1/messages', '={{ JSON.stringify({ textMessage: { text: $json.text }, phoneNumbers: [$json.phone] }) }}').parameters, { genericAuthType: 'httpBasicAuth' }) }),
  ],
  connections: {
    요청: { main: c('처리') }, 처리: { main: c('응답', '답장만') }, 답장만: { main: c('AI물을까') },
    AI물을까: { main: [[{ node: '비서판단', type: 'main', index: 0 }], [{ node: '지금빈칸', type: 'main', index: 0 }]] },
    비서판단: { main: c('지금빈칸') }, 지금빈칸: { main: c('정리') }, 정리: { main: c('우편목록', '비서대화', '알림', '감사목록') }, 우편목록: { main: c('우편넣기') }, 감사목록: { main: c('감사문자') },
  },
  settings: { executionOrder: 'v1', timezone: 'Asia/Seoul' },
};
process.stdout.write(JSON.stringify(workflow, null, 2));
