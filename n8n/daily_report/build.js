// 업무일정표 n8n 흐름 JSON 을 만든다: node n8n/daily_report/build.js > n8n/daily_report/workflow.json
// 저녁 7시 내일 업무일정표 → 카톡 김정헌방(노트북이 outbox 를 가져가 보냄) · 앱 결재함(report) · 오전 9시 결재한 일 하기.
// 코드 노드 = 앱 share.js(현장관리 저장소, 옆 폴더) + lib.js + 각 파일. 설계 docs/superpowers/specs/2026-11-03-결재함-design.md · 시험 node n8n/daily_report/test.js
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
// 앱 share.js 는 배포된 앱에서 받아 그대로 쓴다 (앱목록 기준이 앱과 늘 같게, 흐름 JSON 이 커지지 않게) — 앱코드받기 노드
const SHARE_URL = 'https://jayunsu22.github.io/sitenote/share.js';
const shareCode = () => "const Share = (function (module) { new Function('module', String($('앱코드받기').first().json.data || ''))(module); return module.exports; })({ exports: {} });\n" +
  "if (!Share || !Share.dailyReport) throw new Error('앱 share.js 를 못 읽음 (dailyReport 없음)');\n";
const OWNER = { httpHeaderAuth: { id: 'Tm4pgTszEk1zUiQ8', name: '사장님 열쇠' } };
const SMS = { httpBasicAuth: { id: 'DXh5rioJUf4RGJEN', name: 'SMS Gateway (사장님 폰)' } };
const AIR = { airtableTokenApi: { id: 'J5wefJCMalpjjm3Q', name: 'Airtable Personal Access Token account 2' } };
const API = 'https://api.airtable.com/v0/apprglBOGXhKQN4cl/';
const BASE = 'https://primary-production-a6fa.up.railway.app/webhook/';
const CORS = { responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }] } };

const code = (id, name, file, x, y, withShare) => ({
  id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x, y],
  parameters: { mode: 'runOnceForAllItems', jsCode: (withShare ? shareCode() : '') + read('lib.js') + '\n' + read(file) },
});
const split = (id, name, x, y, js) => ({ id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x, y], parameters: { mode: 'runOnceForAllItems', jsCode: js } });
const respond = (id, name, x, y) => ({
  id, name, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [x, y],
  parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json.resp) }}', options: CORS },
});
const post = (id, name, x, y, url, cred, body) => ({
  id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x, y], continueOnFail: true,
  parameters: {
    method: 'POST', url, authentication: 'genericCredentialType', genericAuthType: Object.keys(cred)[0],
    sendBody: true, specifyBody: 'json', jsonBody: body, options: { timeout: 30000 },
  },
  credentials: cred,
});
const iff = (id, name, x, y, expr) => ({
  id, name, type: 'n8n-nodes-base.if', typeVersion: 2, position: [x, y],
  parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
    conditions: [{ id: id + 'c', leftValue: expr, rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} },
});
const airRead = (id, name, table, formula, x, y) => ({
  id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x, y], executeOnce: true, credentials: AIR,
  parameters: {
    method: 'GET', url: API + encodeURIComponent(table), authentication: 'predefinedCredentialType', nodeCredentialType: 'airtableTokenApi',
    sendQuery: true,
    queryParameters: { parameters: [{ name: 'filterByFormula', value: formula }, { name: 'pageSize', value: '100' }] },
    options: { pagination: { pagination: {
      paginationMode: 'updateAParameterInEachRequest',
      parameters: { parameters: [{ type: 'qs', name: 'offset', value: '={{ $response.body.offset }}' }] },
      paginationCompleteWhen: 'other', completeExpression: '={{ !$response.body.offset }}',
    } } },
  },
});
const cron = (id, name, expr, y) => ({
  id, name, type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, y],
  parameters: { rule: { interval: [{ field: 'cronExpression', expression: expr }] } },
});
const c = (n) => [{ node: n, type: 'main', index: 0 }];

