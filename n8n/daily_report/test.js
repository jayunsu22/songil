// node n8n/daily_report/test.js — 코드 노드를 n8n 없이 돌려 본다 (번호·이름은 지어낸 것)
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const wf = JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build.js')]).toString());
const codeOf = (name) => wf.nodes.find((n) => n.name === name).parameters.jsCode;
const sd = {};
let clock = Date.parse('2026-11-03T10:00:00Z');   // 한국 19시
function run(name, inputs) {
  const RealNow = Date.now;
  Date.now = () => clock;
  try {
    const $ = (n) => {
      const v = inputs[n];
      return { isExecuted: v !== undefined, first: () => ({ json: v || {} }), all: () => [{ json: v || {} }] };
    };
    return new Function('$getWorkflowStaticData', '$', codeOf(name))(() => sd, $)[0].json;
  } finally { Date.now = RealNow; }
}
const rec = (list) => ({ records: list.map((d) => ({ fields: { data: JSON.stringify(d) } })) });
const site = { id: 's1', name: '시험현장', date: '2026-11-06', needStaff: 2, days: [{ date: '2026-11-06', staff: [] }],
  films: [{ code: 'ps035', qty: '2롤' }], pwLobby: '1', pwUnit: '1', toilet: '있음', dayPlan: { '2026-11-06': { need: 2 } } };
const settings = { taskRules: { filmDays: 3, staffDays: 3, supplyDays: 1 }, team: ['가A', '나B'],
  people: { 가A: { pay: '20', phone: '01000000001' }, 나B: { pay: '18', phone: '01000000002' } } };
const SHARE = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'n8n_거래처별_현장관리', 'share.js'), 'utf8');
const air = { 현장읽기: rec([site]), 설정읽기: rec([settings]), 할일읽기: rec([]), 앱코드받기: { data: SHARE } };

// 저녁 7시 — 보고서 + 카톡 글
let o = run('실행', Object.assign({ 저녁7시: {} }, air));
assert.strictEqual(o.resp.date, '2026-11-04');
const ids = sd.reports['2026-11-04'].rep.next.map((n) => n.id);
assert.ok(ids.includes('film:s1') && ids.includes('staff:s1'), ids.join());
assert.ok(sd.outbox[0].text.includes('👉 결재하기: https://jayunsu22.github.io/sitenote/#approve/2026-11-04'));

// 노트북이 outbox 를 가져가면 비워진다
o = run('요청', { 보고서요청: { body: { action: 'outbox' } } });
assert.strictEqual(o.resp.texts.length, 1);
assert.strictEqual(run('요청', { 보고서요청: { body: { action: 'outbox' } } }).resp.texts.length, 0);

// 결재: 필름 진행(담당자) · 인원 진행 · 없는 항목은 거절
o = run('요청', { 보고서요청: { body: { action: 'decide', date: '2026-11-04', id: 'film:s1', act: 'go', to: { label: '멋진필름·주문담당', phone: '010-0000-0009' } } } });
assert.strictEqual(o.resp.decisions['film:s1'].to.phone, '01000000009');
run('요청', { 보고서요청: { body: { action: 'decide', date: '2026-11-04', id: 'staff:s1', act: 'go' } } });
assert.throws(() => run('요청', { 보고서요청: { body: { action: 'decide', date: '2026-11-04', id: 'nope', act: 'go' } } }));
o = run('요청', { 보고서요청: { body: { action: 'get' } } });
assert.strictEqual(o.resp.date, '2026-11-04');

// 다음 날 오전 9시 — 필름 주문 문자 + 우편함 기록, 인원 모집 시작
clock = Date.parse('2026-11-04T00:00:00Z');
o = run('실행', Object.assign({ 아침9시: {} }, air));
assert.deepStrictEqual(o.sms.map((x) => x.phone), ['+821000000009']);
assert.ok(o.sms[0].text.includes('ps035 2롤'));
assert.strictEqual(o.fills[0].kind, 'filmOrdered');
assert.strictEqual(o.crew.length, 1);
assert.deepStrictEqual(o.crew[0].days.map((d) => [d.date, d.slots]), [['2026-11-06', 2]]);
// 두 번 돌아도 다시 하지 않는다, 처리한 결재는 바꿀 수 없다
assert.strictEqual(run('실행', Object.assign({ 아침9시: {} }, air)).sms.length, 0);
o = run('요청', { 보고서요청: { body: { action: 'decide', date: '2026-11-04', id: 'film:s1', act: 'later' } } });
assert.strictEqual(o.resp.ok, false);

// 그날 저녁 보고서의 '오늘 결과' 에 9시에 한 일
clock = Date.parse('2026-11-04T10:00:00Z');
run('실행', Object.assign({ 저녁7시: {} }, air, { 현장읽기: rec([Object.assign({}, site, { filmStage: 2 })]) }));
const done = sd.reports['2026-11-05'].rep.done.map((d) => d.title);
assert.ok(done.some((t) => t.includes('필름 발주 완료')) && done.some((t) => t.includes('인원 모집 시작')), done.join());
console.log('daily_report ok');
