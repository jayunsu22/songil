// 문자_답장 n8n 흐름 JSON: node n8n/sms_reply/build.js > n8n/sms_reply/workflow.json · 시험 node n8n/sms_reply/test.js
// 앱 비서가 보낸 문자의 답 → AI 판단 → 우편함·앱 비서 대화·텔레그램. 설계 docs/superpowers/specs/2026-11-05-답장띄우기-design.md
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const OWNER = { httpHeaderAuth: { id: 'Tm4pgTszEk1zUiQ8', name: '사장님 열쇠' } };
const BASE = 'https://primary-production-a6fa.up.railway.app/webhook/';
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
    post('a', '비서판단', 880, 0, BASE + 'kakao-assist', '={{ JSON.stringify($json.body) }}'),
    code('r', '정리', 1100, 60, read('result.js')),
    code('s1', '우편목록', 1320, -60, "const f = $input.first().json.fills || []; return f.length ? [{ json: { fills: f } }] : [];"),
    post('h1', '우편넣기', 1540, -60, BASE + 'site-fill', '={{ JSON.stringify({ fills: $json.fills }) }}'),
    post('h2', '비서대화', 1320, 60, BASE + 'work-log', '={{ JSON.stringify({ action: "feed_add", items: [$json.feed] }) }}'),
    post('h3', '알림', 1320, 180, BASE + 'kakao-notify', '={{ JSON.stringify($json.notify) }}'),
  ],
  connections: {
    요청: { main: c('처리') }, 처리: { main: c('응답', '답장만') }, 답장만: { main: c('AI물을까') },
    AI물을까: { main: [[{ node: '비서판단', type: 'main', index: 0 }], [{ node: '정리', type: 'main', index: 0 }]] },
    비서판단: { main: c('정리') }, 정리: { main: c('우편목록', '비서대화', '알림') }, 우편목록: { main: c('우편넣기') },
  },
  settings: { executionOrder: 'v1', timezone: 'Asia/Seoul' },
};
process.stdout.write(JSON.stringify(workflow, null, 2));