const workflow = {
  name: '업무일정표',
  nodes: [
    {
      id: 'w1', name: '보고서요청', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: '6d2b8f41-3a7c-4e95-b1d0-7c4e2a9f5b63',
      parameters: { httpMethod: 'POST', path: 'report', responseMode: 'responseNode', authentication: 'headerAuth', options: { allowedOrigins: '*' } },
      credentials: OWNER,
    },
    code('c1', '요청', 'api.js', 220, 0, false),
    iff('i1', '만들기인가', 440, 0, '={{ !!$json.make }}'),
    respond('r1', '요청응답', 660, 100),
    cron('t1', '저녁7시', '0 19 * * *', 300),
    cron('t2', '아침9시', '0 9 * * *', 450),
    airRead('a1', '현장읽기', '현장', "AND(NOT({삭제}), IS_AFTER(DATETIME_PARSE({시작날짜}), DATEADD(TODAY(), -40, 'days')))", 660, 300),
    airRead('a2', '설정읽기', '설정', 'NOT({삭제})', 880, 300),
    airRead('a3', '할일읽기', '할일', 'NOT({삭제})', 1100, 300),
    {
      id: 'g1', name: '앱코드받기', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1210, 450], executeOnce: true,
      parameters: { method: 'GET', url: SHARE_URL, sendQuery: true, queryParameters: { parameters: [{ name: 't', value: '={{ Date.now() }}' }] },
        options: { response: { response: { responseFormat: 'text' } }, timeout: 20000 } },
    },
    code('c2', '실행', 'run.js', 1320, 300, true),
    iff('i2', '요청이었나', 1540, 200, "={{ $('보고서요청').isExecuted }}"),
    respond('r2', '만들기응답', 1760, 200),
    split('s1', '문자목록', 1540, 400, "return ($input.first().json.sms || []).map((x) => ({ json: x }));"),
    post('h1', '문자보내기', 1760, 400, 'https://api.sms-gate.app/3rdparty/v1/messages', SMS,
      '={{ JSON.stringify({ textMessage: { text: $json.text }, phoneNumbers: [$json.phone] }) }}'),
    split('s2', '알림목록', 1540, 550, "return ($input.first().json.notify || []).map((x) => ({ json: x }));"),
    post('h2', '알림보내기', 1760, 550, BASE + 'kakao-notify', OWNER, '={{ JSON.stringify($json) }}'),
    split('s3', '우편목록', 1540, 700, "const f = $input.first().json.fills || []; return f.length ? [{ json: { fills: f } }] : [];"),
    post('h3', '우편넣기', 1760, 700, BASE + 'site-fill', OWNER, '={{ JSON.stringify({ fills: $json.fills }) }}'),
    split('s4', '모집목록', 1540, 850, "return ($input.first().json.crew || []).map((x) => ({ json: x }));"),
    post('h4', '모집시작', 1760, 850, BASE + 'crew-recruit', OWNER, '={{ JSON.stringify($json) }}'),
  ],
  connections: {
    보고서요청: { main: [c('요청')] },
    요청: { main: [c('만들기인가')] },
    만들기인가: { main: [c('현장읽기'), c('요청응답')] },
    저녁7시: { main: [c('현장읽기')] },
    아침9시: { main: [c('현장읽기')] },
    현장읽기: { main: [c('설정읽기')] },
    설정읽기: { main: [c('할일읽기')] },
    할일읽기: { main: [c('앱코드받기')] },
    앱코드받기: { main: [c('실행')] },
    실행: { main: [[...c('요청이었나'), ...c('문자목록'), ...c('알림목록'), ...c('우편목록'), ...c('모집목록')]] },
    요청이었나: { main: [c('만들기응답'), []] },
    문자목록: { main: [c('문자보내기')] },
    알림목록: { main: [c('알림보내기')] },
    우편목록: { main: [c('우편넣기')] },
    모집목록: { main: [c('모집시작')] },
  },
  settings: { executionOrder: 'v1', timezone: 'Asia/Seoul', saveDataSuccessExecution: 'all' },
};
workflow.nodes.forEach((n) => { if (!n.credentials) delete n.credentials; });
process.stdout.write(JSON.stringify(workflow, null, 2));
