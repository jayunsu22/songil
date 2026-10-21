// 견적서 [＋ 추가 견적 받기] 계산 (quote_addon.js)
// 기대값 출처: 시공품목정보 표 (2026-10-21 값) - 2중창 (56,000+9,000)×1.7 = 110,500원/m, 3m 331,500원
//   (사장님 견적서 화면의 샤시1 2중창 3m 331,500원과 같다)
const test = require('node:test');
const assert = require('node:assert');
const A = require('../quote_addon.js');

const 행 = (n, 인건비, 소모, 단위) => ({ 시공_품목명: n, 인건비단가: 인건비, 자재비단가: 9000, 자재소모량: 소모, 견적단위: 단위 });
const 표 = A.표맵([
  행('샤시(단창)', 58000, 1, 'm'), 행('샤시(2중창)', 56000, 1.7, 'm'), 행('시스템샤시', 90000, 1, 'm'),
  행('상가샤시(한쪽시공)', 60000, 1, 'm'), 행('상가샤시(양쪽시공)', 60000, 1.7, 'm'),
  행('싱크대', 40000, 2, 'm'), 행('싱크대 상부장', 40000, 1, 'm'), 행('싱크대 하부장', 40000, 1, 'm'),
  행('터닝도어', 25000, 3, '세트'), 행('현관문', 25000, 5, '세트'), 행('방문', 25000, 6.5, '세트'),
  행('신발장', 16000, 2.5, 'm'),
]);
const 품목 = (n) => A.품목들.find((p) => p.이름 === n);

test('쓸품목: 표에 있는 품목만 (중문·화장실문 등 표에 없으면 빠진다)', () => {
  const 이름 = A.쓸품목(표).map((p) => p.이름);
  assert.deepStrictEqual(이름, ['샤시', '싱크대', '터닝도어', '현관문', '방문', '신발장']);
});

test('샤시: 종류 → 길이 → 끝, 2중창 3m = 331,500원', () => {
  const p = 품목('샤시');
  assert.strictEqual(A.다음질문(p, {}, 표).키, '종류');
  assert.deepStrictEqual(A.다음질문(p, {}, 표).보기.map((b) => b.글), ['단창', '2중창', '시스템샤시', '상가샤시']);
  assert.strictEqual(A.다음질문(p, { 종류: 1 }, 표).키, '길이');
  const s = A.선택(p, { 종류: 1, 길이: 3 }, 표);
  assert.deepStrictEqual(s, { 표이름: '샤시(2중창)', 길이: 3, 한쪽: false, 이름: '샤시 2중창' });
  const l = A.줄만들기(표[s.표이름], s, 0, null, 'add1');
  assert.strictEqual(l.표시금액, 331500);
  assert.strictEqual(l.수량, 3); assert.strictEqual(l.단위, 'm');
  assert.strictEqual(l.구역, '고객님 추가 품목'); assert.strictEqual(l.고객추가, true);
  assert.strictEqual(A.줄이름(p, { 종류: 2 }, 표), '시스템샤시');
});

test('상가샤시: 한쪽/양쪽을 묻고 그 표 줄을 쓴다 (절반으로 치지 않는다)', () => {
  const p = 품목('샤시');
  assert.strictEqual(A.다음질문(p, { 종류: 3 }, 표).키, '면');
  const s = A.선택(p, { 종류: 3, 면: '한쪽', 길이: 2 }, 표);
  assert.strictEqual(s.표이름, '상가샤시(한쪽시공)');
  assert.strictEqual(s.한쪽, false);
  assert.strictEqual(s.이름, '상가샤시 한쪽');
  assert.strictEqual(A.줄만들기(표[s.표이름], s, 0, null).표시금액, (60000 + 9000) * 1 * 2);
});

test('싱크대: 상부장만 4m', () => {
  const p = 품목('싱크대');
  const s = A.선택(p, { 종류: 1, 길이: 4 }, 표);
  assert.strictEqual(s.이름, '싱크대 상부장만');
  assert.strictEqual(A.줄만들기(표[s.표이름], s, 0, null).표시금액, 49000 * 1 * 4);
  assert.strictEqual(A.줄이름(p, { 종류: 0 }, 표), '싱크대 상하부장 전체');
});

