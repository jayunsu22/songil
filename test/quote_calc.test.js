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

/* ---------- 직접 입력 품목 ----------
   방화문 양면·쌍여닫이처럼 기준 단가로 안 잡히는 건이 있어, 품목명과 금액을
   직접 적어 넣을 수 있게 했다. 그런 줄은 계산하지 않고 적은 금액을 그대로 쓴다. */

test('lineAmount: 직접금액이 있으면 단가 계산을 하지 않고 그 금액을 쓴다', () => {
  assert.strictEqual(
    lineAmount({ 직접금액: 250000, 인건비단가: 25000, 자재비단가: 9000, 자재소모량: 3, 난이도: 1, 수량: 1 }),
    250000
  );
});

test('lineAmount: 직접금액은 난이도·수량의 영향을 받지 않는다', () => {
  // 최종 금액을 직접 적는 칸이라 여기에 또 곱하면 사장님이 적은 숫자와 달라진다.
  assert.strictEqual(
    lineAmount({ 직접금액: 250000, 난이도: 1.5, 수량: 3 }),
    250000
  );
});

test('lineAmount: 직접금액은 마이너스도 된다 (빼는 항목)', () => {
  assert.strictEqual(lineAmount({ 직접금액: -50000 }), -50000);
});

test('lineAmount: 직접금액 0 은 0 이다 (계산으로 넘어가지 않는다)', () => {
  // 0 을 falsy 로 보고 단가 계산으로 넘어가면 엉뚱한 금액이 나온다.
  assert.strictEqual(
    lineAmount({ 직접금액: 0, 인건비단가: 25000, 자재비단가: 9000, 자재소모량: 3, 난이도: 1, 수량: 1 }),
    0
  );
});

test('calcQuote: 직접 입력 품목도 전체조정을 같이 받는다', () => {
  // 업자단가 -10% 는 견적 전체에 걸려야 한다. 직접 입력만 빠지면 합계가 안 맞는다.
  const r = calcQuote(
    [{ 직접금액: 200000 }],
    [{ 항목명: '업자단가', 비율: -0.1 }]
  );
  assert.strictEqual(r.소계, 200000);
  assert.strictEqual(r.총액, 180000);
});

test('calcQuote: 계산 품목과 직접 입력 품목이 섞여도 합계가 맞는다', () => {
  const r = calcQuote([
    // d_09 방화문: (25000+9000)×3 = 102,000
    { 인건비단가: 25000, 자재비단가: 9000, 자재소모량: 3, 난이도: 1, 수량: 1 },
    { 직접금액: 250000 },
    { 직접금액: -30000 },
  ], []);
  assert.strictEqual(r.소계, 322000);
  assert.strictEqual(r.총액, 322000);
});

/* ---------- 금액 칸 표시/읽기 ----------
   직접 입력 금액을 '250,000원' 으로 보여준다. type=number 는 콤마와 '원' 을
   못 받아서 글자 칸으로 두고 직접 형식을 맞춘다.
   잘못 읽으면 견적 금액이 통째로 틀어지므로 여기서 검증한다. */
const { 금액포맷, 금액파싱 } = require('../quote_calc.js');

test('금액포맷: 천 단위 콤마와 원을 붙인다', () => {
  assert.strictEqual(금액포맷('250000'), '250,000원');
});

test('금액포맷: 이미 형식이 붙은 값을 다시 넣어도 같다', () => {
  // 타이핑할 때마다 다시 부르므로 여러 번 통과해도 안 망가져야 한다
  assert.strictEqual(금액포맷('250,000원'), '250,000원');
});

test('금액포맷: 빼는 항목(마이너스)도 된다', () => {
  assert.strictEqual(금액포맷('-50000'), '-50,000원');
});

test('금액포맷: 빈 칸은 빈 칸으로 둔다', () => {
  // 여기서 '0원' 을 만들어버리면 지우고 다시 쓸 수가 없다
  assert.strictEqual(금액포맷(''), '');
});

test('금액포맷: 마이너스만 친 상태를 지우지 않는다', () => {
  assert.strictEqual(금액포맷('-'), '-');
});

test('금액파싱: 형식 붙은 글자에서 숫자를 읽는다', () => {
  assert.strictEqual(금액파싱('250,000원'), 250000);
});

test('금액파싱: 마이너스를 살린다', () => {
  assert.strictEqual(금액파싱('-50,000원'), -50000);
});

test('금액파싱: 0 은 0 이다', () => {
  assert.strictEqual(금액파싱('0원'), 0);
});

