const test = require('node:test');
const assert = require('node:assert');
const { webcrypto } = require('node:crypto');
const P = require('../film/film_price.js');
const 표 = require('../film/film_price.json');
const db = require('../film/film-db.json');

const 필름 = (제조사, 코드, 더) => Object.assign({ 제조사, 코드 }, 더);
const 요약 = (p) => P.찾기(표, p).map((x) => x.줄.구분 + ':' + x.계열);

test('삼성 SG/SF 는 비방염 SG 와 방염 SF 둘 다', () => {
  assert.deepStrictEqual(요약(필름('삼성', 'SG/SF 315')), ['비방염:SG', '방염:SF']);
  assert.deepStrictEqual(요약(필름('삼성', 'SG 10')), ['비방염:SG']);
});

test('현대는 방염 코드에 G 를 붙이면 비방염', () => {
  assert.deepStrictEqual(요약(필름('현대', 'S188')), ['비방염:GS', '방염:S']);
  assert.deepStrictEqual(요약(필름('현대', 'ZX145(XP105)')), ['비방염:GZX', '방염:ZX']);
  // SMT 는 비방염·방염 코드가 같다 — 한 줄만 잡으면 안 된다
  assert.deepStrictEqual(요약(필름('현대', 'SMT21')), ['비방염:SMT', '방염:SMT']);
});

test('영림은 비방염 코드에 F 를 붙이면 방염, PS 가 PSM 을 먹지 않는다', () => {
  assert.deepStrictEqual(요약(필름('영림', 'PS104')), ['비방염:PS', '방염:FPS']);
  assert.deepStrictEqual(요약(필름('영림', 'PSM185')), ['비방염:PSM', '방염:FPSM']);
});

test('LX 는 방염 계열에 비방염 호환을 붙이고, 특수 코드는 앞 계열로', () => {
  const r = P.찾기(표, 필름('LX', 'RS138'));
  assert.deepStrictEqual(r.map((x) => x.계열), ['ES', 'RS']);
  assert.strictEqual(r[0].호환, true);
  assert.deepStrictEqual(요약(필름('LX', 'CWAC1')), ['비방염:EW', '방염:CW']);
});

test('한솔은 색상명으로 값이 갈린다', () => {
  const 크림 = P.찾기(표, 필름('한솔', 'HSF1', { 색상명: '클레이크림', 카테고리: '솔리드' }));
  assert.strictEqual(크림[0].줄.묶음, '페인트');
  const 방염 = P.찾기(표, 필름('한솔', 'x', { 색상명: '도브화이트', 카테고리: '솔리드', 세부분류: '방염', 방염: true }));
  assert.strictEqual(방염[0].줄.구분, '방염');
});

test('단가표에 없는 계열은 빈 목록', () => {
  assert.deepStrictEqual(요약(필름('LX', 'PME06')), []);
  assert.deepStrictEqual(요약(필름('레놀릿', 'S-454009')), []);
});

test('실제 DB 의 98% 이상에 단가가 붙는다', () => {
  const 붙음 = db.filter((p) => P.찾기(표, p).length).length;
  assert.ok(붙음 / db.length > 0.98, 붙음 + '/' + db.length);
});

test('공개 파일에는 시공가·업체가가 없다', () => {
  const 글 = JSON.stringify(표);
  assert.ok(!/시공가|업체가|p1|p2|대리점/.test(글));
});

test('잠근 값은 맞는 암호로만 풀린다', async () => {
  const 소금 = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const 키 = await P.키만들기(webcrypto.subtle, '맞는암호', 소금, 1000);
  const 암 = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, 키, new TextEncoder().encode('{"a":1}'));
  const b = (u) => Buffer.from(u).toString('base64');
  const 잠긴 = { 횟수: 1000, 소금: b(소금), iv: b(iv), 값: b(new Uint8Array(암)) };
  assert.deepStrictEqual(await P.풀기(잠긴, '맞는암호', webcrypto.subtle), { a: 1 });
  await assert.rejects(P.풀기(잠긴, '틀린암호', webcrypto.subtle), { name: 'OperationError' });
});
