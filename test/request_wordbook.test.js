const test = require('node:test');
const assert = require('node:assert');
const W = require('../request_wordbook.js');

test('기본: 한글 수사·샤시 종류·안방', () => {
  const b = W.기본();
  assert.strictEqual(b['하나'], '1');
  assert.strictEqual(b['한'], '1');
  assert.strictEqual(b['두'], '2');
  assert.strictEqual(b['셋'], '3');
  assert.strictEqual(b['이중창'], '2중창');
  assert.strictEqual(b['단창'], '단창');
  assert.strictEqual(b['안방'], '방1');
  // 분합창은 마스터에 없는 말이라 기본값으로 짐작하지 않는다
  assert.strictEqual(b['분합창'], undefined);
});

test('합치기: 사용자가 배운 것이 기본보다 우선', () => {
  const r = W.합치기({ 안방: '방1', 하나: '1' }, { 안방: '방2' });
  assert.deepStrictEqual(r, { 안방: '방2', 하나: '1' });
  assert.deepStrictEqual(W.합치기({ a: 'b' }, null), { a: 'b' });
});

test('배우기: 원본은 그대로, 공백을 지운 별칭으로 저장', () => {
  const 원본 = { 하나: '1' };
  const r = W.배우기(원본, ' 분 합 창 ', '베란다 중문');
  assert.deepStrictEqual(원본, { 하나: '1' });
  assert.strictEqual(r['분합창'], '베란다 중문');
});

test('배우기: 빈 값·같은 말은 무시', () => {
  const 원본 = { 하나: '1' };
  assert.strictEqual(W.배우기(원본, '', '방1'), 원본);
  assert.strictEqual(W.배우기(원본, '거실', ''), 원본);
  assert.strictEqual(W.배우기(원본, '거실', '거실'), 원본);
});
