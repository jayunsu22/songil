/* 견적요청 입력 화면 v2 (2026-10-18).
   카톡 견적요청을 세 단계로 받아 적는다.
     ① 품목: 필름현장관리자 품목설정(문+틀·샤시·가구·몰딩·기타, 방2문+틀 …)에서 한꺼번에 체크
     ② 사진·옵션: 고른 품목만 정산견적처럼 줄로 - 시공범위·샤시 종류·길이(m)·필름·난이도, 줄마다 사진
     ③ 합산·메모: 에어테이블 시공품목정보 식으로 합산 (RequestPrice) + 부가항목 + 부가메모
   [방문견적에 넣기] 를 누르면 줄들이 방문견적의 '직접 입력' 품목이 되고(사진도 그 품목에),
   발행은 평소대로 방문견적에서 한다 → 견적서에 사진, 현장관리 앱에 발행내역이 남는다.

   quote_pro.js 뒤에 로드된다. 그 파일의 전역(state, MASTER, PDB, $, toast, save, load, esc, won,
   현장ID확보, buildAll, refresh, persist, 구역장수갱신, 저장함에담기, 업체키, 사진가능 ...)을 쓴다.
   요청 내용은 state.요청 에 둔다 → 자동저장·저장함·서버 백업을 그대로 탄다.
     state.요청 = { 접수일시, 원문(고른 품목 이름 - 현장관리 앱 내역 요약용), 거래처ID, 거래처명,
                    줄: [{ id, 품목명, 시공범위, 샤시종류, 길이, m, 필름ID, 난이도 }], 부가: {항목명: 금액|'포함'},
                    필름추가: [{코드, 단가}], 메모 } */

const 요청구역 = '__요청__';                       // 아직 품목에 안 붙인 카톡 사진이 머무는 자리
const 요청마스터_LS = 'quote_req_master_v1';       // 관리자 품목·단가표·시공품목정보 (마지막으로 받은 것)
const 요청단가_LS = 'quote_req_fixed_v1';          // 표에 없는 품목에 사장님이 정한 단가 {품목명: {인건비단가, m}}
const 요청묶음들 = ['문+틀', '샤시', '가구', '몰딩', '기타'];
const 만원 = 10000;
let 요청M = null;              // { 시공품목, 단가표, 품목정보 }
let 요청탭 = '품목';
let 요청묶음 = '문+틀';
// ① 카테고리(한 줄) 아래 구역 칩으로 '문+틀 → 방4' 처럼 바로 좁힌다 - 방1 문을 고르다 방4 문까지 내려가지 않게.
// 구역 칩은 그 카테고리에 품목이 있는 구역만 (관리자 앱 품목설정의 구역 칸 그대로 - 2층 거실 등)
let 요청구역칩 = '전체';        // '전체' = 안 좁힘
const 요청구역순서 = ['거실', '주방', '현관', '방1', '방2', '방3', '방4', '방5', '기타'];
// 관리자 앱 일괄품목 설정의 구역 탭 색과 같은 순서
const 요청구역색 = [
  ['#dbeafe', '#1e40af'], ['#dcfce7', '#166534'], ['#fef3c7', '#92400e'], ['#fce7f3', '#9d174d'], ['#ede9fe', '#5b21b6'],
  ['#ffe4e6', '#9f1239'], ['#cffafe', '#155e75'], ['#fef9c3', '#854d0e'], ['#e0e7ff', '#3730a3'], ['#d1fae5', '#065f46'],
];
let 요청사진 = [];             // 지금 현장의 사진 (썸네일 URL 포함)
const 요청고른사진 = new Set();
let 요청디비대상 = null;       // 시공사진 고르기 창의 대상 줄
const 요청디비고름 = new Set();
let 요청디비목록 = [];

/* ---------- 데이터 ---------- */

const 요청줄들 = () => (state.요청 && state.요청.줄) || [];
const 요청품목 = (이름) => ((요청M && 요청M.시공품목) || []).find((p) => p.품목명 === 이름) || null;
const 요청고정 = () => load(요청단가_LS) || {};
const 요청묶음of = (p) => (요청묶음들.indexOf(p.카테고리) >= 0 ? p.카테고리 : '기타');

function 요청필름목록() {
  const 기본 = ((요청M && 요청M.단가표) || []).filter((r) => r.구분 === '자재단가')
    .map((r) => ({ id: r.id, 이름: r.항목명, 단가: r.단가 || RequestPrice.기본필름단가 }));
  const 추가 = ((state.요청 && state.요청.필름추가) || [])
    .map((f) => ({ id: 'film:' + f.코드, 이름: f.코드, 단가: Number(f.단가) || RequestPrice.기본필름단가 }));
  return 기본.concat(추가);
}
const 요청필름 = (id) => 요청필름목록().find((f) => f.id === id) || null;

function 요청줄계산(줄) {
  // 직접 입력 줄: 표 계산 없이 적은 인건비·자재비 그대로 (방문견적 직접 입력과 같다)
  if (줄.직접) {
    const 인 = Math.round(Number(줄.인건비) || 0), 자 = Math.round(Number(줄.자재비) || 0);
    return { 기준: null, 길이: null, 필름m: 0, 인건비: 인, 자재비: 자, 합: 인 + 자, 문제: null, 필름ID: '', 필름없음: false };
  }
  const p = 요청품목(줄.품목명) || { 품목명: 줄.품목명 };
  const f = 요청필름(줄.필름ID);
  const r = RequestPrice.줄계산(p, 줄, (요청M && 요청M.품목정보) || [], 요청고정(), f ? f.단가 : null);
  return Object.assign(r, { 필름ID: 줄.필름ID, 필름없음: !f });
}

function 요청부가목록() {
  return ((요청M && 요청M.단가표) || []).filter((r) => r.구분 === '부가항목').map((r) => r.항목명);
}
// 정산견적과 같은 선택지: 식대 포함/1~20만, 퀵·택배 1~10만(5천), 그 밖 1~10만
function 요청부가선택지(이름) {
  const n = String(이름 || '');
  const 범위 = (a, b, s) => { const out = []; for (let v = a; v <= b + 1e-9; v += s) out.push(Math.round(v)); return out; };
  if (n.includes('식대')) return { 포함: true, 값들: 범위(만원, 20 * 만원, 만원) };
  if (n.includes('퀵') || n.includes('택배')) return { 포함: false, 값들: 범위(만원, 10 * 만원, 0.5 * 만원) };
  return { 포함: false, 값들: 범위(만원, 10 * 만원, 만원) };
}
const 요청만원 = (v) => (v % 만원 === 0 ? (v / 만원) + '만원' : Math.floor(v / 만원) + '만' + ((v % 만원) / 1000) + '천원');

