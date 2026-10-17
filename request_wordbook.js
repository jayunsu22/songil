// 견적요청 글 해석용 단어장. DOM/네트워크에 손대지 않는 순수 모듈.
//
// 카톡 글에는 방문견적 품목명·구역명과 다른 말이 섞여 온다('하나요', '이중창', '안방').
// 기본 단어장으로 흔한 말을 바꾸고, 못 알아본 말은 사용자가 고치면 배워서 다음부터 바꾼다.
// 값(정식)은 구역명 / 품목 기본이름 / 샤시 종류 낱말 / 숫자 문자열 중 하나다.
// node 테스트: test/request_wordbook.test.js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RequestWordbook = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 마스터에 없는 말(분합창 등)은 여기서 짐작하지 않는다. 틀리게 바꾸면 빨간 줄이
  // 안 떠서 사용자가 못 알아챈다. 처음 한 번은 빨간 줄로 두고 고치면 배운다.
  const 기본값 = {
    하나: '1', 한: '1', 둘: '2', 두: '2', 셋: '3', 세: '3', 넷: '4', 네: '4', 다섯: '5',
    한개: '1', 두개: '2', 세개: '3', 네개: '4',
    이중창: '2중창', 이중: '2중창', '2중': '2중창', 단창: '단창', 시스템: '시스템', 시스템창: '시스템',
    // 방1 에만 화장대·드레스룸·안쪽 화장실이 있다 - 방문견적의 방1 이 안방이다
    안방: '방1', 큰방: '방1',
    샷시: '샤시', 창: '샤시', 창문: '샤시',
    냉장고: '냉장고장',
  };

  function 기본() { return Object.assign({}, 기본값); }

  function 합치기(기본단어장, 사용자) {
    return Object.assign({}, 기본단어장 || {}, 사용자 || {});
  }

  /* 사용자가 빨간 줄을 고쳤을 때 그 원문 토막을 배운다.
     띄어쓰기는 사람마다 달라서('분합 창') 공백을 지운 것을 열쇠로 쓴다. */
  function 배우기(단어장, 별칭, 정식) {
    const k = String(별칭 == null ? '' : 별칭).replace(/\s+/g, '');
    const v = String(정식 == null ? '' : 정식).trim();
    if (!k || !v || k === v.replace(/\s+/g, '')) return 단어장;
    const r = Object.assign({}, 단어장 || {});
    r[k] = v;
    return r;
  }

  return { 기본: 기본, 합치기: 합치기, 배우기: 배우기 };
});
