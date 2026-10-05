/* 저장함 서버 백업 · 발행한 견적 되살리기 (2026-10-04).
   저장함은 폰 브라우저(localStorage)에만 있었다. 브라우저 사이트 데이터가 지워지면
   저장함이 통째로 사라진다. 그래서 담을 때마다 서버(Airtable)에도 올리고,
   폰 쪽이 비면 서버에서 다시 받는다. 발행만 하고 저장함에 없던 견적은
   발행 스냅샷(견적서에 찍힌 품목 줄)에서 작성 상태를 다시 만든다.
   DOM·네트워크 없음. node 테스트: test/quote_box.test.js */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QuoteBox = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const 키 = (id) => String(id);

  /* 저장함 이전·이후를 견줘 서버에 보낼 일을 만든다.
     같은 id 인데 내용이 같으면 안 보낸다 — 열 때마다 30건을 다시 올리면 안 된다. */
  function 바뀐것(이전, 이후) {
    const 전 = new Map((이전 || []).map((x) => [키(x.id), JSON.stringify(x)]));
    const 후 = new Set();
    const ops = [];
    (이후 || []).forEach((x) => {
      const k = 키(x.id);
      후.add(k);
      if (전.get(k) !== JSON.stringify(x)) ops.push({ op: 'put', id: k, data: x });
    });
    전.forEach((_, k) => { if (!후.has(k)) ops.push({ op: 'delete', id: k }); });
    return ops;
  }

  /* 올리지 못한 일 목록에 새 일을 얹는다. 같은 건은 마지막 것만 남긴다
     (담았다가 지웠으면 '지움' 하나만 보내면 된다). */
  function 큐합치기(큐, ops) {
    const m = new Map((큐 || []).map((o) => [키(o.id), o]));
    (ops || []).forEach((o) => m.set(키(o.id), o));
    return Array.from(m.values());
  }

  /* 보낸 사이에 또 바뀐 건은 남긴다. 보낸 것과 똑같은 것만 큐에서 뺀다. */
  function 보낸것빼기(큐, 보낸) {
    const 보냄 = new Map((보낸 || []).map((o) => [키(o.id), JSON.stringify(o)]));
    return (큐 || []).filter((o) => 보냄.get(키(o.id)) !== JSON.stringify(o));
  }

  /* 서버에서 받은 저장함과 폰 저장함을 합친다.
     - 폰에 있는 건 폰 것을 쓴다 (방금 고친 게 아직 안 올라갔을 수 있다)
     - 서버에만 있는 건 폰에 넣는다 — 지워진 저장함을 되살리는 길이다
       (단, 폰에서 지웠는데 아직 못 올린 건은 되살리지 않는다)
     - 폰에만 있는 건 서버에 올린다 — 이 기능 전에 담은 건들이다 */
  function 서버와합치기(폰, 서버, 큐) {
    const 지우는중 = new Set((큐 || []).filter((o) => o.op === 'delete').map((o) => 키(o.id)));
    const 폰id = new Set((폰 || []).map((x) => 키(x.id)));
    const 서버id = new Set((서버 || []).map((x) => x && 키(x.id)));
    const 더함 = (서버 || []).filter((x) => x && x.id != null && !폰id.has(키(x.id)) && !지우는중.has(키(x.id)));
    const 목록 = (폰 || []).concat(더함);
    // 저장한 때가 늦은 것이 위로 — 폰 저장함이 원래 그 순서다
    목록.sort((a, b) => String(b.저장일시 || '').localeCompare(String(a.저장일시 || '')));
    const 올릴것 = (폰 || []).filter((x) => !서버id.has(키(x.id)))
      .map((x) => ({ op: 'put', id: 키(x.id), data: x }));
    return { 목록: 목록, 되살림: 더함.length, 올릴것: 올릴것 };
  }

  /* 발행한 견적(견적서 스냅샷)을 작성 상태로 되돌린다.
     master 는 파생 품목(거실·방별 몰딩)을 붙인 뒤의 것이어야 한다.
     마스터에서 사라진 품목은 버리지 않고 '직접 입력' 품목으로 금액 그대로 살린다. */
  function 발행을상태로(d, master, 기본자재비) {
    let 라인들 = d && d.라인들;
    if (typeof 라인들 === 'string') { try { 라인들 = JSON.parse(라인들); } catch (e) { 라인들 = []; } }
    if (!Array.isArray(라인들)) 라인들 = [];

    const 품목표 = new Map();   // 체크_ID → { item, 구역 }
    const 구역들 = [];
    ((master && master.zones) || []).forEach((z) => {
      구역들.push(z.구역);
      (z.items || []).forEach((it) => 품목표.set(it.체크_ID, { item: it, 구역: z.구역 }));
    });

    const 조정 = (Array.isArray(d.조정_내역) ? d.조정_내역 : []).filter((a) => a && a.비율).slice(0, 3);
    const st = {
      현장ID: '', 현장코드: String(d.견적코드 || ''), 현장명: String(d.현장명 || ''),
      평형: d.평형 ? String(d.평형) : '확인안됨', 자재비: null,
      선택: {}, 직접품목: [], 설명: {}, 조정: [조정[0] || null, 조정[1] || null, 조정[2] || null],
      구역명: {}, 메모: String(d.메모 || ''), 전달사항: String(d.소비자_전달사항 || ''),
      안내문구: String(d.안내문구_수정 || ''), 내부메모: '', 방수: 3, 업체: null, 현장연결: null,
    };
    let 직접으로 = 0;
    // 아주 처음 발행한 견적은 라인금액 없이 표시금액(조정 뒤)만 있다. 조정을 걷어내 되짚는다
    const 율 = Number(d.조정_합계율) || 0;
    const 원금액 = (l) => l.라인금액 != null ? l.라인금액 : Math.round((Number(l.표시금액) || 0) / (1 + 율));

    // 구역 이름을 바꿔 발행했으면 견적서에는 바꾼 이름이 찍혀 있다. 마스터 품목으로 되짚는다.
    라인들.forEach((l) => {
      const hit = 품목표.get(l.체크_ID);
      if (hit && l.구역 && l.구역 !== hit.구역) st.구역명[hit.구역] = String(l.구역);
    });
    const 원래구역 = (표시) => {
      if (구역들.indexOf(표시) >= 0) return 표시;
      const k = Object.keys(st.구역명).find((원래) => st.구역명[원래] === 표시);
      return k || 구역들[0] || 표시;
    };

    라인들.forEach((l) => {
      const hit = 품목표.get(l.체크_ID);
      if (hit && l.직접금액 == null) {
        const it = hit.item;
        const 옵션들 = it.옵션들 || [];
        let 옵션 = 0;
        if (옵션들.length > 1) {
          const i = 옵션들.findIndex((o) => l.품목명 === it.표시_품목명 + ' (' + o.품목명 + ')');
          if (i >= 0) 옵션 = i;
        }
        st.선택[l.체크_ID] = { 수량: l.수량, 난이도: l.난이도 || 1, 옵션: 옵션 };
        const o = 옵션들[옵션] || 옵션들[0] || it;
        if (l.품목설명 != null && l.품목설명 !== (o.품목설명 || '') && !it.파생) st.설명[l.체크_ID] = String(l.품목설명);
        if (it.적용평형 && it.적용평형 !== '공통' && st.평형 === '확인안됨') st.평형 = it.적용평형;
        if (l.자재비단가 != null && st.자재비 == null && l.자재비단가 !== 기본자재비) st.자재비 = l.자재비단가;
        // 방별 몰딩 설명에 '방 N개로 나눔' 이 남아 있다. 그걸로 방 개수를 되찾는다
        const m = /방 (\d)개로 나눔/.exec(String(l.품목설명 || ''));
        if (it.파생 && m) st.방수 = +m[1];
        return;
      }
      // 직접 입력 품목, 또는 마스터에서 사라진 품목
      const 사라짐 = l.직접금액 == null;
      if (사라짐) 직접으로++;
      const c = {
        id: 사라짐 ? 'c' + 직접으로 + 'x' + String(l.체크_ID || '').replace(/[^0-9a-z]/gi, '').slice(-6)
                   : String(l.체크_ID || ('c' + st.직접품목.length)),
        구역: 원래구역(String(l.구역 || '')),
        품목명: String(l.품목명 || ''),
        금액: 사라짐 ? 원금액(l) : l.직접금액,
        설명: String(l.품목설명 || ''),
      };
      if (사라짐 && l.인건비금액 != null) { c.인건비 = l.인건비금액; c.자재비 = 원금액(l) - l.인건비금액; }
      if (l.인건비 != null) c.인건비 = l.인건비;
      if (l.자재비 != null) c.자재비 = l.자재비;
      st.직접품목.push(c);
    });
    return { 상태: st, 직접으로: 직접으로, 줄수: 라인들.length };
  }

  /* ---------- 사진 백업 ----------
     사진 한 장 = 서버 한 줄. 이미지가 바뀌었는지(빨강 지우기 등)와 태그·네모·구역이
     바뀌었는지를 따로 본다 — 태그만 바뀐 걸로 300KB 를 다시 올리면 안 된다. */
  function 이미지서명(p) {
    return String((p && p.blob && p.blob.size) || 0) + ':' + String((p && p.바뀐때) || 0);
  }
  function 사진서명(p) {
    return [이미지서명(p), p.구역 || '', JSON.stringify(p.태그 || []), JSON.stringify(p.표시 || {})].join('|');
  }

  /* 지운 사진을 서버에서도 정리할 일. 현장마다 '남길 사진키' 를 보낸다.
     - 폰에서 그 현장에 한 번도 올린 적 없고(보낸맵에 없음) 폰 사진이 0장이면 보내지 않는다.
       폰이 지워진 뒤 서버에서 되살린 건은 사진을 아직 못 받았을 수 있다 — 그때 '0장 남김'
       을 보내면 서버 사진이 다 지워진다.
     - 저장함에서 빠진 현장은 '0장 남김' 을 한 번 보낸다. */
  function 정리할현장(박스현장, 현장별키, 보낸맵) {
    const 맵 = Object.assign({}, 보낸맵 || {});
    const 일 = [];
    const 있는 = new Set(박스현장 || []);
    (박스현장 || []).forEach((sid) => {
      const 키들 = (현장별키[sid] || []).slice().sort();
      const 서명 = 키들.join(',');
      if (맵[sid] === undefined && !키들.length) return;
      if (맵[sid] === 서명) return;
      일.push({ 현장ID: sid, 키들: 키들 });
      맵[sid] = 서명;
    });
    Object.keys(맵).forEach((sid) => {
      if (있는.has(sid)) return;
      일.push({ 현장ID: sid, 키들: [] });
      delete 맵[sid];
    });
    return { 일: 일, 맵: 맵 };
  }

  /* 오래된 현장 사진 정리 후보 (2026-10-05).
     저장함에 마지막으로 담은(고친) 때가 기간보다 오래됐고 사진이 있는 건 — 오래된 것부터.
     통계 = { 현장ID: { 장수, 용량 } } (폰 사진 기준) */
  function 정리후보(목록, 통계, 개월, 지금) {
    const 기준 = new Date(지금 || Date.now());
    기준.setMonth(기준.getMonth() - (Number(개월) || 3));
    return (목록 || [])
      .filter((x) => x && x.현장ID && 통계 && 통계[x.현장ID] && 통계[x.현장ID].장수 > 0)
      .filter((x) => { const t = new Date(x.저장일시); return !isNaN(t) && t < 기준; })
      .map((x) => ({ id: x.id, 이름: x.이름, 현장ID: x.현장ID, 저장일시: x.저장일시,
        장수: 통계[x.현장ID].장수, 용량: 통계[x.현장ID].용량 || 0 }))
      .sort((a, b) => String(a.저장일시).localeCompare(String(b.저장일시)));
  }

  return { 정리후보: 정리후보, 이미지서명: 이미지서명, 사진서명: 사진서명, 정리할현장: 정리할현장, 바뀐것: 바뀐것, 큐합치기: 큐합치기, 보낸것빼기: 보낸것빼기, 서버와합치기: 서버와합치기, 발행을상태로: 발행을상태로 };
});
