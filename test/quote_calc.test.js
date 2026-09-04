const test = require('node:test');
const assert = require('node:assert');
const { lineAmount, calcQuote } = require('../quote_calc.js');

/* 기대값은 전부 에어테이블 시공품목정보의 [예상_총금액] 열에 실제로 찍혀 있는
   숫자를 가져온 것이다. 내가 생각한 공식이 아니라 운영 중인 수식을 기준으로 잡는다.
   (예전에 공식을 잘못 추측해 넣었다가 견적 금액이 전부 틀렸던 적이 있다) */

test('lineAmount: 현관문 = (인건비+자재비) × 자재소모량 → 170,000', () => {
  // d_08 현관문: 인건비 25000, 자재비 9000, 소모량 5.0 · 에어테이블 예상_총금액 ₩170,000
  assert.strictEqual(
    lineAmount({ 인건비단가: 25000, 자재비단가: 9000, 자재소모량: 5, 난이도: 1, 수량: 1 }),
    170000
  );
});

test('lineAmount: 문짝 → 110,000', () => {
  // d_03 문짝: 13000, 9000, 5.0 · 에어테이블 ₩110,000
  assert.strictEqual(
    lineAmount({ 인건비단가: 13000, 자재비단가: 9000, 자재소모량: 5, 난이도: 1, 수량: 1 }),
    110000
  );
});

test('lineAmount: 몰딩 1m → 3,900', () => {
  // m_01 몰딩: 30000, 9000, 0.1 · 에어테이블 ₩3,900
  assert.strictEqual(
    lineAmount({ 인건비단가: 30000, 자재비단가: 9000, 자재소모량: 0.1, 난이도: 1, 수량: 1 }),
    3900
  );
});

test('lineAmount: 신발장 1m → 62,500 (소수 소모량)', () => {
  // p_09 신발장: 16000, 9000, 2.5 · 에어테이블 ₩62,500
  assert.strictEqual(
    lineAmount({ 인건비단가: 16000, 자재비단가: 9000, 자재소모량: 2.5, 난이도: 1, 수량: 1 }),
    62500
  );
});

test('lineAmount: 평형별은 수량에 설정길이를 넣으면 에어테이블과 같아진다', () => {
  // y_01 20평 몰딩: 35000, 9000, 0.1, 평형별_설정길이 80m · 에어테이블 ₩352,000
  assert.strictEqual(
    lineAmount({ 인건비단가: 35000, 자재비단가: 9000, 자재소모량: 0.1, 난이도: 1, 수량: 80 }),
    352000
  );
});

test('lineAmount: 난이도와 수량이 모두 곱해진다', () => {
  // 문짝 110,000 × 1.2 × 3
  assert.strictEqual(
    lineAmount({ 인건비단가: 13000, 자재비단가: 9000, 자재소모량: 5, 난이도: 1.2, 수량: 3 }),
    396000
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
  assert.strictEqual(r.소계, 170000 + 39000);
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
  assert.strictEqual(r.총액, 39000);
});

test('calcQuote: 총액은 표시금액의 합과 정확히 일치한다', () => {
  // 반올림 때문에 소계×(1+율) 과 어긋날 수 있는 값들을 일부러 쓴다
  const items = [
    { 구역: 'A', 품목명: 'a', 단위: '개', 인건비단가: 13333, 자재비단가: 0, 자재소모량: 1, 난이도: 1, 수량: 1 },
    { 구역: 'A', 품목명: 'b', 단위: '개', 인건비단가: 7777,  자재비단가: 0, 자재소모량: 1, 난이도: 1, 수량: 1 },
    { 구역: 'A', 품목명: 'c', 단위: '개', 인건비단가: 3333,  자재비단가: 0, 자재소모량: 1, 난이도: 1, 수량: 1 },
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
