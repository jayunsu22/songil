const test = require('node:test');
const assert = require('node:assert');
const { hex를rgb, rgb를hex, rgb를lab, hex를lab, deltaE2000, 중앙값, 영역색, 균일도 } = require('../film_color.js');
const sharma = require('./ciede2000_sharma.json');

/* ΔE2000 은 각도(hue) 처리 때문에 직접 구현하면 틀리기 쉽다. 그리고 틀려도
   "그럴듯한 숫자"가 나와서 눈으로는 못 잡는다. 그래서 감으로 만든 기대값이 아니라
   Sharma, Wu & Dalal (2005) 의 공식 테스트 데이터 34쌍으로 검증한다.
   출처: gfiumara/CIEDE2000 의 testCIEDE2000.cpp (원 논문 부록 데이터) */

test('deltaE2000: Sharma 공식 테스트 34쌍을 소수점 4자리까지 통과한다', () => {
  assert.strictEqual(sharma.length, 34, '테스트 데이터가 34쌍이어야 한다');

  const 실패 = [];
  sharma.forEach((t, i) => {
    const lab1 = { L: t.lab1[0], a: t.lab1[1], b: t.lab1[2] };
    const lab2 = { L: t.lab2[0], a: t.lab2[1], b: t.lab2[2] };
    const 계산 = deltaE2000(lab1, lab2);
    // 참조값이 소수점 4자리로 반올림되어 있으므로 같은 자리에서 비교한다.
    if (계산.toFixed(4) !== t.dE00.toFixed(4)) {
      실패.push(`#${i + 1} 기대 ${t.dE00.toFixed(4)} / 실제 ${계산.toFixed(4)}`);
    }
  });

  assert.deepStrictEqual(실패, [], '불일치:\n' + 실패.join('\n'));
});

test('deltaE2000: 같은 색은 0 이다', () => {
  const c = { L: 55.3, a: 4.1, b: 12.9 };
  assert.strictEqual(deltaE2000(c, c), 0);
});

test('deltaE2000: 대칭이다 (a→b 와 b→a 가 같다)', () => {
  // 대칭성이 깨지면 "A 의 유사품 목록"과 "B 의 유사품 목록"이 서로 모순된다.
  const a = { L: 50, a: 2.5, b: 0 };
  const b = { L: 61, a: -5, b: 29 };
  assert.strictEqual(deltaE2000(a, b).toFixed(10), deltaE2000(b, a).toFixed(10));
});

test('deltaE2000: kL=2 는 명도 차이만 절반으로 줄이고 색상 차이는 건드리지 않는다', () => {
  // 현장 사진 매칭에서 kL=2 를 쓰는 근거가 실제로 성립하는지 확인한다.
  const 기준   = { L: 50, a: 10, b: 10 };
  const 명도만 = { L: 60, a: 10, b: 10 };   // 명도만 다름
  const 색상만 = { L: 50, a: 20, b: 10 };   // 색상만 다름

  const 명도_기본 = deltaE2000(기준, 명도만);
  const 명도_kL2  = deltaE2000(기준, 명도만, { kL: 2 });
  const 색상_기본 = deltaE2000(기준, 색상만);
  const 색상_kL2  = deltaE2000(기준, 색상만, { kL: 2 });

  assert.ok(명도_kL2 < 명도_기본, '명도 차이는 줄어야 한다');
  assert.strictEqual(명도_kL2.toFixed(10), (명도_기본 / 2).toFixed(10), '정확히 절반이어야 한다');
  assert.strictEqual(색상_kL2.toFixed(10), 색상_기본.toFixed(10), '색상 차이는 그대로여야 한다');
});

/* ---------- 색 공간 변환 ---------- */

test('hex를rgb: 6자리와 3자리 축약형을 모두 받는다', () => {
  assert.deepStrictEqual(hex를rgb('#C6C2BD'), { r: 198, g: 194, b: 189 });
  assert.deepStrictEqual(hex를rgb('c6c2bd'),  { r: 198, g: 194, b: 189 });
  assert.deepStrictEqual(hex를rgb('#ccc'),    { r: 204, g: 204, b: 204 });
});

