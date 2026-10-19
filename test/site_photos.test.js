const test = require('node:test');
const assert = require('node:assert');
const C = require('../site_photos_core.js');

test('구역목록: 마스터 구역 이름을 순서대로, 중복·빈 이름은 뺀다', () => {
  const m = { zones: [{ 구역: '거실' }, { 구역: '' }, { 구역: '주방' }, { 구역: '거실' }] };
  assert.deepStrictEqual(C.구역목록(m), ['거실', '주방']);
});

test('구역목록: 마스터가 없으면 기본 구역', () => {
  assert.deepStrictEqual(C.구역목록(null), C.기본구역);
  assert.deepStrictEqual(C.구역목록({ zones: [] }), C.기본구역);
});

test('구역별묶기: 미정이 맨 위, 다음은 구역 순서, 빈 구역은 빠진다', () => {
  const ps = [{ id: 1, 구역: '주방' }, { id: 2, 구역: '' }, { id: 3, 구역: '거실' }, { id: 4 }];
  const g = C.구역별묶기(ps, ['거실', '주방', '방1']);
  assert.deepStrictEqual(g.map((x) => x.구역), ['', '거실', '주방']);
  assert.deepStrictEqual(g[0].사진들.map((p) => p.id), [2, 4]);
});

test('구역별묶기: 목록에 없는 구역의 사진도 사라지지 않고 뒤에 붙는다', () => {
  const g = C.구역별묶기([{ id: 1, 구역: '서재' }, { id: 2, 구역: '거실' }], ['거실']);
  assert.deepStrictEqual(g.map((x) => x.구역), ['거실', '서재']);
});

test('미정수', () => {
  assert.strictEqual(C.미정수([{ 구역: '' }, { 구역: '거실' }, {}]), 2);
});

test('기본이름', () => {
  assert.strictEqual(C.기본이름(new Date(2026, 9, 19)), '10/19 방문');
});

test('방문넣기: 새 방문은 위로, 같은 현장ID 는 하나만', () => {
  const l = [{ 현장ID: 'a', 이름: 'A' }, { 현장ID: 'b', 이름: 'B' }];
  assert.deepStrictEqual(C.방문넣기(l, { 현장ID: 'b', 이름: 'B2' }).map((v) => v.이름), ['B2', 'A']);
  assert.deepStrictEqual(C.방문넣기(l, { 현장ID: 'c', 이름: 'C' }).map((v) => v.현장ID), ['c', 'a', 'b']);
});

const M = { zones: [
  { 구역: '거실', items: [
    { 체크_ID: 'a1', 표시_품목명: '거실샤시', 적용평형: '공통' },
    { 체크_ID: 'a2', 표시_품목명: '몰딩 (30평)', 적용평형: '30평' },
    { 체크_ID: 'a3', 표시_품목명: '몰딩 (40평)', 적용평형: '40평' },
  ] },
  { 구역: '주방', items: [{ 체크_ID: 'k1', 표시_품목명: '싱크대', 적용평형: '공통' }] },
] };

test('보이는품목: 평형을 모르면 공통만, 고르면 그 평형까지', () => {
  assert.deepStrictEqual(C.보이는품목(M, '거실', '확인안됨').map((i) => i.체크_ID), ['a1']);
  assert.deepStrictEqual(C.보이는품목(M, '거실', '30평').map((i) => i.체크_ID), ['a1', 'a2']);
  assert.deepStrictEqual(C.보이는품목(M, '없는구역', '30평'), []);
  assert.deepStrictEqual(C.보이는품목(null, '거실', '30평'), []);
});

test('구역안태그: 구역을 바꾸면 그 구역 품목만 남는다', () => {
  assert.deepStrictEqual(C.구역안태그(['a1', 'k1'], M, '주방'), ['k1']);
  assert.deepStrictEqual(C.구역안태그(['a1'], M, ''), []);
});

test('품목이름', () => {
  assert.strictEqual(C.품목이름(M, 'k1'), '싱크대');
  assert.strictEqual(C.품목이름(M, 'zz'), '');
});