test('금액파싱: 빈 칸은 NaN (안 적은 것과 0원을 구분해야 한다)', () => {
  assert.ok(Number.isNaN(금액파싱('')));
  assert.ok(Number.isNaN(금액파싱('원')));
});

/* ---------- 인건비만 견적 ----------
   "자재는 내가 댈 테니 인건비만 계산해 달라" 는 업자가 있다.
   합산 금액과 같은 규칙으로 나눠야 인건비 몫 + 자재비 몫 = 라인금액 이 된다. */
const { lineWage } = require('../quote_calc.js');

test('lineWage: 인건비단가 × 자재소모량 × 난이도 × 수량', () => {
  // 거실 가벽 10m, 인건비 12,000 · 소모량 2.5 → 300,000
  const it = { 인건비단가: 12000, 자재비단가: 18000, 자재소모량: 2.5, 난이도: 1, 수량: 10 };
  assert.strictEqual(lineWage(it), 300000);
  // 합산은 750,000 이고, 자재비 몫은 그 차액이어야 한다
  assert.strictEqual(lineAmount(it), 750000);
  assert.strictEqual(lineAmount(it) - lineWage(it), 450000);
});

test('lineWage: 난이도가 인건비에도 걸린다', () => {
  const it = { 인건비단가: 12000, 자재비단가: 18000, 자재소모량: 2.5, 난이도: 1.2, 수량: 10 };
  assert.strictEqual(lineWage(it), 360000);
});

test('lineWage: 직접 입력 품목은 적어 넣은 인건비를 그대로 쓴다', () => {
  const it = { 직접금액: 250000, 인건비: 100000, 자재비: 150000 };
  assert.strictEqual(lineWage(it), 100000);
  assert.strictEqual(lineAmount(it), 250000);
});

test('lineWage: 인건비 0원도 0 으로 센다 (안 적은 것과 다르다)', () => {
  assert.strictEqual(lineWage({ 직접금액: 150000, 인건비: 0, 자재비: 150000 }), 0);
});

test('lineWage: 나눠 적기 전 예전 항목은 null (0 이 아니다)', () => {
  // 0 으로 돌려주면 인건비가 0원인 것처럼 보여서 금액이 틀린다
  assert.strictEqual(lineWage({ 직접금액: 250000 }), null);
});

test('calcQuote: 인건비금액·인건비표시금액에 조정이 걸린다', () => {
  const items = [{ 인건비단가: 12000, 자재비단가: 18000, 자재소모량: 2.5, 난이도: 1, 수량: 10 }];
  const r = calcQuote(items, [{ 항목명: '업자단가', 비율: -0.1 }]);
  assert.strictEqual(r.라인들[0].인건비금액, 300000);
  assert.strictEqual(r.라인들[0].인건비표시금액, 270000);
  assert.strictEqual(r.라인들[0].표시금액, 675000);
  assert.strictEqual(r.인건비총액, 270000);
});

test('calcQuote: 나눌 수 없는 줄은 인건비총액에 전액으로 들어간다', () => {
  // 모르는 값을 0 으로 깎으면 받을 돈이 줄어든다. 화면에 '자재 포함' 을 붙인다.
  const items = [
    { 인건비단가: 12000, 자재비단가: 18000, 자재소모량: 2.5, 난이도: 1, 수량: 10 },
    { 직접금액: 250000 },
  ];
  const r = calcQuote(items, []);
  assert.strictEqual(r.라인들[1].인건비금액, null);
  assert.strictEqual(r.라인들[1].인건비표시금액, null);
  assert.strictEqual(r.인건비총액, 300000 + 250000);
  assert.strictEqual(r.총액, 750000 + 250000);
});

test('calcQuote: 인건비만 총액은 자재비를 뺀 금액이다', () => {
  // 월곡레미안 실제 건: 가벽 10m + 수납장 4m + 직접입력 2건
  const items = [
    { 인건비단가: 12000, 자재비단가: 18000, 자재소모량: 2.5, 난이도: 1, 수량: 10 },
    { 인건비단가: 16000, 자재비단가: 18000, 자재소모량: 2.5, 난이도: 1, 수량: 4 },
    { 직접금액: 250000, 인건비: 100000, 자재비: 150000 },
    { 직접금액: 850000, 인건비: 400000, 자재비: 450000 },
  ];
  const r = calcQuote(items, []);
  assert.strictEqual(r.총액, 2190000);
  assert.strictEqual(r.인건비총액, 300000 + 160000 + 100000 + 400000);
  assert.strictEqual(r.인건비총액, 960000);
});
