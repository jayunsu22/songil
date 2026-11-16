/* 품목별 필름 번호 (2026-11-16 사장님: 기사 앱 품목 이름 옆에 ps170 같은 필름 번호 — 따로 고르지 않게).
   1) 그 현장의 가장 최근 정산 견적서에서 품목마다 고른 자재가 이 현장 필름 번호면 그대로
   2) 아니면 현장관리 앱 필름 줄의 시공위치 글자(방3·거실·화장실 …)가 품목 이름과 같으면 자동
   3) 현장 필름이 한 가지뿐이면 모든 품목에 그 번호 (자동)
   헷갈리면 비워 둔다 — 틀린 번호보다 빈칸이 안전. 자료는 n8n 기사앱_필름번호(worker-films) 가 준다.
   화면·네트워크 없음. node 테스트: test/item_film.test.js */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ItemFilm = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const 글 = (v) => String(v == null ? '' : v).trim();
  const ROOM = /(방\d+|안방|작은방|큰방|거실|주방|부엌|화장실|욕실|현관|베란다|발코니|드레스룸|팬트리|다용도실|계단|복도|창고)/g;
  // 위치 낱말 모음 — 띄어쓰기는 무시 ('방 3' → '방3'), 부엌=주방, 욕실=화장실
  function rooms(name) {
    const m = 글(name).replace(/\s+/g, '').match(ROOM) || [];
    return [...new Set(m.map((x) => x.replace('부엌', '주방').replace('욕실', '화장실')))].sort();
  }
  function codes(films) {
    const seen = {}, out = [];
    (Array.isArray(films) ? films : []).forEach((f) => {
      const c = 글(f && f.code);
      if (c && !seen[c.toLowerCase()]) { seen[c.toLowerCase()] = 1; out.push(c); }
    });
    return out;
  }
  // items: 품목 이름들 · films: [{ place, code }] · quote: [{ 품목명, 자재명 }] (최근 정산 견적서) → { 품목명: { code, auto } }
  function match(items, films, quote) {
    const all = codes(films), byLower = {};
    all.forEach((c) => { byLower[c.toLowerCase()] = c; });
    const fromQuote = {};
    (Array.isArray(quote) ? quote : []).forEach((l) => {
      const n = 글(l && l.품목명), c = byLower[글(l && l.자재명).toLowerCase()];
      if (n && c) fromQuote[n] = c;
    });
    const out = {};
    (Array.isArray(items) ? items : []).map(글).filter(Boolean).forEach((name) => {
      if (fromQuote[name]) { out[name] = { code: fromQuote[name], auto: false }; return; }
      const want = rooms(name).join(',');
      if (want) {
        const hit = codes((films || []).filter((f) => f && rooms(f.place).join(',') === want));
        if (hit.length === 1) { out[name] = { code: hit[0], auto: true }; return; }
        if (hit.length > 1) return;   // 같은 위치에 번호가 여럿 — 헷갈리면 비움
      }
      if (all.length === 1) out[name] = { code: all[0], auto: true };
    });
    return out;
  }
  return { match, rooms, codes };
});
