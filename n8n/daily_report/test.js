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

// 결재 저장: 출입정보 질문은 카톡(번호 없음)도 사람·방법·방을 그대로 (11/5)
(function () {
  const keep = JSON.stringify(sd);
  sd.reports['2026-11-30'] = { rep: { date: '2026-11-30', today: '2026-11-29', done: [], next: [{ id: 'ask:z', kind: 'ask', title: 'q', res: '', siteId: 'z', act: 'ask' }] }, decisions: {}, at: 0 };
  const r = run('요청', { 보고서요청: { body: { action: 'decide', date: '2026-11-30', id: 'ask:z', act: 'go', to: { label: '실장님 · 💬 카톡', name: '실장님', via: 'kakao', kakaoRoom: '', client: '블라블라' } } } });
  assert.deepStrictEqual(r.resp.decisions['ask:z'].to, { label: '실장님 · 💬 카톡', phone: '', via: 'kakao', name: '실장님', kakaoRoom: '', client: '블라블라' });
  Object.keys(sd).forEach((k) => delete sd[k]); Object.assign(sd, JSON.parse(keep));
})();
// ❓ 출입정보 질문 (11/5): 문자면 번호 질문 + 답 기억(fill), 카톡이면 노트북에 맡김(ask 정보), 이미 다 받았으면 안 함
(function () {
  const keep = JSON.stringify(sd), at = clock;
  clock = Date.parse('2026-11-09T00:00:00Z');
  const empty = Object.assign({}, site, { id: 'a1', name: '보현나이스 802호', date: '2026-11-15', pwLobby: '', toilet: '' });
  const mk = (to) => { sd.reports['2026-11-09'] = { rep: { date: '2026-11-09', today: '2026-11-08', done: [], next: [{ id: 'ask:a1', kind: 'ask', title: '보현 출입정보 질문', res: '', siteId: 'a1', act: 'ask' }] }, decisions: { 'ask:a1': { act: 'go', at: 0, to } }, at: 0 }; };
  mk({ name: '대표님', phone: '010-0000-0021', via: 'sms', client: '블라블라' });
  let g = run('실행', Object.assign({ 아침9시: {} }, air, { 현장읽기: rec([empty]) }));
  assert.strictEqual(g.sms.length, 1);
  assert.ok(g.sms[0].text.includes('1. 공동현관 비번') && g.sms[0].text.includes('확인 부탁드려요'), g.sms[0].text);
  assert.ok(/\d\. .*겹치는 다른 공정/.test(g.sms[0].text), '업체 확인 질문도 들어감');
  assert.deepStrictEqual([g.watch[0].fill, g.watch[0].keys], [true, ['pwLobby', 'toilet']]);
  mk({ name: '실장님', kakaoRoom: '블라블라 실장님', via: 'kakao', client: '블라블라' });
  g = run('실행', Object.assign({ 아침9시: {} }, air, { 현장읽기: rec([empty]) }));
  assert.strictEqual(g.sms.length, 0);
  assert.deepStrictEqual([g.kakao[0].room, g.kakao[0].ask.missing, g.kakao[0].ttl], ['블라블라 실장님', ['pwLobby', 'toilet'], 600]);
  assert.ok(g.kakao[0].ask.checks.length >= 1);
  mk({ name: '대표님', phone: '01000000021', via: 'sms' });
  const full = Object.assign({}, empty, { pwLobby: '1', toilet: '1', checks: { door: { v: '네' }, overlap: { v: '없음' }, xmark: { v: '확답 받음' } } });
  g = run('실행', Object.assign({ 아침9시: {} }, air, { 현장읽기: rec([full]) }));
  assert.strictEqual(g.sms.length + g.kakao.length, 0, '이미 다 받았으면 안 보냄');
  clock = at;
  Object.keys(sd).forEach((k) => delete sd[k]); Object.assign(sd, JSON.parse(keep));
})();

