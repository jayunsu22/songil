// node n8n/crew_recruit/test.js — 코드 노드를 n8n 없이 돌려 본다 (번호는 지어낸 것)
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const sd = {};
let clock = Date.parse('2026-11-03T05:00:00Z');   // 한국 14시
function run(file, nodeName, body) {
  const RealNow = Date.now;
  Date.now = () => clock;
  try {
    const fn = new Function('$getWorkflowStaticData', '$', read('lib.js') + '\n' + read(file));
    return fn(() => sd, (n) => ({ first: () => ({ json: n === nodeName ? { body } : {} }) }))[0].json;
  } finally { Date.now = RealNow; }
}
const q = [['가A', 25], ['나B', 23], ['다C', 17], ['라D', 30]].map(([name, pay], i) => ({ name, pay, phone: '0100000000' + i }));

// 시작: 42만·2자리 → 가A(25)+다C(17)
let o = run('start.js', '모집요청', { action: 'start', siteId: 's1', siteName: '시험현장', date: '2026-11-05', label: '11/5(목)', slots: 2, budget: 42, queue: q, band: '밴드 글' });
assert.strictEqual(o.resp.sent, 2);
assert.deepStrictEqual(o.sms.map((x) => x.phone), ['+821000000000', '+821000000002']);
assert.ok(o.sms[0].text.startsWith('안녕하세요~\n11/5(목) 일정 가능하신가요?'));
const rid = o.resp.id;

// 다C '아니요' → 아쉽네요 + 다음: 남은 17만·1자리 → 나B(23)·라D(30) 는 넘음 → 남은 후보 없음, 가A 답 기다림이라 아직 '모두 안 됨' 아님
o = run('reply.js', '답장받음', { event: 'sms:received', payload: { message: '아니요 안돼요', sender: '+82100000002' } });
assert.deepStrictEqual(o.sms.map((x) => x.text), ['아쉽네요~ 담에봐요~']);
assert.strictEqual(o.notify.length, 0);

// 모르는 번호의 문자는 지나감
o = run('reply.js', '답장받음', { payload: { message: '네', sender: '+82109999999' } });
assert.strictEqual(o.sms.length + o.notify.length, 0);

// 가A '네' → 텔레그램 버튼
o = run('reply.js', '답장받음', { payload: { message: '네 가능해요', sender: '+82100000000' } });
assert.strictEqual(o.notify.length, 1);
assert.deepStrictEqual(o.notify[0].buttons[0].map((b) => b.data), ['k|' + rid + '|y0', 'k|' + rid + '|n0']);

// [넣기] → 감사 문자 + 우편함, 1자리 남았는데 후보가 예산을 넘음 → 모두 안 됨 (밴드)
o = run('act.js', '버튼요청', { rid, act: 'y0' });
assert.deepStrictEqual(o.sms.map((x) => x.text), ['네~ 감사합니다.\n주소확정되면 보내드릴께요~']);
assert.deepStrictEqual(o.fills, [{ siteId: 's1', kind: 'crewAdd', date: '2026-11-05', name: '가A', room: '인원 모집', at: '2026-11-03' }]);
o = run('act.js', '버튼요청', { rid, act: 'y0' });
assert.ok(o.resp.msg.includes('이미 넣었습니다'));

// 예산 없는 모집: 2자리, 답 없음 → 2시간 뒤 한 번 더 → 또 2시간 → '연락이 없어서' + 다음 사람
o = run('start.js', '모집요청', { action: 'start', siteId: 's2', siteName: '시험2', date: '2026-11-06', label: '11/6(금)', slots: 1, budget: 0, queue: q });
assert.strictEqual(o.sms.length, 1);
clock += 119 * 60e3; o = run('clock.js'); assert.strictEqual(o.sms.length, 0);
clock += 2 * 60e3; o = run('clock.js'); assert.strictEqual(o.sms.length, 1);                 // 2번째 묻기
clock += 121 * 60e3; o = run('clock.js');
assert.deepStrictEqual(o.sms.map((x) => x.text.split('\n')[0]), ['연락이 없어서 다른분께 연락드릴께요.', '안녕하세요~']);
assert.strictEqual(o.sms[1].phone, '+821000000001');                                        // 다음 사람 나B

// 밤(21시)에는 시계가 문자를 안 보낸다
clock = Date.parse('2026-11-03T12:00:00Z');
o = run('clock.js'); assert.strictEqual(o.sms.length, 0);

// 진행 상황
o = run('start.js', '모집요청', { action: 'status', siteId: 's1' });
assert.deepStrictEqual(o.resp.recruits[0].people.map((p) => p.st), ['in', 'wait', 'no', 'wait']);
assert.strictEqual(o.resp.recruits[0].exhausted, true);
console.log('crew_recruit ok');
