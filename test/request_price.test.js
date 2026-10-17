// 견적요청 v2 계산. 기대값 출처: 에어테이블 '시공품목정보' 의 예상_총금액 식
//   (인건비단가 + 자재비단가) × 자재소모량 × 난이도   — 표의 숫자를 그대로 넣어 손으로 계산한 값
//   예) 문틀 2m × (47,000 + 9,000) = 112,000 (사장님 확인), 방문 6.5 × 34,000 = 221,000
const test = require('node:test');
const assert = require('node:assert');
const R = require('../request_price.js');
const 표 = require('./fixtures/price_table_sample.json');
const 관리자 = require('./fixtures/admin_items_sample.json');

const 품목 = (이름) => {
  const p = 관리자.find((x) => x.품목명 === 이름);
  if (!p) throw new Error('fixture 에 없음: ' + 이름);
  return p;
};
const 계산 = (이름, 설정, 필름단가, 고정) => R.줄계산(품목(이름), 설정 || {}, 표, 고정 || {}, 필름단가 == null ? 9000 : 필름단가);
const 표이름 = (이름, 설정) => { const k = R.기준(품목(이름), 설정 || {}, 표, {}); return k ? k.표이름 : null; };

test('방문: 기본 6.5m, 221,000 (인건비 162,500 / 자재비 58,500)', () => {
  const r = 계산('방2문+틀');
  assert.strictEqual(r.기준.표이름, '방문');
  assert.strictEqual(r.기준.단위, '개');
  assert.strictEqual(r.필름m, 6.5);
  assert.deepStrictEqual([r.합, r.인건비, r.자재비], [221000, 162500, 58500]);
  assert.strictEqual(r.문제, null);
});

test('시공범위: 문틀만 → 문틀 줄 112,000 / 문짝만 → 문짝 줄 110,000', () => {
  const a = 계산('방2문+틀', { 시공범위: '문틀만 시공' });
  assert.deepStrictEqual([a.기준.표이름, a.필름m, a.합], ['문틀', 2, 112000]);
  const b = 계산('방2문+틀', { 시공범위: '문짝만 시공' });
  assert.deepStrictEqual([b.기준.표이름, b.필름m, b.합], ['문짝', 5, 110000]);
});

test('시공범위: 한쪽면·앞면·뒷면은 같은 줄에 절반 m, 문선만은 m 를 골라야 함', () => {
  const a = 계산('방2문+틀', { 시공범위: '문+틀 한쪽면 시공' });
  assert.deepStrictEqual([a.기준.표이름, a.필름m, a.합], ['방문', 3.3, 112200]);
  assert.strictEqual(계산('방2문+틀', { 시공범위: '문짝 앞면만 시공' }).필름m, 3.3);
  const c = 계산('방2문+틀', { 시공범위: '문선만 시공' });
  assert.deepStrictEqual([c.필름m, c.합, c.문제], [0, 0, 'm없음']);
  assert.strictEqual(계산('방2문+틀', { 시공범위: '문선만 시공', m: 1.5 }).합, 51000);
});

test('중문: 중문 318,500 / 문틀만 → 중문틀 135,000 / 문짝만 → 중문짝 68,000', () => {
  assert.deepStrictEqual([표이름('현관중문'), 계산('현관중문').합], ['중문', 318500]);
  assert.strictEqual(표이름('방1중문+틀'), '중문');
  assert.strictEqual(계산('현관중문', { 시공범위: '문틀만 시공' }).합, 135000);
  assert.strictEqual(계산('현관중문', { 시공범위: '문짝만 시공' }).합, 68000);
});

test('문 종류: 표의 같은 이름 줄, 기본 m 는 표 값(현관문 5m)', () => {
  assert.strictEqual(표이름('거실화장실문'), '화장실문');
  assert.strictEqual(표이름('방1화장실문+틀'), '화장실문');
  assert.strictEqual(표이름('거실세탁실문'), '세탁실문');
  assert.deepStrictEqual([표이름('현관문'), 계산('현관문').합], ['현관문', 170000]);
  assert.deepStrictEqual([표이름('현관방화문'), 계산('현관방화문').합], ['방화문', 102000]);
  assert.strictEqual(표이름('거실베란다문'), '터닝도어');
  assert.strictEqual(표이름('거실터닝도어'), '터닝도어');
  assert.strictEqual(표이름('방1베란다문+틀'), '실외기실문');
  assert.strictEqual(표이름('방1실외기실문+틀'), '실외기실문');
  assert.strictEqual(표이름('거실실외기실문'), '실외기실문');
  assert.strictEqual(표이름('방1드레스룸문+틀'), '방문');
});

test('샤시: 기본 2중창(1m당 1.7m) 보통 길이 3m → 331,500 · 단창 201,000 · 시스템 297,000 · 상가', () => {
  const a = 계산('거실샤시1');
  assert.deepStrictEqual([a.기준.표이름, a.기준.단위, a.길이, a.필름m, a.합], ['샤시(2중창)', 'm', 3, 5.1, 331500]);
  assert.strictEqual(계산('거실샤시1', { 샤시종류: '단창' }).합, 201000);
  assert.strictEqual(계산('거실샤시1', { 샤시종류: '시스템' }).합, 297000);
  assert.strictEqual(표이름('거실샤시1', { 샤시종류: '상가 양쪽' }), '상가샤시(양쪽시공)');
  assert.strictEqual(표이름('거실샤시1', { 샤시종류: '상가 한쪽' }), '상가샤시(한쪽시공)');
  assert.strictEqual(표이름('방3샤시 2'), '샤시(2중창)');
  assert.strictEqual(표이름('거실화장실샤시'), '샤시(2중창)');
  assert.strictEqual(계산('거실샤시1', { 길이: 2 }).합, Math.round(3.4 * 65000));
});