test('hex를rgb: 잘못된 값은 null 을 준다', () => {
  // Airtable 의 HEX 필드는 사람이 손으로 고칠 수 있는 텍스트 필드다. 깨진 값이 들어올 수 있다.
  [null, '', '#12345', 'zzzzzz', '#12345g'].forEach((v) => {
    assert.strictEqual(hex를rgb(v), null, `${JSON.stringify(v)} 는 null 이어야 한다`);
  });
});

test('rgb를hex: 왕복 변환이 원래 값으로 돌아온다', () => {
  ['#C6C2BD', '#7AC840', '#394553', '#000000', '#FFFFFF'].forEach((h) => {
    const c = hex를rgb(h);
    assert.strictEqual(rgb를hex(c.r, c.g, c.b), h.toUpperCase());
  });
});

test('rgb를lab: 흰색과 검정이 정의대로 나온다', () => {
  const 흰 = rgb를lab(255, 255, 255);
  assert.ok(Math.abs(흰.L - 100) < 0.01, `흰색 L*=100 이어야 하는데 ${흰.L}`);

  // 흰색의 a*,b* 가 정확히 0 이 아니라 0.005 / -0.010 이 나온다. 버그가 아니다.
  // 인수인계 문서에 적힌 변환 행렬 계수(0.4124, 0.3576, ...)가 반올림된 값이라
  // 행 합이 D65 백색점(0.95047, 1.0, 1.08883)과 소수점 아래에서 미세하게 어긋난다.
  //
  // 더 정밀한 계수로 바꾸면 이 오차는 사라지지만, 기존 2,047건이 이 식으로 만들어졌으므로
  // 우리가 새로 뽑는 색과 기존 데이터가 서로 어긋나게 된다. 그게 훨씬 나쁘다.
  // 그래서 문서의 식을 그대로 쓰고, 이 미세 오차를 '알려진 성질'로 여기 고정해 둔다.
  // ΔE 로 환산하면 0.02 수준이라 매칭 결과에 영향을 주지 않는다.
  assert.ok(Math.abs(흰.a) < 0.02 && Math.abs(흰.b) < 0.02,
    `흰색은 거의 무채색이어야 한다 (a*=${흰.a}, b*=${흰.b})`);
  const 흰오차 = deltaE2000({ L: 100, a: 0, b: 0 }, 흰);
  assert.ok(흰오차 < 0.05, `백색점 오차가 ΔE ${흰오차.toFixed(4)} — 매칭에 영향 없어야 한다`);

  const 검 = rgb를lab(0, 0, 0);
  assert.strictEqual(검.L, 0);
});

test('rgb를lab: Airtable 에 저장된 실제 5건과 반올림 오차 안에서 일치한다', () => {
  // 기존 DB 2,047건이 이 변환식으로 만들어졌다는 전제를 고정한다.
  // 이 테스트가 깨지면 우리가 새로 뽑는 색과 기존 데이터가 어긋난다는 뜻이다.
  const 실제 = [
    { hex: '#7AC840', L: 73.4, a: -46.5, b: 57.9 },
    { hex: '#E4D9D9', L: 87.5, a: 3.8,   b: 1.3  },
    { hex: '#394553', L: 28.8, a: -1.1,  b: -10.0 },
    { hex: '#997B4F', L: 53.5, a: 5.7,   b: 28.4 },
    { hex: '#8A867D', L: 56.0, a: -0.2,  b: 5.4  },
  ];
  실제.forEach((t) => {
    const c = hex를lab(t.hex);
    // 저장값이 소수점 1자리로 반올림되어 있으므로 0.05 를 허용한다.
    assert.ok(Math.abs(c.L - t.L) < 0.06, `${t.hex} L* ${c.L} vs ${t.L}`);
    assert.ok(Math.abs(c.a - t.a) < 0.06, `${t.hex} a* ${c.a} vs ${t.a}`);
    assert.ok(Math.abs(c.b - t.b) < 0.06, `${t.hex} b* ${c.b} vs ${t.b}`);
  });
});

