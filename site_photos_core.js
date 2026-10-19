// 현장사진 앱의 판단 로직. 화면·IndexedDB 를 건드리지 않아서 node 로 테스트한다.
// site_photos.js 가 이걸 불러 쓴다.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SitePhotosCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // 구역을 아직 안 정한 사진의 구역 값. 견적 화면(quote_pro)은 구역 이름으로 사진을
  // 찾으므로, 빈 값이면 어느 구역 트레이에도 안 나타난다 - 정하기 전에 견적에 섞이지 않는다.
  const 미정 = '';

  // 마스터를 못 받았을 때 쓰는 구역. 견적 화면 마스터(구역별체크리스트)와 이름이 같아야
  // 사진이 그 구역 트레이로 들어간다.
  const 기본구역 = ['전체공통', '현관', '거실', '주방', '방1', '방2', '방3', '방4',
                   '안방욕실', '공용욕실', '베란다', '드레스룸', '다용도실'];

  // 견적 마스터({ zones: [{ 구역, items }] })에서 구역 이름만. 없거나 비었으면 기본구역.
  function 구역목록(마스터) {
    const zs = (마스터 && Array.isArray(마스터.zones)) ? 마스터.zones : [];
    const 이름들 = [];
    zs.forEach(function (z) {
      const n = z && String(z.구역 || '').trim();
      if (n && 이름들.indexOf(n) < 0) 이름들.push(n);
    });
    return 이름들.length ? 이름들 : 기본구역.slice();
  }

  function 미정인가(p) {
    return !p || !p.구역;
  }

  function 미정수(사진들) {
    return (사진들 || []).filter(미정인가).length;
  }

  /* 화면에 보일 묶음. 구역 미정이 맨 위(할 일), 그다음 구역 목록 순서.
     목록에 없는 구역(마스터에서 지워진 이름 등)은 뒤에 붙여서 사진이 사라져 보이지 않게 한다.
     사진이 없는 구역은 뺀다. */
  function 구역별묶기(사진들, 구역들) {
    const 맵 = {};
    (사진들 || []).forEach(function (p) {
      const k = 미정인가(p) ? 미정 : p.구역;
      (맵[k] = 맵[k] || []).push(p);
    });
    const 순서 = [미정].concat(구역들 || []);
    Object.keys(맵).forEach(function (k) { if (순서.indexOf(k) < 0) 순서.push(k); });
    return 순서.filter(function (k) { return 맵[k] && 맵[k].length; })
      .map(function (k) { return { 구역: k, 사진들: 맵[k] }; });
  }

  /* 현장에서 임의로 만든 구역('보일러실', '창고방' 같은). 견적서 마스터에 없는 이름이라
     견적서 어느 구역에도 안 나온다 - 집에 와서 견적서 구역으로 옮기기 전까지의 임시 이름이다. */
  function 임시구역인가(구역, 구역들) {
    return !!구역 && (구역들 || []).indexOf(구역) < 0;
  }

  function 임시수(사진들, 구역들) {
    return (사진들 || []).filter(function (p) { return p && 임시구역인가(p.구역, 구역들); }).length;
  }

  /* 이 현장에서 고를 수 있는 구역: 견적서 구역 + 이 현장에서 추가한 구역
     + 사진에 붙어 있는데 둘 다에 없는 이름(마스터에서 이름이 바뀐 경우 등). 순서 유지, 중복 없음. */
  function 현장구역목록(구역들, 추가구역, 사진들) {
    const out = (구역들 || []).slice();
    const 넣기 = function (z) { z = String(z || '').trim(); if (z && out.indexOf(z) < 0) out.push(z); };
    (추가구역 || []).forEach(넣기);
    (사진들 || []).forEach(function (p) { if (p) 넣기(p.구역); });
    return out;
  }

  /* 사진에서 고를 품목. 방문견적서의 평형 필터와 똑같이 건다 - 여기서만 보이면
     태그는 되는데 견적에는 안 나타나는 품목이 생긴다. 평형을 모르면(확인안됨) 공통만. */
  function 보이는품목(마스터, 구역, 평형) {
    const zs = (마스터 && Array.isArray(마스터.zones)) ? 마스터.zones : [];
    const z = zs.find(function (x) { return x && x.구역 === 구역; });
    return ((z && z.items) || []).filter(function (it) {
      return it && it.체크_ID && (it.적용평형 === '공통' || it.적용평형 === 평형);
    });
  }

  /* 사진의 구역을 바꾸면 앞 구역 품목 태그는 뺀다. 구역 = 사진 찍은 곳이라
     다른 구역 품목이 남아 있으면 화면에서 안 보이는 채로 견적에 들어간다. */
  function 구역안태그(태그, 마스터, 구역) {
    const zs = (마스터 && Array.isArray(마스터.zones)) ? 마스터.zones : [];
    const z = zs.find(function (x) { return x && x.구역 === 구역; });
    const ids = ((z && z.items) || []).map(function (it) { return it.체크_ID; });
    return (태그 || []).filter(function (id) { return ids.indexOf(id) >= 0; });
  }

  // 체크_ID -> 품목명 (구역 줄에 '거실샤시, 아트월' 처럼 보여줄 때)
  function 품목이름(마스터, 체크_ID) {
    const zs = (마스터 && Array.isArray(마스터.zones)) ? 마스터.zones : [];
    for (let i = 0; i < zs.length; i++) {
      const it = ((zs[i] && zs[i].items) || []).find(function (x) { return x.체크_ID === 체크_ID; });
      if (it) return it.표시_품목명 || it.품목명 || 체크_ID;
    }
    return '';
  }

  // 새 방문의 기본 이름 "10/19 방문"
  function 기본이름(날) {
    const d = 날 || new Date();
    return (d.getMonth() + 1) + '/' + d.getDate() + ' 방문';
  }

  // 방문 목록: 최근 것이 위로. 같은 현장ID 는 하나만.
  function 방문넣기(목록, 방문) {
    const 나머지 = (목록 || []).filter(function (v) { return v.현장ID !== 방문.현장ID; });
    return [방문].concat(나머지);
  }

  return {
    미정: 미정,
    기본구역: 기본구역,
    구역목록: 구역목록,
    미정인가: 미정인가,
    미정수: 미정수,
    구역별묶기: 구역별묶기,
    기본이름: 기본이름,
    방문넣기: 방문넣기,
    보이는품목: 보이는품목,
    구역안태그: 구역안태그,
    품목이름: 품목이름,
    임시구역인가: 임시구역인가,
    임시수: 임시수,
    현장구역목록: 현장구역목록,
  };
});