// ❓ 출입정보 질문 자동 (11/6): 결재 안 해도 9시에 정해 둔 담당자에게, 연기·내가·완료면 안 나감, 9시 뒤 [진행해] 는 바로, 밤에는 거절
(function () {
  const keep = JSON.stringify(sd), at = clock;
  clock = Date.parse('2026-11-09T00:00:00Z');
  const empty = Object.assign({}, site, { id: 'a3', clientId: 'c3', name: '보현', date: '2026-11-15', pwLobby: '' });
  const client = { id: 'c3', name: '블라블라', contacts: [{ name: '대표님', phone: '01000000021' }, { name: '실장님', phone: '01000000022', ask: true }] };
  const air3 = Object.assign({}, air, { 현장읽기: rec([empty]), 거래처읽기: rec([client]) });
  const mk = (decisions, date) => { sd.reports[date || '2026-11-09'] = { rep: { date: date || '2026-11-09', today: '2026-11-08', done: [], next: [{ id: 'ask:a3', kind: 'ask', title: '보현 출입정보 질문', res: '', siteId: 'a3', act: 'ask' }] }, decisions: decisions || {}, at: 0 }; delete (sd.asked || {}).a3; };
  mk();
  assert.ok(run('요청', { 보고서요청: { body: { action: 'askPlan' } } }).resp.plans.a3, '결재 안 한 카드도 노트북에 알림');
  let g = run('실행', Object.assign({ 아침9시: {} }, air3));
  assert.deepStrictEqual(g.sms.map((x) => x.phone), ['+821000000022'], '정해 둔 담당자에게');
  assert.ok(!g.sms[0].text.includes('번호로 짧게'), '안내 한 줄 없음');
  assert.ok(g.sms[0].text.includes('1. 공동현관 비번'));
  assert.ok(sd.reports['2026-11-09'].decisions['ask:a3'].doneAt && sd.asked.a3);
  assert.strictEqual(run('실행', Object.assign({ 아침9시: {} }, air3)).sms.length, 0, '두 번 안 보냄');
  for (const act of ['later', 'mine', 'done']) {
    mk({ 'ask:a3': { act, at: 0, to: null } });
    assert.strictEqual(run('실행', Object.assign({ 아침9시: {} }, air3)).sms.length, 0, act);
  }
  // ⏸ 멈춤(later) 은 askPlan 에서도 빠지고, 뒤에 [진행해] 를 누르면 나간다
  mk({ 'ask:a3': { act: 'later', at: 0, to: null } });
  assert.ok(!run('요청', { 보고서요청: { body: { action: 'askPlan' } } }).resp.plans.a3);
  mk();
  g = run('실행', Object.assign({ 아침9시: {} }, air3, { 거래처읽기: rec([]) }));
  assert.strictEqual(g.sms.length + g.kakao.length, 0);
  assert.ok(g.notify[0].text.includes('담당자가 없습니다'));
  // 9시 뒤 [진행해] (오늘 카드) — 실행으로 넘겨 바로 보냄. 지난 카드·내일 카드는 안 넘김
  clock = Date.parse('2026-11-09T01:00:00Z');
  mk();
  const body = { action: 'decide', date: '2026-11-09', id: 'ask:a3', act: 'go', to: { label: 'x', name: '대표님', via: 'sms', phone: '01000000021' } };
  assert.strictEqual(run('요청', { 보고서요청: { body } }).make, true);
  g = run('실행', Object.assign({ 보고서요청: { body } }, air3));
  assert.deepStrictEqual(g.sms.map((x) => x.phone), ['+821000000021'], '고른 사람에게');
  assert.ok(g.resp.ok && g.resp.rep && g.resp.decisions['ask:a3'].doneAt, '앱이 그릴 응답');
  mk(null, '2026-11-10');
  assert.ok(!run('요청', { 보고서요청: { body: Object.assign({}, body, { date: '2026-11-10' }) } }).make, '내일 카드는 9시를 기다림');
  clock = Date.parse('2026-11-09T12:00:00Z');   // 한국 21시
  mk();
  const night = run('요청', { 보고서요청: { body } });
  assert.strictEqual(night.resp.ok, false);
  assert.ok(!sd.reports['2026-11-09'].decisions['ask:a3'], '밤에는 결재도 안 남김');
  clock = at;
  Object.keys(sd).forEach((k) => delete sd[k]); Object.assign(sd, JSON.parse(keep));
})();

