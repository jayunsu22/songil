// 추가작업·약속 메모 순수 함수 (worker/extra_work.js)
const test = require('node:test');
const assert = require('node:assert');
const E = require('../worker/extra_work.js');

const 표 = {
  방문: { 인건비단가: 25000, 자재비단가: 9000, 자재소모량: 6.5, 견적단위: '세트' },
  '샤시(2중창)': { 인건비단가: 56000, 자재비단가: 9000, 자재소모량: 1.7, 견적단위: 'm' },
};

test('단가: 카테고리2 = 단가표 품목명, 샤시는 2중창, 없으면 0', () => {
  assert.strictEqual(E.단가({ 카테고리2: '방문' }, 표), 221000);
  assert.strictEqual(E.단가({ 카테고리2: '샤시' }, 표), 110500);
  assert.strictEqual(E.단가({ 카테고리2: '아치' }, 표), 0);
  assert.strictEqual(E.단가({}, 표), 0);
  assert.strictEqual(E.금액(110500, 2.5), 276300);
  assert.strictEqual(E.필름m({ 자재소모량: 6.5 }, 2), 13);
});

test('청구 기본값: 고객→고객청구, 업체→업체청구, 우리 실수→무상', () => {
  assert.strictEqual(E.청구기본('고객'), '고객청구');
  assert.strictEqual(E.청구기본('업체'), '업체청구');
  assert.strictEqual(E.청구기본('우리'), '무상');
});

test('새이름: 원래 품목과 겹치지 않게, 같은 게 있으면 번호', () => {
  assert.strictEqual(E.새이름('방2문+틀', 'AS', ['방2문+틀']), '방2문+틀 AS');
  assert.strictEqual(E.새이름('방2문+틀', 'AS', ['방2문+틀', '방2문+틀 AS']), '방2문+틀 AS 2');
  assert.strictEqual(E.새이름('', '추가요청', []), '추가작업 추가요청');
});

test('요약: 고객 청구 합, 업체 청구 따로, 무상은 0원으로 건수만', () => {
  const r = E.요약([
    { fields: { 시공품목: '거실샤시' } },
    { fields: { 시공품목: '아트월 재시공', 추가구분: '재시공', 청구: '고객청구', 추가금액: 420000 } },
    { fields: { 시공품목: '방2문틀 AS', 추가구분: 'AS', 청구: '업체청구', 추가금액: 150000 } },
    { fields: { 시공품목: '방3문틀 AS', 추가구분: 'AS', 청구: '무상', 추가금액: 90000 } },
  ]);
  assert.deepStrictEqual(r, { 건수: 3, 고객: 420000, 업체: 150000, 무상건수: 1, 구분별: { 재시공: 1, AS: 2, 추가요청: 0 } });
});

test('약속 메모: 읽기·더하기·반영·남은 것', () => {
  let l = E.약속읽기('');
  assert.deepStrictEqual(l, []);
  l = E.약속더하기(l, '현관 중문 틀도 같이', '김실장', '10/22 15:40');
  l = E.약속더하기(l, '  ', '김실장', '');
  assert.strictEqual(l.length, 1);
  const back = E.약속읽기(E.약속쓰기(l));
  assert.strictEqual(back[0].글, '현관 중문 틀도 같이');
  assert.strictEqual(E.남은약속(back).length, 1);
  const done = E.약속상태(back, back[0].id, '반영', '현관중문 추가요청');
  assert.strictEqual(E.남은약속(done).length, 0);
  assert.strictEqual(done[0].작업, '현관중문 추가요청');
  assert.deepStrictEqual(E.약속읽기('not json'), []);
});