function 요청합계() {
  const 결과 = 요청줄들().map((줄) => Object.assign({ 줄: 줄 }, 요청줄계산(줄)));
  const 부가 = Object.values((state.요청 && state.요청.부가) || {}).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
  const 인건비 = 결과.reduce((s, r) => s + r.인건비, 0);
  const 자재비 = 결과.reduce((s, r) => s + r.자재비, 0);
  return { 결과: 결과, 인건비: 인건비, 자재비: 자재비, 부가: 부가, 총액: 인건비 + 자재비 + 부가, 필름별: RequestPrice.필름별합계(결과) };
}

function 요청저장() {
  if (state.요청) state.요청.원문 = 요청줄들().map((x) => x.품목명).join(', ');
  persist();
}

/* ---------- 서버 ---------- */

async function 요청마스터받기() {
  const 캐시 = load(요청마스터_LS);
  if (캐시 && 캐시.시공품목) 요청M = 캐시;
  try {
    const res = await fetch(CONFIG.requestMasterUrl);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    if (!j || !Array.isArray(j.시공품목) || !j.시공품목.length) throw new Error('빈 응답');
    요청M = j;
    save(요청마스터_LS, j);
    return true;
  } catch (e) {
    if (!요청M) toast('품목 목록을 못 받았습니다 (' + (e.message || e) + ')');
    return false;
  }
}

// 정한 단가는 서버(단어장 웹훅, '단가:품목명' 열쇠)에도 둔다 - 폰을 바꿔도 남게
async function 요청단가받기() {
  const 키 = 업체키();
  if (!키) return;
  try {
    const res = await fetch(CONFIG.wordbookUrl + '?key=' + encodeURIComponent(키));
    if (!res.ok) return;
    const j = await res.json();
    const 받은 = {};
    Object.keys((j && j.단어장) || {}).forEach((k) => {
      if (k.indexOf('단가:') !== 0) return;
      try { 받은[k.slice(3)] = JSON.parse(j.단어장[k]); } catch (e) { /* 깨진 값은 건너뛴다 */ }
    });
    save(요청단가_LS, Object.assign({}, 받은, 요청고정()));
  } catch (e) { /* 폰에 있는 것으로 */ }
}

async function 요청단가올리기(품목명, 값) {
  const 키 = 업체키();
  if (!키) return;
  try {
    await fetch(CONFIG.wordbookUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 키, 단어장: { ['단가:' + 품목명]: JSON.stringify(값) } }),
    });
  } catch (e) { /* 폰에는 저장됐다 */ }
}

/* ---------- 열기·닫기 ---------- */

async function 요청시트열기() {
  if (!state.요청) {
    state.요청 = { 접수일시: new Date().toISOString(), 원문: '', 거래처ID: (state.업체 && state.업체.id) || '', 거래처명: (state.업체 && state.업체.이름) || '' };
  }
  if (!Array.isArray(state.요청.줄)) state.요청.줄 = [];
  if (!state.요청.부가) state.요청.부가 = {};
  요청저장();
  $('#reqBack').hidden = false;
  $('#reqSheet').hidden = false;
  $('#reqSite').value = state.현장명 || '';
  $('#reqVendor').textContent = state.요청.거래처명 ? '🏢 ' + state.요청.거래처명 : '';
  $('#reqMemo').value = state.요청.메모 || '';
  요청바그리기();
  await 요청사진읽기();
  if (!요청M) { const 캐시 = load(요청마스터_LS); if (캐시 && 캐시.시공품목) 요청M = 캐시; }
  요청탭바꾸기(요청탭);
  요청마스터받기().then(() => { if (!$('#reqSheet').hidden) 요청그리기(); });
  요청단가받기().then(() => { if (!$('#reqSheet').hidden && 요청탭 !== '품목') 요청그리기(); });
}

function 요청시트닫기() {
  $('#reqBack').hidden = true;
  $('#reqSheet').hidden = true;
  요청사진비우기();
  요청바그리기();
}

/* 본 화면 맨 위 '견적요청' 띠. 요청으로 시작한 견적이면 언제든 입력 화면으로 돌아갈 수 있게 */
function 요청바그리기() {
  const bar = $('#reqBar');
  if (!bar) return;
  const 요 = state.요청;
  bar.hidden = !요;
  if (!요) return;
  const d = new Date(요.접수일시 || Date.now());
  $('#reqBarText').textContent = '📝 견적요청 · ' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ' 접수' +
    (요.거래처명 ? ' · ' + 요.거래처명 : '');
}

function 요청탭바꾸기(탭) {
  요청탭 = 탭;
  document.querySelectorAll('#reqTabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === 탭));
  $('#reqPaneItems').hidden = 탭 !== '품목';
  $('#reqPaneLines').hidden = 탭 !== '옵션';
  $('#reqPaneSum').hidden = 탭 !== '합산';
  $('#reqItemsBar').hidden = 탭 !== '품목';
  $('#reqLinesBar').hidden = 탭 !== '옵션';
  $('#reqSumBar').hidden = 탭 !== '합산';
  $('#reqSheet .req-body').scrollTop = 0;
  요청그리기();
}

function 요청그리기() {
  if (요청탭 === '품목') 요청품목그리기();
  else if (요청탭 === '옵션') 요청줄그리기();
  else 요청합산그리기();
  요청탭숫자();
}

function 요청탭숫자() {
  const n = 요청줄들().length;
  const 미지정 = 요청미지정사진().length;
  $('#reqTabItems').textContent = '① 품목 ' + n;
  $('#reqTabLines').textContent = '② 사진·옵션' + (미지정 ? ' · 📷' + 미지정 : '');
  $('#reqTabSum').textContent = '③ 합산' + (n ? ' ' + won(요청합계().총액) : '');
}

/* ---------- ① 품목 ---------- */

// 구역 정렬: 거실·주방·현관·방1~5·기타, 그 뒤 2층 구역들 (층 → 같은 순서)
function 요청구역키(구역) {
  const m = String(구역 || '').match(/^(\d+)층\s*(.*)$/);
  const 층 = m ? Number(m[1]) : 1;
  const 방 = m ? m[2] : String(구역 || '기타');
  const i = 요청구역순서.indexOf(방);
  return 층 * 100 + (i < 0 ? 요청구역순서.length : i);
}
function 요청구역들(목록) {
  return [...new Set(목록.map((p) => p.구역 || '기타'))].sort((a, b) => 요청구역키(a) - 요청구역키(b) || a.localeCompare(b));
}

function 요청칩(글, on, 색, 누름) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'req-chip' + (on ? ' on' : '');
  b.textContent = 글;
  if (색 && !on) { b.style.background = 색[0]; b.style.color = 색[1]; b.style.borderColor = 색[0]; }
  if (색 && on) { b.style.background = 색[1]; b.style.borderColor = 색[1]; }
  b.addEventListener('click', 누름);
  return b;
}

