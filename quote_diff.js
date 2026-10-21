/* 가견적 ↔ 실제견적 품목별 비교 (2026-10-21, 견적서 시안 C).
   실제견적서(견적종류 '실제견적')는 비교견적코드로 가견적을 가리킨다. 견적서 화면이 둘을 받아
   맨 위에 '가견적과 달라진 품목' 표를 그리고, 품목 카드에 변경·신규 표시를 붙인다.
   품목은 체크_ID 로 짝짓는다 - 방문견적이 가견적을 불러와 고쳐도 체크_ID 는 그대로 남는다
   (직접 입력·고객 추가 품목도 quote_box 발행을상태로 가 원래 체크_ID 를 지킨다).
   화면·네트워크에 손대지 않는 순수 모듈. node 테스트: test/quote_diff.test.js */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QuoteDiff = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 체크_ID 가 없는 예전 줄은 구역+이름으로 짝짓는다
  function 키(l) {
    return l && l.체크_ID ? 'id:' + l.체크_ID : 'nm:' + (l && l.구역) + '|' + (l && l.품목명);
  }
  // '샤시1 (샤시(2중창))' → { 이름: '샤시1', 종류: '2중창' }
  function 나누기(품목명) {
    const t = String(품목명 || '');
    const i = t.indexOf(' (');
    if (i < 0 || !/\)$/.test(t)) return { 이름: t, 종류: '' };
    const 안 = t.slice(i + 2, -1);
    const m = 안.match(/^[^(]*\((.+)\)$/);
    return { 이름: t.slice(0, i), 종류: m ? m[1] : 안.replace(/샤시$/, '') || 안 };
  }
  const 수량글 = (l) => (l.수량 === '' || l.수량 == null) ? '' : String(l.수량) + (l.단위 || '');

  // 왜 금액이 바뀌었는지 (자동). 못 알아내면 '금액 조정'
  function 이유(전, 후) {
    const out = [];
    const a = 나누기(전.품목명), b = 나누기(후.품목명);
    if (a.이름 === b.이름 && a.종류 !== b.종류 && (a.종류 || b.종류)) out.push('종류 ' + (a.종류 || '기본') + ' → ' + (b.종류 || '기본'));
    else if (a.이름 !== b.이름) out.push('품목 ' + a.이름 + ' → ' + b.이름);
    const q1 = 수량글(전), q2 = 수량글(후);
    if (q1 !== q2 && (q1 || q2)) out.push((후.단위 === 'm' || 전.단위 === 'm' ? '길이 ' : '수량 ') + (q1 || '-') + ' → ' + (q2 || '-'));
    const d1 = Number(전.난이도) || 1, d2 = Number(후.난이도) || 1;
    if (d1 !== d2) out.push('난이도 ' + d1 + ' → ' + d2);
    return out.length ? out : ['금액 조정'];
  }

  /* 가라인들·실라인들: 견적서의 라인들. 금액(l) = 그 줄에 보여줄 금액(인건비 견적서면 인건비 몫).
     돌려줌: { 바뀐: [{ 종류: '변경'|'신규'|'빠짐', 키, 이름, 전, 후, 차이, 이유: [] }], 키별: { 키: 줄 } }
     바뀐 순서: 실제견적서 품목 순서(변경·신규), 그 뒤에 빠진 품목. 금액이 같은 줄은 넣지 않는다. */
  function 비교(가라인들, 실라인들, 금액) {
    금액 = 금액 || ((l) => Number(l.표시금액) || 0);
    const 가맵 = {};
    (가라인들 || []).forEach((l) => { 가맵[키(l)] = l; });
    const 쓴 = {};
    const 바뀐 = [];
    const 키별 = {};
    (실라인들 || []).forEach((l) => {
      const k = 키(l);
      const 전 = 가맵[k];
      if (!전) {
        const r = { 종류: '신규', 키: k, 이름: 나누기(l.품목명).이름, 전: 0, 후: 금액(l), 차이: 금액(l), 이유: ['가견적에 없던 품목'], 줄: l };
        바뀐.push(r); 키별[k] = r;
        return;
      }
      쓴[k] = true;
      const 차이 = 금액(l) - 금액(전);
      if (차이 === 0) return;
      const r = { 종류: '변경', 키: k, 이름: 나누기(l.품목명).이름, 전: 금액(전), 후: 금액(l), 차이: 차이, 이유: 이유(전, l), 줄: l };
      바뀐.push(r); 키별[k] = r;
    });
    (가라인들 || []).forEach((l) => {
      const k = 키(l);
      if (쓴[k]) return;
      바뀐.push({ 종류: '빠짐', 키: k, 이름: 나누기(l.품목명).이름, 구역: l.구역, 수량: 수량글(l), 전: 금액(l), 후: 0, 차이: -금액(l), 이유: ['빠짐'], 줄: l });
    });
    return { 바뀐: 바뀐, 키별: 키별 };
  }

  return { 비교: 비교, 키: 키, 나누기: 나누기, 이유: 이유 };
});
