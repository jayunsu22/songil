/* 추가작업 · 약속 메모 (2026-10-26 사장님, 월곡동 현장).
   계획에 없던 일 세 가지를 현장에서 30초에 적는다:
     재시공 = 고객 요청 설계변경으로 이미 한 부위를 다시, AS = 그 사이 파손 복구, 추가요청 = 업자와 말로 정한 추가
   적은 것은 작업목록에 한 줄(추가구분·청구…)로 들어가 기사앱·정산견적에 같이 쓰인다.
   약속 메모는 말로 정한 걸 그 자리에서 남겨 두고, 견적에 넣거나 '안 함'으로 닫을 때까지 빨갛게 따라다닌다.
   화면·네트워크에 손대지 않는 순수 함수만. node 테스트: test/extra_work.test.js */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ExtraWork = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const 구분들 = [
    { 값: '재시공', 글: '🔁 설계변경 재시공', 짧게: '🔁 재시공' },
    { 값: 'AS', 글: '🛠 AS (파손)', 짧게: '🛠 AS' },
    { 값: '추가요청', 글: '➕ 추가요청', 짧게: '➕ 추가' },
  ];
  const 청구들 = [
    { 값: '고객청구', 글: '고객 청구' },
    { 값: '업체청구', 글: '업체 청구' },
    { 값: '무상', 글: '무상' },
  ];
  const 수 = (v) => { const n = Number(v); return v === '' || v == null || isNaN(n) ? 0 : n; };
  const 글 = (v) => String(v == null ? '' : v).trim();

  function 구분정보(값) { return 구분들.find((g) => g.값 === 값) || null; }

  // 누가 했나 → 돈은 누가: 고객이면 고객 청구, 다른 업체가 깼으면 그 업체, 우리 실수면 무상
  function 청구기본(누가) {
    if (누가 === '우리') return '무상';
    if (누가 === '업체') return '업체청구';
    return '고객청구';
  }

  /* 1단위 금액. 품목 설정의 카테고리2 가 1분견적 단가표 품목명과 같다 (방문·화장실문·수납장…).
     샤시는 단가표에 단창/2중창으로 나뉘어 있어서 2중창으로 본다 (1분견적에서도 그냥 '샤시'는 2중창).
     표 = { 시공_품목명: { 인건비단가, 자재비단가, 자재소모량, 견적단위 } }. 못 찾으면 0 → 사장님이 직접 적는다 */
  function 단가(품목, 표) {
    if (!품목 || !표) return 0;
    let 이름 = 글(품목.카테고리2);
    if (!이름) return 0;
    if (이름 === '샤시') 이름 = '샤시(2중창)';
    const r = 표[이름];
    if (!r) return 0;
    return Math.round((수(r.인건비단가) + 수(r.자재비단가 || 9000)) * 수(r.자재소모량));
  }
  function 금액(단가값, 수량) { return Math.round(수(단가값) * 수(수량) / 100) * 100; }
  // 필름 소모량(m): 품목 설정의 자재소모량 × 수량 (길이입력 품목은 1m당, 아니면 1개당)
  function 필름m(품목, 수량) {
    const per = 품목 && typeof 품목.자재소모량 === 'number' ? 품목.자재소모량 : 0;
    return Math.round(per * 수(수량) * 10) / 10;
  }

  // 작업목록의 시공품목 이름. 원래 품목과 겹치면 안 된다 (품목 삭제·정산견적이 이름으로 짝짓는다)
  function 새이름(원품목, 구분, 있는이름들) {
    const 바탕 = (글(원품목) || '추가작업') + ' ' + ((구분정보(구분) || {}).값 || '추가');
    const 있는 = new Set((있는이름들 || []).map(글));
    if (!있는.has(바탕)) return 바탕;
    for (let i = 2; i < 100; i++) if (!있는.has(바탕 + ' ' + i)) return 바탕 + ' ' + i;
    return 바탕 + ' ' + Date.now();
  }

  function is추가(task) { return !!(task && task.fields && task.fields.추가구분); }

  // 정산견적·요약에 쓰는 금액: 무상은 0, 업체청구는 고객 합계와 따로
  function 요약(tasks) {
    const out = { 건수: 0, 고객: 0, 업체: 0, 무상건수: 0, 구분별: { 재시공: 0, AS: 0, 추가요청: 0 } };
    (tasks || []).filter(is추가).forEach((t) => {
      const f = t.fields;
      out.건수 += 1;
      if (f.추가구분 in out.구분별) out.구분별[f.추가구분] += 1;
      const 청구 = f.청구 || '고객청구';
      if (청구 === '무상') out.무상건수 += 1;
      else if (청구 === '업체청구') out.업체 += Math.round(수(f.추가금액));
      else out.고객 += Math.round(수(f.추가금액));
    });
    return out;
  }

  /* ---------- 약속 메모 ---------- 현장목록.약속메모 칸에 JSON 배열 글로 둔다 */
  function 약속읽기(text) {
    let arr = [];
    try { arr = JSON.parse(text || '[]'); } catch (e) { arr = []; }
    if (!Array.isArray(arr)) arr = [];
    return arr.filter((p) => p && 글(p.글)).map((p) => ({
      id: 글(p.id) || ('p' + Math.random().toString(36).slice(2, 8)),
      글: 글(p.글), 누가: 글(p.누가), 때: 글(p.때),
      상태: ['대기', '반영', '안함'].includes(p.상태) ? p.상태 : '대기',
      작업: 글(p.작업),   // 견적에 넣었을 때 만든 작업목록 이름
    }));
  }
  function 약속쓰기(list) { return JSON.stringify((list || []).map((p) => ({ id: p.id, 글: p.글, 누가: p.누가, 때: p.때, 상태: p.상태, 작업: p.작업 || '' }))); }
  function 약속더하기(list, 글값, 누가, 때) {
    const t = 글(글값);
    if (!t) return list;
    return [{ id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), 글: t, 누가: 글(누가), 때: 글(때), 상태: '대기', 작업: '' }].concat(list || []);
  }
  function 약속상태(list, id, 상태, 작업) {
    return (list || []).map((p) => p.id === id ? Object.assign({}, p, { 상태, 작업: 작업 || p.작업 || '' }) : p);
  }
  const 남은약속 = (list) => (list || []).filter((p) => p.상태 === '대기');

  return { 구분들, 청구들, 구분정보, 청구기본, 단가, 금액, 필름m, 새이름, is추가, 요약, 약속읽기, 약속쓰기, 약속더하기, 약속상태, 남은약속 };
});