function 요청품목그리기() {
  const 목록 = (요청M && 요청M.시공품목) || [];
  $('#reqItemsEmpty').hidden = 목록.length > 0;
  const 고른 = new Set(요청줄들().map((x) => x.품목명));
  const 몇개 = (arr) => arr.filter((p) => 고른.has(p.품목명)).length;
  const 맨위로 = () => { $('#reqSheet .req-body').scrollTop = 0; };
  const 다시 = () => { 요청품목그리기(); 맨위로(); };

  const cc = $('#reqCats');
  const zc = $('#reqZones');
  cc.textContent = '';
  zc.textContent = '';
  const 전체구역 = 요청구역들(목록);
  const 색of = (z) => 요청구역색[전체구역.indexOf(z) % 요청구역색.length];

  // 카테고리: 글자만 한 줄 (같은 폭)
  요청묶음들.forEach((k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = k === 요청묶음 ? 'on' : '';
    b.textContent = k;
    b.addEventListener('click', () => { 요청묶음 = k; 요청구역칩 = '전체'; 다시(); });
    cc.appendChild(b);
  });
  const 묶 = 목록.filter((p) => 요청묶음of(p) === 요청묶음);
  const 직접들 = 요청줄들().filter((x) => x.직접 && x.카테고리 === 요청묶음);
  const 구역들 = 요청구역들(묶.concat(직접들.map((x) => ({ 구역: x.구역 }))));
  if (요청구역칩 !== '전체' && 구역들.indexOf(요청구역칩) < 0) 요청구역칩 = '전체';
  zc.appendChild(요청칩('전체', 요청구역칩 === '전체', null, () => { 요청구역칩 = '전체'; 다시(); }));
  구역들.forEach((z) => {
    const 몇 = 몇개(묶.filter((p) => (p.구역 || '기타') === z)) + 직접들.filter((x) => x.구역 === z).length;
    zc.appendChild(요청칩(z + (몇 ? ' ✓' + 몇 : ''), 요청구역칩 === z, 색of(z), () => { 요청구역칩 = z; 다시(); }));
  });
  // 맨 끝: 방문견적처럼 표에 없는 건을 금액으로 바로 적는 '직접 입력'
  const 추가 = 요청칩('＋ 직접 입력', false, null, () => 요청직접열기(null));
  추가.classList.add('add');
  zc.appendChild(추가);
  const 보일 = 묶.filter((p) => 요청구역칩 === '전체' || (p.구역 || '기타') === 요청구역칩);

  const box = $('#reqItemList');
  box.textContent = '';
  보일.forEach((p) => {
    const on = 고른.has(p.품목명);
    const k = RequestPrice.기준(p, {}, 요청M.품목정보, 요청고정());
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'req-item' + (on ? ' on' : '');
    const 설명 = !k ? '단가 정해야 함'
      : (k.단위 === 'm' ? '길이 · ' + k.소모율 + 'm/m' : (k.기본m != null ? k.기본m + 'm/개' : ''));
    row.innerHTML = '<span class="req-ck">' + (on ? '✓' : '') + '</span><b>' + esc(p.품목명) + '</b>' +
      '<small class="' + (k ? '' : 'bad') + '">' + esc(설명) + '</small>';
    row.addEventListener('click', () => 요청품목토글(p));
    box.appendChild(row);
  });
  직접들.filter((x) => 요청구역칩 === '전체' || x.구역 === 요청구역칩).forEach((x) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'req-item on direct';
    row.innerHTML = '<span class="req-ck">✓</span><b>' + esc(x.품목명) + '</b><small>직접 · ' + won((Number(x.인건비) || 0) + (Number(x.자재비) || 0)) + '</small>';
    row.addEventListener('click', () => 요청직접열기(x));
    box.appendChild(row);
  });
  $('#reqItemsCount').textContent = '고른 품목 ' + 요청줄들().length + '개';
}

/* ---------- 직접 입력 (방문견적 '직접 입력' 과 같은 칸) ---------- */
let 요청직접편집 = null;   // 고치는 줄 (null = 새로)
let 요청직접ID = null;     // 이 창에서 붙이는 사진의 태그 (새로 만들 때도 미리 정해 둔다)

function 요청직접열기(줄) {
  요청직접편집 = 줄;
  요청직접ID = 줄 ? 줄.id : 'rq' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const 구역들 = 요청구역들((요청M && 요청M.시공품목) || []);
  const 기본구역 = 줄 ? 줄.구역 : (요청구역칩 !== '전체' ? 요청구역칩 : (구역들[0] || '기타'));
  const sel = $('#reqCustomZone');
  sel.innerHTML = 구역들.concat(구역들.indexOf(기본구역) < 0 ? [기본구역] : [])
    .map((z) => '<option value="' + esc(z) + '"' + (z === 기본구역 ? ' selected' : '') + '>' + esc(z) + '</option>').join('');
  $('#reqCustomTitle').textContent = (줄 ? '직접 입력 고치기' : '직접 입력') + ' · ' + (줄 ? 줄.카테고리 : 요청묶음);
  $('#reqCustomName').value = 줄 ? 줄.품목명 : '';
  $('#reqCustomWage').value = 줄 ? QuoteCalc.금액포맷(String(줄.인건비 || 0)) : '';
  $('#reqCustomMat').value = 줄 ? QuoteCalc.금액포맷(String(줄.자재비 || 0)) : '';
  $('#reqCustomDesc').value = 줄 ? (줄.설명 || '') : '';
  $('#reqCustomDel').hidden = !줄;
  요청직접합계();
  요청직접사진그리기();
  $('#reqCustomBack').hidden = false;
  $('#reqCustomSheet').hidden = false;
}

function 요청직접합계() {
  const 인 = QuoteCalc.금액파싱($('#reqCustomWage').value);
  const 자 = QuoteCalc.금액파싱($('#reqCustomMat').value);
  $('#reqCustomSum').textContent = (isFinite(인) || isFinite(자))
    ? '합계 ' + won((isFinite(인) ? 인 : 0) + (isFinite(자) ? 자 : 0)) : '합계 —';
}

function 요청직접닫기() {
  $('#reqCustomBack').hidden = true;
  $('#reqCustomSheet').hidden = true;
  요청직접편집 = null;
  요청직접ID = null;
  // 저장하지 않고 닫았으면 이 창에서 붙인 사진은 ② 의 '안 붙인 사진' 으로 남는다 (지우지 않는다)
  요청그리기();
}

/* 직접 입력 창의 사진: 이 항목에 붙은 사진 (누르면 뗀다) */
function 요청직접사진그리기() {
  const box = $('#reqCustomPhotos');
  if (!box) return;
  box.textContent = '';
  const 사진들 = 요청사진.filter((p) => (p.태그 || []).indexOf(요청직접ID) >= 0);
  $('#reqCustomPhotoHint').textContent = 사진들.length ? 사진들.length + '장 · 누르면 뗍니다' : '사진이 없습니다';
  사진들.forEach((p) => {
    const m = document.createElement('button');
    m.type = 'button';
    m.className = 'req-mini';
    m.style.backgroundImage = 'url("' + p._url + '")';
    m.addEventListener('click', async () => {
      if (!confirm('이 사진을 뗄까요?')) return;
      try { await PDB.태그저장(p.id, []); await PDB.필드저장(p.id, { 구역: 요청구역 }); } catch (e) { return; }
      await 요청사진읽기();
      요청직접사진그리기();
    });
    box.appendChild(m);
  });
}

