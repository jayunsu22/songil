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

// 2단계: 종류 탭 — 단가표 1단위 금액 비율로 (1분견적과 같은 '시공품목정보')
const 표 = {
  '샤시(단창)': { 시공_품목명: '샤시(단창)', 인건비단가: 58000, 자재비단가: 9000, 자재소모량: 1, 견적단위: 'm' },
  '샤시(2중창)': { 시공_품목명: '샤시(2중창)', 인건비단가: 56000, 자재비단가: 9000, 자재소모량: 1.7, 견적단위: 'm' },
  '시스템샤시': { 시공_품목명: '시스템샤시', 인건비단가: 90000, 자재비단가: 9000, 자재소모량: 1, 견적단위: 'm' },
  '싱크대': { 시공_품목명: '싱크대', 인건비단가: 40000, 자재비단가: 9000, 자재소모량: 2, 견적단위: 'm' },
  '싱크대 상부장': { 시공_품목명: '싱크대 상부장', 인건비단가: 40000, 자재비단가: 9000, 자재소모량: 1, 견적단위: 'm' },
  '싱크대 하부장': { 시공_품목명: '싱크대 하부장', 인건비단가: 40000, 자재비단가: 9000, 자재소모량: 1, 견적단위: 'm' },
};
test('종류찾기: 샤시 단창/2중창/시스템(그냥 샤시=2중창), 싱크대 전체/상부장/하부장, 상가샤시는 제외', () => {
  assert.deepStrictEqual(Q.종류찾기('샤시(2중창)'), { group: '샤시', idx: 1 });
  assert.deepStrictEqual(Q.종류찾기('시스템샤시'), { group: '샤시', idx: 2 });
  assert.deepStrictEqual(Q.종류찾기('샤시 단창'), { group: '샤시', idx: 0 });
  assert.deepStrictEqual(Q.종류찾기('30평 싱크대 상부장'), { group: '싱크대', idx: 1 });
  assert.deepStrictEqual(Q.종류찾기('싱크대'), { group: '싱크대', idx: 0 });
  assert.deepStrictEqual(Q.종류찾기('싱크대 상하부장 전체'), { group: '싱크대', idx: 0 });
  assert.deepStrictEqual(Q.종류찾기('싱크대 하부장'), { group: '싱크대', idx: 2 });
  assert.strictEqual(Q.종류찾기('상가샤시(양쪽시공)'), null);
  assert.strictEqual(Q.종류찾기('화장실문'), null);
});
test('종류 바꾸기: 3m 2중창 331,500 → 단창 201,000 · 시스템 297,000, 30평 싱크대 전체 980,000 → 상부장만 490,000 (이름도 바뀜)', () => {
  const c = Q.붙이기(Q.새카트(), [{ name: '샤시(2중창)', label: '3m', subtotal: 331500 }, { name: '30평 싱크대 전체', label: '1세트', subtotal: 980000 }], {});
  const [샤시, 싱크] = c.items;
  assert.deepStrictEqual([0, 1, 2].map(i => Q.종류금액(샤시, i, 표)), [201000, 331500, 297000]);
  assert.ok(Q.종류고르기(샤시, 0, 표));
  assert.deepStrictEqual([샤시.subtotal, Q.보이는이름(샤시)], [201000, '샤시 단창']);
  assert.ok(Q.종류고르기(샤시, 2, 표));
  assert.strictEqual(샤시.subtotal, 297000, '처음 금액 기준이라 여러 번 바꿔도 틀어지지 않는다');
  Q.종류고르기(싱크, 1, 표);
  assert.deepStrictEqual([싱크.subtotal, Q.보이는이름(싱크)], [490000, '30평 싱크대 상부장만']);
  assert.strictEqual(Q.종류고르기(싱크, 1, null), false, '단가표가 없으면 안 바꾼다');
  const t = Q.고른글(Q.카트읽기(c));
  assert.ok(t.includes('- 샤시 시스템 3m: 297,000원') && t.includes('- 30평 싱크대 상부장만 1세트: 490,000원'), t);
});

test('앞 견적에 있던 품목을 다시 물으면 덧붙이지 않고 그 자리에서 바꾼다 (20평 전체 → 화장실문 2세트)', () => {
  let c = Q.붙이기(null, [
    { name: '방문', label: '3세트', subtotal: 663000 },
    { name: '화장실문', label: '1세트', subtotal: 221000 },
    { name: '샤시(2중창)', label: '3m', subtotal: 331500 },
  ], { message: '20평 아파트 전체' });
  c = Q.붙이기(c, [{ name: '화장실문', label: '2세트', subtotal: 442000 }], { message: '화장실문 문+틀 2세트' });
  assert.deepStrictEqual(c.items.map((x) => x.name + ' ' + x.label), ['방문 3세트', '화장실문 2세트', '샤시(2중창) 3m']);
  assert.strictEqual(Q.합계(c), 663000 + 442000 + 331500);
  assert.deepStrictEqual(c.바뀐, [{ 이름: '화장실문', 전: '1세트 221,000원', 후: '2세트 442,000원' }]);
  assert.deepStrictEqual(c.새로, [c.items[1].id]);
  // 새 품목은 뒤에 붙는다
  c = Q.붙이기(c, [{ name: '중문', label: '1세트', subtotal: 318500 }]);
  assert.strictEqual(c.items.length, 4);
  assert.deepStrictEqual(c.바뀐, []);
});
