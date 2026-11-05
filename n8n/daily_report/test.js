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
let o = run('실행', Object.assign({ 오후5시: {} }, air));
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

// [되돌리기] (11/5): 완료표시를 취소하면 우편함으로 앱 기록도 되돌리고, 결과에서도 뺀다
(function () {
  const keep = JSON.stringify(sd);
  sd.reports['2026-11-09'] = { rep: { date: '2026-11-09', today: '2026-11-08', done: [], next: [{ id: 'film:u1', kind: 'film', title: '필름 주문: 되돌림', res: '', siteId: 'u1', act: 'film' }] }, decisions: {}, at: 0 };
  let u = run('요청', { 보고서요청: { body: { action: 'decide', date: '2026-11-09', id: 'film:u1', act: 'done' } } });
  assert.strictEqual(u.fills[0].kind, 'filmOrdered');
  const day = u.fills[0].at;
  u = run('요청', { 보고서요청: { body: { action: 'decide', date: '2026-11-09', id: 'film:u1', act: '' } } });
  assert.deepStrictEqual([u.fills[0].kind, u.fills[0].what, u.fills[0].siteId, u.fills[0].at], ['undo', 'film', 'u1', day]);
  assert.ok(!(sd.log[day] || []).some((x) => x.title === '필름 주문: 되돌림 — 완료'));
  assert.ok(!sd.marks['film:u1']);
  // 결재만 하고 완료가 아니었으면 되돌릴 것이 없다
  run('요청', { 보고서요청: { body: { action: 'decide', date: '2026-11-09', id: 'film:u1', act: 'later' } } });
  assert.strictEqual(run('요청', { 보고서요청: { body: { action: 'decide', date: '2026-11-09', id: 'film:u1', act: '' } } }).fills.length, 0);
  Object.keys(sd).forEach((k) => delete sd[k]); Object.assign(sd, JSON.parse(keep));
})();
// 결재 뒤 앱에서 이미 주문했으면 9시에 또 보내지 않는다 (11/5)
(function () {
  const keep = JSON.stringify(sd), at = clock;
  clock = Date.parse('2026-11-09T00:00:00Z');
  sd.reports['2026-11-09'] = { rep: { date: '2026-11-09', today: '2026-11-08', done: [], next: [{ id: 'film:s1', kind: 'film', title: '필름', res: '', siteId: 's1', act: 'film' }] }, decisions: { 'film:s1': { act: 'go', at: 0, to: { label: '가', phone: '01000000009' } } }, at: 0 };
  const g = run('실행', Object.assign({ 아침9시: {} }, air, { 현장읽기: rec([Object.assign({}, site, { filmStage: 2 })]) }));
  assert.strictEqual(g.sms.length, 0);
  clock = at;
  Object.keys(sd).forEach((k) => delete sd[k]); Object.assign(sd, JSON.parse(keep));
})();

// 그날 저녁 보고서의 '오늘 결과' 에 9시에 한 일
clock = Date.parse('2026-11-04T10:00:00Z');
run('실행', Object.assign({ 오후5시: {} }, air, { 현장읽기: rec([Object.assign({}, site, { filmStage: 2 })]) }));
const done = sd.reports['2026-11-05'].rep.done.map((d) => d.title);
assert.ok(done.some((t) => t.includes('필름 발주 완료')) && done.some((t) => t.includes('인원 모집 시작')), done.join());

