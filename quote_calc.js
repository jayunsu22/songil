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
    // 직접 입력한 품목(방화문 양면·쌍여닫이처럼 기준 단가로 안 잡히는 건)은
    // 계산하지 않고 적어 넣은 금액을 그대로 쓴다. 최종 금액을 적는 칸이라
    // 여기에 난이도나 수량을 또 곱하면 적은 숫자와 달라진다.
    // != null 로 봐야 한다. 0 을 falsy 로 보고 넘기면 엉뚱한 금액이 나온다.
    if (item.직접금액 != null) return Math.round(item.직접금액);
    const 단가 = ((item.인건비단가 || 0) + (item.자재비단가 || 0)) * (item.자재소모량 || 0);
    return Math.round(단가 * (item.난이도 || 1) * (item.수량 || 0));
  }

  /* 인건비 몫.
     "자재는 내가 댈 테니 인건비만 계산해 달라" 는 업자가 있다. 그때 자재비를
     빼고 인건비만으로 견적을 내보내기 위한 값이다.

     자재소모량은 인건비에도 곱한다 - 합산 금액을 낼 때와 같은 규칙이어야
     인건비 몫 + 자재비 몫 = 라인금액 이 된다.

     직접 입력 품목은 적어 넣은 인건비를 그대로 쓴다. 인건비/자재비를 나눠
     적기 전에 넣은 예전 항목은 나눌 방법이 없으므로 null 을 돌려준다 -
     0 으로 돌려주면 인건비가 0원인 것처럼 보여서 금액이 틀린다. */
  function lineWage(item) {
    if (item.직접금액 != null) {
      return item.인건비 != null ? Math.round(item.인건비) : null;
    }
    const 단가 = (item.인건비단가 || 0) * (item.자재소모량 || 0);
    return Math.round(단가 * (item.난이도 || 1) * (item.수량 || 0));
  }

  /* 금액 칸 표시/읽기. '250,000원' 처럼 보여준다.
     type=number 는 콤마와 '원' 을 못 받아서 글자 칸으로 두고 직접 맞춘다.

     빈 칸을 '0원' 으로 만들면 안 된다 - 지우고 다시 쓸 수가 없어진다.
     마이너스만 친 상태도 지우면 빼는 항목을 입력할 수 없다. */
  function 금액포맷(글) {
    const 원본 = String(글 == null ? '' : 글);
    const 음수 = /^\s*-/.test(원본);
    const 숫자 = 원본.replace(/[^0-9]/g, '');
    if (!숫자) return 음수 ? '-' : '';
    return (음수 ? '-' : '') + Number(숫자).toLocaleString('ko-KR') + '원';
  }

  // 안 적은 것(NaN)과 0원을 구분해야 하므로 빈 칸은 NaN 을 돌려준다.
  function 금액파싱(글) {
    const 원본 = String(글 == null ? '' : 글);
    const 숫자 = 원본.replace(/[^0-9]/g, '');
    if (!숫자) return NaN;
    return (/^\s*-/.test(원본) ? -1 : 1) * Number(숫자);
  }

  function calcQuote(items, adjustments) {
    // 전체 조정은 곱이 아니라 합. 거주중 +10%와 업자단가 -10%는 상쇄되어야 하고,
    // 사용자가 암산으로 검산할 수 있어야 한다.
    const 조정_합계율 = (adjustments || []).reduce(function (s, a) {
      return s + (a.비율 || 0);
    }, 0);

    const 라인들 = (items || []).map(function (it) {
      const 라인금액 = lineAmount(it);
      const 인건비금액 = lineWage(it);
      return Object.assign({}, it, {
        라인금액: 라인금액,
        표시금액: Math.round(라인금액 * (1 + 조정_합계율)),
        // 인건비만 보내는 견적서에서 쓴다. 나눌 수 없는 줄은 null 이다.
        인건비금액: 인건비금액,
        인건비표시금액: 인건비금액 == null
          ? null
          : Math.round(인건비금액 * (1 + 조정_합계율)),
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
      // 인건비만 보낼 때의 총액. 나눌 수 없는 줄(예전에 넣은 직접 입력 품목)은
      // 자재비가 섞인 채로 전액이 들어간다 - 모르는 값을 0 으로 깎으면
      // 사장님이 받을 돈이 줄어든다. 화면에는 그 줄에 '자재 포함' 을 붙인다.
      인건비총액: 라인들.reduce(function (s, l) {
        return s + (l.인건비표시금액 == null ? l.표시금액 : l.인건비표시금액);
      }, 0),
    };
  }

  return { lineAmount: lineAmount, lineWage: lineWage, calcQuote: calcQuote,
           금액포맷: 금액포맷, 금액파싱: 금액파싱 };
});
