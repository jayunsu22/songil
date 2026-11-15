// node n8n/kakao_buttons/test.js — 버튼정리: 텔레그램 콜백과 업무비서 앱 버튼(kakao-press, 11/13). 이름은 지어낸 것
const path = require('path');
const assert = require('assert');
const wf = JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build.js')]).toString());
const code = wf.nodes.find((n) => n.name === '버튼정리').parameters.jsCode;
let sd = {};
function run({ app, cq }) {
  const $ = (n) => {
    if (n === '앱버튼') return { isExecuted: !!app, first: () => ({ json: { body: app } }) };
    if (n === '버튼누름') { if (!cq) throw new Error('not executed'); return { first: () => ({ json: { callback_query: cq } }) }; }
    throw new Error('no ' + n);
  };
  return new Function('$', '$input', '$getWorkflowStaticData', code)($, { first: () => ({ json: { fields: { 텔레그램_챗ID: '111' } } }) }, () => sd);
}
// 텔레그램 그대로
let o = run({ cq: { id: 'q1', from: { id: 111 }, data: 'k|ab12cd|ok', message: { message_id: 5, chat: { id: 111 }, text: '💬 김실장님' } } });
assert.deepStrictEqual([o[0].json.query_id, o[0].json.message_id], ['q1', '5']);
assert.ok(o[0].json.text.endsWith('✔ 확인함'));
assert.deepStrictEqual(run({ cq: { id: 'q2', from: { id: 999 }, data: 'k|ab12cd|ok' } }), [], '남이 누른 텔레그램 버튼은 무시');
// 앱 버튼: 확인함
o = run({ app: { data: 'k|ab12cd|ok', text: '💬 김실장님 · 견적 문의' } });
assert.ok(o[0].json.text.startsWith('💬 김실장님 · 견적 문의') && o[0].json.text.endsWith('✔ 확인함'));
// 앱 버튼: 답장 보내기 → 노트북 할 일
sd = {};
o = run({ app: { data: 'k|cd34ef|rs', text: '초안 「네 내일 뵐게요~」' } });
assert.deepStrictEqual(sd.jobs.map((j) => [j.job, j.action]), [['cd34ef', 'rs']]);
// 고쳐서 보내기 → 초안 글
o = run({ app: { data: 'k|cd34ef|rc', text: '초안 「네 내일 뵐게요~」' } });
assert.ok(o[0].json.text.includes('<code>네 내일 뵐게요~</code>'));
// 이상한 버튼 → 앱엔 ❌ 글 (기다리지 않게)
o = run({ app: { data: 'zz', text: '' } });
assert.ok(o[0].json.text.startsWith('❌'));
o = run({ app: { data: 'k|ab12cd|nope', text: '' } });
assert.ok(o[0].json.text.startsWith('❌'));
// 흐름
const c = wf.connections;
assert.deepStrictEqual(c['앱버튼'].main[0].map((x) => x.node), ['가맹점_조회']);
assert.deepStrictEqual(c['버튼지우고_표시'].main[0].map((x) => x.node), ['앱이었나']);
assert.deepStrictEqual(c['앱이었나'].main[0].map((x) => x.node), ['앱버튼응답']);
console.log('kakao_buttons ok');
