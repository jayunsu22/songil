/* 견적 저장함 → 현장관리자 품목 체크 짝짓기.
   견적은 '구역 × 품목'(방1 / 방문), 현장관리자는 품목명 하나(안방문+틀)라
   이름이 거의 안 맞는다. 규칙으로 후보 이름을 만들고, 현장관리자에 실제로 있는
   이름만 쓴다 — 없는 품목이 새로 생기면 안 된다.
   DOM·네트워크 없음. node 테스트: test/quote_to_site.test.js */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QuoteToSite = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const 몰딩류 = ['몰딩', '크라운몰딩', '걸레받이'];

  /* 견적 구역 -> 현장관리자 품목명 앞머리. 현장관리자는 방1을 '안방' 이라 부른다.
     세탁실·실외기실은 현장관리자에서 거실 쪽 품목(거실세탁실문)으로 잡혀 있다. */
  function 앞머리(구역) {
    if (구역 === '방1') return '안방';
    if (구역 === '방1베란다') return '안방베란다';
    if (구역 === '방1드레스룸') return '안방드레스룸';
    if (구역 === '세탁실') return '거실세탁실';
    if (구역 === '실외기실') return '거실실외기실';
    return 구역;
  }

  // '싱크대 하부장 (30평)' -> '싱크대 하부장'
  function 기본이름(품목명) {
    return String(품목명 || '').split(' (')[0].trim();
  }

  // 전체공통 몰딩을 나눠 받는 구역들. 방 개수만큼 방2..방N.
  function 몰딩구역(방수) {
    const n = Math.max(1, Math.min(5, parseInt(방수, 10) || 3));
    const out = ['거실', '주방', '현관', '안방'];
    for (let i = 2; i <= n; i++) out.push('방' + i);
    return out;
  }

  /* 한 줄의 후보 목록. 앞에서부터 현장관리자에 있는 첫 이름을 쓴다.
     전체공통 몰딩류는 여러 구역으로 나뉘므로 '묶음' 으로 돌려준다(각각 따로 확인). */
  function 후보(구역, 품목명, 방수) {
    const 이름 = 기본이름(품목명);
    const P = 앞머리(구역);

    if (몰딩류.indexOf(이름) >= 0) {
      const 끝 = 이름 === '걸레받이' ? '걸레받이' : '몰딩';   // 크라운몰딩도 몰딩으로 체크
      if (구역 === '전체공통') return { 묶음: 몰딩구역(방수).map((z) => z + 끝) };
      return { 후보: [P + 끝] };
    }

    if (이름 === '방문' || 이름 === '문짝' || 이름 === '문틀') return { 후보: [P + '문+틀', P + '문'] };
    if (이름 === '샤시1' || 이름 === '샤시2') return { 후보: [P + 이름, P + '샤시'] };
    if (/^(붙박이장|수납장)/.test(이름)) return { 후보: [P + '수납장'] };
    if (이름 === '등박스') return { 후보: [P + '등박스'] };
    if (이름 === '화장실문' || 이름 === '화장실 문짝') return { 후보: [P + '화장실문+틀', P + '화장실문'] };
    if (이름 === '화장대') return { 후보: ['화장대'] };
    if (이름 === '거실베란다 통로문' || 이름 === '베란다 중문') return { 후보: ['거실베란다문'] };
    if (이름 === '아치') return { 후보: [P + '아치문틀'] };
    if (이름 === '아트월') return { 후보: ['아트월'] };
    if (이름 === '가벽') return { 후보: 구역 === '거실' ? ['가벽'] : [] };
    if (/^싱크대/.test(이름)) return { 후보: ['싱크대'] };
    if (/^냉장고장/.test(이름)) return { 후보: ['냉장고장'] };
    if (이름 === '세탁실문') return { 후보: ['거실세탁실문'] };
    if (이름 === '실외기실문') return { 후보: ['거실실외기실문'] };
    if (/^중문/.test(이름) && 구역 === '현관') return { 후보: ['현관중문'] };
    if (이름 === '신발장1' || 이름 === '신발장2' || 이름 === '현관문') return { 후보: [이름] };
    return { 후보: [] };
  }

  /* 저장함 항목의 상태(견적 state 스냅샷) -> [{구역, 품목명}]
     체크_ID 는 'zNN_구역_표시품목명_적용평형' 형식이다. 마스터를 다시 받지 않아도
     구역과 품목명을 알 수 있다. */
  function 견적품목들(상태) {
    const out = [];
    if (!상태) return out;
    Object.keys(상태.선택 || {}).forEach((id) => {
      const s = id.split('_');
      if (s.length < 4) return;
      out.push({ 구역: s[1], 품목명: s.slice(2, -1).join('_') });
    });
    (상태.직접품목 || []).forEach((c) => {
      if (c && c.구역 && c.품목명) out.push({ 구역: c.구역, 품목명: c.품목명 });
    });
    return out;
  }

  function 짝짓기(견적품목, 방수, 현장품목명들) {
    const 있음 = new Set(현장품목명들 || []);
    const 짝 = [], 짝없음 = [];
    const 넣은품목 = new Set(), 넣은없음 = new Set();

    (견적품목 || []).forEach((q) => {
      const h = 후보(q.구역, q.품목명, 방수);
      let 찾은 = [];
      if (h.묶음) 찾은 = h.묶음.filter((n) => 있음.has(n));
      else {
        const 첫 = h.후보.find((n) => 있음.has(n));
        if (첫) 찾은 = [첫];
      }

      if (!찾은.length) {
        const k = q.구역 + '|' + q.품목명;
        if (!넣은없음.has(k)) { 넣은없음.add(k); 짝없음.push({ 구역: q.구역, 견적품목: q.품목명 }); }
        return;
      }
      찾은.forEach((n) => {
        if (넣은품목.has(n)) return;
        넣은품목.add(n);
        짝.push({ 구역: q.구역, 견적품목: q.품목명, 현장품목: n });
      });
    });
    return { 짝: 짝, 짝없음: 짝없음 };
  }

  // 두 글자 조각. 숫자가 섞인 조각('3동', '10')은 동·호수끼리 우연히 겹치므로 뺀다.
  function 조각들(s) {
    const out = new Set();
    String(s || '').split(/\s+/).forEach((w) => {
      for (let i = 0; i + 1 < w.length; i++) {
        const g = w.slice(i, i + 2);
        if (!/\d/.test(g)) out.add(g);
      }
    });
    return out;
  }

  /* 현장 목록 정렬: 견적 이름과 겹치는 조각이 많은 현장이 위, 나머지는 시공일자 최신순.
     한 조각만 겹치는 건('그린', '송도') 흔한 말이라 비슷하다고 치지 않는다. */
  const 비슷함기준 = 2;
  function 현장정렬(현장들, 견적이름) {
    const 기준 = 조각들(견적이름);
    return (현장들 || []).map((p) => {
      let 점수 = 0;
      조각들(p.현장명).forEach((g) => { if (기준.has(g)) 점수++; });
      if (점수 < 비슷함기준) 점수 = 0;
      return Object.assign({}, p, { 점수: 점수, 비슷함: 점수 > 0 });
    }).sort((a, b) =>
      (b.점수 - a.점수) || String(b.시공일자 || '').localeCompare(String(a.시공일자 || '')));
  }

  /* 견적 사진의 구역 -> 현장관리자 원본사진 구역.
     현장관리자 원본사진 구역 버튼은 방1~5·거실·주방·현관·기타 뿐이다.
     베란다·드레스룸은 그 방으로(현장관리자도 안방베란다샤시를 방1 구역에 둔다),
     세탁실·실외기실은 거실로(거실세탁실문이 거실 구역 품목이다). */
  const 사진기본구역 = ['방1', '방2', '방3', '방4', '방5', '거실', '주방', '현관'];
  function 사진구역(구역) {
    const z = String(구역 || '');
    if (사진기본구역.indexOf(z) >= 0) return z;
    const 방 = z.match(/^(방[1-5])(베란다|드레스룸)$/);
    if (방) return 방[1];
    if (z === '세탁실' || z === '실외기실') return '거실';
    return '기타';
  }

  /* 견적에 넣은 품목에 붙은 사진만 고른다. 현장에서는 견적에 안 넣을 품목도
     일단 찍어두기 때문에, 폰에 있는 사진을 다 보내면 안 된다.
     기준은 견적서 발행 때(QuotePhotos.올릴사진목록)와 같다: 태그한 품목 +
     네모만 남은 품목. 어느 품목에도 안 붙은 사진은 보내지 않는다. */
  function 견적사진만(사진들, 상태) {
    const 넣은 = new Set(Object.keys((상태 && 상태.선택) || {}));
    ((상태 && 상태.직접품목) || []).forEach((c) => { if (c && c.id) 넣은.add(c.id); });
    return (사진들 || []).filter((p) => {
      const ids = (p.태그 || []).slice();
      Object.keys(p.표시 || {}).forEach((id) => {
        const v = p.표시[id];
        if (v && (!Array.isArray(v) || v.length)) ids.push(id);
      });
      return ids.some((id) => 넣은.has(id));
    });
  }

  return { 견적품목들: 견적품목들, 짝짓기: 짝짓기, 현장정렬: 현장정렬, 사진구역: 사진구역, 견적사진만: 견적사진만 };
});
