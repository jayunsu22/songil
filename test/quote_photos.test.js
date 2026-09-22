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

/* ---------- 네모 표시 좌표 ----------
   "이 사진의 이 문" 을 가리키려고 사진 위에 네모를 그린다.
   화면 크기가 폰마다 다르므로 0~1 비율로 저장해야 어디서 봐도 같은 자리에 찍힌다. */
const { 정규화사각 } = require('../quote_photos.js');

test('정규화사각: 화면 좌표를 0~1 비율로 바꾼다', () => {
  // 400x300 화면에서 (100,60)~(300,210) 을 끌었다
  assert.deepStrictEqual(정규화사각(100, 60, 300, 210, 400, 300),
    { x: 0.25, y: 0.2, w: 0.5, h: 0.5 });
});

test('정규화사각: 거꾸로(오른쪽아래 -> 왼쪽위) 끌어도 같은 네모가 된다', () => {
  assert.deepStrictEqual(정규화사각(300, 210, 100, 60, 400, 300),
    정규화사각(100, 60, 300, 210, 400, 300));
});

test('정규화사각: 화면 밖으로 나가도 사진 안에 가둔다', () => {
  const r = 정규화사각(-50, -50, 500, 400, 400, 300);
  assert.deepStrictEqual(r, { x: 0, y: 0, w: 1, h: 1 });
});

test('정규화사각: 살짝 누르기만 해도 보이는 크기는 준다', () => {
  // 손가락으로 톡 누르면 0 크기가 되어 화면에 아무것도 안 보인다
  const r = 정규화사각(200, 150, 202, 151, 400, 300);
  assert.ok(r.w >= 0.04 && r.h >= 0.04);
  // 최소 크기를 줘도 사진 밖으로 삐져나가면 안 된다
  assert.ok(r.x + r.w <= 1 && r.y + r.h <= 1);
});

test('정규화사각: 오른쪽 끝에서 눌러도 사진 밖으로 안 나간다', () => {
  const r = 정규화사각(399, 299, 400, 300, 400, 300);
  assert.ok(r.x + r.w <= 1 && r.y + r.h <= 1);
  assert.ok(r.w >= 0.04 && r.h >= 0.04);
});

/* ---------- 네모 여러 개 · 올릴 사진 목록 ---------- */
const { 사각목록, 올릴사진목록 } = require('../quote_photos.js');

test('사각목록: 예전 데이터(객체 하나)도 배열로 돌려준다', () => {
  assert.deepStrictEqual(사각목록({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }),
    [{ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }]);
  assert.deepStrictEqual(사각목록([{ x: 0 }, null, { x: 1 }]), [{ x: 0 }, { x: 1 }]);
  assert.deepStrictEqual(사각목록(null), []);
  assert.deepStrictEqual(사각목록(undefined), []);
});

test('올릴사진목록: 태그만 하고 네모 안 친 사진도 올린다', () => {
  // 예전엔 네모 친 것만 올렸더니 그냥 올린 사진이 견적서에 안 나왔다
  const 사진들 = [{ id: 1, 태그: ['z07_방1_방문_공통'], 표시: {} }];
  const r = 올릴사진목록(사진들);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].체크_ID, 'z07_방1_방문_공통');
  assert.deepStrictEqual(r[0].사각들, []);
  assert.strictEqual(r[0].파일명, 'z07_방1_방문_공통.jpg');
});

test('올릴사진목록: 같은 품목 사진이 여럿이면 __2, __3 으로 이름을 나눈다', () => {
  // 첫 장은 예전 견적서와 같은 이름이어야 한다
  const 사진들 = [
    { id: 3, 태그: ['a'], 표시: {} },
    { id: 1, 태그: ['a'], 표시: { a: { x: 0, y: 0, w: 0.5, h: 0.5 } } },
    { id: 2, 태그: ['b', 'a'], 표시: {} },
  ];
  const r = 올릴사진목록(사진들);
  // 찍은 순서(id)대로
  assert.deepStrictEqual(r.map((x) => x.파일명), ['a.jpg', 'b.jpg', 'a__2.jpg', 'a__3.jpg']);
  assert.strictEqual(r[0].사각들.length, 1);
});

test('올릴사진목록: 한 사진에 한 품목 네모가 여러 개면 전부 넘긴다', () => {
  const 사진들 = [{ id: 1, 태그: ['a'],
    표시: { a: [{ x: 0, y: 0, w: 0.2, h: 0.2 }, { x: 0.5, y: 0.5, w: 0.2, h: 0.2 }] } }];
  const r = 올릴사진목록(사진들);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].사각들.length, 2);
});

