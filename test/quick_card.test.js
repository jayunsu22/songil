// 1분견적 결과 카드 계산 (quick_card.js). 기준: 사장님 — 몰딩·걸레받이는 거실·주방·현관 합쳐 50%, 나머지 50% 를 방 수로 (2026-10-24)
const test = require('node:test');
const assert = require('node:assert');
const Q = require('../quick_card.js');

test('평수 → 방 수: 20평대 2 · 30평대 3 · 40평 이상 4, 모르면 3', () => {
  assert.strictEqual(Q.평수('30평 몰딩'), 30);
  assert.strictEqual(Q.평수('몰딩'), null);
  assert.deepStrictEqual([Q.방수(24), Q.방수(30), Q.방수(39), Q.방수(45), Q.방수(null)], [2, 3, 3, 4, 3]);
});

test('나누기: 공용 50%, 방은 나머지를 똑같이 (100원 단위, 남는 건 마지막 방) — 합은 늘 전체와 같다', () => {
  const p = Q.나누기(484000, 3);
  assert.deepStrictEqual(p.map(x => [x.label, x.amount]), [['거실·주방·현관', 242000], ['방1', 80600], ['방2', 80600], ['방3', 80800]]);
  [[484000, 3], [99000, 4], [123450, 2], [500, 5]].forEach(([t, n]) => {
    assert.strictEqual(Q.나누기(t, n).reduce((s, x) => s + x.amount, 0), t);
  });
});

test('붙이기: 0원 줄은 버리고, 몰딩은 평수(이름·글)로 묶음, 채팅을 더 치면 이어 붙는다', () => {
  let c = Q.붙이기(Q.새카트(), [{ name: '30평 몰딩', label: '1세트', subtotal: 484000, material: 99000, labor: 385000 }, { name: '없는것', subtotal: 0 }], { quoteId: 'A1', message: '30평 몰딩' });
  assert.strictEqual(c.items.length, 1);
  assert.deepStrictEqual(c.items[0].bundle, { 평: 30, rooms: 3, off: [] });
  c = Q.붙이기(c, [{ name: '걸레받이', label: '1세트', subtotal: 200000 }, { name: '화장실문', label: '2개', subtotal: 460000 }], { quoteId: 'A2', message: '24평 걸레받이, 화장실문2개' });
  assert.deepStrictEqual(c.items.map(i => [i.id, i.name, !!i.bundle]), [['q1', '30평 몰딩', true], ['q2', '걸레받이', true], ['q3', '화장실문', false]]);
  assert.strictEqual(c.items[1].bundle.rooms, 2);
  assert.strictEqual(c.quoteId, 'A2');
});

test('합계·고른글: 품목을 빼거나 방을 빼면 그만큼 줄고, 상담 글에 (뺌)으로 남는다', () => {
  let c = Q.붙이기(Q.새카트(), [{ name: '30평 몰딩', label: '1세트', subtotal: 484000 }, { name: '화장실문', label: '2개', subtotal: 460000 }, { name: '현관문', label: '1개', subtotal: 280000 }], {});
  assert.strictEqual(Q.합계(c), 1224000);
  c.items[0].bundle.off = ['방2'];
  c.items[2].on = false;
  assert.strictEqual(Q.합계(c), 484000 - 80600 + 460000);
  const t = Q.고른글(c);
  assert.ok(t.includes('30평 몰딩 1세트 (방 3개): 403,400원 · 거실·주방·현관, 방1, 방3 / 뺌: 방2'), t);
  assert.ok(t.includes('- 현관문 1개 (뺌)'), t);
  assert.ok(t.endsWith('합계: 863,400원'), t);
});

test('카트읽기: 이상한 값은 걸러 기본으로', () => {
  const c = Q.카트읽기({ items: [{ name: 'A', subtotal: '1000', on: false, bundle: { rooms: 0 } }, null, { subtotal: 5 }] });
  assert.strictEqual(c.items.length, 1);
  assert.deepStrictEqual([c.items[0].subtotal, c.items[0].on, c.items[0].bundle.rooms], [1000, false, 3]);
});

test('설명: 빈 줄·----- 구분 줄은 뺀다', () => {
  const c = Q.붙이기(Q.새카트(), [{ name: '붙박이장', label: '6m', subtotal: 375000, text: '붙박이장틀+문짝 시공금액입니다.\n-------------------------------------\n\n문짝은 앞면만 시공하는 기준입니다.' }], {});
  assert.strictEqual(c.items[0].text, '붙박이장틀+문짝 시공금액입니다.\n문짝은 앞면만 시공하는 기준입니다.');
});
