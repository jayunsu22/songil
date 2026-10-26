// 정산견적(품수 기반 사후 견적) 금액 계산. DOM/네트워크에 손대지 않는 순수 모듈.
// 브라우저(<script src>)와 node(require) 양쪽에서 로드된다. test/settle_calc.test.js 로 검증.
//
// 규칙 (docs/superpowers/specs/2026-09-20-settle-quote-design.md §3):
//   인건비      = 품수 × 품단가
//   줄 소모량   = 직접소모량 ?? (길이입력 ? 마스터소모량 × 길이 : 마스터소모량 × 수량)   … 소수 1자리
//   자재별 금액 = round(소모량합 × 단가)   … 소모량합을 소수 1자리로 맞춘 뒤 곱한다
//   총액        = 인건비 + Σ자재별 금액 + Σ직접비 + Σ부가항목
//   직접비      = '직접 추가' 줄 중 종류가 '금액'인 줄(실리콘 시공 등)의 금액. 필름이 아니라 소모량 0.
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

  // 직접 추가한 '금액' 줄 - 필름 자재가 아니라 사장님이 금액을 바로 적는 품목(실리콘 시공 등).
  function is금액줄(줄) { return !!줄 && 줄.출처 === '추가' && 줄.종류 === '금액'; }

  function 줄소모량(줄) {
    if (is금액줄(줄)) return 0;
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
      if (!줄.체크 || is금액줄(줄)) return;
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
    return (줄들 || []).filter(function (줄) { return 줄.체크 && !is금액줄(줄) && !(자재표 && 자재표[줄.자재ID]); });
  }

  // 체크된 '금액' 줄의 합. 원 단위 반올림.
  function 직접비(줄들) {
    return (줄들 || []).reduce(function (s, 줄) {
      return 줄.체크 && is금액줄(줄) ? s + Math.round(수(줄.금액)) : s;
    }, 0);
  }

  // 인건비 = 정수 품 × 단가 + (반품이 있으면 단가의 절반을 만원 단위로 반올림).
  // 25만원의 0.5품은 12.5만 → 13만, 27만원은 13.5만 → 14만. 현장에서 반품은 늘 이렇게 쳐 왔다.
  // 품수는 0.5 단위로만 온다(드롭다운). 다른 값이 와도 정수부+0.5 이상이면 반품으로 본다.
  function 인건비(품수, 품단가) {
    const n = 수(품수), 단가 = 수(품단가);
    const 정수 = Math.floor(n);
    const 반품 = (n - 정수) >= 0.5 ? Math.round(단가 / 2 / 10000) * 10000 : 0;
    return Math.round(정수 * 단가 + 반품);
  }

  function 합계(state, 자재표) {
    const 인건비금액 = 인건비(state.품수, state.품단가);
    const 자재소계 = 자재별소계(state.줄들, 자재표);
    const 자재비 = 자재소계.reduce(function (s, r) { return s + r.금액; }, 0);
    const 직접비금액 = 직접비(state.줄들);
    const 부가 = (state.부가 || []).reduce(function (s, r) { return s + Math.round(수(r.금액)); }, 0);
    // 미수금: 지난 현장에서 아직 못 받은 돈. 이번 시공대금과 섞지 않고 따로 집계해서
    // 견적서에 '시공대금 / 미수금' 으로 갈라 보여준다 - 받는 쪽이 무슨 돈인지 알아야 한다.
    const 미수금 = (state.미수금 || []).reduce(function (s, r) { return s + Math.round(수(r.금액)); }, 0);
    // 추가 작업 (2026-10-26): 현장에서 적은 재시공·AS·추가요청. 고객청구만 시공대금에 더하고,
    // 업체청구는 따로 모아 보여만 준다 (다른 업체가 낼 돈), 무상은 0원
    const 추가들 = (state.추가작업 || []).filter(function (a) { return a && a.포함 !== false; });
    const 추가 = 추가들.reduce(function (s, a) { return (a.청구 || '고객청구') === '고객청구' ? s + Math.round(수(a.금액)) : s; }, 0);
    const 업체청구 = 추가들.reduce(function (s, a) { return a.청구 === '업체청구' ? s + Math.round(수(a.금액)) : s; }, 0);
    const 시공대금 = 인건비금액 + 자재비 + 직접비금액 + 부가 + 추가;
    return { 인건비: 인건비금액, 자재비: 자재비, 직접비: 직접비금액, 부가: 부가, 미수금: 미수금, 추가: 추가, 업체청구: 업체청구,
             시공대금: 시공대금, 총액: 시공대금 + 미수금, 자재소계: 자재소계 };
  }

  return { 줄소모량: 줄소모량, 자재별소계: 자재별소계, 자재없음줄: 자재없음줄, 인건비: 인건비, 합계: 합계, 수: 수,
           직접비: 직접비, is금액줄: is금액줄 };
});
