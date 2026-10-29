/* 견적초안 ①② (2026-10-29 사장님, 업무자동화 1단계). DOM/네트워크에 손대지 않는 순수 모듈.
   받은 견적 요청 글은 n8n 견적초안_읽기(1분견적 텍스트 프롬프트 복사)가 1분견적과 같은 품목으로 읽는다:
       [{ 품목명: '방문', 수량: 3, 표시수량: '3개', 구역: '', 근거: '방문3세트' }]
   여기서 그걸 방문견적 MASTER.zones 의 체크(state.선택)로 바꾼다. 금액은 방문견적이 평소대로 계산한다.

   자리 고르기: 구역을 말했으면 그 구역, 안 했으면 거실·주방·현관·방1~5 순서로 그 품목이 있는 구역을 앞에서부터.
   그래서 '방문 3' → 방1·방2·방3, '화장실문 2' → 거실·방1 이 된다 (사장님 확인 2026-10-29).
   세트 = 문짝+문틀 - 방문견적의 방문·화장실문 품목이 원래 문+틀이라 따로 할 일이 없다.
   m 품목은 1분견적이 이미 길이로 바꿔 준다(샤시 1개 3m, 가구 1세트 2m). '2세트' 면 샤시1·샤시2 처럼 나눠 담는다.
   못 담은 것은 버리지 않고 확인필요로 돌려준다 - 조용히 빠지는 품목이 생기면 이 기능을 만든 이유가 무너진다.
   이미 체크된 자리는 건드리지 않고 '건너뜀' 으로 센다 - 붙여넣기를 두 번 눌러도 두 배가 안 된다.
   node 테스트: test/request_draft.test.js */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RequestDraft = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const 앞구역 = ['거실', '주방', '현관', '방1', '방2', '방3', '방4', '방5'];
  const 붙임 = (s) => String(s == null ? '' : s).replace(/\s+/g, '');
  const 수 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  // 전체공통(평형별 패키지)은 구역 자리가 아니라 뺀다
  function 구역순서(zones) {
    const 이름들 = (zones || []).map((z) => z.구역).filter((n) => n && n !== '전체공통');
    return 앞구역.filter((n) => 이름들.indexOf(n) >= 0).concat(이름들.filter((n) => 앞구역.indexOf(n) < 0));
  }

  // 이 품목명을 받는 자리(구역 순서대로). 옵션 품목명이 같으면 그 옵션 순번을 쓴다.
  function 자리들(품목명, zones) {
    const 키 = 붙임(품목명);
    const out = [];
    구역순서(zones).forEach((구역) => {
      const z = zones.find((x) => x.구역 === 구역);
      (z.items || []).forEach((it) => {
        if (it.파생) return;     // 방 개수로 만든 몰딩 몫 - 사람이 고르는 품목이 아니다
        const 옵션들 = it.옵션들 || [];
        let 옵션 = 옵션들.findIndex((o) => 붙임(o.품목명) === 키);
        if (옵션 < 0 && 붙임(it.표시_품목명) === 키) 옵션 = 0;
        if (옵션 >= 0) out.push({ 구역, item: it, 옵션, m: (옵션들[옵션] || it).단위 === 'm' || it.단위 === 'm' });
      });
    });
    return out;
  }

  function 체크하기(items, zones, 이미선택) {
    const 이미 = 이미선택 || {};
    const 선택 = {}, 건너뜀 = [], 확인필요 = [];
    const 쓴 = new Set();

    (items || []).forEach((줄) => {
      const 이름 = String((줄 && 줄.품목명) || '').trim();
      if (!이름) return;
      let 후보 = 자리들(이름, zones || []);
      if (줄.구역) 후보 = 후보.filter((s) => 붙임(s.구역) === 붙임(줄.구역));
      후보 = 후보.filter((s) => !쓴.has(s.item.체크_ID));
      const m품목 = 후보.length ? 후보[0].m : false;

      // 몇 자리에 얼마씩 담나
      const 세트 = /^\s*(\d+)\s*세트/.exec(String(줄.표시수량 || ''));
      let 개수, 한자리;
      if (m품목) {
        개수 = 세트 ? Math.max(1, Number(세트[1])) : 1;
        한자리 = Math.round((수(줄.수량) / 개수) * 10) / 10;
      } else {
        개수 = Math.max(1, Math.round(수(줄.수량)) || 1);
        한자리 = 1;
      }

      if (!후보.length) {
        확인필요.push({ 품목명: 이름, 개수, 근거: 줄.근거 || 이름, 이유: '방문견적에 없는 품목' });
        return;
      }
      let 남음 = 개수;
      for (const s of 후보) {
        if (!남음) break;
        const id = s.item.체크_ID;
        쓴.add(id);
        if (이미[id]) 건너뜀.push({ 품목명: 이름, 구역: s.구역, 체크_ID: id });
        else 선택[id] = { 수량: 한자리, 난이도: 1, 옵션: s.옵션, 초안: true };
        남음--;
      }
      if (남음) 확인필요.push({ 품목명: 이름, 개수: 남음, 근거: 줄.근거 || 이름, 이유: '담을 자리가 모자람' });
    });

    return { 선택, 건너뜀, 확인필요 };
  }

  /* 견적 공통 필수 (사장님 2026-10-29): 사는 집인지 · 위치 · 다른 공정과 겹치는지. 필름·날짜도 같이 본다. */
  const 필수 = [['거주', '사는 집인지'], ['위치', '위치'], ['다른공정', '다른 공정'], ['필름', '필름'], ['날짜', '날짜']];
  function 빠진것(공통) {
    const g = 공통 || {};
    return 필수.filter(([k]) => !String(g[k] || '').trim()).map(([, 글]) => 글);
  }

  return { 체크하기, 빠진것, 구역순서 };
});