/* ---------- 영역에서 색 뽑기 ---------- */

// 테스트용 RGBA 픽셀 배열 만들기. colors 는 [r,g,b] 배열의 배열.
function 픽셀(colors, alpha) {
  const out = [];
  colors.forEach((c) => out.push(c[0], c[1], c[2], alpha == null ? 255 : alpha));
  return out;
}

test('영역색: 단색이면 대비폭이 0 이다', () => {
  const p = 픽셀(Array(100).fill([180, 150, 120]));
  const r = 영역색(p);
  assert.strictEqual(r.대비폭, 0);
  assert.ok(Math.abs(r.대표색.L - rgb를lab(180, 150, 120).L) < 0.001);
});

test('영역색: 나뭇결(밝고 어두운 줄무늬)은 대비폭이 크게 나온다', () => {
  // 설계의 핵심 가정이다. 밋밋한 솔리드와 무늬 있는 우드가 대비폭으로 갈려야 한다.
  const 솔리드 = 픽셀(Array(100).fill([179, 150, 114]));
  const 우드 = 픽셀(
    Array(50).fill([216, 192, 160]).concat(Array(50).fill([138, 107, 69]))
  );
  const s = 영역색(솔리드);
  const w = 영역색(우드);

  assert.ok(w.대비폭 > 10, `우드 대비폭이 커야 하는데 ${w.대비폭.toFixed(2)}`);
  assert.ok(s.대비폭 < 1,  `솔리드 대비폭이 작아야 하는데 ${s.대비폭.toFixed(2)}`);

  // 그런데 대표색은 서로 비슷하다 -> 평균색 하나로는 둘을 구분 못 한다는 것,
  // 즉 대비폭을 따로 저장해야 하는 이유 자체를 고정해 둔다.
  assert.ok(deltaE2000(s.대표색, w.대표색) < 6,
    `대표색은 비슷해야 논지가 성립하는데 ΔE ${deltaE2000(s.대표색, w.대표색).toFixed(2)}`);
});

test('영역색: 반사광 한 점이 대표색을 끌고 가지 않는다', () => {
  // 절삭이 실제로 작동하는지 확인한다. 이게 평균 대신 중앙값+절삭을 쓰는 이유다.
  const 깨끗 = 픽셀(Array(100).fill([120, 100, 80]));
  const 반사포함 = 픽셀(
    Array(92).fill([120, 100, 80]).concat(Array(8).fill([255, 255, 255]))
  );
  const a = 영역색(깨끗);
  const b = 영역색(반사포함);
  assert.ok(Math.abs(a.대표색.L - b.대표색.L) < 0.001,
    `반사광 8% 가 대표색을 바꾸면 안 된다 (${a.대표색.L} vs ${b.대표색.L})`);
});

test('영역색: 투명 픽셀은 무시한다', () => {
  // 제조사 썸네일 중 PNG 는 여백이 투명일 수 있다. 그걸 세면 색이 흐려진다.
  const 불투명 = 픽셀(Array(50).fill([180, 150, 120]), 255);
  const 투명   = 픽셀(Array(50).fill([255, 255, 255]), 0);
  const r = 영역색(불투명.concat(투명));
  assert.strictEqual(r.픽셀수, 50);
  assert.ok(Math.abs(r.대표색.L - rgb를lab(180, 150, 120).L) < 0.001);
});

test('영역색: 픽셀이 하나도 없으면 null 을 준다', () => {
  assert.strictEqual(영역색([]), null);
  assert.strictEqual(영역색(픽셀(Array(10).fill([1, 2, 3]), 0)), null);
});

test('중앙값: 짝수 개일 때 가운데 두 값의 평균을 낸다', () => {
  const r = 중앙값([
    { L: 10, a: 0, b: 0 },
    { L: 20, a: 2, b: 4 },
    { L: 30, a: 4, b: 8 },
    { L: 40, a: 6, b: 12 },
  ]);
  assert.deepStrictEqual(r, { L: 25, a: 3, b: 6 });
});

/* ---------- 이 이미지가 견본 사진이 맞는가 ---------- */

