/* 현장사진 앱.
   거주 중인 집에 방문하면 사진만 빨리 찍고 나와야 한다. 집에 와서 보면 어디서 찍은 건지
   헷갈려서, 사진을 한 장씩 눌러 구역을 고르게 하고 그 사진을 방문견적서(quote_pro)로 넘긴다.

   사진은 방문견적서와 같은 IndexedDB(QuotePhotos.PhotoDB)에 { 현장ID, 구역 } 으로 넣는다.
   견적서로 보낼 때는 옮기지 않고 quote_pro.html?photos=<현장ID> 로 열기만 한다 -
   견적서가 그 현장ID 로 시작하면 구역마다 📷 에 사진이 붙는다.
   판단 로직은 site_photos_core.js(SitePhotosCore). */

const C = SitePhotosCore;
const PDB = QuotePhotos.PhotoDB;
const VISITS_KEY = 'site_photos_visits_v1';    // quote_pro.js 의 사진앱방문KEY 와 같은 키
const MASTER_KEY = 'quote_pro_master_v1';      // 방문견적서가 받아 둔 마스터 (구역 이름)
const MASTER_URL = 'https://primary-production-a6fa.up.railway.app/webhook/pro-master';
const QUOTE_STATE_KEY = 'quote_pro_state_v1';
const QUOTE_BOX_KEY = 'quote_pro_box_v1';

const $ = (s) => document.querySelector(s);

function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 무시 */ }
}
function load(key) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
  catch (e) { return null; }
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ---------- 구역 이름 ----------
   방문견적서 마스터의 구역 이름을 그대로 써야 사진이 그 구역 트레이로 들어간다.
   받아 둔 게 있으면 그걸로 바로 쓰고, 뒤에서 최신을 받는다. */
let 구역들 = C.구역목록(load(MASTER_KEY));

async function 구역받기() {
  try {
    const res = await fetch(MASTER_URL);
    if (!res.ok) return;
    const fresh = await res.json();
    if (!fresh || !Array.isArray(fresh.zones) || !fresh.zones.length) return;
    save(MASTER_KEY, fresh);   // 방문견적서와 같은 캐시. 원본 그대로 넣는다
    구역들 = C.구역목록(fresh);
  } catch (e) { /* 현장에서 신호가 약하면 받아 둔 것으로 */ }
}

/* ---------- 방문 목록 ---------- */
function 방문들() { return load(VISITS_KEY) || []; }
function 방문저장(list) { save(VISITS_KEY, list); }

let 지금방문 = null;     // { 현장ID, 이름, 만든때, 견적연결 }
let 사진들 = [];         // 지금 방문의 사진 (썸네일 URL 포함)
let 보는중 = -1;         // 크게 보는 사진의 자리 (사진들 기준)
let 보기URL = null;

/* objectURL 은 다 쓰면 풀어준다. 안 풀면 사진을 열 때마다 메모리가 쌓여 폰이 느려진다. */
const 목록URL = [];
function 목록URL비우기() { while (목록URL.length) URL.revokeObjectURL(목록URL.pop()); }

async function 목록그리기() {
  목록URL비우기();
  const list = 방문들();
  const wrap = $('#visits');
  wrap.textContent = '';
  $('#noVisits').hidden = list.length > 0;
  for (const v of list) {
    let ps = [];
    try { ps = await PDB.현장사진(v.현장ID); } catch (e) { 사진못씀(e); return; }
    const 미정 = C.미정수(ps);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'visit';
    let 그림 = '<span class="noimg">📷</span>';
    if (ps.length) {
      const u = URL.createObjectURL(ps[ps.length - 1].thumb);
      목록URL.push(u);
      그림 = '<img alt="" src="' + u + '">';
    }
    b.innerHTML = 그림 +
      '<span class="vi"><b>' + esc(v.이름) + '</b>' +
      '<small>사진 ' + ps.length + '장' +
      (미정 ? '<span class="badge">구역 미정 ' + 미정 + '</span>' : '') +
      (v.견적연결 ? ' · <span class="sent">견적서 연결됨</span>' : '') +
      '</small></span>';
    b.addEventListener('click', () => 방문열기(v.현장ID));
    wrap.appendChild(b);
  }
}

function 새방문() {
  const 이름 = prompt('현장 이름 (주소·단지명 등)', C.기본이름());
  if (이름 === null) return;
  const v = {
    현장ID: QuotePhotos.새현장ID(),
    이름: 이름.trim() || C.기본이름(),
    만든때: new Date().toISOString(),
  };
  방문저장(C.방문넣기(방문들(), v));
  방문열기(v.현장ID);
}

