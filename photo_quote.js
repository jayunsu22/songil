/* 📷 사진으로 견적 (2026-11-11 사장님: 업자가 카톡으로 사진 20장을 보내며 견적을 부탁할 때). DOM/네트워크 없는 순수 모듈.
   사진 한 장마다 n8n 견적사진_읽기가 { n, id(방문견적 품목)|null, qty, film, memo, text } 를 돌려준다.
   여기서 같은 품목끼리 묶어 확인 화면 줄로 만든다. 같은 품목을 여러 장 찍었으면 한 줄 (수량은 가장 큰 수 — 같은 문을 두 각도로 찍었다고 2세트가 되면 안 된다).
   못 고른 사진은 버리지 않고 '확인 필요' 로 — 조용히 빠지는 품목이 생기면 안 된다.
   화면은 quote_photo_view.js, node 테스트: test/photo_quote.test.js */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PhotoQuote = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const str = (v) => String(v == null ? '' : v).trim();

  // AI 에게 줄 품목 목록 — 지금 보이는 품목만 (방 개수로 만든 몰딩 몫 같은 파생 품목은 빼고)
  function 품목목록(zones) {
    const out = [];
    (zones || []).forEach((z) => (z.items || []).forEach((it) => {
      if (it.파생) return;
      out.push({ id: it.체크_ID, 구역: z.구역, 이름: it.표시_품목명 });
    }));
    return out;
  }

  // 읽은 사진들 → { rows: [{ id, 구역, 품목명, qty, films, memos, photos:[n], texts }], need: [{ n, text, film, memo }] }
  // rows 는 구역 순서(방문견적 화면 순서) 그대로
  function 합치기(photos, zones) {
    const where = {}, order = [];
    (zones || []).forEach((z) => (z.items || []).forEach((it) => { where[it.체크_ID] = { 구역: z.구역, 품목명: it.표시_품목명 }; order.push(it.체크_ID); }));
    const byId = {}, need = [];
    (photos || []).slice().sort((a, b) => a.n - b.n).forEach((p) => {
      if (!p) return;
      if (!p.id || !where[p.id]) { need.push({ n: p.n, text: str(p.text), film: str(p.film), memo: str(p.memo) }); return; }
      const r = byId[p.id] = byId[p.id] || { id: p.id, 구역: where[p.id].구역, 품목명: where[p.id].품목명, qty: 0, films: [], memos: [], photos: [], texts: [] };
      r.qty = Math.max(r.qty, Number(p.qty) > 0 ? Number(p.qty) : 1);
      r.photos.push(p.n);
      [['films', p.film], ['memos', p.memo], ['texts', p.text]].forEach(([k, v]) => { v = str(v); if (v && r[k].indexOf(v) < 0) r[k].push(v); });
    });
    const rows = order.filter((id) => byId[id]).map((id) => byId[id]);
    return { rows, need };
  }

  // 품목 설명 뒤에 필름·메모를 붙인다 (이미 붙어 있으면 또 안 붙임)
  function 설명덧붙이기(설명, films, memos) {
    const base = str(설명);
    const add = [];
    if ((films || []).length) add.push('· 필름: ' + films.join(', '));
    (memos || []).forEach((m) => add.push('· ' + m));
    const 새 = add.filter((l) => base.indexOf(l) < 0);
    return 새.length ? (base ? base + '\n' : '') + 새.join('\n') : base;
  }

  return { 품목목록, 합치기, 설명덧붙이기 };
});
