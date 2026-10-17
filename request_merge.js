// 견적요청: 글 줄 + 사진 라벨 → 견적 항목. DOM/네트워크에 손대지 않는 순수 모듈.
//
// 카톡 글과 사진은 같은 품목을 두 번 말하는 경우가 많다("거실 샤시 2" + 샤시 사진 2장).
// 같은 체크_ID 면 한 항목으로 합쳐 견적에 두 번 들어가지 않게 한다. 수량은 글을 따른다 -
// 사진 장수는 같은 창을 여러 각도로 찍은 것일 수 있어서 개수가 아니다.
// 품목을 못 붙인 사진과 못 알아본 글 줄은 버리지 않고 남겨 발행 전에 알린다.
// node 테스트: test/request_merge.test.js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RequestMerge = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* 글줄[] (RequestParse.해석 결과), 사진라벨[] {사진id, 구역, 체크_ID},
     기본줄(체크_ID) → 그 품목 1개짜리 글줄 (사진만 있는 품목의 수량을 채울 때) */
  function 합치기(글줄, 사진라벨, 기본줄) {
    const 항목 = [];
    const 찾기 = new Map();   // 체크_ID → 항목
    (글줄 || []).forEach((줄, i) => {
      if (줄.건너뜀) return;
      if (줄.체크_ID && 찾기.has(줄.체크_ID)) {
        const h = 찾기.get(줄.체크_ID);
        h.개수 += 줄.개수 || 0;
        h.수량 += 줄.수량 || 0;
        h.기본길이 = h.기본길이 || !!줄.기본길이;
        h.확인필요 = h.확인필요 || !!줄.확인필요;
        h.원문들.push(줄.원문);
        return;
      }
      const h = Object.assign({}, 줄, {
        // 못 알아본 줄은 서로 합치지 않는다 - 같은 '분합창' 이라도 다른 방일 수 있다
        키: 줄.체크_ID || ('?' + i),
        출처: '글만',
        사진ids: [],
        원문들: [줄.원문],
      });
      항목.push(h);
      if (줄.체크_ID) 찾기.set(줄.체크_ID, h);
    });

    const 미지정사진 = [];
    (사진라벨 || []).forEach((p) => {
      if (!p.체크_ID) { 미지정사진.push(p.사진id); return; }
      let h = 찾기.get(p.체크_ID);
      if (!h) {
        const 기본 = (기본줄 && 기본줄(p.체크_ID)) || {
          원문: '', 구역: p.구역, 체크_ID: p.체크_ID, 품목명: p.체크_ID, 옵션: null,
          개수: 1, 수량: 1, 기본길이: false, 확인필요: true, 건너뜀: false, 모르는말: null,
        };
        h = Object.assign({}, 기본, { 키: p.체크_ID, 출처: '사진만', 사진ids: [], 원문들: [] });
        항목.push(h);
        찾기.set(p.체크_ID, h);
      } else if (h.출처 === '글만') {
        h.출처 = '사진+글';
      }
      h.사진ids.push(p.사진id);
    });
    return { 항목: 항목, 미지정사진: 미지정사진 };
  }

  // 발행 전에 확인할 것. 막지는 않고 알린다 (기존 이중계산경고와 같은 방식)
  function 경고(결과) {
    const out = [];
    (결과.항목 || []).forEach((h) => {
      if (h.확인필요) out.push('‘' + (h.원문들 && h.원문들[0] || h.품목명 || '') + '’ 확인이 필요합니다');
    });
    const n = (결과.미지정사진 || []).length;
    if (n) out.push('품목을 안 정한 사진 ' + n + '장이 있습니다');
    return out;
  }

  return { 합치기: 합치기, 경고: 경고 };
});
