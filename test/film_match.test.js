const test = require('node:test');
const assert = require('node:assert');
const { 등급, 통과, 색거리, 점수, 검색, 타브랜드대체품, 필터후보 } = require('../film_match.js');
const { hex를lab } = require('../film_color.js');

// 실제 DB 에서 가져온 값으로 만든 테스트용 제품들.
function 제품(id, 제조사, 코드, hex, 카테고리, 대비폭) {
  return { id, 제조사, 코드, HEX: hex, 카테고리, 명도: '중간', lab: hex를lab(hex), 대비폭 };
}

// 멀리 떨어진 색들. '다 비슷한 갈색' 처럼 보여도 실제로는 ΔE 7~34 로 멀다.
// (#775B3B 기준: #997B4F 는 7.05, #B29F77 은 13.74, #7AC840 은 33.72)
// 상한 동작과 '비슷한 제품 없음' 처리를 확인하는 데 쓴다.
const 목록 = [
  제품('r1', 'LX',   'CW469',  '#775B3B', '우드',     18),
  제품('r2', '영림', 'PW1115', '#B29F77', '우드',     15),
  제품('r3', '삼성', 'JG9511', '#997B4F', '우드',     12),
  제품('r4', '현대', 'ZX145',  '#C19768', '우드',     14),
  제품('r5', '예림', 'HSM11',  '#394553', '솔리드',    0),
  제품('r6', '삼성', 'SG315',  '#7AC840', '솔리드',    0),
];

// 실제 DB 를 닮은 근접 클러스터. 측정해보니 전체의 65.3% 가 ΔE<1 쌍둥이를 갖고,
// ΔE<2 안에 중앙값 11개가 몰려 있다. 정렬·필터 동작은 이런 상황에서 확인해야 의미가 있다.
const 근접 = [
  제품('c1', 'LX',   'CW469', '#775B3B', '우드',   18),
  제품('c2', '영림', 'PW801', '#7A5E3E', '우드',   16),
  제품('c3', '삼성', 'JG820', '#735839', '우드',   11),
  제품('c4', '현대', 'ZX310', '#7D6142', '우드',   13),
  제품('c5', '예림', 'HW140', '#6F5436', '솔리드',  1),
];

/* ---------- 등급 ---------- */

test('등급: 경계값이 설계대로 갈린다', () => {
  assert.strictEqual(등급(0.0),  '거의 동일');
  assert.strictEqual(등급(0.99), '거의 동일');
  assert.strictEqual(등급(1.0),  '매우 유사');
  assert.strictEqual(등급(1.99), '매우 유사');
  assert.strictEqual(등급(2.0),  '유사');
  assert.strictEqual(등급(5.0),  '유사');
  assert.strictEqual(등급(5.01), null, 'ΔE 5 초과는 등급 없음 = 표시하지 않음');
});

/* ---------- 필터 ---------- */

test('통과: 빈 배열이나 없는 키는 전체 허용으로 본다', () => {
  const p = 목록[0];
  assert.strictEqual(통과(p, null), true);
  assert.strictEqual(통과(p, {}), true);
  assert.strictEqual(통과(p, { 제조사: [] }), true, '빈 배열은 필터 안 건 것');
  assert.strictEqual(통과(p, { 제조사: ['LX'] }), true);
  assert.strictEqual(통과(p, { 제조사: ['영림'] }), false);
});

test('통과: 여러 필터는 모두 만족해야 한다', () => {
  const p = 목록[0]; // LX / 우드
  assert.strictEqual(통과(p, { 제조사: ['LX'], 카테고리: ['우드'] }), true);
  assert.strictEqual(통과(p, { 제조사: ['LX'], 카테고리: ['솔리드'] }), false);
});

/* ---------- 검색 ---------- */

test('검색: 색이 가까운 순으로 정렬하고 개수를 지킨다', () => {
  const 질의 = { lab: hex를lab('#775B3B') }; // c1 과 동일한 색
  const r = 검색(근접, 질의, null, { 개수: 3 });
  assert.strictEqual(r.length, 3);
  assert.strictEqual(r[0].제품.코드, 'CW469', '같은 색이 1등이어야 한다');
  assert.ok(r[0].ΔE < 0.001);
  for (let i = 1; i < r.length; i++) {
    assert.ok(r[i].점수 >= r[i - 1].점수, '점수 오름차순이어야 한다');
  }
});

test('검색: ΔE 상한을 넘는 제품은 후보에서 빠진다', () => {
  // 선명한 초록(#7AC840)을 질의하면 베이지·브라운 계열은 전부 ΔE 5 를 넘는다.
  const r = 검색(목록, { lab: hex를lab('#7AC840') }, null, {});
  assert.ok(r.length >= 1);
  r.forEach((x) => assert.ok(x.ΔE <= 5, `상한 초과가 남아있다: ${x.제품.코드} ΔE ${x.ΔE}`));
  assert.strictEqual(r[0].제품.코드, 'SG315');
});