async function 요청직접사진넣기(files) {
  if (!files.length || !요청직접ID) return;
  if (!사진가능) { toast('이 브라우저에서는 사진을 쓸 수 없습니다.'); return; }
  const id = 요청직접ID;
  const 실패 = [];
  for (const f of files) {
    try {
      const p = await PDB.추가(현장ID확보(), 요청구역, f);
      await PDB.태그저장(p.id, [id]);
    } catch (err) { 실패.push(await 사진실패이유(err, f)); }
  }
  await 요청사진읽기();
  요청직접사진그리기();
  toast(실패.length ? 실패.length + '장 실패 · ' + 실패[0] : '사진 ' + files.length + '장 붙였습니다');
}

function 요청직접저장() {
  const 이름 = ($('#reqCustomName').value || '').trim();
  const 인 = QuoteCalc.금액파싱($('#reqCustomWage').value);
  const 자 = QuoteCalc.금액파싱($('#reqCustomMat').value);
  if (!이름) { toast('품목명을 적어 주세요'); return; }
  if (!isFinite(인) && !isFinite(자)) { toast('인건비나 자재비 중 하나는 적어 주세요'); return; }
  const 값 = {
    직접: true, 카테고리: 요청직접편집 ? 요청직접편집.카테고리 : 요청묶음,
    구역: $('#reqCustomZone').value, 품목명: 이름,
    인건비: isFinite(인) ? Math.round(인) : 0, 자재비: isFinite(자) ? Math.round(자) : 0,
    설명: ($('#reqCustomDesc').value || '').trim(),
  };
  if (요청직접편집) Object.assign(요청직접편집, 값);
  else 요청줄들().push(Object.assign({ id: 요청직접ID }, 값));
  요청저장();
  요청직접닫기();
}

function 요청직접삭제() {
  const 줄 = 요청직접편집;
  if (!줄 || !confirm('‘' + 줄.품목명 + '’ 을(를) 지울까요?')) return;
  state.요청.줄 = 요청줄들().filter((x) => x !== 줄);
  요청저장();
  요청직접닫기();
}

function 요청품목토글(p) {
  const 줄들 = 요청줄들();
  const i = 줄들.findIndex((x) => x.품목명 === p.품목명);
  if (i >= 0) 줄들.splice(i, 1);
  else {
    const 첫필름 = 요청필름목록()[0];
    줄들.push({
      id: 'rq' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      품목명: p.품목명,
      시공범위: RequestPrice.is문(p) ? RequestPrice.시공범위들[0] : undefined,
      샤시종류: RequestPrice.is샤시(p) ? RequestPrice.샤시종류들[0] : undefined,
      필름ID: 첫필름 ? 첫필름.id : '',
      난이도: 1,
    });
  }
  요청저장();
  요청품목그리기();
  요청탭숫자();
}

/* ---------- ② 사진·옵션 ---------- */

function 요청사진비우기() {
  요청사진.forEach((p) => { if (p._url) URL.revokeObjectURL(p._url); });
  요청사진 = [];
}

async function 요청사진읽기() {
  요청사진비우기();
  if (!사진가능) return;
  try { 요청사진 = await PDB.현장사진(현장ID확보()); } catch (e) { 사진못씀(e); 요청사진 = []; }
  요청사진.forEach((p) => { p._url = URL.createObjectURL(p.thumb || p.blob); });
  const 있는 = new Set(요청사진.map((p) => p.id));
  [...요청고른사진].forEach((id) => { if (!있는.has(id)) 요청고른사진.delete(id); });
}

// 아직 어느 줄에도 안 붙은 카톡 사진 (줄을 빼서 떨어진 사진 포함)
function 요청미지정사진() {
  const ids = new Set(요청줄들().map((x) => x.id));
  return 요청사진.filter((p) => p.구역 === 요청구역 && !(p.태그 || []).some((t) => ids.has(t)));
}

const 요청줄사진 = (줄) => 요청사진.filter((p) => (p.태그 || []).indexOf(줄.id) >= 0);

async function 요청사진넣기(files) {
  if (!files.length) return;
  if (!사진가능) { toast('이 브라우저에서는 사진을 쓸 수 없습니다.'); return; }
  toast('사진 ' + files.length + '장 넣는 중…');
  const 실패 = [];
  for (const f of files) {
    try { await PDB.추가(현장ID확보(), 요청구역, f); }
    catch (err) { 실패.push(await 사진실패이유(err, f)); }
  }
  await 요청사진읽기();
  요청그리기();
  toast(실패.length ? 실패.length + '장 실패 · ' + 실패[0] : '사진 ' + files.length + '장 넣었습니다 · 사진을 고른 뒤 줄의 [붙이기]');
}

async function 요청사진붙이기(줄) {
  const ids = [...요청고른사진];
  if (!ids.length) return;
  try {
    for (const id of ids) await PDB.태그저장(id, [줄.id]);
  } catch (e) { toast('사진을 붙이지 못했습니다.'); return; }
  요청고른사진.clear();
  await 요청사진읽기();
  요청그리기();
}

async function 요청사진떼기(p) {
  try { await PDB.태그저장(p.id, []); await PDB.필드저장(p.id, { 구역: 요청구역 }); } catch (e) { return; }
  await 요청사진읽기();
  요청그리기();
}

function 요청선택지(값들, 현재, 글) {
  return 값들.map((v) => '<option value="' + esc(v) + '"' + (String(v) === String(현재) ? ' selected' : '') + '>' + esc(글 ? 글(v) : v) + '</option>').join('');
}

function 요청줄그리기() {
  // 위: 아직 안 붙인 카톡 사진
  const 미지정 = 요청미지정사진();
  const g = $('#reqLoose');
  g.textContent = '';
  $('#reqLooseHint').textContent = 미지정.length
    ? '안 붙인 사진 ' + 미지정.length + '장 · 눌러서 고른 뒤 아래 줄의 [＋ 붙이기]'
    : '카톡 사진을 한꺼번에 넣고, 골라서 품목 줄에 붙이세요.';
  미지정.forEach((p) => {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'req-ph' + (요청고른사진.has(p.id) ? ' on' : '');
    d.style.backgroundImage = 'url("' + p._url + '")';
    d.innerHTML = '<span class="req-ck">' + (요청고른사진.has(p.id) ? '✓' : '') + '</span>';
    d.addEventListener('click', () => {
      if (요청고른사진.has(p.id)) 요청고른사진.delete(p.id); else 요청고른사진.add(p.id);
      요청줄그리기();
    });
    g.appendChild(d);
  });

  const box = $('#reqLines');
  box.textContent = '';
  const 줄들 = 요청줄들();
  $('#reqLinesEmpty').hidden = 줄들.length > 0;
  // 구역별로 묶어 보여준다 (정산견적처럼)
  const 구역들 = [];
  줄들.forEach((줄) => {
    const p = 요청품목(줄.품목명);
    const 구역 = 줄.직접 ? (줄.구역 || '기타') : ((p && p.구역) || '기타');
    let 묶 = 구역들.find((x) => x.구역 === 구역);
    if (!묶) { 묶 = { 구역: 구역, 줄들: [] }; 구역들.push(묶); }
    묶.줄들.push(줄);
  });
  구역들.forEach((묶) => {
    box.appendChild(Object.assign(document.createElement('div'), { className: 'req-zh', textContent: 묶.구역 }));
    묶.줄들.forEach((줄) => box.appendChild(요청줄카드(줄)));
  });
  let 합 = 0, m = 0;
  줄들.forEach((줄) => { const r = 요청줄계산(줄); 합 += r.합; m += r.필름m; });
  $('#reqLinesSum').textContent = '필름 ' + (Math.round(m * 10) / 10) + 'm · ' + won(합);
}

