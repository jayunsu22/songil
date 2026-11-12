// 정산견적 [품목 견적] 금액 계산 (2026-11-12). DOM/네트워크 없음. node 테스트: test/settle_items.test.js
//
// 사장님: 품수 견적 줄처럼 문틀·문짝(시공범위)을 고르고, 금액은 방문견적처럼 품목마다 나오게.
// 한 줄 금액 = 견적요청·방문견적과 같은 표 계산 (RequestPrice.줄계산: 필름 m × (인건비단가 + 필름단가) × 난이도) × 개수.
// 사장님이 금액 창에서 고친 값(품목.고침 {금액, 인건비})이 있으면 그것이 먼저다.
// 표에 없는 품목은 0원으로 조용히 넘기지 않고 문제('단가없음'·'m없음'·'길이없음') 로 돌려준다 - 화면이 '금액 넣기' 로 보여준다.
//
// 줄 = 정산 화면 state.줄들 의 작업목록 줄. 시공범위는 품수 견적과 같이 쓰고, 품목 견적에만 있는 값은 줄.품목 에 둔다:
//   줄.품목 = { 개수, 난이도, m(문선만 등 필름 m), 길이(m 단위 품목), 고침: { 금액, 인건비 } }
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./request_price.js'));
  else root.SettleItems = factory(root.RequestPrice);
})(typeof self !== 'undefined' ? self : this, function (RP) {
  'use strict';

  const 수 = (v) => { const n = Number(v); return v === '' || v == null || isNaN(n) ? null : n; };

  function 설정(줄) {
    const p = (줄 && 줄.품목) || {};
    return { 시공범위: (줄 && 줄.시공범위) || RP.시공범위들[0], m: p.m, 길이: p.길이, 난이도: 수(p.난이도) || 1 };
  }

  /* 한 줄. 표 = 시공품목정보(request-master 의 품목정보), 고정 = 견적요청에서 사장님이 정한 단가 {품목명: {...}} */
  function 줄금액(줄, 표, 고정, 필름단가) {
    const p = (줄 && 줄.품목) || {};
    const 개수 = Math.max(0, 수(p.개수) == null ? 1 : 수(p.개수));
    const r = RP.줄계산({ 품목명: 줄.품목명 }, 설정(줄), 표 || [], 고정 || {}, 필름단가);
    const 자동 = { 금액: Math.round(r.합 * 개수), 인건비: Math.round(r.인건비 * 개수) };
    const g = p.고침;
    if (g && 수(g.금액) != null) {
      const 금액 = Math.round(수(g.금액)), 인건비 = Math.round(수(g.인건비) || 0);
      return { 금액: 금액, 인건비: 인건비, 자재비: 금액 - 인건비, 필름m: r.필름m, 길이: r.길이, 단위: r.기준 && r.기준.단위,
               문제: null, 고침: true, 자동: r.문제 ? null : 자동 };
    }
    return { 금액: r.문제 ? 0 : 자동.금액, 인건비: r.문제 ? 0 : 자동.인건비, 자재비: r.문제 ? 0 : 자동.금액 - 자동.인건비,
             필름m: r.필름m, 길이: r.길이, 단위: r.기준 && r.기준.단위, 문제: r.문제, 고침: false, 자동: r.문제 ? null : 자동 };
  }

  /* 체크한 작업목록 줄 합계. 필름단가(줄) → 그 줄 필름의 원/m. 문제 있는 줄은 빼고 이름을 모은다 */
  function 합계(줄들, 표, 고정, 필름단가) {
    const out = { 금액: 0, 인건비: 0, 자재비: 0, 문제줄: [] };
    (줄들 || []).forEach((l) => {
      if (!l || !l.체크 || l.출처 !== '작업목록') return;
      const r = 줄금액(l, 표, 고정, 필름단가(l));
      if (r.문제) { out.문제줄.push(l.품목명); return; }
      out.금액 += r.금액; out.인건비 += r.인건비; out.자재비 += r.자재비;
    });
    return out;
  }

  return { 줄금액: 줄금액, 합계: 합계 };
});