/* ---------- 현장 한 곳 ---------- */
async function 방문열기(현장ID) {
  지금방문 = 방문들().find((v) => v.현장ID === 현장ID) || null;
  if (!지금방문) { 목록보기(); return; }
  $('#listView').hidden = true;
  $('#visitView').hidden = false;
  $('#visitName').textContent = 지금방문.이름;
  window.scrollTo(0, 0);
  await 사진그리기();
}

function 목록보기() {
  지금방문 = null;
  사진비우기();
  $('#visitView').hidden = true;
  $('#listView').hidden = false;
  목록그리기();
}

function 사진비우기() {
  사진들.forEach((p) => { if (p._url) URL.revokeObjectURL(p._url); });
  사진들 = [];
}

async function 사진읽기() {
  사진비우기();
  try {
    사진들 = await PDB.현장사진(지금방문.현장ID);
  } catch (e) {
    사진못씀(e);
    사진들 = [];
  }
}

async function 사진그리기() {
  await 사진읽기();
  const wrap = $('#groups');
  wrap.textContent = '';
  $('#noPhotos').hidden = 사진들.length > 0;
  const 미정 = C.미정수(사진들);
  $('#todo').hidden = !미정;
  $('#todo').textContent = '구역을 안 정한 사진이 ' + 미정 + '장 있습니다. 사진을 눌러 구역을 고르세요.';

  C.구역별묶기(사진들, 구역들).forEach((g) => {
    const sec = document.createElement('div');
    sec.className = 'group' + (g.구역 === C.미정 ? ' unset' : '');
    sec.innerHTML = '<h2>' + esc(g.구역 === C.미정 ? '구역 미정' : g.구역) + ' <small>' + g.사진들.length + '장</small></h2>';
    const grid = document.createElement('div');
    grid.className = 'grid';
    g.사진들.forEach((p) => {
      p._url = p._url || URL.createObjectURL(p.thumb);
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<img alt="" src="' + p._url + '">';
      b.addEventListener('click', () => 보기열기(사진들.indexOf(p)));
      grid.appendChild(b);
    });
    sec.appendChild(grid);
    wrap.appendChild(sec);
  });
}

function 이름바꾸기() {
  const 새이름 = prompt('현장 이름', 지금방문.이름);
  if (새이름 === null || !새이름.trim()) return;
  지금방문.이름 = 새이름.trim();
  방문저장(방문들().map((v) => (v.현장ID === 지금방문.현장ID ? 지금방문 : v)));
  $('#visitName').textContent = 지금방문.이름;
}

/* 방문견적서가 이 현장의 사진을 쓰고 있는가 (지금 작성 중이거나 저장함에 담김) */
function 견적에서쓰는중(현장ID) {
  const st = load(QUOTE_STATE_KEY);
  if (st && st.현장ID === 현장ID) return true;
  return (load(QUOTE_BOX_KEY) || []).some((x) => x.현장ID === 현장ID);
}

async function 방문지우기() {
  const n = 사진들.length;
  const 쓰는중 = 견적에서쓰는중(지금방문.현장ID);
  const 말 = '‘' + 지금방문.이름 + '’ 을(를) 지울까요?' +
    (n ? '\n사진 ' + n + '장도 폰에서 지워집니다.' : '') +
    (쓰는중 && n ? '\n\n⚠️ 방문견적서에서 이 사진을 쓰고 있습니다. 견적서의 사진도 같이 사라집니다.' : '');
  if (!confirm(말)) return;
  try { await PDB.현장삭제(지금방문.현장ID); } catch (e) { toast('사진을 지우지 못했습니다.'); return; }
  방문저장(방문들().filter((v) => v.현장ID !== 지금방문.현장ID));
  toast('지웠습니다');
  목록보기();
}

function 견적서로보내기() {
  if (!사진들.length) { toast('사진이 없습니다.'); return; }
  const 미정 = C.미정수(사진들);
  if (미정 && !confirm('구역을 안 정한 사진이 ' + 미정 + '장 있습니다.\n이 사진들은 방문견적서에서 안 보입니다.\n\n그래도 보낼까요?')) return;
  location.href = '/quote_pro.html?photos=' + encodeURIComponent(지금방문.현장ID);
}

/* ---------- 사진 넣기 ---------- */
let 촬영구역 = C.미정;   // 카메라에서 골라 둔 구역. 기본은 미정 - 현장에서는 찍기만 한다

async function 사진넣기(file) {
  try {
    await PDB.추가(지금방문.현장ID, 촬영구역, file);
    return null;
  } catch (err) {
    console.warn('사진 넣기 실패', err);
    if (err && err.name === 'QuotaExceededError') return '저장공간이 부족합니다. 지난 현장을 지워주세요.';
    try {
      if (file && await QuotePhotos.HEIC인가(file)) {
        return '고효율(HEIC) 사진이라 열 수 없습니다. ‘촬영’ 으로 찍어주세요.';
      }
    } catch (e) { /* 아래 일반 문구로 */ }
    return '사진을 저장하지 못했습니다.';
  }
}