/* 줄의 사진 칸: 붙은 사진 · 고른 사진 붙이기 · 시공사진에서 고르기 */
function 요청사진줄(줄) {
  const ph = document.createElement('div');
  ph.className = 'req-phs';
  const 사진들 = 요청줄사진(줄);
  사진들.forEach((p2) => {
    const m = document.createElement('button');
    m.type = 'button';
    m.className = 'req-mini';
    m.style.backgroundImage = 'url("' + p2._url + '")';
    m.title = '눌러서 떼기';
    m.addEventListener('click', () => { if (confirm('이 사진을 이 품목에서 뗄까요?')) 요청사진떼기(p2); });
    ph.appendChild(m);
  });
  if (요청고른사진.size) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'req-db strong';
    b.textContent = '＋ 고른 ' + 요청고른사진.size + '장 붙이기';
    b.addEventListener('click', () => 요청사진붙이기(줄));
    ph.appendChild(b);
  }
  if (!사진들.length && !요청고른사진.size) ph.appendChild(Object.assign(document.createElement('span'), { className: 'req-warn', textContent: '📷 사진 없음' }));
  const db = document.createElement('button');
  db.type = 'button';
  db.className = 'req-db';
  db.textContent = '시공사진';
  db.addEventListener('click', () => 요청디비열기(줄));
  ph.appendChild(db);
  return ph;
}

function 요청줄카드(줄) {
  const p = 요청품목(줄.품목명) || { 품목명: 줄.품목명 };
  const r = 요청줄계산(줄);
  const k = r.기준;
  const 바꿈 = (값) => { Object.assign(줄, 값); 요청저장(); 요청줄그리기(); 요청탭숫자(); };
  const card = document.createElement('div');
  card.className = 'req-line' + (r.문제 || r.필름없음 ? ' bad' : '');

  if (줄.직접) return 요청직접카드(줄, r, card);
  const 단가글 = k ? (k.표이름 === p.품목명 ? '정한 단가' : k.표이름) + ' · ' + won(k.인건비단가) + '/m' : '단가 정해야 함';
  card.innerHTML =
    '<div class="r1"><b>' + esc(줄.품목명) + '</b><small>' + esc(단가글) + '</small>' +
    '<span class="req-amt">' + (r.합 ? won(r.합) : '—') + '</span></div>';

  card.appendChild(요청사진줄(줄));

  if (!k) {
    // 표에 없는 품목: 여기서 단가를 정하면 다음부터 그대로 쓴다
    const f = document.createElement('div');
    f.className = 'req-fixprice';
    f.innerHTML = '<span>단가 정하기</span><input type="number" inputmode="numeric" min="0" step="1000" placeholder="인건비 원/m">' +
      '<input type="number" inputmode="decimal" min="0" step="0.1" placeholder="1개 필름 m"><button type="button">저장</button>';
    const 칸 = f.querySelectorAll('input');
    f.querySelector('button').addEventListener('click', () => {
      const 단가 = Math.round(Number(칸[0].value));
      const mm = Number(칸[1].value);
      if (!(단가 > 0) || !(mm > 0)) { toast('인건비(원/m)와 1개 필름 m 를 넣어 주세요'); return; }
      const 값 = { 인건비단가: 단가, m: mm };
      save(요청단가_LS, Object.assign({}, 요청고정(), { [줄.품목명]: 값 }));
      요청단가올리기(줄.품목명, 값);
      toast('‘' + 줄.품목명 + '’ 단가를 기억했습니다');
      요청줄그리기(); 요청탭숫자();
    });
    card.appendChild(f);
  }

  const opt = document.createElement('div');
  opt.className = 'req-opts';
  if (줄.시공범위 !== undefined && RequestPrice.is문(p)) {
    const s = document.createElement('select');
    s.className = 'req-scope' + (줄.시공범위 !== RequestPrice.시공범위들[0] ? ' part' : '');
    s.innerHTML = 요청선택지(RequestPrice.시공범위들, 줄.시공범위, (v) => '🚪 ' + v);
    // 범위를 바꾸면 그 범위의 기본 m 로 다시 잡는다 (m 를 직접 골랐던 것은 지운다)
    s.addEventListener('change', () => 바꿈({ 시공범위: s.value, m: undefined }));
    opt.appendChild(s);
  }
  const row = document.createElement('div');
  row.className = 'req-two';
  if (k && k.단위 === 'm') {
    // 20m 까지는 0.5m 단위, 그 위는 1m 단위로 100m 까지 (몰딩은 방 하나에 40m 넘게도 나온다)
    const 값들 = [];
    for (let v = 0.5; v <= 20 + 1e-9; v += 0.5) 값들.push(Math.round(v * 10) / 10);
    for (let v = 21; v <= 100; v++) 값들.push(v);
    if (r.길이 != null && 값들.indexOf(r.길이) < 0) 값들.push(r.길이);
    const s = document.createElement('select');
    s.className = 'req-len' + (r.길이 == null ? ' bad' : (줄.길이 == null ? ' guess' : ''));
    s.innerHTML = (r.길이 == null ? '<option value="">길이 고르기</option>' : '') +
      요청선택지(값들.sort((a, b) => a - b), r.길이 == null ? '' : r.길이, (v) => '길이 ' + v + 'm');
    s.addEventListener('change', () => 바꿈({ 길이: s.value === '' ? undefined : Number(s.value) }));
    row.appendChild(s);
  } else if (k) {
    const 값들 = []; for (let v = 0.1; v <= 13 + 1e-9; v += 0.1) 값들.push(Math.round(v * 10) / 10);
    if (r.필름m && 값들.indexOf(r.필름m) < 0) 값들.push(r.필름m);
    const s = document.createElement('select');
    s.className = 'req-len' + (r.문제 ? ' bad' : '');
    s.innerHTML = (r.문제 ? '<option value="">m 고르기</option>' : '') +
      요청선택지(값들.sort((a, b) => a - b), r.문제 ? '' : r.필름m, (v) => '1개 ' + v + 'm');
    s.addEventListener('change', () => 바꿈({ m: s.value === '' ? undefined : Number(s.value) }));
    row.appendChild(s);
  }
  if (줄.샤시종류 !== undefined && RequestPrice.is샤시(p)) {
    const s = document.createElement('select');
    s.className = 'req-kind';
    s.innerHTML = 요청선택지(RequestPrice.샤시종류들, 줄.샤시종류);
    s.addEventListener('change', () => 바꿈({ 샤시종류: s.value }));
    row.appendChild(s);
  }
  const fs = document.createElement('select');
  fs.className = 'req-film' + (r.필름없음 ? ' bad' : '');
  fs.innerHTML = (r.필름없음 ? '<option value="">필름 고르기</option>' : '') +
    요청필름목록().map((f) => '<option value="' + esc(f.id) + '"' + (f.id === 줄.필름ID ? ' selected' : '') + '>' + esc(f.이름) + '</option>').join('');
  fs.addEventListener('change', () => 바꿈({ 필름ID: fs.value }));
  row.appendChild(fs);
  opt.appendChild(row);

  const row2 = document.createElement('div');
  row2.className = 'req-two';
  const ds = document.createElement('select');
  ds.className = 'req-diff';
  ds.innerHTML = 요청선택지(RequestPrice.난이도들, 줄.난이도 || 1, (v) => '난이도 ' + Number(v).toFixed(1));
  ds.addEventListener('change', () => 바꿈({ 난이도: Number(ds.value) }));
  row2.appendChild(ds);
  if (k) row2.appendChild(Object.assign(document.createElement('span'), {
    className: 'req-calc',
    textContent: (r.길이 != null ? r.길이 + 'm × ' + k.소모율 + ' = ' : '') + '필름 ' + r.필름m + 'm',
  }));
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'req-del';
  del.textContent = '빼기';
  del.addEventListener('click', () => {
    state.요청.줄 = 요청줄들().filter((x) => x !== 줄);
    요청저장(); 요청줄그리기(); 요청탭숫자();
  });
  row2.appendChild(del);
  opt.appendChild(row2);
  card.appendChild(opt);
  return card;
}