test('올릴사진목록: 태그를 풀었는데 네모만 남은 예전 데이터도 올린다', () => {
  const 사진들 = [{ id: 1, 태그: [], 표시: { a: { x: 0, y: 0, w: 0.5, h: 0.5 } } }];
  assert.strictEqual(올릴사진목록(사진들).length, 1);
});

test('올릴사진목록: 태그도 네모도 없는 사진은 안 올린다', () => {
  const 사진들 = [{ id: 1, 태그: [], 표시: {} }, { id: 2 }];
  assert.strictEqual(올릴사진목록(사진들).length, 0);
});

/* ---------- 빨간 표시 지우기 · 네모 색 ---------- */
const { 빨간가, 네모색 } = require('../quote_photos.js');

test('빨간가: 펜 빨강과 가장자리 분홍은 잡고, 베이지 바닥·검정 선·흰 배경은 안 잡는다', () => {
  assert.strictEqual(빨간가(255, 0, 0), true);       // 순빨강
  assert.strictEqual(빨간가(230, 40, 50), true);     // 펜 빨강
  assert.strictEqual(빨간가(245, 140, 150), true);   // 가장자리 분홍
  assert.strictEqual(빨간가(220, 185, 140), false);  // 베이지 바닥 (R 높지만 G 도 높다)
  assert.strictEqual(빨간가(200, 160, 120), false);  // 나무색 문
  assert.strictEqual(빨간가(255, 255, 255), false);  // 흰 배경
  assert.strictEqual(빨간가(30, 30, 30), false);     // 검정 선
  assert.strictEqual(빨간가(250, 200, 190), false);  // 살구색 (너무 밝은 분홍은 배경일 수 있다)
});

test('네모색: 파랑만 파랑, 나머지(예전 데이터 포함)는 빨강', () => {
  assert.strictEqual(네모색('파랑'), '#1e6fff');
  assert.strictEqual(네모색('빨강'), '#ff3b30');
  assert.strictEqual(네모색(undefined), '#ff3b30');
});

/* ---------- HEIC 판별 ----------
   갤럭시·아이폰 '고효율' 사진은 크로미움이 못 연다. 앨범에서 고른 사진만
   안 들어가고 촬영은 되는 원인이라, 왜 안 되는지 사장님에게 말해줘야 한다. */
const { HEIC머리인가 } = require('../quote_photos.js');

// [크기 4바이트]['ftyp'][브랜드 4바이트] 형태의 앞 12바이트를 만든다
function 머리(브랜드) {
  const b = [0, 0, 0, 24];
  'ftyp'.split('').forEach((c) => b.push(c.charCodeAt(0)));
  String(브랜드).split('').forEach((c) => b.push(c.charCodeAt(0)));
  return Uint8Array.from(b);
}

test('HEIC머리인가: 갤럭시·아이폰이 쓰는 브랜드를 모두 잡는다', () => {
  ['heic', 'heix', 'mif1', 'msf1', 'hevc', 'avif'].forEach((브랜드) => {
    assert.strictEqual(HEIC머리인가(머리(브랜드)), true, 브랜드);
  });
});

test('HEIC머리인가: 대문자로 온 브랜드도 잡는다', () => {
  assert.strictEqual(HEIC머리인가(머리('HEIC')), true);
});

test('HEIC머리인가: JPEG·PNG 는 안 잡는다 (멀쩡한 사진을 막으면 안 된다)', () => {
  // JPEG: ff d8 ff e0 ... / PNG: 89 50 4e 47 ...
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);
  const png  = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  assert.strictEqual(HEIC머리인가(jpeg), false);
  assert.strictEqual(HEIC머리인가(png), false);
});

test('HEIC머리인가: ftyp 는 맞지만 HEIF 가 아닌 것(mp4)은 안 잡는다', () => {
  assert.strictEqual(HEIC머리인가(머리('isom')), false);
  assert.strictEqual(HEIC머리인가(머리('mp42')), false);
});

test('HEIC머리인가: 12바이트가 안 되면 false (0바이트 파일에서 안 터진다)', () => {
  assert.strictEqual(HEIC머리인가(Uint8Array.from([])), false);
  assert.strictEqual(HEIC머리인가(Uint8Array.from([0, 0, 0, 24, 102])), false);
  assert.strictEqual(HEIC머리인가(null), false);
});
