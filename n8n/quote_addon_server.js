/* n8n 워크플로우 '현장견적_추가견적'(GoLuUuLo5H7OsI5J) 의 '추가_계산' 코드 노드 원본 (2026-10-21).
   n8n 에 붙여 넣어 쓴다 - 여기를 고치면 n8n 코드 노드에도 다시 넣을 것.
   계산 함수가 quote_addon.js 와 같은지는 test/quote_addon_server.test.js 가 본다. */
// quote_addon.js (songil) 의 계산 함수와 같아야 한다 - 그 파일의 줄만들기·새총액을 고치면 여기도 고칠 것
const 허용표 = ['샤시(단창)','샤시(2중창)','시스템샤시','상가샤시(한쪽시공)','상가샤시(양쪽시공)','싱크대','싱크대 상부장','싱크대 하부장','터닝도어','현관문','중문','방문','화장실문','세탁실문','실외기실문','신발장','수납장','냉장고장','붙박이장','아트월','화장대'];
const A = {
  허용표: 허용표,
  표맵: (행들) => { const m = {}; (행들 || []).forEach((r) => { if (r && r.시공_품목명) m[r.시공_품목명] = r; }); return m; },
  자재비찾기: (라인들) => { const l = (라인들 || []).find((x) => x && x.직접금액 == null && !x.고객추가 && typeof x.자재비단가 === 'number' && x.자재비단가 > 0); return l ? l.자재비단가 : null; },
  줄만들기: (줄, s, 율, 자재비단가, id, 일시) => {
    const m단위 = 줄.견적단위 === 'm';
    const 길이 = Math.round(Number(s.길이) * 10) / 10;
    const 수량 = m단위 ? (길이 >= 0.5 && 길이 <= 30 ? 길이 : null) : 1;
    if (수량 == null) return null;
    const 인건비단가 = Number(줄.인건비단가) || 0;
    const 자재 = 자재비단가 != null ? 자재비단가 : (Number(줄.자재비단가) || 9000);
    const 소모 = (Number(줄.자재소모량) || 0) * (s.한쪽 ? 0.5 : 1);
    const 라인금액 = Math.round((인건비단가 + 자재) * 소모 * 수량);
    const 인건비금액 = Math.round(인건비단가 * 소모 * 수량);
    const r = Number(율) || 0;
    return { 체크_ID: id || '', 구역: '고객님 추가 품목', 품목명: String(s.이름 || 줄.시공_품목명).slice(0, 40),
      수량: 수량, 단위: m단위 ? 'm' : (줄.견적단위 || '개'), 인건비단가: 인건비단가, 자재비단가: 자재, 자재소모량: 소모, 난이도: 1,
      라인금액: 라인금액, 표시금액: Math.round(라인금액 * (1 + r)), 인건비금액: 인건비금액, 인건비표시금액: Math.round(인건비금액 * (1 + r)),
      품목설명: '', 고객추가: true, 추가일시: 일시 || '' };
  },
  절삭했나: (원래, 원래총액) => { const S = (원래 || []).reduce((s, l) => s + (Number(l.표시금액) || 0), 0); const 총 = Number(원래총액) || 0; return 총 % 10000 === 0 && S - 총 >= 0 && S - 총 < 10000; },
  새총액: (원래, 추가들, 절삭) => { const n = (원래 || []).concat(추가들 || []).reduce((s, l) => s + (Number(l.표시금액) || 0), 0); return 절삭 ? Math.floor(n / 10000) * 10000 : n; },
};
const F = (r) => (r && r.fields) ? Object.assign({ id: r.id }, r.fields) : (r || {});
const 행들 = (name) => $(name).all().map(i => i.json).filter(r => r && (r.id || r.fields)).map(F);
const 파싱 = (s, 기본) => { try { const v = JSON.parse(s || ''); return v == null ? 기본 : v; } catch (e) { return 기본; } };
const won = (n) => Math.round(n || 0).toLocaleString('ko-KR') + '원';
const 글 = (s) => String(s == null ? '' : s).replace(/[<>&]/g, '');
const 실패 = (error) => [{ json: { ok: false, error: error } }];

const b = $('pro-addon').first().json.body || {};
const 견적 = 행들('견적_조회');
if (!견적.length) return 실패('not_found');
const q = 견적[0];
const 원래 = 파싱(q['견적_스냅샷'], []);
let meta = 파싱(q['고객_추가품목'], null);
// 처음 추가할 때 원래 총액·소계·절삭 여부를 남긴다 - 총액을 고친 뒤에는 다시 알아낼 수 없다
if (!meta || !Array.isArray(meta.줄들)) {
  meta = { 절삭: A.절삭했나(원래, q['총액']), 원래총액: q['총액'] || 0, 원래소계: q['소계'] || 0, 줄들: [] };
}
const 지금 = new Date().toISOString();
let 바뀐, 종류;
if (b.삭제) {
  const i = meta.줄들.findIndex((l) => l.체크_ID === String(b.삭제));
  if (i < 0) return 실패('no_line');
  바뀐 = meta.줄들.splice(i, 1)[0];
  종류 = '삭제';
} else {
  const s = b.추가 || {};
  if (A.허용표.indexOf(s.표이름) < 0) return 실패('bad_item');
  if (meta.줄들.length >= 20) return 실패('too_many');
  const 줄 = A.표맵(행들('시공품목정보 조회'))[s.표이름];
  if (!줄) return 실패('bad_item');
  // 금액은 여기서 다시 계산한다 - 화면이 보낸 금액은 받지 않는다
  바뀐 = A.줄만들기(줄, { 길이: s.길이, 한쪽: !!s.한쪽, 이름: 글(s.이름) }, Number(q['조정_합계율']) || 0,
    A.자재비찾기(원래), 'add' + Date.now().toString(36), 지금);
  if (!바뀐) return 실패('bad_length');
  meta.줄들.push(바뀐);
  종류 = '추가';
}
const 이전총액 = Number(q['총액']) || 0;
const 총액 = A.새총액(원래, meta.줄들, meta.절삭);
const 소계 = (Number(meta.원래소계) || 0) + meta.줄들.reduce((s, l) => s + (l.라인금액 || 0), 0);

const g = 행들('가맹점_조회')[0] || {};
const 링크 = 'https://songil.netlify.app/q/' + (q['견적코드'] || '');
const 품목글 = 글(바뀐.품목명) + (바뀐.단위 === 'm' ? ' ' + 바뀐.수량 + 'm' : '') + ' · ' + won(바뀐.표시금액);
const text = [
  종류 === '추가' ? '<b>[견적서 고객 추가]</b>' : '<b>[고객 추가품목 삭제]</b>',
  '현장: ' + 글(q['현장명'] || '(미입력)'),
  (종류 === '추가' ? '추가: ' : '삭제: ') + 품목글,
  '합계: ' + won(이전총액) + ' → <b>' + won(총액) + '</b>',
  '고객 추가 품목 ' + meta.줄들.length + '개',
  '',
  '견적서: ' + 링크,
].join('\n');

return [{ json: {
  ok: true, record_id: q.id, 고객_추가품목: JSON.stringify(meta), 총액: 총액, 소계: 소계,
  chat_id: g['텔레그램_챗ID'] || '', text: text, should_telegram: !!g['텔레그램_챗ID'],
  should_push: !!g['웹푸시_구독정보'], push_subscription: g['웹푸시_구독정보'] || '{}',
  push_title: '견적서 고객 추가', push_body: 글(q['현장명'] || '현장') + ' · ' + 품목글, push_url: 링크,
} }];