/* ② 직접 입력 줄: 적은 금액과 사진만 (옵션 없음). 고치기는 ① 과 같은 창 */
function 요청직접카드(줄, r, card) {
  card.innerHTML =
    '<div class="r1"><b>' + esc(줄.품목명) + '</b><small>직접 입력 · 인건비 ' + won(r.인건비) + ' · 자재비 ' + won(r.자재비) + '</small>' +
    '<span class="req-amt">' + won(r.합) + '</span></div>';
  card.appendChild(요청사진줄(줄));
  const row = document.createElement('div');
  row.className = 'req-two';
  row.appendChild(Object.assign(document.createElement('span'), { className: 'req-calc', textContent: 줄.설명 || '' }));
  const fix = document.createElement('button');
  fix.type = 'button'; fix.className = 'req-del'; fix.textContent = '고치기';
  fix.addEventListener('click', () => 요청직접열기(줄));
  row.appendChild(fix);
  const del = document.createElement('button');
  del.type = 'button'; del.className = 'req-del'; del.textContent = '빼기';
  del.addEventListener('click', () => { state.요청.줄 = 요청줄들().filter((x) => x !== 줄); 요청저장(); 요청줄그리기(); 요청탭숫자(); });
  row.appendChild(del);
  card.appendChild(row);
  return card;
}

/* ---------- ③ 합산·메모 ---------- */

function 요청합산그리기() {
  const h = 요청합계();
  const L = [];
  h.결과.forEach((r) => {
    L.push('<div class="req-sr' + (r.문제 || r.필름없음 ? ' bad' : '') + '"><span>' + esc(r.줄.품목명) +
      '<small>' + (r.줄.직접 ? '직접 입력 · 인건비 ' + won(r.인건비) : r.문제 === '단가없음' ? '단가 정해야 함' : r.문제 ? '길이·m 를 골라야 함' : '필름 ' + r.필름m + 'm · 인건비 ' + won(r.인건비)) + '</small></span>' +
      '<b>' + won(r.합) + '</b></div>');
  });
  $('#reqSumLines').innerHTML = L.join('') || '<p class="hint">① 에서 품목을 고르세요.</p>';
  $('#reqSumFilms').innerHTML = h.필름별.map((f) => {
    const 필름 = 요청필름(f.필름ID);
    return '<div class="req-sr"><span>' + esc(필름 ? 필름.이름 : '?') + '<small>' + f.m + 'm × ' + won(필름 ? 필름.단가 : 0) + '</small></span><b>' + won(f.금액) + '</b></div>';
  }).join('') + '<div class="req-sr total"><span>인건비 합</span><b>' + won(h.인건비) + '</b></div>';

  // 필름 추가 (현장 필름 번호)
  const fa = $('#reqFilmAdd');
  fa.textContent = '';
  ((state.요청 && state.요청.필름추가) || []).forEach((f, i) => {
    const row = document.createElement('div');
    row.className = 'req-sr';
    row.innerHTML = '<span>' + esc(f.코드) + '<small>이 견적에서 추가한 필름 · 원/m</small></span>';
    const inp = document.createElement('input');
    inp.type = 'number'; inp.inputMode = 'numeric'; inp.step = '500'; inp.value = f.단가; inp.className = 'req-price';
    inp.addEventListener('change', () => { f.단가 = Math.max(0, Math.round(Number(inp.value) || 0)) || RequestPrice.기본필름단가; 요청저장(); 요청합산그리기(); 요청탭숫자(); });
    row.appendChild(inp);
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'req-del'; x.textContent = '✕';
    x.addEventListener('click', () => {
      if (요청줄들().some((줄) => 줄.필름ID === 'film:' + f.코드)) { toast('이 필름을 쓰는 줄이 있어 뺄 수 없습니다'); return; }
      state.요청.필름추가.splice(i, 1); 요청저장(); 요청합산그리기();
    });
    row.appendChild(x);
    fa.appendChild(row);
  });

  // 부가 항목
  const ex = $('#reqExtras');
  ex.textContent = '';
  요청부가목록().forEach((이름) => {
    const 선택지 = 요청부가선택지(이름);
    const 값 = state.요청.부가[이름];
    const row = document.createElement('div');
    row.className = 'req-sr';
    row.innerHTML = '<span>' + esc(이름) + '</span>';
    const s = document.createElement('select');
    s.className = 'req-extra';
    s.innerHTML = '<option value="">없음</option>' + (선택지.포함 ? '<option value="포함"' + (값 === '포함' ? ' selected' : '') + '>인건비 포함</option>' : '') +
      선택지.값들.map((v) => '<option value="' + v + '"' + (값 === v ? ' selected' : '') + '>' + 요청만원(v) + '</option>').join('');
    s.addEventListener('change', () => {
      if (s.value === '') delete state.요청.부가[이름];
      else state.요청.부가[이름] = s.value === '포함' ? '포함' : Number(s.value);
      요청저장(); 요청합산그리기(); 요청탭숫자();
    });
    row.appendChild(s);
    ex.appendChild(row);
  });
  $('#reqTotal').textContent = won(h.총액);
  $('#reqTotalSub').textContent = '인건비 ' + won(h.인건비) + ' · 자재비 ' + won(h.자재비) + (h.부가 ? ' · 부가 ' + won(h.부가) : '');
}

