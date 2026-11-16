// 품목별 필름 번호 (worker/item_film.js, 사장님 11/16) — 현장·번호는 지어낸 것
const test = require('node:test');
const assert = require('node:assert');
const F = require('../worker/item_film.js');

const films = [{ place: '방3 문틀', code: 'ps170' }, { place: '거실 화장실문', code: 'px451' }, { place: '안방', code: 'PS170' }];

test('위치 낱말: 띄어쓰기 무시, 부엌=주방, 욕실=화장실', () => {
  assert.deepStrictEqual(F.rooms('방 3 문+틀'), ['방3']);
  assert.deepStrictEqual(F.rooms('거실욕실문'), ['거실', '화장실']);
  assert.deepStrictEqual(F.rooms('부엌 샤시'), ['주방']);
  assert.deepStrictEqual(F.rooms('현관문'), ['현관']);
});

test('견적서에서 고른 필름이 먼저, 없으면 위치 글자로 자동, 맞는 줄 없으면 비움', () => {
  const m = F.match(['방3문+틀', '거실화장실문', '현관문'], films, [{ 품목명: '방3문+틀', 자재명: 'PX451' }]);
  assert.deepStrictEqual(m['방3문+틀'], { code: 'px451', auto: false }, '견적서 고른 것 (대소문자 무시, 현장 표기로)');
  assert.deepStrictEqual(m['거실화장실문'], { code: 'px451', auto: true });
  assert.strictEqual(m['현관문'], undefined);
});

test('견적서 자재가 현장 필름이 아니면(영림ps) 무시하고 자동 짝', () => {
  const m = F.match(['방3문+틀'], films, [{ 품목명: '방3문+틀', 자재명: '영림ps' }]);
  assert.deepStrictEqual(m['방3문+틀'], { code: 'ps170', auto: true });
});

test('같은 위치에 번호가 여럿이면 비움 · 현장 필름이 하나뿐이면 모두 그 번호', () => {
  const two = [{ place: '방3 문', code: 'ps170' }, { place: '방3 틀', code: 'px451' }];
  assert.deepStrictEqual(F.match(['방3문+틀'], two, []), {});
  assert.deepStrictEqual(F.match(['현관문', '주방샤시'], [{ place: '', code: 'ps170' }, { place: '전체', code: 'PS170' }], []),
    { 현관문: { code: 'ps170', auto: true }, 주방샤시: { code: 'ps170', auto: true } });
  assert.deepStrictEqual(F.match(['현관문'], [], []), {});
});
