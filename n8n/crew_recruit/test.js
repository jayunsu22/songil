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
const ph = (i) => '0100000000' + i;
const q = [['가A', 25], ['나B', 23], ['다C', 17], ['라D', 30]].map(([name, pay], i) => ({ name, pay, phone: ph(i) }));
const reply = (i, message) => run('reply.js', '답장받음', { event: 'sms:received', payload: { message, sender: '+8210000000' + i } });

// ── 하루 (예전 앱 모양): 42만·2자리 → 가A(25)+다C(17)
let o = run('start.js', '모집요청', { action: 'start', siteId: 's1', siteName: '시험현장', date: '2026-11-05', label: '11/5(목)', slots: 2, budget: 42, queue: q, band: '밴드 글' });
assert.strictEqual(o.resp.sent, 2);
assert.deepStrictEqual(o.sms.map((x) => x.phone), ['+821000000000', '+821000000002']);
assert.strictEqual(o.sms[0].text, '안녕하세요. 김정헌실장님의\nAI 인원모집비서입니다.\n\n11월 5일 구인중입니다.\n일정 되시는날을 알려주세요.\n\n5일 가능\n\n이렇게 보내주시면 됩니다.\n감사합니다.');
const rid = o.resp.id;

// 다C '아니요' → 아쉽네요, 남은 17만·1자리에 들 사람 없음, 가A 기다리는 중이라 아직 '모두 안 됨' 아님
o = reply(2, '아니요 안돼요');
assert.deepStrictEqual(o.sms.map((x) => x.text), ['아쉽네요~ 담에봐요~']);
assert.strictEqual(o.notify.length, 0);
// 모르는 번호의 문자는 지나감
o = run('reply.js', '답장받음', { payload: { message: '네', sender: '+82109999999' } });
assert.strictEqual(o.sms.length + o.notify.length, 0);
// 가A '네' → 텔레그램 [5일 넣기][안 넣기]
o = reply(0, '네 가능해요');
assert.deepStrictEqual(o.notify[0].buttons[0].map((b) => b.data), ['k|' + rid + '|y0a', 'k|' + rid + '|n0']);
// 넣기 → 감사 문자 + 우편함, 1자리 남았는데 후보가 예산을 넘음 → 모두 안 됨 (밴드)
o = run('act.js', '버튼요청', { rid, act: 'y0a' });
assert.deepStrictEqual(o.sms.map((x) => x.text), ['5일 확정입니다. 감사합니다~\n주소확정되면 보내드릴께요~']);
assert.deepStrictEqual(o.fills, [{ siteId: 's1', kind: 'crewAdd', date: '2026-11-05', name: '가A', room: '인원 모집', at: '2026-11-03' }]);
assert.ok(o.notify[0].text.includes('모두 안 됨'));
o = run('act.js', '버튼요청', { rid, act: 'y0a' });
assert.ok(o.resp.msg.includes('이미 넣었습니다'));

// ── 여러 날: 15일 2자리, 16일 1자리, 18일 2자리 (예산 없음). 라D 는 16일이 바쁨
const q2 = q.map((x) => Object.assign({}, x, { dates: x.name === '라D' ? ['2026-11-15', '2026-11-18'] : ['2026-11-15', '2026-11-16', '2026-11-18'] }));
o = run('start.js', '모집요청', { action: 'start', siteId: 's3', siteName: '여러날', queue: q2, days: [
  { date: '2026-11-15', label: '11/15(일)', slots: 2, band: 'b15' }, { date: '2026-11-16', label: '11/16(월)', slots: 1 }, { date: '2026-11-18', label: '11/18(수)', slots: 2 }] });
