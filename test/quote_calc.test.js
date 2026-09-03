const test = require('node:test');
const assert = require('node:assert');
const { lineAmount, calcQuote } = require('../quote_calc.js');

test('lineAmount: 인건비 + 자재비×소모량, 난이도와 수량을 곱한다', () => {
  // 문짝: 인건비 13000, 자재비 9000, 소모량 5 => 13000 + 45000 = 58000
  assert.strictEqual(
    lineAmount({ 인건비단가: 13000, 자재비단가: 9000, 자재소모량: 5, 난이도: 1, 수량: 1 }),
    58000
  );
});

test('lineAmount: 난이도와 수량이 모두 곱해진다', () => {
  assert.strictEqual(
    lineAmount({ 인건비단가: 13000, 자재비단가: 9000, 자재소모량: 5, 난이도: 1.2, 수량: 3 }),
    208800  // 58000 * 1.2 * 3
  );
});

test('lineAmount: 결과는 항상 정수다', () => {
  const v = lineAmount({ 인건비단가: 12000, 자재비단가: 9000, 자재소모량: 2.5, 난이도: 1.15, 수량: 3 });
  assert.strictEqual(Number.isInteger(v), true);
});

test('calcQuote: 조정이 없으면 총액은 라인금액의 합이다', () => {
  const items = [
    { 구역: '현관', 품목명: '현관문', 단위: '세트', 인건비단가: 25000, 자재비단가: 9000, 자재소모량: 5, 난이도: 1, 수량: 1 },
    { 구역: '거실', 품목명: '몰딩',   단위: 'm',    인건비단가: 30000, 자재비단가: 9000, 자재소모량: 0.1, 난이도: 1, 수량: 10 },
  ];
  const r = calcQuote(items, []);
  assert.strictEqual(r.소계, 70000 + 309000);
  assert.strictEqual(r.조정_합계율, 0);
  assert.strictEqual(r.총액, r.소계);
});

test('calcQuote: 조정 비율은 곱이 아니라 합으로 적용된다', () => {
  const items = [
    { 구역: '거실', 품목명: '몰딩', 단위: 'm', 인건비단가: 30000, 자재비단가: 9000, 자재소모량: 0.1, 난이도: 1, 수량: 10 },
  ];
  // +10% 와 -10% 는 상쇄되어 0% 가 되어야 한다 (곱이면 0.99가 된다)
  const r = calcQuote(items, [{ 항목명: '거주중', 비율: 0.1 }, { 항목명: '업자단가', 비율: -0.1 }]);
  assert.strictEqual(r.조정_합계율, 0);
  assert.strictEqual(r.총액, 309000);
});

test('calcQuote: 총액은 표시금액의 합과 정확히 일치한다', () => {
  // 반올림 때문에 소계×(1+율) 과 어긋날 수 있는 값들을 일부러 쓴다
  const items = [
    { 구역: 'A', 품목명: 'a', 단위: '개', 인건비단가: 13333, 자재비단가: 0, 자재소모량: 0, 난이도: 1, 수량: 1 },
    { 구역: 'A', 품목명: 'b', 단위: '개', 인건비단가: 7777,  자재비단가: 0, 자재소모량: 0, 난이도: 1, 수량: 1 },
    { 구역: 'A', 품목명: 'c', 단위: '개', 인건비단가: 3333,  자재비단가: 0, 자재소모량: 0, 난이도: 1, 수량: 1 },
  ];
  const r = calcQuote(items, [{ 항목명: '거주중', 비율: 0.15 }]);
  const sum = r.라인들.reduce((s, l) => s + l.표시금액, 0);
  assert.strictEqual(r.총액, sum);
});

test('calcQuote: 빈 목록이면 0을 돌려준다', () => {
  const r = calcQuote([], [{ 항목명: '거주중', 비율: 0.1 }]);
  assert.strictEqual(r.소계, 0);
  assert.strictEqual(r.총액, 0);
  assert.deepStrictEqual(r.라인들, []);
});