function 요청경고() {
  const out = [];
  요청합계().결과.forEach((r) => {
    if (r.문제 === '단가없음') out.push('‘' + r.줄.품목명 + '’ 단가를 정해야 합니다');
    else if (r.문제) out.push('‘' + r.줄.품목명 + '’ 길이·m 를 골라야 합니다');
    else if (r.필름없음) out.push('‘' + r.줄.품목명 + '’ 필름을 골라야 합니다');
  });
  const n = 요청미지정사진().length;
  if (n) out.push('품목에 안 붙인 사진 ' + n + '장');
  return out;
}

/* 방문견적 쪽 구역 이름으로 (관리자 품목 구역이 방문견적에 없으면 전체공통) */
function 요청방문구역(구역) {
  const zs = ((MASTER && MASTER.zones) || []).map((z) => z.구역);
  if (zs.indexOf(구역) >= 0) return 구역;
  return zs.indexOf('전체공통') >= 0 ? '전체공통' : (zs[0] || '기타');
}

/* [방문견적에 넣기] - 줄들을 방문견적의 직접 입력 품목으로. 사진은 줄 id = 품목 id 라 그대로 따라간다 */
async function 요청넣기() {
  const 경고 = 요청경고();
  if (경고.length && !confirm(경고.join('\n') + '\n\n이대로 넣을까요? (금액이 안 나온 줄은 빠집니다)')) return;
  const h = 요청합계();
  const 남길 = (state.직접품목 || []).filter((c) => String(c.id).indexOf('rq') !== 0);
  const 새 = [];
  h.결과.forEach((r) => {
    if (!r.합) return;
    const 줄 = r.줄;
    if (줄.직접) {
      새.push({ id: 줄.id, 구역: 요청방문구역(줄.구역), 품목명: 줄.품목명, 인건비: r.인건비, 자재비: r.자재비, 금액: r.합, 설명: 줄.설명 || '' });
      return;
    }
    const p = 요청품목(줄.품목명) || {};
    const 필름 = 요청필름(줄.필름ID);
    const 덧 = [];
    if (줄.시공범위 && 줄.시공범위 !== RequestPrice.시공범위들[0]) 덧.push(줄.시공범위);
    if (줄.샤시종류) 덧.push(줄.샤시종류);
    새.push({
      id: 줄.id,
      구역: 요청방문구역(p.구역),
      품목명: 줄.품목명 + (덧.length ? ' (' + 덧.join(' · ') + ')' : ''),
      인건비: r.인건비, 자재비: r.자재비, 금액: r.합,
      설명: [(r.길이 != null ? '길이 ' + r.길이 + 'm' : ''), '필름 ' + (필름 ? 필름.이름 + ' ' : '') + r.필름m + 'm',
        (줄.난이도 && 줄.난이도 !== 1 ? '난이도 ' + Number(줄.난이도).toFixed(1) : '')].filter(Boolean).join(' · '),
    });
  });
  Object.keys(state.요청.부가 || {}).forEach((이름, i) => {
    const v = state.요청.부가[이름];
    if (typeof v !== 'number' || !v) return;
    새.push({ id: 'rqx' + i, 구역: 요청방문구역('전체공통'), 품목명: 이름, 인건비: 0, 자재비: v, 금액: v, 설명: '' });
  });
  if (!새.length) { toast('넣을 품목이 없습니다'); return; }
  state.직접품목 = 남길.concat(새);
  // 사진을 그 품목의 구역으로 옮긴다 (태그는 이미 줄 id = 품목 id)
  for (const c of 새) {
    for (const p of 요청사진.filter((x) => (x.태그 || []).indexOf(c.id) >= 0)) {
      try { await PDB.필드저장(p.id, { 구역: c.구역 }); } catch (e) { /* 구역만 못 옮겨도 견적서에는 나간다 */ }
    }
  }
  if (state.요청.메모) { state.메모 = state.요청.메모; $('#memoText').value = state.메모; }
  state.요청.넣음 = new Date().toISOString();
  요청저장();
  buildAll();
  구역장수갱신();
  refresh();
  요청시트닫기();
  toast('견적요청 ' + 새.length + '개 품목을 넣었습니다 · 확인 후 [견적서 발행]');
}

/* ---------- 시공사진에서 고르기 ---------- */

async function 요청디비열기(줄) {
  요청디비대상 = 줄;
  요청디비고름.clear();
  요청디비목록 = [];
  $('#reqDbTitle').textContent = '‘' + 줄.품목명 + '’ 시공사진에서 고르기';
  $('#reqDbStatus').textContent = '불러오는 중…';
  $('#reqDbStatus').hidden = false;
  $('#reqDbGrid').textContent = '';
  $('#reqDbBack').hidden = false;
  $('#reqDbSheet').hidden = false;
  요청디비버튼();
  const 낱말 = RequestPrice.찾을낱말(줄.품목명);
  const p = 요청품목(줄.품목명);
  const 구역 = (p && p.구역) || '';
  try {
    const res = await fetch(CONFIG.workPhotosUrl + '?q=' + encodeURIComponent(낱말));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    // 같은 품목명 → 같은 구역 → 나머지 순
    const 점수 = (x) => (x.시공품목 === 줄.품목명 ? 2 : 0) + (String(x.시공품목).indexOf(구역) === 0 ? 1 : 0);
    요청디비목록 = ((j && j.사진) || []).slice().sort((a, b) => 점수(b) - 점수(a));
  } catch (e) {
    $('#reqDbStatus').textContent = '시공사진을 못 받았습니다 (' + (e.message || e) + ')';
    return;
  }
  if (요청디비대상 !== 줄) return;
  $('#reqDbStatus').hidden = 요청디비목록.length > 0;
  $('#reqDbStatus').textContent = '‘' + 낱말 + '’ 시공사진이 없습니다.';
  요청디비그리기();
}

function 요청디비그리기() {
  const g = $('#reqDbGrid');
  g.textContent = '';
  요청디비목록.forEach((p, i) => {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'req-ph' + (요청디비고름.has(i) ? ' on' : '');
    d.style.backgroundImage = 'url("' + p.썸네일 + '")';
    d.innerHTML = '<span class="req-ba">' + esc(p.전후) + '</span><span class="req-ck">' + (요청디비고름.has(i) ? '✓' : '') + '</span>' +
      '<span class="req-lab">' + esc(p.시공품목 || '') + '<br>' + esc((p.현장명 || '').slice(0, 12)) + '</span>';
    d.addEventListener('click', () => {
      if (요청디비고름.has(i)) 요청디비고름.delete(i); else 요청디비고름.add(i);
      요청디비그리기();
      요청디비버튼();
    });
    g.appendChild(d);
  });
}