const r3 = o.resp.id;
// 가A: 15·16·18, 나B: 15·18 (16은 가A 가 잡음) → 2명
assert.deepStrictEqual(o.sms.map((x) => x.phone), ['+821000000000', '+821000000001']);
assert.ok(o.sms[0].text.includes('11월 15일,16일,18일 구인중입니다.') && o.sms[0].text.includes('15일 가능\n16일 불가능\n18일 가능'));
assert.ok(o.sms[1].text.includes('11월 15일,18일 구인중입니다.'));
// 가A '15일 가능 16일 불가능 18일 가능' → 16일은 놓아줌 → 다C 에게 16일만
o = reply(0, '15일 가능\n16일 불가능\n18일 가능');
assert.strictEqual(o.notify.length, 1);
assert.ok(o.notify[0].text.includes('가능: 15일 · 18일') && o.notify[0].text.includes('불가: 16일'));
assert.deepStrictEqual(o.notify[0].buttons.map((row) => row.map((b) => b.data.split('|')[2])), [['y0d0', 'y0d2'], ['y0a', 'n0']]);
assert.deepStrictEqual(o.sms.map((x) => x.phone), ['+821000000002']);
assert.ok(o.sms[0].text.includes('11월 16일 구인중입니다.'));
// [모두 넣기] → '15일, 18일 확정입니다…' + 우편함 두 날
o = run('act.js', '버튼요청', { rid: r3, act: 'y0a' });
assert.deepStrictEqual(o.sms.map((x) => x.text), ['15일, 18일 확정입니다. 감사합니다~\n주소확정되면 보내드릴께요~']);
assert.deepStrictEqual(o.fills.map((f) => f.date), ['2026-11-15', '2026-11-18']);
assert.ok(o.resp.msg.includes('남은 자리: 15일 1 · 16일 1 · 18일 1'));
// 나B '네' (날짜 없이) → 15·18 둘 다 → 15일만 넣기
o = reply(1, '넵');
assert.ok(o.notify[0].text.includes('가능: 15일 · 18일'));
o = run('act.js', '버튼요청', { rid: r3, act: 'y1d0' });
assert.deepStrictEqual(o.sms.map((x) => x.text), ['15일 확정입니다. 감사합니다~\n주소확정되면 보내드릴께요~']);
assert.ok(o.resp.msg.includes('18일은 아직 잡아 둠'));
assert.deepStrictEqual(o.notify[0].buttons.map((row) => row.map((b) => b.data.split('|')[2])), [['y1d2'], ['n1']]);
// 그다음 [안 넣기] → 18일을 놓아줌 → 라D 에게 18일 (다C 는 16일 묻는 중)
o = run('act.js', '버튼요청', { rid: r3, act: 'n1' });
assert.deepStrictEqual(o.sms.map((x) => x.phone), ['+821000000003']);
assert.ok(o.sms[0].text.includes('11월 18일 구인중입니다.'));
// 다C 못 읽는 답 → 사장님께 원문 + 버튼
o = reply(2, '16일은 오후만요');
assert.ok(o.notify[0].text.includes('못 읽음: 16일'));
// 상태
o = run('start.js', '모집요청', { action: 'status', siteId: 's3' });
assert.deepStrictEqual(o.resp.recruits[0].days.map((d) => d.in), [2, 0, 1]);
assert.deepStrictEqual(o.resp.recruits[0].people.map((p) => p.st), ['in', 'in', 'yes', 'asked']);

// 달이 바뀌는 날짜
o = run('start.js', '모집요청', { action: 'start', siteId: 's4', queue: q, days: [{ date: '2026-11-30', slots: 1 }, { date: '2026-12-01', slots: 1 }] });
assert.ok(o.sms[0].text.includes('11월 30일, 12월 1일 구인중입니다.') && o.sms[0].text.includes('30일 가능\n1일 불가능'));
// 다 찬 날에 늦게 '가능' → 마감 문자
o = run('act.js', '버튼요청', { rid: o.resp.id, act: 'n0' });   // 가A 안 넣기 → 나B 에게
const r4 = Object.keys(sd.recruits).find((k) => sd.recruits[k].siteId === 's4');
sd.recruits[r4].people[1].in = [0, 1]; sd.recruits[r4].people[1].st = 'in'; sd.recruits[r4].people[1].hold = [];
sd.recruits[r4].people[0].st = 'timeout';
o = reply(0, '30일 가능 1일 가능');
assert.deepStrictEqual(o.sms.map((x) => x.text), ['30일, 1일은 마감되었어요~ 담에봐요~']);

// ── 무응답: 1자리, 답 없음 → 2시간 뒤 한 번 더 → 또 2시간 → '연락이 없어서' + 다음 사람
o = run('start.js', '모집요청', { action: 'start', siteId: 's2', siteName: '시험2', date: '2026-11-06', label: '11/6(금)', slots: 1, budget: 0, queue: q });
assert.strictEqual(o.sms.length, 1);
for (const r of Object.values(sd.recruits)) if (r.siteId !== 's2') r.active = false;
clock += 119 * 60e3; o = run('clock.js'); assert.strictEqual(o.sms.length, 0);
clock += 2 * 60e3; o = run('clock.js'); assert.strictEqual(o.sms.length, 1);                 // 2번째 묻기
clock += 121 * 60e3; o = run('clock.js');
assert.deepStrictEqual(o.sms.map((x) => x.text.split('\n')[0]), ['연락이 없어서 다른분께 연락드릴께요.', '안녕하세요. 김정헌실장님의']);
assert.strictEqual(o.sms[1].phone, '+821000000001');
// 밤(21시)에는 시계가 문자를 안 보낸다
clock = Date.parse('2026-11-03T12:00:00Z');
o = run('clock.js'); assert.strictEqual(o.sms.length, 0);
// 모집 답이 아닌 문자는 문자_답장으로 넘긴다 (11/5), 모집 답은 안 넘긴다
o = run('reply.js', '답장받음', { payload: { message: '공현 0000', sender: '+821077776666' } });
assert.deepStrictEqual(o.forward, { action: 'in', from: '+821077776666', msg: '공현 0000' });
const wfj = JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build.js')]).toString());
assert.ok(wfj.connections['답장'].main[0].some((c) => c.node === '넘길문자'), '답장 → 넘길문자 연결');
console.log('crew_recruit ok');