test('터닝도어: 앞면만이면 자재소모량 절반, 길이는 안 묻는다', () => {
  const p = 품목('터닝도어');
  const q = A.다음질문(p, {}, 표);
  assert.strictEqual(q.키, '면');
  assert.deepStrictEqual(q.보기.map((b) => b.글), ['앞면만', '양쪽']);
  const s = A.선택(p, { 면: '한쪽' }, 표);
  assert.deepStrictEqual(s, { 표이름: '터닝도어', 길이: null, 한쪽: true, 이름: '터닝도어 앞면만' });
  const l = A.줄만들기(표.터닝도어, s, 0, null);
  assert.strictEqual(l.표시금액, Math.round(34000 * 1.5));
  assert.strictEqual(l.수량, 1); assert.strictEqual(l.단위, '세트');
  assert.strictEqual(A.줄만들기(표.터닝도어, A.선택(p, { 면: '양쪽' }, 표), 0, null).표시금액, 34000 * 3);
});

test('방문: 아무것도 안 묻고 바로 금액', () => {
  const p = 품목('방문');
  assert.strictEqual(A.다음질문(p, {}, 표), null);
  assert.strictEqual(A.줄만들기(표.방문, A.선택(p, {}, 표), 0, null).표시금액, Math.round(34000 * 6.5));
});

test('가구(신발장): 한쪽/양쪽은 안 묻고 길이만 - 표 금액(문짝 앞면 기준) 그대로 m당 62,500원', () => {
  const p = 품목('신발장');
  assert.strictEqual(A.다음질문(p, {}, 표).키, '길이');
  const s = A.선택(p, { 길이: 3 }, 표);
  assert.deepStrictEqual(s, { 표이름: '신발장', 길이: 3, 한쪽: false, 이름: '신발장' });
  assert.strictEqual(A.줄만들기(표.신발장, s, 0, null).표시금액, 62500 * 3);
  ['신발장', '수납장', '냉장고장', '붙박이장'].forEach((n) => assert.ok(!품목(n).면, n));
  assert.deepStrictEqual(A.한쪽표, ['터닝도어', '현관문', '중문', '세탁실문', '실외기실문']);
});

test('조정(할인·할증)과 견적서의 필름 단가를 따른다', () => {
  const s = { 표이름: '샤시(2중창)', 길이: 3, 한쪽: false, 이름: '샤시 2중창' };
  const l = A.줄만들기(표['샤시(2중창)'], s, -0.1, 12000);
  assert.strictEqual(l.라인금액, Math.round(68000 * 1.7 * 3));
  assert.strictEqual(l.표시금액, Math.round(l.라인금액 * 0.9));
  assert.strictEqual(l.인건비표시금액, Math.round(Math.round(56000 * 1.7 * 3) * 0.9));
  assert.strictEqual(A.자재비찾기([{ 직접금액: 5, 자재비단가: 1 }, { 자재비단가: 12000 }]), 12000);
  assert.strictEqual(A.자재비찾기([{ 고객추가: true, 자재비단가: 1 }]), null);
});

test('길이: 0.5~30m 만, 소수 한 자리', () => {
  assert.strictEqual(A.길이다듬기('2.55'), 2.6);
  assert.strictEqual(A.길이다듬기(0.2), null);
  assert.strictEqual(A.길이다듬기(31), null);
  assert.strictEqual(A.줄만들기(표.신발장, { 길이: 'abc', 이름: 'x' }, 0, null), null);
});

test('총액: 절삭 견적이면 합친 금액도 만원 아래를 버린다', () => {
  const 원래 = [{ 표시금액: 3871500 }];
  assert.strictEqual(A.절삭했나(원래, 3870000), true);
  assert.strictEqual(A.절삭했나(원래, 3871500), false);
  assert.strictEqual(A.새총액(원래, [{ 표시금액: 331500 }], true), 4200000);
  assert.strictEqual(A.새총액(원래, [{ 표시금액: 331500 }], false), 4203000);
});

test('허용표: 목록의 표 이름만', () => {
  assert.ok(A.허용표.indexOf('상가샤시(양쪽시공)') >= 0);
  assert.ok(A.허용표.indexOf('문틀') < 0);
});