test('몰딩·걸레받이: 길이 기준 줄(실측), 길이를 안 정하면 0원·길이없음', () => {
  const a = 계산('방1몰딩', { 길이: 40 });
  assert.deepStrictEqual([a.기준.표이름, a.필름m, a.합], ['몰딩', 4, 156000]);
  const b = 계산('방1몰딩');
  assert.deepStrictEqual([b.합, b.문제], [0, '길이없음']);
  assert.strictEqual(표이름('주방걸레받이'), '걸레받이');
  assert.strictEqual(R.표줄이름({ 품목명: '거실크라운몰딩' }, {}), '크라운몰딩');
});

test('가구: 길이 품목은 보통 길이로 먼저 채운다', () => {
  assert.deepStrictEqual([표이름('신발장1'), 계산('신발장1').합], ['신발장', 312500]);
  assert.strictEqual(계산('신발장2').길이, 3);
  assert.deepStrictEqual([표이름('냉장고장'), 계산('냉장고장').합], ['냉장고장', 125000]);
  assert.deepStrictEqual([표이름('방1드레스룸수납장'), 계산('방1드레스룸수납장').길이], ['수납장', 3]);
  assert.deepStrictEqual([표이름('싱크대'), 계산('싱크대').합], ['싱크대', 784000]);
  assert.strictEqual(표이름('거실 세탁실 싱크대'), '싱크대');
  assert.deepStrictEqual([표이름('화장대'), 계산('화장대').합], ['화장대', 340000]);
  assert.strictEqual(표이름('방1침대프레임'), '침대 프레임');
  assert.strictEqual(표이름('주방중간알판'), '중간알판');
  assert.strictEqual(표이름('주방알판'), '알판');
});

test('기타: 가벽·등박스·웨인스코팅·아트월', () => {
  assert.deepStrictEqual([표이름('방1가벽'), 계산('방1가벽').길이], ['가벽', 10]);
  assert.deepStrictEqual([표이름('방1등박스'), 계산('방1등박스').합], ['등박스', 57600]);
  assert.strictEqual(표이름('방2웨인스코팅'), '웨인스코팅');
  assert.deepStrictEqual([표이름('아트월'), 계산('아트월').합], ['아트월', 120000]);
});

test('아치: 1m당 25,000 기본 5m → 170,000', () => {
  assert.deepStrictEqual([표이름('방1아치문틀'), 계산('방1아치문틀').길이, 계산('방1아치문틀').합], ['아치', 5, 170000]);
  assert.strictEqual(표이름('아치문'), '아치');
});

test('표에 없는 품목은 단가없음 (나올 때 정한다)', () => {
  ['거실프레임', '2층 방1 문틀', '2층 출입문', '방1파티션', 'tv 박스', '현관거울프레임', '샤시틀옆 기둥', '계단', '사무실벽']
    .forEach((n) => {
      assert.strictEqual(R.기준(품목(n), {}, 표, {}), null, n);
      assert.deepStrictEqual([계산(n).합, 계산(n).문제], [0, '단가없음'], n);
    });
});

test('정해 둔 단가(고정): 개당 m × (인건비 + 필름)', () => {
  const r = 계산('거실프레임', {}, 9000, { 거실프레임: { 인건비단가: 25000, m: 2 } });
  assert.deepStrictEqual([r.기준.표이름, r.필름m, r.합, r.문제], ['거실프레임', 2, 68000, null]);
});

test('필름 단가·난이도·m 직접', () => {
  assert.strictEqual(계산('방2문+틀', {}, 15000).합, 260000);
  assert.strictEqual(계산('방2문+틀', { 난이도: 1.2 }).합, 265200);
  assert.strictEqual(계산('방2문+틀', { m: 5 }).합, 170000);
  assert.strictEqual(계산('방2문+틀', {}, null).자재비, 58500);
});

test('찾을낱말: 구역을 떼고 끝 숫자를 뗀다 (시공사진 찾기용)', () => {
  assert.strictEqual(R.찾을낱말('방2문+틀'), '문+틀');
  assert.strictEqual(R.찾을낱말('거실샤시1'), '샤시');
  assert.strictEqual(R.찾을낱말('방3샤시 2'), '샤시');
  assert.strictEqual(R.찾을낱말('거실화장실문'), '화장실문');
  assert.strictEqual(R.찾을낱말('주방걸레받이'), '걸레받이');
  assert.strictEqual(R.찾을낱말('2층 방1 문틀'), '문틀');
  assert.strictEqual(R.찾을낱말('냉장고장'), '냉장고장');
});

test('필름별합계: 같은 필름끼리 m·금액을 더한다', () => {
  const r = R.필름별합계([
    { 필름ID: 'a', 필름m: 6.5, 자재비: 58500 },
    { 필름ID: 'a', 필름m: 2, 자재비: 18000 },
    { 필름ID: 'b', 필름m: 5.1, 자재비: 76500 },
  ]);
  assert.deepStrictEqual(r, [{ 필름ID: 'a', m: 8.5, 금액: 76500 }, { 필름ID: 'b', m: 5.1, 금액: 76500 }]);
});
