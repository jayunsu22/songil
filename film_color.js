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
  /* ---------- 조명 보정 (화이트밸런스) ---------- */

  // 왜 필요한가. 2026-09-06 실사진 87건 측정에서, 사진색과 DB색의 ΔE 중앙값이 8.41 이었다.
  // 그 오차의 방향이 무작위가 아니었다 — b* 가 87건 중 94% 에서 같은 방향으로 -7.75 치우쳤다.
  // 폰의 자동 화이트밸런스가 따뜻한 실내등을 과하게 되돌려 사진 전체가 푸르게 찍힌 것이다.
  // 설계 초기에 '보정 없음 + L* 가중치 낮춤(kL=2)' 으로 정했지만, kL 은 L* 만 눌러줄 뿐
  // 정작 가장 일관되게 틀리는 b* 에는 아무 일도 하지 않는다. 그래서 여기서 되돌린다.
  //
  // pixels 는 [r,g,b,a, ...] 평탄 배열. 성능을 위해 걸러 뽑아 넣어도 된다.
  //
  // 방식:
  //   '회색'   그레이월드. 화면 평균이 회색이라고 본다. 한 색이 화면을 덮으면 무너진다.
  //   '흰점'   가장 밝은 쪽을 흰색으로 본다. 흰 벽·종이가 있으면 잘 맞는다.
  //   '멱평균' shades-of-grey. 위 둘의 중간이고 실측에서 가장 안정적이었다.
  function 조명추정(pixels, 옵션) {
    옵션 = 옵션 || {};
    const 방식 = 옵션.방식 || '멱평균';
    const 지수 = 옵션.지수 != null ? 옵션.지수 : 6;

    if (방식 === '흰점') {
      // 완전히 날아간 화소(255 근처)는 색 정보가 없다. 넣으면 보정이 사라진다.
      const 밝기 = [];
      for (let i = 0; i + 3 < pixels.length; i += 4) {
        if (pixels[i + 3] < 200) continue;
        if (pixels[i] >= 250 && pixels[i + 1] >= 250 && pixels[i + 2] >= 250) continue;
        밝기.push(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
      }
      if (!밝기.length) return null;
      밝기.sort((a, b) => a - b);
      const 문턱 = 밝기[Math.floor(밝기.length * 0.97)];
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i + 3 < pixels.length; i += 4) {
        if (pixels[i + 3] < 200) continue;
        if (pixels[i] >= 250 && pixels[i + 1] >= 250 && pixels[i + 2] >= 250) continue;
        if (0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2] < 문턱) continue;
        r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]; n++;
      }
      return n ? [r / n, g / n, b / n] : null;
    }

    const p = 방식 === '회색' ? 1 : 지수;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i + 3 < pixels.length; i += 4) {
      if (pixels[i + 3] < 200) continue;
      r += Math.pow(pixels[i], p); g += Math.pow(pixels[i + 1], p); b += Math.pow(pixels[i + 2], p);
      n++;
    }
    if (!n) return null;
    return [Math.pow(r / n, 1 / p), Math.pow(g / n, 1 / p), Math.pow(b / n, 1 / p)];
  }

  // 조명색을 회색으로 되돌리는 채널별 이득.
  //
  // 반드시 선형 공간에서 계산한다. 조명보정()이 선형에서 곱하기 때문이다.
  // 감마가 씌워진 값끼리 나눈 비를 선형 공간에 쓰면 배율이 어긋난다.
  //
  // 기준을 안 주면 초록을 그대로 두고 색만 맞춘다(화이트밸런스). 밝기는 건드리지 않는다.
  // 기준을 주면 추정한 조명이 그 밝기가 되도록 세 채널을 함께 밀어 노출까지 맞춘다.
  // 실측에서 노출 오차(L* 가 쪽마다 -14~+11)가 색 오차만큼 컸기 때문에 이 갈래가 필요하다.
  //
  // 이득을 묶는 이유: 한 색이 화면을 가득 채운 사진(예: 벽 전체가 파랑)에서는 추정이 크게
  // 틀리고, 그대로 보정하면 원래보다 나빠진다. 보정은 거들기만 해야 한다.
  function 조명이득(조명, 옵션) {
    if (!조명) return null;
    옵션 = 옵션 || {};
    // 기본 2.5 는 실측(2026-09-06)에서 고른 값이다. 여기 기본값과 앱이 쓰는 값이 다르면
    // 나중에 누군가 옵션을 빼먹었을 때 조용히 다른 결과가 나온다. 같은 값으로 둔다.
    const 한계 = 옵션.한계 || 2.5;
    const 검 = 옵션.검은점 ? 옵션.검은점.map(s선형) : [0, 0, 0];
    const L = 조명.map((v, i) => Math.max(1e-4, s선형(v) - 검[i]));
    // 세기: 1 이면 추정한 조명을 끝까지 되돌리고, 0.7 이면 그 70% 만 되돌린다.
    //
    // 왜 부분만 되돌리는가. '가장 밝은 것은 완전한 무채색' 이라는 가정이 실제로는 늘 조금 틀리다.
    // 종이와 흰 벽에는 형광증백제가 들어 있어 원래 푸르스름하다. 그걸 무채색으로 강제하면
    // 화면 전체가 붉은 쪽으로 밀린다. 실측에서 정확히 그 일이 일어났다 —
    // 보정 전 a* 편차 +1.2 가 완전 보정 뒤 +3.8 로 오히려 커졌다.
    const 세기 = 옵션.세기 != null ? 옵션.세기 : 1;
    const 묶기 = v => Math.min(한계, Math.max(1 / 한계, Math.pow(v, 세기)));
    if (옵션.기준) {
      const 목표 = Math.max(1e-4, s선형(옵션.기준));
      return [묶기(목표 / L[0]), 묶기(목표 / L[1]), 묶기(목표 / L[2])];
    }
    return [묶기(L[1] / L[0]), 1, 묶기(L[1] / L[2])];
  }

  const s선형 = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const s부호 = c => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

  // 이득을 픽셀 배열에 적용해 새 배열을 돌려준다. 원본은 건드리지 않는다.
  //
  // 빛의 세기는 선형 공간에서 곱해진다. sRGB 값(감마가 씌워진 값)에 그대로 곱하면
  // 밝은 곳과 어두운 곳에 서로 다른 배율을 적용한 셈이 되어 어긋난다.
  // 그래서 감마를 풀고 곱한 뒤 다시 씌운다.
  //
  // 검은점(옵션)은 유리·인화면에서 번진 빛(플레어)이 모든 채널에 더해 놓은 바닥값이다.
  // 곱셈만으로는 못 없앤다. 빼야 한다.
  function 조명보정(pixels, 이득, 검은점) {
    if (!이득) return pixels;
    const 검 = 검은점 ? 검은점.map(s선형) : [0, 0, 0];
    const 나 = new Array(pixels.length);
    for (let i = 0; i + 3 < pixels.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const v = (s선형(pixels[i + c]) - 검[c]) * 이득[c];
        나[i + c] = Math.max(0, Math.min(255, s부호(Math.max(0, v))));
      }
      나[i + 3] = pixels[i + 3];
    }
    return 나;
  }

  // 채널별 검은점: 가장 어두운 쪽 분위수. 실제 검정보다 밝게 찍혀 있으면 그만큼이 번진 빛이다.
  //
  // 상한이 반드시 있어야 한다. 화면에 어두운 것이 없는 사진 — 예를 들어 짙은 갈색 문짝이
  // 화면을 가득 채운 사진 — 에서는 '가장 어두운 화소' 가 번진 빛이 아니라 문짝 그 자체다.
  // 그걸 빼면 문짝이 새까매진다. 실제로 브라우저 시험에서 갈색 색판이 #000000 이 됐다.
  // 번진 빛은 원래 작은 값이므로, 흰 쪽의 일부를 넘으면 '잴 수 없는 상황' 으로 보고 물러선다.
  function 검은점추정(pixels, 분위 = 0.005, 상한 = null) {
    const 채널 = [[], [], []];
    for (let i = 0; i + 3 < pixels.length; i += 4) {
      if (pixels[i + 3] < 200) continue;
      for (let c = 0; c < 3; c++) 채널[c].push(pixels[i + c]);
    }
    if (!채널[0].length) return null;
    const 값 = 채널.map(v => { v.sort((a, b) => a - b); return v[Math.floor(v.length * 분위)]; });
    const 최대 = 상한 != null ? 상한 : 30;
    return 값.map(v => Math.min(v, 최대));
  }

  // 사진 한 장에서 보정 계수를 한 번에 만든다.
  // 검은점을 먼저 빼고 그 위에서 이득을 구해야 순서가 맞는데, 호출하는 쪽이
  // 그 순서를 매번 기억해야 하면 언젠가 틀린다. 그래서 여기서 묶어 둔다.
  function 보정계수(표본, 옵션) {
    옵션 = 옵션 || {};
    if (!옵션.방식) return null;
    const 조명 = 조명추정(표본, { 방식: 옵션.방식, 지수: 옵션.지수 });
    if (!조명) return null;

    // 검은점 상한은 흰 쪽에 맞춰 잡는다. 어두운 사진에서는 그만큼 작아진다.
    const 검은점 = 옵션.검은점빼기
      ? 검은점추정(표본, 옵션.검은점분위,
                   Math.min(옵션.검은점절대상한 != null ? 옵션.검은점절대상한 : 40,
                            Math.max.apply(null, 조명) * (옵션.검은점상한비 != null ? 옵션.검은점상한비 : 0.2)))
      : null;

    // 노출까지 맞추려면 '화면에서 가장 밝은 것이 흰색' 이라는 가정이 필요하다.
    // 샘플북·흰 벽 앞에서는 맞지만, 창문이나 색등이 제일 밝은 사진에서는 틀린다.
    // 그때 노출을 억지로 맞추면 사진 전체가 무너지므로, 밝은 쪽이 충분히 무채색일 때만 한다.
    // 아니면 색만 맞추고 밝기는 건드리지 않는다.
    let 기준 = 옵션.기준;
    if (기준) {
      const 최대 = Math.max.apply(null, 조명), 최소 = Math.min.apply(null, 조명);
      const 치우침 = 최대 > 0 ? (최대 - 최소) / 최대 : 1;
      if (치우침 > (옵션.무채색문턱 != null ? 옵션.무채색문턱 : 0.18)) 기준 = null;
    }
    const 이득 = 조명이득(조명, { 한계: 옵션.한계, 기준: 기준, 검은점: 검은점, 세기: 옵션.세기 });
    return 이득 ? { 이득: 이득, 검은점: 검은점, 노출맞춤: !!기준 } : null;
  }

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
    조명추정: 조명추정,
    조명이득: 조명이득,
    조명보정: 조명보정,
    검은점추정: 검은점추정,
    보정계수: 보정계수,
  };
});