function 요청디비버튼() {
  const n = 요청디비고름.size;
  $('#reqDbAdd').disabled = !n;
  $('#reqDbAdd').textContent = n ? n + '장 붙이기' : '사진을 고르세요';
}

/* 고른 시공사진을 폰 사진으로 복사해 그 줄에 붙인다. 첨부 주소는 몇 시간 뒤 만료되므로
   주소를 저장하지 않고 이미지를 받아 둔다 - 그러면 견적서에 싣는 기존 발행 경로를 그대로 탄다. */
async function 요청디비붙이기() {
  const 줄 = 요청디비대상;
  if (!줄) return;
  const 고른 = [...요청디비고름].map((i) => 요청디비목록[i]).filter(Boolean);
  if (!고른.length) return;
  $('#reqDbAdd').disabled = true;
  $('#reqDbAdd').textContent = '받는 중…';
  let 됨 = 0;
  for (const p of 고른) {
    try {
      const res = await fetch(p.url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      await PDB.들여오기(현장ID확보(), 요청구역, blob, { 태그: [줄.id], 출처: '시공사진' });
      됨++;
    } catch (e) { console.warn('시공사진 받기 실패', e); }
  }
  요청디비닫기();
  toast(됨 === 고른.length ? 됨 + '장 붙였습니다' : 됨 + '장 붙임 · ' + (고른.length - 됨) + '장 실패');
  await 요청사진읽기();
  요청그리기();
  if (!$('#reqCustomSheet').hidden) 요청직접사진그리기();
}

function 요청디비닫기() {
  $('#reqDbBack').hidden = true;
  $('#reqDbSheet').hidden = true;
  요청디비대상 = null;
}

/* ---------- 현장관리 앱에서 들어올 때 ----------
   quote_pro.html?req=1&client=<거래처ID>. 새 견적으로 시작하고 그 업체를 골라 둔 채 입력 화면을 연다.
   boot() 끝에서 부른다. 주소의 req 는 바로 지운다 - 새로고침할 때마다 새 견적이 시작되면 안 된다. */
async function 요청진입() {
  요청바그리기();
  const q = new URLSearchParams(location.search);
  if (q.get('req') !== '1') return;
  const 거래처ID = q.get('client') || '';
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* 무시 */ }

  const 하던것 = Object.keys(state.선택 || {}).length || (state.직접품목 || []).length || (state.현장명 || '').trim() || state.요청;
  if (하던것) {
    const ok = await 새견적시작();
    if (!ok) return;
  }
  if (거래처ID) {
    const 찾음 = 업체캐시().목록.find((c) => c.id === 거래처ID);
    if (찾음) state.업체 = 찾음;
    else toast('업체 목록에 이 거래처가 없습니다 · 🏢 업체 선택에서 목록 새로고침');
  }
  state.요청 = {
    접수일시: new Date().toISOString(), 원문: '', 줄: [], 부가: {},
    거래처ID: 거래처ID || (state.업체 && state.업체.id) || '',
    거래처명: (state.업체 && state.업체.이름) || '',
  };
  persist();
  업체줄그리기();
  요청탭 = '품목';
  요청시트열기();
}

/* ---------- 이벤트 ---------- */

document.querySelectorAll('#reqTabs button').forEach((b) => b.addEventListener('click', () => 요청탭바꾸기(b.dataset.tab)));
$('#reqClose').addEventListener('click', 요청시트닫기);
$('#reqBack').addEventListener('click', 요청시트닫기);
$('#reqBarOpen').addEventListener('click', 요청시트열기);
$('#reqSite').addEventListener('input', () => {
  state.현장명 = $('#reqSite').value;
  $('#siteName').value = state.현장명;
  요청저장();
});
$('#reqMemo').addEventListener('input', () => { if (state.요청) { state.요청.메모 = $('#reqMemo').value; 요청저장(); } });
$('#reqAdd').addEventListener('click', () => { $('#reqFile').value = ''; $('#reqFile').click(); });
$('#reqFile').addEventListener('change', () => 요청사진넣기(Array.from($('#reqFile').files || [])));
$('#reqToLines').addEventListener('click', () => 요청탭바꾸기('옵션'));
$('#reqToSum').addEventListener('click', () => 요청탭바꾸기('합산'));
$('#reqSave').addEventListener('click', () => { 요청저장(); 저장함에담기(); });
$('#reqApply').addEventListener('click', 요청넣기);
$('#reqFilmNew').addEventListener('click', () => {
  const 코드 = (prompt('추가할 필름 번호 (예: 영림207)', '') || '').trim();
  if (!코드) return;
  if (!state.요청.필름추가) state.요청.필름추가 = [];
  if (요청필름목록().some((f) => f.이름.toLowerCase() === 코드.toLowerCase())) { toast('이미 있는 필름입니다'); return; }
  state.요청.필름추가.push({ 코드: 코드, 단가: RequestPrice.기본필름단가 });
  요청저장();
  요청합산그리기();
  toast('‘' + 코드 + '’ 추가 · 단가 9,000원 (고칠 수 있음) · ② 줄에서 고르세요');
});
$('#reqCustomClose').addEventListener('click', 요청직접닫기);
$('#reqCustomBack').addEventListener('click', 요청직접닫기);
$('#reqCustomSave').addEventListener('click', 요청직접저장);
$('#reqCustomDel').addEventListener('click', 요청직접삭제);
$('#reqCustomAdd').addEventListener('click', () => { $('#reqCustomFile').value = ''; $('#reqCustomFile').click(); });
$('#reqCustomFile').addEventListener('change', () => 요청직접사진넣기(Array.from($('#reqCustomFile').files || [])));
$('#reqCustomDb').addEventListener('click', () => {
  // 시공사진은 적어 둔 품목명으로 찾는다 (비었으면 카테고리 이름으로)
  const 이름 = ($('#reqCustomName').value || '').trim() || (요청직접편집 ? 요청직접편집.카테고리 : 요청묶음);
  요청디비열기({ id: 요청직접ID, 품목명: 이름, 직접: true });
});
['#reqCustomWage', '#reqCustomMat'].forEach((id) => $(id).addEventListener('input', () => {
  const el = $(id);
  const 새값 = QuoteCalc.금액포맷(el.value);
  if (새값 !== el.value) el.value = 새값;
  요청직접합계();
}));
$('#reqDbClose').addEventListener('click', 요청디비닫기);
$('#reqDbBack').addEventListener('click', 요청디비닫기);
$('#reqDbAdd').addEventListener('click', 요청디비붙이기);

// 캐시된 단가로 boot() 가 이 파일보다 먼저 돌았으면 여기서 진입을 마저 한다
if (MASTER) 요청진입();
