// 정산견적(품수 기반 사후 견적) 금액 계산. DOM/네트워크에 손대지 않는 순수 모듈.
// 브라우저(<script src>)와 node(require) 양쪽에서 로드된다. test/settle_calc.test.js 로 검증.
//
// 규칙 (docs/superpowers/specs/2026-09-20-settle-quote-design.md §3):
//   인건비      = 품수 × 품단가
//   줄 소모량   = 직접소모량 ?? (길이입력 ? 마스터소모량 × 길이 : 마스터소모량 × 수량)   … 소수 1자리
//   자재별 금액 = round(소모량합 × 단가)   … 소모량합을 소수 1자리로 맞춘 뒤 곱한다
//   총액        = 인건비 + Σ자재별 금액 + Σ부가항목
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SettleCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // '' / null / 'abc' 는 0. 입력칸 값이 그대로 들어오므로 숫자로 못 읽으면 0으로 본다.
  function 수(v) {
    if (v === '' || v == null) return 0;
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  }

  // 소수 1자리. 0.1×3 = 0.30000000000000004 같은 값을 화면 표시와 같은 숫자로 맞춘다.
  function m1(v) { return Math.round(v * 10) / 10; }

  function 줄소모량(줄) {
    if (줄.직접소모량 !== null && 줄.직접소모량 !== undefined && 줄.직접소모량 !== '') {
      return m1(수(줄.직접소모량));
    }
    const 마스터 = 수(줄.마스터소모량);
    if (줄.길이입력) return m1(마스터 * 수(줄.길이));
    return m1(마스터 * 수(줄.수량));
  }

  // 체크된 줄만 자재별로 묶는다. 자재표에 없는 자재ID(설정에서 지워진 것)는 조용히 0원으로
  // 넘기지 않고 아예 뺀다 - 화면은 자재없음줄() 로 그 줄을 경고 표시한다.
  function 자재별소계(줄들, 자재표) {
    const 순서 = [];
    const 합 = {};
    (줄들 || []).forEach(function (줄) {
      if (!줄.체크) return;
      const 자재 = 자재표 && 자재표[줄.자재ID];
      if (!자재) return;
      if (!(줄.자재ID in 합)) { 합[줄.자재ID] = 0; 순서.push(줄.자재ID); }
      합[줄.자재ID] += 줄소모량(줄);
    });
    return 순서.map(function (id) {
      const 소모량합 = m1(합[id]);
      return {
        자재ID: id,
        자재명: 자재표[id].항목명,
        단가: 수(자재표[id].단가),
        소모량합: 소모량합,
        금액: Math.round(소모량합 * 수(자재표[id].단가)),
      };
    });
  }

  function 자재없음줄(줄들, 자재표) {
    return (줄들 || []).filter(function (줄) { return 줄.체크 && !(자재표 && 자재표[줄.자재ID]); });
  }

  function 합계(state, 자재표) {
    const 인건비 = Math.round(수(state.품수) * 수(state.품단가));
    const 자재소계 = 자재별소계(state.줄들, 자재표);
    const 자재비 = 자재소계.reduce(function (s, r) { return s + r.금액; }, 0);
    const 부가 = (state.부가 || []).reduce(function (s, r) { return s + Math.round(수(r.금액)); }, 0);
    return { 인건비: 인건비, 자재비: 자재비, 부가: 부가, 총액: 인건비 + 자재비 + 부가, 자재소계: 자재소계 };
  }

  return { 줄소모량: 줄소모량, 자재별소계: 자재별소계, 자재없음줄: 자재없음줄, 합계: 합계, 수: 수 };
});
