// 카톡 견적요청 글 → 견적 줄. DOM/네트워크에 손대지 않는 순수 모듈.
//
// "안방 분합창 1", "거실 샤시 2 이중창", "현관문이랑 신발장도요" 같은 글을
// 방문견적 마스터(MASTER.zones)의 구역·품목(체크_ID)·수량으로 바꾼다.
// 못 알아본 말은 버리지 않고 빨간 줄(확인필요)로 남겨 사용자가 고치게 한다 -
// 조용히 빠지는 품목이 생기면 이 기능을 만든 이유(빠진 견적 막기)가 무너진다.
//
// 개수와 수량은 다르다. 샤시·신발장·냉장고장처럼 m 단위 품목에서 카톡의 "2" 는
// 창 2개라는 뜻이지 2m 가 아니다. 그래서 개수는 따로 두고, 수량은 지난 방문견적에서
// 실제로 넣은 보통 길이로 먼저 채운 뒤 기본길이 표시를 붙여 사용자가 고치게 한다.
// node 테스트: test/request_parse.test.js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RequestParse = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* 품목별 보통 길이(m). 2026-10-17 발행 견적 68건의 수량 중앙값
     (평형별 품목 제외, 표본 5건 미만은 넣지 않음). 샤시2 는 표본이 없어 샤시1 값을 쓴다. */
  const 보통길이 = {
    샤시1: 3, 샤시2: 3, 냉장고장: 2, 수납장: 3, 붙박이장: 2, 신발장1: 5, 신발장2: 3,
    싱크대: 8, '싱크대 하부장': 7, '싱크대 상부장': 4, 등박스: 12, 가벽: 10,
  };
  // 사장님 기준: 샤시는 종류를 안 쓰면 2중창으로 본다
  const 기본샤시종류 = '2중창';
  const 종류낱말 = ['2중창', '단창', '시스템'];
  // 낱말 끝에 붙는 조사·꼬리. 알아보지 못했을 때만 하나씩 떼어 본다 ('문짝' 의 '짝' 을 먼저 떼면 안 된다)
  const 꼬리 = /(이요|요|도|은|는|이|가|을|를|만|개|짝|세트|짜리|정도|씩)$/;
  const 이음 = /(이랑|랑|하고)$/;

  const 붙임 = (s) => String(s || '').replace(/\s+/g, '');
  // 샤시1·샤시2, 신발장1·신발장2 는 한 품목의 '칸' 이다. 끝 숫자를 뗀 것이 기본이름
  const 기본이름 = (이름) => String(이름 || '').replace(/\d+$/, '');

  function 색인(zones) {
    const 구역들 = new Set();
    const 품목 = new Map();   // 붙인 기본이름 → 기본이름
    (zones || []).forEach((z) => {
      구역들.add(z.구역);
      (z.items || []).forEach((it) => {
        const b = 기본이름(it.표시_품목명);
        품목.set(붙임(b), b);
      });
    });
    return { 구역들: 구역들, 품목: 품목 };
  }

  // 한 토막(붙인 글)이 무엇인지. 단어장은 한 번만 거친다 (값이 또 별칭이면 돌고 돈다).
  function 알아보기(토막, 사전, 색, 단어장거침) {
    const k = 붙임(토막);
    if (!k) return null;
    const 단어장 = 사전.단어장 || {};
    if (!단어장거침 && Object.prototype.hasOwnProperty.call(단어장, k)) {
      const r = 알아보기(단어장[k], 사전, 색, true);
      if (r) return Object.assign(r, { 배운말: true });
    }
    if (색.구역들.has(k)) return { 종류: '구역', 값: k };
    // 띄어 쓴 구역명(방1 베란다)도 받는다
    for (const z of 색.구역들) if (붙임(z) === k) return { 종류: '구역', 값: z };
    if (색.품목.has(k)) return { 종류: '품목', 값: 색.품목.get(k) };
    if (종류낱말.indexOf(k) >= 0) return { 종류: '샤시종류', 값: k };
    if (/^\d+(\.\d+)?$/.test(k)) return { 종류: '숫자', 값: Number(k), 아라비아: !단어장거침 };
    return null;
  }

  // 꼬리를 하나씩 떼며 알아본다. 이음말(이랑·하고)은 먼저 떼고 끊김 표시만 남긴다.
  function 낱말풀기(낱말, 사전, 색) {
    let w = 낱말;
    let 끊김 = false;
    if (이음.test(w) && w.replace(이음, '')) { w = w.replace(이음, ''); 끊김 = true; }
    for (let i = 0; i < 4 && w; i++) {
      const r = 알아보기(w, 사전, 색, false);
      if (r) return Object.assign(r, { 끊김: 끊김, 글: w });
      if (!꼬리.test(w) || !w.replace(꼬리, '')) break;
      w = w.replace(꼬리, '');
    }
    return { 종류: '모름', 값: w, 끊김: 끊김, 글: w };
  }

  // 한 줄 → 덩어리[] (구역·기본이름·개수·종류). 아직 체크_ID 는 모른다.
  function 덩어리로(줄, 사전, 색) {
    const 낱말들 = 줄.split(/[\s,·/()]+/).filter(Boolean);
    const 덩어리 = [];
    let 구역 = null, 남은수 = null, 남은종류 = null, 열림 = false;
    let 구역있음 = false, 아라비아수 = false;
    const 모름 = [];
    for (let i = 0; i < 낱말들.length; i++) {
      // 두 낱말 품목명(싱크대 하부장·베란다 중문)을 먼저 본다
      let r = null;
      if (i + 1 < 낱말들.length) {
        const 둘 = 낱말풀기(낱말들[i] + 낱말들[i + 1], 사전, 색);
        if (둘.종류 === '품목') { r = 둘; i++; }
      }
      if (!r) r = 낱말풀기(낱말들[i], 사전, 색);

      if (r.종류 === '구역') { 구역 = r.값; 구역있음 = true; }
      else if (r.종류 === '품목') {
        덩어리.push({ 구역: 구역, 기본이름: r.값, 개수: 남은수, 종류: 남은종류 });
        남은수 = null; 남은종류 = null; 열림 = true;
      } else if (r.종류 === '숫자') {
        if (r.아라비아) 아라비아수 = true;
        const 끝 = 덩어리[덩어리.length - 1];
        if (열림 && 끝 && 끝.개수 == null) 끝.개수 = r.값;
        else 남은수 = r.값;
      } else if (r.종류 === '샤시종류') {
        const 끝 = 덩어리[덩어리.length - 1];
        if (열림 && 끝) 끝.종류 = r.값; else 남은종류 = r.값;
      } else {
        모름.push(r.글);
      }
      if (r.끊김) 열림 = false;
    }
    // 품목은 하나도 못 찾았지만 구역이 있거나(안방 분합창 1), 숫자와 모르는 말이 있으면
    // 견적 줄일 가능성이 높다 → 빨간 줄로 남긴다. 아니면 인사말로 보고 건너뛴다.
    if (!덩어리.length && 모름.length && (구역있음 || 아라비아수)) {
      덩어리.push({ 구역: 구역, 기본이름: null, 개수: 남은수, 종류: 남은종류, 모르는말: 모름.join(' ') });
    }
    return 덩어리;
  }

  function 줄만들기(원문, 덩, zones) {
    const 개수 = 덩.개수 == null ? 1 : 덩.개수;
    const 빈줄 = (덧) => Object.assign({
      원문: 원문, 구역: 덩.구역, 체크_ID: null, 품목명: 덩.기본이름, 옵션: null,
      개수: 개수, 수량: 개수, 기본길이: false, 확인필요: true, 건너뜀: false, 모르는말: 덩.모르는말 || null,
    }, 덧 || {});
    if (!덩.기본이름) return [빈줄()];

    const 있는구역 = zones.filter((z) => (z.items || []).some((it) => 기본이름(it.표시_품목명) === 덩.기본이름));
    let z = null;
    if (덩.구역) z = 있는구역.find((x) => x.구역 === 덩.구역) || null;
    else if (있는구역.length === 1) z = 있는구역[0];
    if (!z) return [빈줄()];

    const 칸들 = z.items
      .filter((it) => 기본이름(it.표시_품목명) === 덩.기본이름)
      .sort((a, b) => String(a.표시_품목명).localeCompare(String(b.표시_품목명), 'ko', { numeric: true }));
    const 여러칸 = 칸들.length > 1;
    const 쓸칸 = 여러칸 ? 칸들.slice(0, Math.max(1, Math.min(개수, 칸들.length))) : 칸들;

    return 쓸칸.map((it, i) => {
      const 이칸개수 = 여러칸 ? 1 : 개수;
      let 수량, 기본길이 = false, 확인필요 = false;
      if (it.단위 === 'm') {
        // 길이 품목은 개수를 수량에 넣지 않는다. 보통 길이 × 개수로 먼저 채운다
        기본길이 = true;
        수량 = 보통길이[it.표시_품목명] != null ? 보통길이[it.표시_품목명] * 이칸개수 : (it.기본수량 || 1);
      } else {
        수량 = 이칸개수;
      }
      if (it.최대수량 && 수량 > it.최대수량) { 수량 = it.최대수량; 확인필요 = true; }
      // 칸보다 많이 달라고 했으면(샤시 3개인데 칸은 2개) 마지막 칸에 알린다
      if (여러칸 && i === 쓸칸.length - 1 && 개수 > 칸들.length) 확인필요 = true;

      let 옵션 = null;
      if ((it.옵션들 || []).length > 1) {
        const 낱 = 덩.종류 || 기본샤시종류;
        옵션 = it.옵션들.findIndex((o) => String(o.품목명).indexOf(낱) >= 0);
        if (옵션 < 0) 옵션 = 0;
      }
      return {
        원문: 원문, 구역: z.구역, 체크_ID: it.체크_ID, 품목명: it.표시_품목명, 옵션: 옵션,
        개수: 이칸개수, 수량: 수량, 기본길이: 기본길이, 확인필요: 확인필요, 건너뜀: false, 모르는말: null,
      };
    });
  }

  /* 글 → 줄[]. 사전 = { zones: 지금 평형에 보이는 MASTER.zones, 단어장 } */
  function 해석(글, 사전) {
    사전 = 사전 || {};
    const zones = 사전.zones || [];
    const 색 = 색인(zones);
    const 결과 = [];
    String(글 || '').split(/\r?\n/).forEach((줄) => {
      const 원문 = 줄.trim();
      if (!원문) return;
      const 덩어리 = 덩어리로(원문, 사전, 색);
      if (!덩어리.length) {
        결과.push({ 원문: 원문, 구역: null, 체크_ID: null, 품목명: null, 옵션: null, 개수: 0, 수량: 0,
          기본길이: false, 확인필요: false, 건너뜀: true, 모르는말: null });
        return;
      }
      덩어리.forEach((덩) => { 결과.push.apply(결과, 줄만들기(원문, 덩, zones)); });
    });
    return 결과;
  }

  return { 해석: 해석, 보통길이: 보통길이, 기본이름: 기본이름 };
});