$('#pickFile').addEventListener('change', async (e) => {
  const files = [...(e.target.files || [])];
  e.target.value = '';
  if (!files.length) return;
  촬영구역 = C.미정;
  toast(files.length + '장 넣는 중…');
  const 이유들 = [];
  for (const f of files) {
    const 이유 = await 사진넣기(f);
    if (이유) 이유들.push(이유);
  }
  await 사진그리기();
  const 성공 = files.length - 이유들.length;
  toast(이유들.length ? (성공 ? 성공 + '장 넣음 · ' : '') + 이유들.length + '장 실패 — ' + 이유들[0] : 성공 + '장 넣었습니다');
});

$('#camFile').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const 이유 = await 사진넣기(f);
  await 사진그리기();
  if (이유) toast(이유);
});

/* ---------- 인앱 카메라 ----------
   폰 기본 카메라를 거치면 한 장마다 앱 전환·확인이 들어간다. 셔터만 연달아 누르게 한다. */
let 스트림 = null;
let 이번촬영 = 0;

function 카메라구역그리기() {
  const w = $('#camZones');
  w.textContent = '';
  [C.미정].concat(구역들).forEach((z) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = (z === C.미정 ? 'unset' : '') + (z === 촬영구역 ? ' on' : '');
    b.textContent = z === C.미정 ? '구역 미정' : z;
    b.addEventListener('click', () => { 촬영구역 = z; 카메라구역그리기(); });
    w.appendChild(b);
  });
}

async function 카메라열기() {
  촬영구역 = C.미정;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('#camFile').click(); return; }
  try {
    스트림 = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  } catch (e) {
    toast('카메라를 열 수 없어 폰 카메라로 넘어갑니다.');
    $('#camFile').click();
    return;
  }
  이번촬영 = 0;
  $('#camCount').textContent = '0장';
  카메라구역그리기();
  const v = $('#camVideo');
  v.srcObject = 스트림;
  await v.play().catch(() => {});
  $('#camSheet').hidden = false;
}

function 카메라닫기() {
  // 트랙을 안 끄면 카메라 표시등이 계속 켜져 있고 배터리를 먹는다
  if (스트림) { 스트림.getTracks().forEach((t) => t.stop()); 스트림 = null; }
  $('#camVideo').srcObject = null;
  $('#camSheet').hidden = true;
  사진그리기();
}

let 셔터중 = false;
$('#camShot').addEventListener('click', async () => {
  const v = $('#camVideo');
  if (!v.videoWidth || 셔터중) return;
  셔터중 = true;
  try {
    const cv = document.createElement('canvas');
    cv.width = v.videoWidth;
    cv.height = v.videoHeight;
    cv.getContext('2d').drawImage(v, 0, 0);
    if (navigator.vibrate) navigator.vibrate(30);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.92));
    if (!blob) { toast('사진을 만들지 못했습니다.'); return; }
    const 이유 = await 사진넣기(blob);
    if (이유) { toast(이유); return; }
    이번촬영 += 1;
    $('#camCount').textContent = 이번촬영 + '장';
  } finally {
    셔터중 = false;
  }
});

/* ---------- 크게 보기 + 구역 고르기 ---------- */
function 보기열기(i) {
  if (i < 0 || i >= 사진들.length) return;
  보는중 = i;
  $('#viewer').hidden = false;
  보기그리기();
}

function 보기그리기() {
  const p = 사진들[보는중];
  if (!p) { 보기닫기(); return; }
  if (보기URL) URL.revokeObjectURL(보기URL);
  보기URL = URL.createObjectURL(p.blob);
  $('#vwImg').src = 보기URL;
  $('#vwPos').textContent = (보는중 + 1) + ' / ' + 사진들.length + (C.미정인가(p) ? ' · 구역 미정' : ' · ' + p.구역);
  $('#vwPrev').disabled = 보는중 === 0;
  $('#vwNext').disabled = 보는중 >= 사진들.length - 1;

  const w = $('#vwZones');
  w.textContent = '';
  [C.미정].concat(구역들).forEach((z) => {
    const b = document.createElement('button');
    b.type = 'button';
    const 지금 = C.미정인가(p) ? C.미정 : p.구역;
    b.className = (z === C.미정 ? 'unset' : '') + (z === 지금 ? ' on' : '');
    b.textContent = z === C.미정 ? '미정' : z;
    b.addEventListener('click', () => 구역정하기(z));
    w.appendChild(b);
  });
  // 목록에 없는 구역(마스터에서 이름이 바뀐 경우)도 지금 값은 보여준다
  if (!C.미정인가(p) && 구역들.indexOf(p.구역) < 0) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'on';
    b.textContent = p.구역;
    w.appendChild(b);
  }
}

