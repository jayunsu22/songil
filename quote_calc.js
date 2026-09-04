// 견적 금액 계산. DOM/네트워크에 손대지 않는 순수 모듈.
// 브라우저(<script src>)와 node(require) 양쪽에서 로드된다.
//
// 이 파일이 이 도구에서 유일하게 "틀리면 안 되는" 부분이라 DOM에서 떼어내
// test/quote_calc.test.js 로 검증한다.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QuoteCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // 시공품목정보의 [예상_총금액] 수식과 같은 계산이다.
  //   IF(평형별_설정길이 > 0, 평형별_설정길이 * 자재소모량, 자재소모량)
  //     * (자재비단가 + 인건비단가) * 난이도계수
  //
  // 자재소모량은 (인건비+자재비) 전체에 곱한다. 자재비에만 곱하는 게 아니다.
  // 평형별 품목은 화면에서 수량 = 평형별_설정길이 로 넣으므로 같은 결과가 된다.
  function lineAmount(item) {
    const 단가 = ((item.인건비단가 || 0) + (item.자재비단가 || 0)) * (item.자재소모량 || 0);
    return Math.round(단가 * (item.난이도 || 1) * (item.수량 || 0));
  }

  function calcQuote(items, adjustments) {
    // 전체 조정은 곱이 아니라 합. 거주중 +10%와 업자단가 -10%는 상쇄되어야 하고,
    // 사용자가 암산으로 검산할 수 있어야 한다.
    const 조정_합계율 = (adjustments || []).reduce(function (s, a) {
      return s + (a.비율 || 0);
    }, 0);

    const 라인들 = (items || []).map(function (it) {
      const 라인금액 = lineAmount(it);
      return Object.assign({}, it, {
        라인금액: 라인금액,
        표시금액: Math.round(라인금액 * (1 + 조정_합계율)),
      });
    });

    // 총액은 표시금액의 합으로 구한다.
    // 소계×(1+율)로 따로 구하면 반올림 때문에 품목 금액의 합과 몇 원 어긋나고,
    // 받는 사람이 계산기를 두드리면 바로 티가 난다.
    return {
      소계: 라인들.reduce(function (s, l) { return s + l.라인금액; }, 0),
      조정_합계율: 조정_합계율,
      라인들: 라인들,
      총액: 라인들.reduce(function (s, l) { return s + l.표시금액; }, 0),
    };
  }

  return { lineAmount: lineAmount, calcQuote: calcQuote };
});
