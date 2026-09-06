// 필름 매칭. 어떤 제품을 어떤 순서로 보여줄지 결정한다.
//
// film_color.js 가 "두 색이 얼마나 다른가"를 답한다면, 여기는 "그래서 뭘 보여줄까"를 답한다.
// 화면 코드와 분리해 둔 이유는 순위 규칙이 이 서비스에서 가장 자주 바뀔 부분이기 때문이다.
// 실사진 테스트셋으로 가중치를 조정할 때 여기만 고치면 된다.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./film_color.js'));
  } else {
    root.FilmMatch = factory(root.FilmColor);
  }
})(typeof self !== 'undefined' ? self : this, function (FilmColor) {

  const { deltaE2000 } = FilmColor;

  // 현장 사진은 노출과 그림자로 명도가 크게 흔들린다. 색상(a*,b*)은 폰의
  // 자동 화이트밸런스 덕에 상대적으로 안정적이므로 명도 비중을 절반으로 낮춘다.
  const 기본kL = 2;

  // 대비폭(무늬 세기) 차이에 매기는 벌점. 지금은 시작값이고,
  // 7-2 실사진 테스트셋의 '정답 상위5위 적중률'을 보고 조정한다. 감으로 정하지 않는다.
  const 기본대비가중치 = 0.15;

  // ΔE 5 를 넘으면 '명확히 다른 색'이다. 억지로 추천하면 신뢰만 깎인다.
  const 기본상한 = 5;

  const 기본개수 = 10;

  /* ---------- 등급 ---------- */

  // 숫자를 그대로 보여주지 않는다. 'ΔE 2.4' 는 시공기사에게 아무 의미가 없다.
  //
  // 주의: '거의 동일' 은 색이 거의 같다는 뜻이지 같은 제품이라는 뜻이 아니다.
  // 측정 결과 전체의 65.3% 가 ΔE<1 쌍둥이를 갖는다. 화면 문구도 그렇게 써야 한다.
  function 등급(ΔE) {
    if (ΔE < 1) return '거의 동일';
    if (ΔE < 2) return '매우 유사';
    if (ΔE <= 5) return '유사';
    return null;
  }

  /* ---------- 필터 ---------- */

  // 필터는 {필드: [허용값...]} 형태. 빈 배열이나 없는 키는 '전체 허용'으로 본다.
  // 브랜드 목록을 코드에 박아두지 않는 이유: 한솔이 6번째로 들어왔고 계속 늘어난다.
  function 통과(제품, 필터) {
    if (!필터) return true;
    for (const 키 of Object.keys(필터)) {
      const 허용 = 필터[키];
      if (!허용 || !허용.length) continue;
      if (허용.indexOf(제품[키]) < 0) return false;
    }
    return true;
  }

  /* ---------- 점수 ---------- */

  // 색 거리. 이것이 후보에 들지 말지를 가르는 기준이다.
  function 색거리(질의, 제품, kL) {
    return deltaE2000(질의.lab, 제품.lab, { kL: kL });
  }

  // 최종 정렬 점수 = 색 거리 + 무늬 벌점.
  //
  // 무늬 벌점을 쓰는 이유: 평균색이 같아도 무늬가 전혀 다른 제품이 많다.
  // 측정 결과 ΔE<2 경쟁쌍의 40.3% 가 서로 다른 카테고리였다
  // (예: 솔리드 #0A0A0A 와 스톤마블 #0A0A0A 가 ΔE 0.00).
  // 나뭇결을 찍었으면 무늬 있는 제품이, 민무늬 벽을 찍었으면 솔리드가 위로 와야 한다.
  //
  // 양쪽 다 대비폭을 알 때만 적용한다. 사용자가 색을 직접 고른 경우(사진 없음)에는
  // 대비폭이 없으므로 벌점 없이 색 거리만으로 정렬한다.
  function 점수(질의, 제품, 옵션) {
    const kL = 옵션.kL, 가중치 = 옵션.대비가중치;
    const ΔE = 색거리(질의, 제품, kL);
    let 벌점 = 0;
    if (Number.isFinite(질의.대비폭) && Number.isFinite(제품.대비폭)) {
      벌점 = 가중치 * Math.abs(질의.대비폭 - 제품.대비폭);
    }
    return { ΔE: ΔE, 점수: ΔE + 벌점, 벌점: 벌점 };
  }

  /* ---------- 검색 ---------- */

  function 옵션정리(o) {
    o = o || {};
    return {
      개수:       o.개수       != null ? o.개수       : 기본개수,
      kL:         o.kL         != null ? o.kL         : 기본kL,
      대비가중치: o.대비가중치 != null ? o.대비가중치 : 기본대비가중치,
      상한:       o.상한       != null ? o.상한       : 기본상한,
      제외id:     o.제외id     || null,
    };
  }

  // 질의: { lab, 대비폭? }
  // 반환: [{ 제품, ΔE, 점수, 등급 }] — 점수 오름차순, 최대 개수만큼
  //
  // 상한은 '점수'가 아니라 '색 거리(ΔE)'에 건다. 색은 잘 맞는데 무늬만 다른 제품을
  // 후보에서 아예 빼버리면 안 되기 때문이다. 그건 순위를 내릴 일이지 탈락시킬 일이 아니다.
  function 검색(제품목록, 질의, 필터, 옵션) {
    const o = 옵션정리(옵션);
    if (!질의 || !질의.lab) return [];

    const 후보 = [];
    for (const p of 제품목록) {
      if (o.제외id && p.id === o.제외id) continue;
      if (!통과(p, 필터)) continue;
      const s = 점수(질의, p, o);
      if (s.ΔE > o.상한) continue;
      후보.push({ 제품: p, ΔE: s.ΔE, 점수: s.점수, 등급: 등급(s.ΔE) });
    }

    후보.sort(function (a, b) {
      if (a.점수 !== b.점수) return a.점수 - b.점수;
      return a.ΔE - b.ΔE; // 동점이면 색이 더 가까운 쪽
    });
    return 후보.slice(0, o.개수);
  }

  // "이 제품 재고가 없다. 다른 브랜드에서 제일 비슷한 것" — 자재상·시공기사의 실제 질문.
  // 측정 결과 86.7% 의 제품이 타 브랜드에 ΔE 2 이내 대체품을 갖는다.
  // 사진 매칭보다 성공률이 높은 기능이다.
  function 타브랜드대체품(제품목록, 기준제품, 옵션) {
    const 대상 = 제품목록.filter(function (p) { return p.제조사 !== 기준제품.제조사; });
    return 검색(
      대상,
      { lab: 기준제품.lab, 대비폭: 기준제품.대비폭 },
      null,
      Object.assign({ 제외id: 기준제품.id }, 옵션)
    );
  }

  // 칩 필터 목록을 데이터에서 만든다. 브랜드가 늘어나면 칩도 저절로 늘어난다.
  // 화면 코드에 '5개 브랜드'를 박아두지 않기 위한 함수다.
  function 필터후보(제품목록, 키) {
    const m = new Map();
    제품목록.forEach(function (p) {
      const v = p[키];
      if (v == null || v === '') return;
      m.set(v, (m.get(v) || 0) + 1);
    });
    return [...m.entries()]
      .sort(function (a, b) { return b[1] - a[1]; })
      .map(function (e) { return { 값: e[0], 건수: e[1] }; });
  }

  return {
    등급: 등급,
    통과: 통과,
    색거리: 색거리,
    점수: 점수,
    검색: 검색,
    타브랜드대체품: 타브랜드대체품,
    필터후보: 필터후보,
    기본값: {
      kL: 기본kL, 대비가중치: 기본대비가중치, 상한: 기본상한, 개수: 기본개수,
    },
  };
});
