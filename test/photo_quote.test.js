// node test/photo_quote.test.js — 📷 사진으로 견적 묶기 (값은 지어낸 것)
const test = require('node:test');
const assert = require('assert');
const PQ = require('../photo_quote.js');
const zones = [
  { 구역: '거실', items: [{ 체크_ID: 'g1', 표시_품목명: '거실샤시1' }, { 체크_ID: 'm', 표시_품목명: '몰딩', 파생: true }] },
  { 구역: '현관', items: [{ 체크_ID: 'h1', 표시_품목명: '현관문' }, { 체크_ID: 'h2', 표시_품목명: '중문' }] },
];
test('품목목록: 파생 품목은 빼고 구역·이름', () => {
  assert.deepStrictEqual(PQ.품목목록(zones), [{ id: 'g1', 구역: '거실', 이름: '거실샤시1' }, { id: 'h1', 구역: '현관', 이름: '현관문' }, { id: 'h2', 구역: '현관', 이름: '중문' }]);
});
test('합치기: 같은 품목은 한 줄 (수량은 큰 수), 구역 순서, 못 고른 사진은 확인 필요', () => {
  const r = PQ.합치기([
    { n: 0, id: 'h1', qty: 1, film: 'px451 화이트스톤', memo: '도어락 교체 예정', text: '현관 방화문 px451' },
    { n: 3, id: 'h2', qty: 1, film: 'ps170', text: '중문 ps170' },
    { n: 4, id: 'h2', qty: 1, film: 'ps170', text: '중문 ps170' },
    { n: 2, id: 'g1', qty: 2, film: 'ps010' },
    { n: 5, id: null, text: '' },
    { n: 6, id: '없는품목', text: '보일러실' },
  ], zones);
  assert.deepStrictEqual(r.rows.map((x) => [x.id, x.qty, x.photos, x.films]), [['g1', 2, [2], ['ps010']], ['h1', 1, [0], ['px451 화이트스톤']], ['h2', 1, [3, 4], ['ps170']]]);
  assert.deepStrictEqual(r.rows[1].memos, ['도어락 교체 예정']);
  assert.deepStrictEqual(r.need.map((x) => [x.n, x.text]), [[5, ''], [6, '보일러실']]);
});
test('설명덧붙이기: 필름·메모를 뒤에, 두 번 안 붙임', () => {
  const a = PQ.설명덧붙이기('문짝+문틀 필름', ['px451 화이트스톤'], ['도어락 교체 예정']);
  assert.strictEqual(a, '문짝+문틀 필름\n· 필름: px451 화이트스톤\n· 도어락 교체 예정');
  assert.strictEqual(PQ.설명덧붙이기(a, ['px451 화이트스톤'], ['도어락 교체 예정']), a);
  assert.strictEqual(PQ.설명덧붙이기('', [], []), '');
});
