const test = require('node:test');
const assert = require('node:assert');
const { 맞춤크기, 태그해제후_체크뺄까, 사진용량합, 새현장ID } = require('../quote_photos.js');

/* IndexedDB 와 카메라는 브라우저 API라 node 에서 못 돌린다.
   그래서 "판단"에 해당하는 부분만 순수함수로 빼서 여기서 검증한다. */

test('맞춤크기: 긴 변이 최대보다 작으면 그대로 둔다', () => {
  assert.deepStrictEqual(맞춤크기(800, 600, 1600), { 폭: 800, 높이: 600 });
});

test('맞춤크기: 가로 사진은 폭을 최대에 맞추고 비율을 지킨다', () => {
  // 4032x3024 (4:3) -> 1600x1200
  assert.deepStrictEqual(맞춤크기(4032, 3024, 1600), { 폭: 1600, 높이: 1200 });
});

test('맞춤크기: 세로 사진은 높이를 최대에 맞춘다', () => {
  // 3024x4032 -> 1200x1600. 세로로 찍은 현장 사진이 대부분이라 이게 실제 경로다.
  assert.deepStrictEqual(맞춤크기(3024, 4032, 1600), { 폭: 1200, 높이: 1600 });
});

test('맞춤크기: 정사각형', () => {
  assert.deepStrictEqual(맞춤크기(2000, 2000, 240), { 폭: 240, 높이: 240 });
});

test('맞춤크기: 극단적으로 납작해도 0이 되지 않는다', () => {
  // 0 을 canvas 크기로 주면 예외가 난다. 최소 1은 보장해야 한다.
  const r = 맞춤크기(4000, 3, 240);
  assert.strictEqual(r.폭, 240);
  assert.ok(r.높이 >= 1);
});

test('태그해제후_체크뺄까: 다른 사진이 같은 품목을 태그하고 있으면 안 뺀다', () => {
  // 태그를 이미 지운 뒤의 사진 목록을 넘긴다.
  const 사진들 = [
    { id: 1, 태그: [] },
    { id: 2, 태그: ['z07_방1_화장대_공통'] },
  ];
  assert.strictEqual(태그해제후_체크뺄까('z07_방1_화장대_공통', 사진들), false);
});

test('태그해제후_체크뺄까: 아무 사진도 안 걸고 있으면 뺀다', () => {
  const 사진들 = [
    { id: 1, 태그: [] },
    { id: 2, 태그: ['z07_방1_방문_공통'] },
  ];
  assert.strictEqual(태그해제후_체크뺄까('z07_방1_화장대_공통', 사진들), true);
});

test('태그해제후_체크뺄까: 사진이 하나도 없으면 뺀다', () => {
  assert.strictEqual(태그해제후_체크뺄까('z07_방1_화장대_공통', []), true);
});

test('사진용량합: 원본과 썸네일을 모두 더한다', () => {
  const 사진들 = [
    { blob: { size: 300000 }, thumb: { size: 15000 } },
    { blob: { size: 280000 }, thumb: { size: 14000 } },
  ];
  assert.strictEqual(사진용량합(사진들), 609000);
});

test('사진용량합: 빈 목록은 0', () => {
  assert.strictEqual(사진용량합([]), 0);
});

test('새현장ID: s 로 시작하고 매번 다르다', () => {
  const a = 새현장ID();
  const b = 새현장ID();
  assert.ok(a.startsWith('s'));
  assert.ok(a.length >= 8);
  assert.notStrictEqual(a, b);
});