// [완료표시] 잔금 → 우편함 done/pay + 오늘 결과 + 다음 보고서에서 빠짐 / [내가할께] → 다음 보고서에 '어제 내가할께'
const ended = { id: 's9', name: '끝난현장', date: '2026-10-28', days: [{ date: '2026-10-28', staff: ['가A'] }] };
const ask = { id: 's8', name: '모집현장', date: '2026-11-08', needStaff: 3, days: [{ date: '2026-11-08', staff: [] }], films: [{ code: 'x1' }], filmStage: 2, pwLobby: '1', pwUnit: '1', toilet: '1' };
const air2 = Object.assign({}, air, { 현장읽기: rec([ended, ask]) });
clock = Date.parse('2026-11-05T10:00:00Z');   // 11/5 19시 → 11/6 보고서
run('실행', Object.assign({ 오후5시: {} }, air2));
const ids6 = sd.reports['2026-11-06'].rep.next.map((n) => n.id);
assert.ok(ids6.includes('pay:s9') && ids6.includes('staff:s8'), ids6.join());
o = run('요청', { 보고서요청: { body: { action: 'decide', date: '2026-11-06', id: 'pay:s9', act: 'done' } } });
assert.deepStrictEqual(o.fills, [{ siteId: 's9', kind: 'done', what: 'pay', at: '2026-11-05', room: '결재함' }]);
run('요청', { 보고서요청: { body: { action: 'decide', date: '2026-11-06', id: 'staff:s8', act: 'mine' } } });
clock = Date.parse('2026-11-06T00:00:00Z');   // 9시 — 내가할께는 아무것도 안 함
o = run('실행', Object.assign({ 아침9시: {} }, air2));
assert.strictEqual(o.fills.length + o.sms.length + o.crew.length, 0);
clock = Date.parse('2026-11-06T10:00:00Z');   // 11/6 19시 → 11/7 보고서 (앱에 아직 반영 안 됐어도 잔금은 빠짐)
run('실행', Object.assign({ 오후5시: {} }, air2));
const r7 = sd.reports['2026-11-07'].rep;
assert.ok(!r7.next.some((n) => n.id === 'pay:s9'));
assert.strictEqual(r7.next.find((n) => n.id === 'staff:s8').again, true);
// 🤖 능동 비서 받은 정보함 (11/4): 어느 현장? → 고르면 우편함 / 잔금 → 완료 / 넘김
o = run('요청', { 보고서요청: { body: { action: 'inbox_add', items: [
  { kind: 'pick', room: '가업체', title: '공동현관 비번', quote: '공현 #0000', fills: [{ kind: 'field', field: 'pwLobby', value: '#0000' }],
    cands: [{ id: 's1', name: '시험현장', date: '2026-11-06' }, { id: 's2', name: '다른현장', date: '2026-11-07' }] },
  { kind: 'pay', room: '가업체', title: '잔금 넣었다고 함', quote: '잔금 넣었어요', siteId: 's9', name: '끝난현장' },
  { kind: 'pick', room: '가업체', title: '현장 후보 없음', fills: [{ kind: 'field', field: 'pwUnit', value: '1' }], cands: [] }] } } });
assert.strictEqual(o.resp.n, 2);
const ib = run('요청', { 보고서요청: { body: { action: 'get' } } }).resp.inbox;
assert.strictEqual(ib.length, 2);
assert.ok(!('fills' in ib[0]), '비번 값은 결재함 목록에 안 나감');
o = run('요청', { 보고서요청: { body: { action: 'inbox', id: ib[0].id, act: 'pick', siteId: 's2' } } });
assert.deepStrictEqual(o.fills, [{ kind: 'field', field: 'pwLobby', value: '#0000', siteId: 's2', room: '가업체', at: o.fills[0].at }]);
o = run('요청', { 보고서요청: { body: { action: 'inbox', id: ib[1].id, act: 'done' } } });
assert.deepStrictEqual(o.fills.map((f) => [f.kind, f.what, f.siteId]), [['done', 'pay', 's9']]);
assert.strictEqual(o.resp.inbox.length, 0);
assert.strictEqual(run('요청', { 보고서요청: { body: { action: 'inbox', id: ib[1].id, act: 'done' } } }).resp.ok, false);
// 낮 12시 — 내일 작업자 안내 (11/5)
{
  clock = Date.parse('2026-11-05T03:00:00Z');
  const noon = { 낮12시: {}, 현장읽기: rec([{ id: 'n1', name: '가람마을', date: '2026-11-06', pwLobby: '#0000', days: [{ date: '2026-11-06', staff: ['마바', '김정헌', '사아'] }] }]),
    설정읽기: rec([{ people: { 마바: { phone: '010-1111-2222' } } }]), 할일읽기: rec([]), 앱코드받기: air.앱코드받기 };
  const r1 = run('실행', noon);
  assert.deepStrictEqual(r1.sms.map((x) => x.phone), ['+821011112222'], '번호 있는 작업자만, 사장님 본인은 빼고');
  assert.ok(r1.sms[0].text.includes('#0000'));
  assert.strictEqual(r1.watch[0].fill, false);
  assert.ok(r1.notify[0].text.includes('연락처 없어 못 보냄: 사아'));
  assert.strictEqual(run('실행', noon).sms.length, 0, '같은 안내는 한 번만');
}
console.log('daily_report ok');
