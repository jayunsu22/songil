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

  /* 구역을 정한 뒤 넘어갈 사진의 자리. 지금 사진 다음의 미정 사진,
     뒤에 없으면 앞쪽의 미정 사진. 미정이 하나도 없으면 -1.
     (집에 와서 사진을 한 장씩 눌러 구역만 고르고 넘어가는 흐름) */
  function 다음미정(사진들, 지금) {
    const n = (사진들 || []).length;
    for (let k = 1; k < n; k++) {
      const i = (지금 + k) % n;
      if (미정인가(사진들[i])) return i;
    }
    return -1;
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
    다음미정: 다음미정,
    기본이름: 기본이름,
    방문넣기: 방문넣기,
  };
});
