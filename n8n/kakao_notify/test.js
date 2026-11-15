// node n8n/kakao_notify/test.js — 카톡_알림 › 글만들기: 텔레그램/업무비서 앱 나누기 (사장님 11/13). 이름·번호는 지어낸 것
const path = require('path');
const assert = require('assert');
const wf = JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build.js')]).toString());
const code = wf.nodes.find((n) => n.name === '글만들기').parameters.jsCode;
const run = (body) => new Function('$', '$input', code)(
  () => ({ first: () => ({ json: { body } }) }),
  { first: () => ({ json: { fields: { 텔레그램_챗ID: '111' } } }) })[0].json;

// 거래처 카톡 요약 (노트북이 꾸민 글 + 버튼) → 앱
let o = run({ html: true, text: '💬 <b>김실장님 · 견적 문의</b>\n한빛아파트 문짝 2개 &lt;급함&gt;\n새 글 2개 · 사진 2장', buttons: [[{ text: '확인함', data: 'k|ab12cd|ok' }]] });
assert.strictEqual(o.route, 'app');
assert.deepStrictEqual([o.item.title, o.item.text], ['💬 김실장님 · 견적 문의', '한빛아파트 문짝 2개 <급함>\n새 글 2개 · 사진 2장']);
assert.deepStrictEqual(o.item.buttons, [{ text: '확인함', data: 'k|ab12cd|ok' }]);
assert.strictEqual(o.n, 1, '텔레그램으로 돌아갈 때 쓸 버튼도 그대로');

// 5시 업무일정표: 결재 링크가 알림 누른 곳
o = run({ html: true, text: '📅 <b>11/14(토) 업무일정표</b>\n결재하기: <a href="https://jayunsu22.github.io/sitenote/#approve/2026-11-14">열기</a>' });
assert.deepStrictEqual([o.route, o.item.url, o.item.text], ['app', 'https://jayunsu22.github.io/sitenote/#approve/2026-11-14', '결재하기: 열기']);

// 기계 상태는 텔레그램
for (const t of ['[카톡읽기] 가견적 발행 실패', '[비서] 박사장님 방에 카톡을 못 보냈어요 (x)', '[현장] 업체에 못 물음 · 그린빌', '[카톡] 업무일정표를 못 올렸습니다']) {
  assert.strictEqual(run({ text: t }).route, 'tg', t);
}
for (const t of ['🔴 <b>노트북이 멈춘 것 같아요</b>', '🟢 <b>노트북이 다시 돌아왔어요</b>', '🔋 <b>서비스 확인 필요</b>', '🤖 <b>비서: 클로드(소넷) 답을 못 받아</b>']) {
  assert.strictEqual(run({ html: true, text: t }).route, 'tg', t);
}
// 정해서 보내면 그대로
assert.strictEqual(run({ to: 'tg', html: true, text: '<b>⏰ 오전 10시 업무보고</b>\n처리 2건' }).route, 'tg');
assert.strictEqual(run({ to: 'app', text: '[카톡] 시험' }).route, 'app');
// 그 밖 (문자 답장·인원 모집·직접 답장해 주세요) → 앱
for (const t of ['📨 <b>최실장님 문자</b>', '👤 <b>홍길동(15만)</b> · 그린빌\n남은 날: 11/14 — 넣을까요?', '🙋 <b>박사장님</b> 방 — 답장 안 보냈어요, 직접 답장해 주세요']) {
  assert.strictEqual(run({ html: true, text: t }).route, 'app', t);
}
// 흐름: 앱으로 → 앱알림 → 앱됐나 → (실패) 텔레그램으로 → 버튼개수
const c = wf.connections;
assert.deepStrictEqual(c['글만들기'].main[0].map((x) => x.node), ['앱으로']);
assert.deepStrictEqual(c['앱으로'].main.map((m) => m[0].node), ['앱알림', '버튼개수']);
assert.deepStrictEqual(c['앱됐나'].main.map((m) => m[0].node), ['응답', '텔레그램으로']);
assert.ok(wf.nodes.find((n) => n.name === '앱알림').continueOnFail);
console.log('kakao_notify ok');