test('검색: 맞는 게 하나도 없으면 빈 배열 — 억지 추천을 하지 않는다', () => {
  // 이 DB 에 없는 선명한 자홍색. "비슷한 제품 없음" 으로 처리되어야 한다.
  const r = 검색(목록, { lab: hex를lab('#FF00FF') }, null, {});
  assert.deepStrictEqual(r, []);
});

test('검색: 필터를 걸면 그 안에서만 찾는다', () => {
  const 질의 = { lab: hex를lab('#775B3B') };
  const r = 검색(근접, 질의, { 제조사: ['영림', '삼성'] }, {});
  assert.ok(r.length > 0);
  r.forEach((x) => assert.ok(['영림', '삼성'].includes(x.제품.제조사)));
});

test('검색: 상한은 점수가 아니라 색 거리에 걸린다', () => {
  // 색은 정확히 같지만 무늬가 정반대인 제품을 만든다.
  // 벌점 때문에 점수는 5 를 넘지만, 색이 맞으므로 후보에서 빠지면 안 된다.
  // 순위를 내릴 일이지 탈락시킬 일이 아니다.
  const 특수 = [제품('x1', 'LX', 'SAME', '#775B3B', '솔리드', 0)];
  const 질의 = { lab: hex를lab('#775B3B'), 대비폭: 40 }; // 벌점 0.15*40 = 6.0
  const r = 검색(특수, 질의, null, {});
  assert.strictEqual(r.length, 1, '색이 같으면 무늬가 달라도 후보에는 남아야 한다');
  assert.ok(r[0].ΔE < 0.001);
  assert.ok(r[0].점수 > 5, `벌점이 실제로 붙어야 한다 (점수 ${r[0].점수})`);
});

/* ---------- 대비폭 벌점 ---------- */

test('점수: 무늬가 비슷한 제품이 위로 올라온다', () => {
  // 설계의 핵심 주장이다. 나뭇결을 찍으면 우드가, 민무늬를 찍으면 솔리드가 위로 와야 한다.
  const 우드   = 제품('w', 'LX', 'W', '#8A6F4D', '우드',   18);
  const 솔리드 = 제품('s', '영림', 'S', '#8A6F4D', '솔리드',  0); // 색은 완전히 동일

  const 나뭇결촬영 = { lab: hex를lab('#8A6F4D'), 대비폭: 18 };
  const 민무늬촬영 = { lab: hex를lab('#8A6F4D'), 대비폭: 0 };

  assert.strictEqual(검색([우드, 솔리드], 나뭇결촬영, null, {})[0].제품.코드, 'W');
  assert.strictEqual(검색([우드, 솔리드], 민무늬촬영, null, {})[0].제품.코드, 'S');
});

test('점수: 대비폭이 없으면(색만 고른 경우) 벌점 없이 색으로만 정렬한다', () => {
  const p = 목록[0];
  const s = 점수({ lab: hex를lab('#775B3B') }, p, { kL: 2, 대비가중치: 0.15 });
  assert.strictEqual(s.벌점, 0);
  assert.strictEqual(s.점수, s.ΔE);
});

test('색거리: kL 옵션이 실제로 전달된다', () => {
  const p = 제품('t', 'LX', 'T', '#8A6F4D', '우드', 10);
  const 질의 = { lab: hex를lab('#5A4F3D') }; // 주로 명도가 다른 색
  assert.ok(색거리(질의, p, 2) < 색거리(질의, p, 1), 'kL=2 면 명도 차이가 줄어야 한다');
});

/* ---------- 브랜드 교차 ---------- */

test('타브랜드대체품: 자기 브랜드와 자기 자신을 제외한다', () => {
  const 기준 = 근접[2]; // 삼성 JG820
  const r = 타브랜드대체품(근접, 기준);
  assert.ok(r.length > 0);
  r.forEach((x) => {
    assert.notStrictEqual(x.제품.제조사, '삼성', '같은 브랜드가 나오면 안 된다');
    assert.notStrictEqual(x.제품.id, 기준.id);
  });
});

/* ---------- 필터 후보 ---------- */

test('필터후보: 데이터에서 목록을 만든다 (브랜드를 코드에 박지 않는다)', () => {
  const r = 필터후보(목록, '제조사');
  assert.strictEqual(r.length, 5);
  assert.strictEqual(r[0].값, '삼성', '건수 많은 순 정렬');
  assert.strictEqual(r[0].건수, 2);

  // 새 브랜드를 추가하면 목록이 저절로 늘어나야 한다. 한솔이 6번째로 들어왔고 더 늘어난다.
  const 확장 = 목록.concat([제품('r7', '한솔', 'HS1', '#DDDDDD', '솔리드', 1)]);
  assert.strictEqual(필터후보(확장, '제조사').length, 6);
  assert.ok(필터후보(확장, '제조사').some((x) => x.값 === '한솔'));
});
