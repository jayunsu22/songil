const test = require('node:test');
const assert = require('node:assert');
const M = require('../request_merge.js');

const 줄 = (체크_ID, 덧) => Object.assign({
  원문: '글', 구역: '거실', 체크_ID: 체크_ID, 품목명: 체크_ID, 옵션: null,
  개수: 1, 수량: 1, 기본길이: false, 확인필요: false, 건너뜀: false, 모르는말: null,
}, 덧 || {});
const 사진 = (사진id, 체크_ID, 구역) => ({ 사진id: 사진id, 구역: 구역 === undefined ? '거실' : 구역, 체크_ID: 체크_ID });
const 기본줄 = (체크_ID) => 줄(체크_ID, { 원문: '', 수량: 3, 기본길이: true });

test('같은 품목의 글과 사진은 한 항목 - 수량은 글을 따른다', () => {
  const r = M.합치기([줄('A', { 수량: 6, 개수: 2 })], [사진(1, 'A'), 사진(2, 'A')], 기본줄);
  assert.strictEqual(r.항목.length, 1);
  assert.strictEqual(r.항목[0].출처, '사진+글');
  assert.strictEqual(r.항목[0].수량, 6);
  assert.deepStrictEqual(r.항목[0].사진ids, [1, 2]);
});

test('글만 있으면 글만, 사진 없음', () => {
  const r = M.합치기([줄('A')], [], 기본줄);
  assert.strictEqual(r.항목[0].출처, '글만');
  assert.deepStrictEqual(r.항목[0].사진ids, []);
});

test('사진만 있으면 기본줄로 채운 사진만 항목, 글 항목 뒤에', () => {
  const r = M.합치기([줄('A')], [사진(9, 'B')], 기본줄);
  assert.deepStrictEqual(r.항목.map((x) => x.체크_ID), ['A', 'B']);
  assert.strictEqual(r.항목[1].출처, '사진만');
  assert.strictEqual(r.항목[1].수량, 3);
  assert.strictEqual(r.항목[1].기본길이, true);
});

test('같은 품목 글 두 줄은 개수·수량을 더한다', () => {
  const r = M.합치기([줄('A', { 수량: 2, 개수: 1, 기본길이: true }), 줄('A', { 수량: 2, 개수: 1 })], [], 기본줄);
  assert.strictEqual(r.항목.length, 1);
  assert.strictEqual(r.항목[0].수량, 4);
  assert.strictEqual(r.항목[0].개수, 2);
  assert.strictEqual(r.항목[0].기본길이, true);
});

test('건너뜀 줄은 빼고, 못 알아본 줄은 따로 남긴다', () => {
  const r = M.합치기([
    줄(null, { 건너뜀: true }),
    줄(null, { 확인필요: true, 모르는말: '분합창', 원문: '안방 분합창 1' }),
    줄(null, { 확인필요: true, 모르는말: '분합창', 원문: '거실 분합창 1' }),
  ], [], 기본줄);
  assert.strictEqual(r.항목.length, 2);
  assert.ok(r.항목.every((x) => x.확인필요 && x.출처 === '글만'));
  assert.notStrictEqual(r.항목[0].키, r.항목[1].키);
});

test('품목이 안 붙은 사진은 미지정', () => {
  const r = M.합치기([], [사진(1, null), 사진(2, null, null)], 기본줄);
  assert.deepStrictEqual(r.미지정사진, [1, 2]);
  assert.strictEqual(r.항목.length, 0);
});

test('경고: 확인필요 항목과 미지정 사진을 알려준다', () => {
  const r = M.합치기([줄(null, { 확인필요: true, 원문: '안방 분합창 1' }), 줄('A')], [사진(1, null)], 기본줄);
  const w = M.경고(r);
  assert.strictEqual(w.length, 2);
  assert.ok(w[0].indexOf('안방 분합창 1') >= 0);
  assert.ok(w[1].indexOf('1장') >= 0);
  assert.deepStrictEqual(M.경고(M.합치기([줄('A')], [], 기본줄)), []);
});