// 폭 x 높이 RGBA 이미지를 만든다. fn(x,y) -> [r,g,b]
function 이미지(폭, 높이, fn) {
  const out = new Uint8ClampedArray(폭 * 높이 * 4);
  for (let y = 0; y < 높이; y++) {
    for (let x = 0; x < 폭; x++) {
      const c = fn(x, y), i = (y * 폭 + x) * 4;
      out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255;
    }
  }
  return out;
}

test('균일도: 단색 견본은 0 에 가깝다', () => {
  const img = 이미지(64, 64, () => [180, 150, 120]);
  assert.ok(균일도(img, 64, 64) < 0.01);
});

test('균일도: 가는 나뭇결 견본은 낮게 나온다 (무늬가 있어도 견본은 견본)', () => {
  // 칸(16px)보다 촘촘한 줄무늬. 칸마다 밝은 줄과 어두운 줄이 고르게 섞이므로 칸 평균이 비슷하다.
  // 대비폭은 크지만 균일도는 작아야 한다 — 두 지표가 서로 다른 것을 재는지 확인한다.
  const img = 이미지(64, 64, (x) => (x % 4 < 2 ? [216, 192, 160] : [138, 107, 69]));
  assert.ok(균일도(img, 64, 64) < 1, `가는 나뭇결 균일도가 ${균일도(img, 64, 64).toFixed(2)}`);
});

test('균일도: 굵은 무늬는 높게 나온다 — 알려진 한계이므로 제외 규칙으로 쓰면 안 된다', () => {
  // 주기가 칸(16px)보다 굵은 줄무늬. 넓은 판재나 큰 대리석 결이 이런 모양이다.
  // 불량이 아닌데도 값이 크게 나온다는 사실을 여기 고정해 둔다.
  // 이 테스트가 있는 한, 나중에 누가 균일도를 '제외 규칙'으로 바꾸려 하면 이 주석을 보게 된다.
  const 굵은결 = 이미지(64, 64, (x) => (x % 32 < 16 ? [216, 192, 160] : [138, 107, 69]));
  assert.ok(균일도(굵은결, 64, 64) > 15, '굵은 무늬는 연출사진과 같은 대역으로 올라온다');

  // 실제 DB 의 우드 958건은 중앙값 1.41, 상위 1% 가 6.5 라 현실에서는 이 한계에 잘 안 걸린다.
  // 그래도 '신뢰도'로만 쓰고 최종 판단은 사람이 이미지를 보고 해야 하는 이유다.
});

test('균일도: 실내 사진처럼 영역이 나뉜 이미지는 크게 나온다', () => {
  // 위쪽은 밝은 천장, 아래쪽은 어두운 바닥. 한솔 URL 이 가리키던 연출 사진의 구조다.
  const img = 이미지(64, 64, (x, y) => (y < 32 ? [240, 238, 235] : [60, 55, 50]));
  assert.ok(균일도(img, 64, 64) > 15, `연출사진 균일도가 ${균일도(img, 64, 64).toFixed(2)}`);
});

test('균일도: 한쪽 구석만 다른 경우도 잡는다 (평균이 아니라 최대를 쓰는 이유)', () => {
  // 대부분 균일한데 왼쪽 위 한 칸만 창문처럼 밝다. 평균으로 재면 묻힌다.
  const img = 이미지(64, 64, (x, y) => (x < 16 && y < 16 ? [255, 255, 255] : [70, 60, 50]));
  assert.ok(균일도(img, 64, 64) > 15);
});

test('균일도: 투명 픽셀은 세지 않는다', () => {
  const 폭 = 64, 높이 = 64;
  const img = new Uint8ClampedArray(폭 * 높이 * 4);
  for (let i = 0; i < 폭 * 높이; i++) {
    img[i * 4] = 180; img[i * 4 + 1] = 150; img[i * 4 + 2] = 120;
    img[i * 4 + 3] = i % 2 ? 255 : 0; // 절반은 투명
  }
  assert.ok(균일도(img, 폭, 높이) < 0.01);
});
