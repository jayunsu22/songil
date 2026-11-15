// node n8n/site_fill/test_report.js — ⏰ 정시 업무보고 (11/7). 이름·번호는 지어낸 것
const path = require('path');
const assert = require('assert');
const wf = JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build.js')]).toString());
const code = wf.nodes.find((n) => n.name === '정시보고').parameters.jsCode;
const sd = {};
let clock = 0;
function run(body) {
  const real = Date.now;
  Date.now = () => clock;
  try {
    const $ = (n) => {
      if (n === '보고요청' && body) return { first: () => ({ json: { body } }) };
      throw new Error('not executed');
    };
    return new Function('$getWorkflowStaticData', '$', code)(() => sd, $)[0].json;
  } finally { Date.now = real; }
}
const kst = (s) => Date.parse(s + '+09:00');
const SUB = { endpoint: 'https://push.example/abc', keys: { p256dh: 'x', auth: 'y' } };

// 등록·설정
let o = run({ action: 'test' });
assert.deepStrictEqual([o.resp.ok, o.push.length, o.tg.to], [true, 0, 'tg'], '등록 전: 텔레그램 시험만');
const o2 = run({ action: 'notify', item: { title: '💬 김실장님 · 견적 문의', text: '문짝 2개', buttons: [{ text: '확인함', data: 'k|abc123|ok' }] } });
assert.deepStrictEqual([o2.resp.ok, o2.push.length], [false, 0], '등록 전 앱 알림은 못 보냄 → 텔레그램으로');
o = run({ action: 'sub', subscription: JSON.stringify(SUB), device: 'phone' });
assert.deepStrictEqual([o.resp.ok, o.resp.n, o.resp.cfg.from, o.resp.cfg.to], [true, 1, 8, 17]);
run({ action: 'sub', subscription: SUB });
assert.strictEqual(sd.pushSubs.length, 1, '같은 폰은 한 번');

// 9~10시 사이 일 → 10시 보고
sd.worklog = [
  { id: 'a', t: kst('2026-11-09T08:59:00'), title: '어제 일', state: '' },
  { id: 'b', t: kst('2026-11-09T09:00:00'), title: '보현나이스 출입정보 질문 문자 보냄', detail: '결재함 → 실장님', state: '' },
  { id: 'c', t: kst('2026-11-09T09:12:00'), title: '세대 비번 넣음', state: '' },
  { id: 'd', t: kst('2026-11-09T09:05:00'), title: '윤인재님 문자 못 보냄', detail: '번호 없음', state: 'need' },
];
sd.feed = [{ id: 'f1', t: kst('2026-11-09T09:31:00'), kind: 'sms', from: '오니브실장님', siteName: '영화아이닉스', lines: ['공동현관 비번 넣음'] }];
clock = kst('2026-11-09T10:00:04');   // 월요일 10시 (몇 초 늦게)
o = run(null);
// 11/13: 정시 보고는 텔레그램으로 (앱 알림 없음)
assert.strictEqual(o.push.length, 0);
assert.strictEqual(o.tg.to, 'tg');
assert.ok(o.tg.text.startsWith('<b>⏰ 오전 10시 업무보고 (9시~10시)</b>\n처리 2건 · 받은 답장 1건 · 확인 필요 1건\n✅ 보현나이스'), o.tg.text);
assert.ok(o.tg.text.includes('⚠️ 윤인재님 문자 못 보냄') && o.tg.text.includes('💬 오니브실장님 답장 · 영화아이닉스'));
assert.ok(o.tg.text.endsWith('#order/log">업무 내역 전체</a>'));
const card = sd.feed.find((x) => x.kind === 'report');
assert.deepStrictEqual([card.done.length, card.need.length, card.replies.length, card.quiet], [2, 1, 1, false]);
run(null);
assert.strictEqual(sd.feed.filter((x) => x.kind === 'report').length, 1, '같은 시각 두 번 안 넣음');

// 일 없는 시간: 알림 없음, 대화에 회색 한 줄
clock = kst('2026-11-09T11:00:00');
o = run(null);
assert.deepStrictEqual([o.push.length, o.resp.empty, !!o.tg], [0, true, false]);
assert.ok(sd.feed.some((x) => x.kind === 'report' && x.quiet && x.title.startsWith('⏰ 오전 11시')));
run({ action: 'cfg', cfg: { on: true, from: 8, to: 17, empty: true, sat: true, sun: false } });
clock = kst('2026-11-09T12:00:00');
assert.ok(run(null).tg, '일 없는 시간도 알림 켜면 보냄');
assert.ok(sd.feed.some((x) => x.kind === 'report' && x.title.startsWith('⏰ 낮 12시')));

// 시간·요일 밖
clock = kst('2026-11-09T07:00:00'); assert.strictEqual(run(null).resp.skip, true);
clock = kst('2026-11-09T18:00:00'); assert.strictEqual(run(null).resp.skip, true);
clock = kst('2026-11-08T10:00:00'); assert.strictEqual(run(null).resp.skip, true, '일요일 끔');
clock = kst('2026-11-07T10:00:00'); assert.notStrictEqual(run(null).resp.skip, true, '토요일 켬');
run({ action: 'cfg', cfg: { on: false } });
clock = kst('2026-11-09T13:00:00'); assert.strictEqual(run(null).resp.skip, true, '끄면 안 보냄');

// 시험 보내기·빼기
o = run({ action: 'test' });
assert.ok(o.resp.ok && o.tg.text.startsWith('<b>🔔 시험') && o.push[0].title.startsWith('🔔 시험'));
// 📝 업무비서 알림 (11/13): 비서 대화 카드 + 폰 알림 (버튼 앞 2개만 알림에, 전부는 카드에)
const B = (i) => ({ text: '담당' + i, data: 'k|abc123|o' + i });
o = run({ action: 'notify', item: { title: '🚚 필름 주문', text: '누구에게 보낼까요?', buttons: [B(0), B(1), B(2)], url: 'https://jayunsu22.github.io/sitenote/index.html#order/approve' } });
assert.deepStrictEqual([o.resp.ok, o.push.length, o.push[0].extra.actions.length, o.push[0].extra.actions[0].title], [true, 1, 2, '담당0']);
assert.ok(o.push[0].url.endsWith('#order/approve'));
const nc = sd.feed.find((x) => x.id === o.resp.id);
assert.deepStrictEqual([nc.kind, nc.buttons.length, nc.title], ['notice', 3, '🚚 필름 주문']);
o = run({ action: 'notify', item: { title: 'x', text: 'y', url: 'https://evil.example/' } });
assert.ok(o.push[0].url.endsWith('#order'), '다른 곳 주소는 안 씀');
run({ action: 'unsub', endpoint: SUB.endpoint });
assert.strictEqual(sd.pushSubs.length, 0);
console.log('report ok');