// ⏸ 멈춘 출입정보 카드 (11/6): 받거나 완료할 때까지 날마다 멈춘 채로 다시, 진행해·완료·다 받음이면 안 올림
(function () {
  const keep = JSON.stringify(sd), at = clock;
  Object.keys(sd.reports).forEach((k) => delete sd.reports[k]);
  const empty = Object.assign({}, site, { id: 'a4', clientId: 'c4', name: '멈춘현장', date: '2026-11-20', needStaff: 0, pwLobby: '', days: [{ date: '2026-11-20', staff: ['가A'] }], filmStage: 2 });
  const air4 = Object.assign({}, air, { 현장읽기: rec([empty]), 거래처읽기: rec([{ id: 'c4', name: '업체', contacts: [{ name: '실장님', phone: '01000000022', ask: true }] }]) });
  const card = { id: 'ask:a4', kind: 'ask', title: '멈춘현장 출입정보 질문', res: '공동현관', siteId: 'a4', act: 'ask' };
  sd.reports['2026-11-13'] = { rep: { date: '2026-11-13', today: '2026-11-12', done: [], next: [card] }, decisions: { 'ask:a4': { act: 'later', at: 5, to: null } }, at: 0 };
  clock = Date.parse('2026-11-13T08:00:00Z');   // 11/13 17시 → 11/14 보고서
  run('실행', Object.assign({ 오후5시: {} }, air4));
  let box = sd.reports['2026-11-14'];
  assert.ok(box.rep.next.some((n) => n.id === 'ask:a4'), '다음 보고서에 다시');
  assert.strictEqual(box.decisions['ask:a4'].act, 'later', '멈춘 채로');
  clock = Date.parse('2026-11-14T00:00:00Z');   // 9시 — 멈춘 카드는 안 나감
  let g = run('실행', Object.assign({ 아침9시: {} }, air4));
  assert.strictEqual(g.sms.length + g.kakao.length, 0);
  clock = Date.parse('2026-11-14T08:00:00Z');   // 다음 날도 이어짐
  run('실행', Object.assign({ 오후5시: {} }, air4));
  assert.strictEqual(sd.reports['2026-11-15'].decisions['ask:a4'].act, 'later');
  // 멈춤을 풀면 다음 9시에 자동으로
  run('요청', { 보고서요청: { body: { action: 'decide', date: '2026-11-15', id: 'ask:a4', act: '' } } });
  clock = Date.parse('2026-11-15T00:00:00Z');
  g = run('실행', Object.assign({ 아침9시: {} }, air4));
  assert.strictEqual(g.sms.length, 1, '풀면 9시에 나감');
  // 나간 뒤에는 다시 안 올림
  clock = Date.parse('2026-11-15T08:00:00Z');
  run('실행', Object.assign({ 오후5시: {} }, air4));
  assert.ok(!sd.reports['2026-11-16'].rep.next.some((n) => n.id === 'ask:a4'));
  // 다 받았으면 안 올림
  sd.reports['2026-11-16'].rep.next.push(card);
  sd.reports['2026-11-16'].decisions['ask:a4'] = { act: 'later', at: 6, to: null };
  const full = Object.assign({}, empty, { pwLobby: '1', pwUnit: '1', toilet: '1', checks: { door: { v: '네' }, overlap: { v: '없음' }, xmark: { v: '확답 받음' } } });
  clock = Date.parse('2026-11-16T08:00:00Z');
  run('실행', Object.assign({ 오후5시: {} }, air4, { 현장읽기: rec([full]) }));
  assert.ok(!sd.reports['2026-11-17'].rep.next.some((n) => n.id === 'ask:a4'));
  clock = at;
  Object.keys(sd).forEach((k) => delete sd[k]); Object.assign(sd, JSON.parse(keep));
})();

// ❓ 결재함 ↔ 노트북 (11/6): askPlan 에 [진행해] 한 현장, 9시에 보내면 asked(결재함), 노트북이 먼저 물었으면 9시에 안 보냄
(function () {
  const keep = JSON.stringify(sd), at = clock;
  clock = Date.parse('2026-11-09T00:00:00Z');
  const empty = Object.assign({}, site, { id: 'a2', name: '보현', date: '2026-11-15', pwLobby: '' });
  sd.reports['2026-11-09'] = { rep: { date: '2026-11-09', today: '2026-11-08', done: [], next: [{ id: 'ask:a2', kind: 'ask', title: '보현 출입정보 질문', res: '', siteId: 'a2', act: 'ask' }] },
    decisions: { 'ask:a2': { act: 'go', at: 0, to: { name: '실장님', via: 'sms', phone: '01000000022' } } }, at: 0 };
  let r = run('요청', { 보고서요청: { body: { action: 'askPlan' } } });
  assert.deepStrictEqual([r.resp.plans.a2.who, r.resp.plans.a2.via], ['실장님', 'sms']);
  let g = run('실행', Object.assign({ 아침9시: {} }, air, { 현장읽기: rec([empty]) }));
  assert.strictEqual(g.sms.length, 1);
  assert.strictEqual(sd.asked.a2.by, '결재함');
  r = run('요청', { 보고서요청: { body: { action: 'askPlan' } } });
  assert.ok(!r.resp.plans.a2 && r.resp.asked.a2, '보낸 뒤엔 plan 이 아니라 asked');
  // 노트북이 먼저 물었으면 9시에 안 보냄
  delete sd.asked.a2; sd.reports['2026-11-09'].decisions['ask:a2'].doneAt = 0;
  run('요청', { 보고서요청: { body: { action: 'asked', siteId: 'a2', by: '노트북', via: 'kakao', who: '블라블라 실장님' } } });
  g = run('실행', Object.assign({ 아침9시: {} }, air, { 현장읽기: rec([empty]) }));
  assert.strictEqual(g.sms.length, 0);
  assert.ok(g.fills.some((f) => /노트북이 이미 물음/.test(f.title)));
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
