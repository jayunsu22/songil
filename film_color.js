// 필름 색상 계산. 색 공간 변환과 색차(ΔE2000) 만 담당한다.
//
// 화면도 네트워크도 건드리지 않는 순수함수만 둔다. 그래야
//   (1) node 로 테스트할 수 있고
//   (2) 브라우저(검색 화면)와 빌드 스크립트(2,047건 색 추출)가 같은 코드를 쓴다.
// 같은 코드를 쓰는 게 중요하다. 두 벌로 나뉘면 "빌드 때 계산한 색"과
// "화면에서 계산한 색"이 미묘하게 달라져 원인 못 찾는 버그가 된다.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FilmColor = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const 라디안 = Math.PI / 180;
  const 도     = 180 / Math.PI;

  /* ---------- 색 공간 변환 ---------- */

  // '#C6C2BD' -> {r,g,b}. 3자리 축약형(#ccc)도 받는다.
  function hex를rgb(hex) {
    let s = String(hex || '').trim().replace(/^#/, '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
    return {
      r: parseInt(s.slice(0, 2), 16),
      g: parseInt(s.slice(2, 4), 16),
      b: parseInt(s.slice(4, 6), 16),
    };
  }

  function rgb를hex(r, g, b) {
    const h = function (v) {
      return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    };
    return '#' + (h(r) + h(g) + h(b)).toUpperCase();
  }

  // sRGB -> CIE L*a*b* (D65).
  // 인수인계 문서에 적힌 DB 생성 시 변환식과 동일해야 한다. 다르면 우리가 새로 뽑은 색과
  // 기존 2,047건의 L*a*b* 가 미세하게 어긋나 매칭 순위가 흔들린다.
  function rgb를lab(r, g, b) {
    const 감마해제 = function (c) {
      c = c / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const R = 감마해제(r), G = 감마해제(g), B = 감마해제(b);

    const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    const y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / 1.00000;
    const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;

    const f = function (t) {
      return t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116;
    };
    const fx = f(x), fy = f(y), fz = f(z);

    return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
  }

  function hex를lab(hex) {
    const c = hex를rgb(hex);
    return c ? rgb를lab(c.r, c.g, c.b) : null;
  }

  /* ---------- ΔE2000 ---------- */

  // CIEDE2000 색차. Sharma, Wu & Dalal (2005) 구현 노트를 따른다.
  //
  // 직접 구현하면 틀리기 쉬운 수식이다. 함정은 전부 각도(hue) 처리에 있다:
  //   · h 를 항상 [0,360) 으로 정규화해야 한다
  //   · 두 각의 차이는 ±180 을 넘으면 360 을 더하거나 빼서 짧은 쪽을 잡아야 한다
  //   · 두 각의 평균도 마찬가지로 경계를 넘을 때 보정해야 한다 (359°와 1°의 평균은 180°가 아니라 0°)
  //   · 채도(C')가 0 인 무채색은 각이 정의되지 않으므로 예외 처리해야 한다
  // 그래서 test/film_color.test.js 에서 Sharma 공식 테스트 34쌍으로 검증한다.
  // 이 함수를 고칠 일이 있으면 반드시 그 테스트를 먼저 돌릴 것.
  //
  // kL 은 명도 가중치. 기본 1 이지만 사진 매칭에서는 2 를 쓴다.
  // 현장 사진은 노출과 그림자 때문에 명도가 크게 흔들리는데, 색상(a*,b*)은
  // 폰의 자동 화이트밸런스 덕에 상대적으로 안정적이기 때문이다.
  function deltaE2000(lab1, lab2, 옵션) {
    const kL = (옵션 && 옵션.kL) || 1;
    const kC = (옵션 && 옵션.kC) || 1;
    const kH = (옵션 && 옵션.kH) || 1;

    const L1 = lab1.L, a1 = lab1.a, b1 = lab1.b;
    const L2 = lab2.L, a2 = lab2.a, b2 = lab2.b;

    const C1 = Math.sqrt(a1 * a1 + b1 * b1);
    const C2 = Math.sqrt(a2 * a2 + b2 * b2);
    const C평균 = (C1 + C2) / 2;

    // 채도가 낮은 영역(회색 근처)에서 색상각이 과민해지는 걸 눌러주는 보정.
    // 이 DB 는 베이지·그레이가 대부분이라 이 항이 특히 중요하게 작동한다.
    const C평균7 = Math.pow(C평균, 7);
    const G = 0.5 * (1 - Math.sqrt(C평균7 / (C평균7 + 6103515625))); // 25^7 = 6103515625

    const a1p = (1 + G) * a1;
    const a2p = (1 + G) * a2;

    const C1p = Math.sqrt(a1p * a1p + b1 * b1);
    const C2p = Math.sqrt(a2p * a2p + b2 * b2);

    // 무채색이면 각을 0 으로 둔다. atan2(0,0) 은 0 을 주지만 의미상 각이 없는 것이므로 명시한다.
    const 각 = function (b, ap) {
      if (ap === 0 && b === 0) return 0;
      const h = Math.atan2(b, ap) * 도;
      return h >= 0 ? h : h + 360;
    };
    const h1p = 각(b1, a1p);
    const h2p = 각(b2, a2p);

    const dLp = L2 - L1;
    const dCp = C2p - C1p;

    // 각의 차. 한쪽이라도 무채색이면 색상차는 의미가 없으므로 0.
    let dhp;
    if (C1p * C2p === 0) {
      dhp = 0;
    } else {
      dhp = h2p - h1p;
      if (dhp > 180) dhp -= 360;
      else if (dhp < -180) dhp += 360;
    }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * 라디안);

    const L평균p = (L1 + L2) / 2;
    const C평균p = (C1p + C2p) / 2;

    // 각의 평균. 359° 와 1° 의 평균은 180° 가 아니라 0° 다.
    let h평균p;
    if (C1p * C2p === 0) {
      h평균p = h1p + h2p;
    } else if (Math.abs(h1p - h2p) <= 180) {
      h평균p = (h1p + h2p) / 2;
    } else if (h1p + h2p < 360) {
      h평균p = (h1p + h2p + 360) / 2;
    } else {
      h평균p = (h1p + h2p - 360) / 2;
    }

    const T = 1
      - 0.17 * Math.cos((h평균p - 30) * 라디안)
      + 0.24 * Math.cos((2 * h평균p) * 라디안)
      + 0.32 * Math.cos((3 * h평균p + 6) * 라디안)
      - 0.20 * Math.cos((4 * h평균p - 63) * 라디안);

    const SL = 1 + (0.015 * Math.pow(L평균p - 50, 2)) / Math.sqrt(20 + Math.pow(L평균p - 50, 2));
    const SC = 1 + 0.045 * C평균p;
    const SH = 1 + 0.015 * C평균p * T;

    // 파랑 계열에서 색상과 채도가 함께 틀어지는 현상을 잡아주는 회전항.
    const dTheta = 30 * Math.exp(-Math.pow((h평균p - 275) / 25, 2));
    const C평균p7 = Math.pow(C평균p, 7);
    const RC = 2 * Math.sqrt(C평균p7 / (C평균p7 + 6103515625));
    const RT = -Math.sin((2 * dTheta) * 라디안) * RC;

    const 명도항 = dLp / (kL * SL);
    const 채도항 = dCp / (kC * SC);
    const 색상항 = dHp / (kH * SH);

    return Math.sqrt(
      명도항 * 명도항 + 채도항 * 채도항 + 색상항 * 색상항 + RT * 채도항 * 색상항
    );
  }

  /* ---------- 사진 영역에서 색 뽑기 ---------- */

  // L* 기준으로 정렬된 lab 배열에서 채널별 중앙값을 낸다.
  // 평균이 아니라 중앙값인 이유: 평균은 반사광 한 점, 그림자 한 점에 그대로 끌려간다.
  function 중앙값(labs) {
    if (!labs.length) return null;
    const 뽑기 = function (키) {
      const v = labs.map(function (x) { return x[키]; }).sort(function (p, q) { return p - q; });
      const m = v.length >> 1;
      return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
    };
    return { L: 뽑기('L'), a: 뽑기('a'), b: 뽑기('b') };
  }

  // canvas 의 RGBA 픽셀 배열에서 대표색과 대비폭을 뽑는다.
  //
  // pixels: Uint8ClampedArray 등 [r,g,b,a, r,g,b,a, ...]
  // 반환  : { 대표색, 밝은색, 어두운색, 대비폭, 픽셀수 }  — 색은 전부 lab
  //
  // 사용자 사진과 제품 카탈로그 이미지 양쪽에 같은 함수를 쓴다.
  // 뽑는 방식이 같아야 비교가 성립하기 때문이다.
  function 영역색(pixels, 옵션) {
    const 절삭비 = (옵션 && 옵션.절삭비 != null) ? 옵션.절삭비 : 0.10; // 상·하위 각 10%
    const 극단비 = (옵션 && 옵션.극단비 != null) ? 옵션.극단비 : 0.25; // 밝은/어두운 각 25%

    let labs = [];
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 128) continue; // 투명 픽셀은 버린다 (PNG 썸네일 여백)
      labs.push(rgb를lab(pixels[i], pixels[i + 1], pixels[i + 2]));
    }
    if (!labs.length) return null;

    labs.sort(function (p, q) { return p.L - q.L; });

    // 반사광(맨 위)과 그림자(맨 아래)를 먼저 잘라낸다.
    // 이걸 안 하면 창문 반사 한 조각이 대표색을 통째로 밝은 쪽으로 끌고 간다.
    const 절삭 = Math.floor(labs.length * 절삭비);
    const 유효 = labs.length - 2 * 절삭 >= 3 ? labs.slice(절삭, labs.length - 절삭) : labs;

    const 대표색 = 중앙값(유효);

    // 무늬의 세기를 재기 위한 두 점. 우드의 밝은 결과 어두운 결에 해당한다.
    const n = Math.max(1, Math.floor(유효.length * 극단비));
    const 어두운색 = 중앙값(유효.slice(0, n));
    const 밝은색   = 중앙값(유효.slice(유효.length - n));

    // 대비폭에는 kL=1 을 쓴다. 매칭(kL=2)과 다른 이유:
    // 여기서 재려는 것이 바로 명도 대비 그 자체이므로 명도를 눌러버리면 안 된다.
    const 대비폭 = deltaE2000(밝은색, 어두운색);

    return {
      대표색: 대표색,
      밝은색: 밝은색,
      어두운색: 어두운색,
      대비폭: 대비폭,
      픽셀수: labs.length,
    };
  }

  /* ---------- 이 이미지가 '견본 사진'이 맞는가 ---------- */

  // 이미지를 격자로 나눠 칸별 평균색을 구하고, 칸들끼리 가장 많이 벌어진 거리를 낸다.
  //
  // 왜 필요한가: 제조사가 준 이미지 URL 이 항상 필름 견본인 건 아니다. 실제로 한솔의 일부
  // URL 은 주방·복도 실내 연출 사진을 가리켰다. 그런 이미지도 유효한 JPEG 이라 파이프라인은
  // 오류 없이 '성공' 하고, 방에서 뽑은 엉뚱한 색을 그럴듯하게 내놓는다. 조용히 틀리는 게 문제다.
  //
  // 견본은 어디를 봐도 색이 비슷해 값이 작다(중앙값 0.73).
  // 실내 사진은 천장·벽·바닥이 전부 달라 크게 나온다(15 이상).
  //
  // 평균이 아니라 '최대'를 쓰는 이유: 사진 한쪽 구석만 전혀 다른 경우(창문, 조명)도 잡아야 한다.
  //
  // 주의 1: 값이 크다고 반드시 불량은 아니다. 메탈 필름은 보는 각도에 따라 색이 변하는 게
  // 실제 물성이라 조명 그라데이션이 정상적으로 생긴다.
  //
  // 주의 2: 무늬 주기가 칸 크기보다 굵으면 값이 오른다. 측정해보면 64px 이미지·16px 칸에서
  // 주기 4px 줄무늬는 0.00 이지만 주기 32px 은 26.88 이 나온다. 즉 넓은 판재나 큰 대리석 결처럼
  // 굵은 무늬를 가진 멀쩡한 제품이 높게 잡힐 수 있다.
  // (실제 DB 의 우드 958건은 중앙값 1.41, 상위 1% 가 6.5 라 현실에서는 여유가 있다)
  //
  // 이 두 가지 때문에 이 값을 '제외 규칙' 으로 바꾸면 안 된다. 멀쩡한 제품이 사라진다.
  // 반드시 '신뢰도' 로만 쓸 것. 최종 판단은 사람이 이미지를 보고 한다.
  function 균일도(pixels, 폭, 높이, 격자) {
    격자 = 격자 || 4;
    const 칸폭 = Math.floor(폭 / 격자), 칸높 = Math.floor(높이 / 격자);
    if (칸폭 < 1 || 칸높 < 1) return 0;

    const 칸색 = [];
    for (let gy = 0; gy < 격자; gy++) {
      for (let gx = 0; gx < 격자; gx++) {
        let r = 0, g = 0, b = 0, n = 0;
        for (let y = gy * 칸높; y < (gy + 1) * 칸높; y++) {
          for (let x = gx * 칸폭; x < (gx + 1) * 칸폭; x++) {
            const i = (y * 폭 + x) * 4;
            if (pixels[i + 3] < 128) continue;
            r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]; n++;
          }
        }
        if (n) 칸색.push(rgb를lab(r / n, g / n, b / n));
      }
    }
    if (칸색.length < 2) return 0;

    let 최대 = 0;
    for (let i = 0; i < 칸색.length; i++) {
      for (let j = i + 1; j < 칸색.length; j++) {
        const d = deltaE2000(칸색[i], 칸색[j]);
        if (d > 최대) 최대 = d;
      }
    }
    return 최대;
  }

  return {
    hex를rgb: hex를rgb,
    rgb를hex: rgb를hex,
    rgb를lab: rgb를lab,
    hex를lab: hex를lab,
    deltaE2000: deltaE2000,
    중앙값: 중앙값,
    영역색: 영역색,
    균일도: 균일도,
  };
});
