/* 정산견적: 일정 앱(거래처별 현장관리)에 적어둔 필름 번호를 자재 선택지로 바꾸는 규칙.
   일정 앱 현장은 위치·필름 번호 줄(films)을 갖고 있고, 정산견적은 현장업무(현장관리자) id 로
   열린다. 두 앱의 연결(adminId)이 이어진 현장의 번호만 가져온다 - 안 이어진 현장 것이 섞이면 안 된다.
   필름 번호는 설정의 자재단가와 달리 현장마다 달라서 설정에 저장하지 않고 이 견적에만 둔다.
   DOM·네트워크 없음. node 테스트: test/settle_films.test.js */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SettleFilms = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const 기본단가 = 9000;       // 원/m. 사장님이 견적 화면에서 번호별로 고친다
  const 접두 = 'film:';

  const 글 = (v) => String(v == null ? '' : v).trim();
  const 필름ID = (코드) => 접두 + 코드;

  /* 일정 앱 백업의 sites 에서, 이 현장업무에 연결된 현장들의 필름 번호를 순서대로.
     빈 번호는 빼고, 대소문자만 다른 중복은 먼저 적은 표기로 한 번만. */
  function 필름코드들(sites, 현장ID) {
    const id = 글(현장ID);
    if (!id || !Array.isArray(sites)) return [];
    const 본 = new Set();
    const out = [];
    sites.forEach((s) => {
      if (!s || 글(s.adminId) !== id || !Array.isArray(s.films)) return;
      s.films.forEach((f) => {
        const 코드 = f ? 글(f.code) : '';
        if (!코드) return;
        const 키 = 코드.toLowerCase();
        if (본.has(키)) return;
        본.add(키);
        out.push(코드);
      });
    });
    return out;
  }

  // 선택지 줄. settle.js 의 자재 줄({ id, 항목명, 단가, 사용여부 })과 같은 모양이라 그대로 섞어 쓴다.
  function 필름자재목록(코드들, 단가맵) {
    const 맵 = 단가맵 || {};
    return (코드들 || []).map((코드) => {
      const v = Number(맵[코드]);
      return { id: 필름ID(코드), 항목명: 코드, 단가: isFinite(v) && v > 0 ? v : 기본단가, 사용여부: true, 필름: true };
    });
  }

  /* 새로 받은 번호 + 이전에 받아둔 번호 중 지금 견적 줄이 쓰는 것.
     일정 앱에서 번호를 지웠어도 이미 줄에 고른 것은 남겨야 한다 - 말없이 '자재 없음' 이 되면
     견적 금액이 바뀐다. 체크를 꺼둔 줄이 쓰던 번호도 남긴다(다시 켰을 때 같아야 한다). */
  function 남길코드들(새코드들, 이전코드들, 줄들) {
    const 쓰는 = new Set((줄들 || []).map((l) => l && l.자재ID).filter(Boolean));
    const out = (새코드들 || []).slice();
    const 있음 = new Set(out.map((c) => c.toLowerCase()));
    (이전코드들 || []).forEach((c) => {
      if (쓰는.has(필름ID(c)) && !있음.has(c.toLowerCase())) { out.push(c); 있음.add(c.toLowerCase()); }
    });
    return out;
  }

  return { 필름코드들: 필름코드들, 필름자재목록: 필름자재목록, 남길코드들: 남길코드들, 필름ID: 필름ID, 기본단가: 기본단가 };
});