async function 구역정하기(z) {
  const p = 사진들[보는중];
  if (!p) return;
  const 미정이었음 = C.미정인가(p);
  try {
    await PDB.필드저장(p.id, { 구역: z });
  } catch (e) {
    toast('저장하지 못했습니다.');
    return;
  }
  p.구역 = z;
  if (z === C.미정) { 보기그리기(); return; }
  // 미정 사진을 정리하는 중이면 다음 미정 사진으로 넘긴다. 다 끝나면 닫는다.
  // 이미 정해 둔 사진을 고친 거면 그 자리에 둔다.
  if (미정이었음) {
    const 다음 = C.다음미정(사진들, 보는중);
    if (다음 < 0) {
      toast('모든 사진의 구역을 정했습니다 ✓');
      보기닫기();
      return;
    }
    보는중 = 다음;
  }
  보기그리기();
}

async function 보기삭제() {
  const p = 사진들[보는중];
  if (!p || !confirm('이 사진을 지울까요?')) return;
  try { await PDB.삭제(p.id); } catch (e) { toast('지우지 못했습니다.'); return; }
  if (p._url) URL.revokeObjectURL(p._url);
  사진들.splice(보는중, 1);
  if (!사진들.length) { 보기닫기(); return; }
  if (보는중 >= 사진들.length) 보는중 = 사진들.length - 1;
  보기그리기();
}

function 보기닫기() {
  $('#viewer').hidden = true;
  if (보기URL) { URL.revokeObjectURL(보기URL); 보기URL = null; }
  $('#vwImg').removeAttribute('src');
  보는중 = -1;
  if (지금방문) 사진그리기();
}

// 좌우로 밀어서 넘기기
let 밀기시작 = null;
$('#vwImg').addEventListener('touchstart', (e) => { 밀기시작 = e.touches[0].clientX; }, { passive: true });
$('#vwImg').addEventListener('touchend', (e) => {
  if (밀기시작 === null) return;
  const dx = e.changedTouches[0].clientX - 밀기시작;
  밀기시작 = null;
  if (Math.abs(dx) < 50) return;
  const i = 보는중 + (dx < 0 ? 1 : -1);
  if (i >= 0 && i < 사진들.length) { 보는중 = i; 보기그리기(); }
});

/* ---------- 사진 못 쓰는 브라우저 (시크릿 모드 등) ---------- */
let 경고함 = false;
function 사진못씀(e) {
  console.warn('사진 기능을 쓸 수 없습니다:', e);
  if (경고함) return;
  경고함 = true;
  alert('이 브라우저에서는 사진을 저장할 수 없습니다.\n시크릿 모드라면 일반 창으로 열어주세요.');
}

/* ---------- 이벤트 ---------- */
$('#newVisit').addEventListener('click', 새방문);
$('#backList').addEventListener('click', 목록보기);
$('#renameVisit').addEventListener('click', 이름바꾸기);
$('#delVisit').addEventListener('click', 방문지우기);
$('#toQuote').addEventListener('click', 견적서로보내기);
$('#shootBtn').addEventListener('click', 카메라열기);
$('#albumBtn').addEventListener('click', () => $('#pickFile').click());
$('#camClose').addEventListener('click', 카메라닫기);
$('#vwClose').addEventListener('click', 보기닫기);
$('#vwDel').addEventListener('click', 보기삭제);
$('#vwPrev').addEventListener('click', () => { if (보는중 > 0) { 보는중--; 보기그리기(); } });
$('#vwNext').addEventListener('click', () => { if (보는중 < 사진들.length - 1) { 보는중++; 보기그리기(); } });

// 뒤로가기 버튼으로 앱이 통째로 닫히지 않게: 현장 화면에서는 목록으로
window.addEventListener('popstate', () => {
  if (!$('#viewer').hidden) { 보기닫기(); history.pushState(null, ''); return; }
  if (!$('#camSheet').hidden) { 카메라닫기(); history.pushState(null, ''); return; }
  if (지금방문) { 목록보기(); history.pushState(null, ''); }
});
history.pushState(null, '');

// 견적을 내고 몇 달 뒤 시공하기도 해서, 폰 저장공간이 부족해도 크롬이 사진을 지우지 않게 한다
PDB.영구요청();
목록그리기();
구역받기().then(() => { if (지금방문 && $('#viewer').hidden && $('#camSheet').hidden) 사진그리기(); });
