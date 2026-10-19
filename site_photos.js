/* 현장사진 앱.
   거주 중인 집에 방문하면 사진만 빨리 찍고 나와야 한다. 현장에서는 구역만 골라 찍고,
   집에 와서 사진을 보면서 품목을 고른 뒤 방문견적서(quote_pro)로 넘긴다.
   품목은 방문견적서와 같은 방식으로 사진의 태그(체크_ID 목록)에 넣는다 -
   견적서가 열리면서 태그된 품목을 체크한다.

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
// 현장에서 추가한 구역 이름 (모든 현장 공용). 한 번 만든 '보일러실' 을 다음 현장에서도 누르기만 하면 되게
const CUSTOM_ZONES_KEY = 'site_photos_custom_zones_v1';

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
let 마스터 = load(MASTER_KEY);
let 구역들 = C.구역목록(마스터);

async function 구역받기() {
  try {
    const res = await fetch(MASTER_URL);
    if (!res.ok) return;
    const fresh = await res.json();
    if (!fresh || !Array.isArray(fresh.zones) || !fresh.zones.length) return;
    save(MASTER_KEY, fresh);   // 방문견적서와 같은 캐시. 원본 그대로 넣는다
    마스터 = fresh;
    구역들 = C.구역목록(fresh);
  } catch (e) { /* 현장에서 신호가 약하면 받아 둔 것으로 */ }
}

/* ---------- 방문 목록 ---------- */
function 방문들() { return load(VISITS_KEY) || []; }
function 방문저장(list) { save(VISITS_KEY, list); }
function 지금방문저장() {
  방문저장(방문들().map((v) => (v.현장ID === 지금방문.현장ID ? 지금방문 : v)));
}

let 지금방문 = null;     // { 현장ID, 이름, 만든때, 평형, 유형(주택|상가), 구역설정, 견적연결 } (예전: 추가구역)
let 사진들 = [];         // 지금 방문의 사진 (썸네일 URL 포함)
let 보는중 = -1;         // 크게 보는 사진의 자리 (사진들 기준)
let 보기URL = null;

/* ---------- 구역설정 ----------
   이 현장에 있는 구역만 골라 둔다. 견적서 구역은 20개 가까이 돼서 촬영 중에 구역 줄을
   밀어 가며 찾기 번거롭다. 고른 구역만 촬영·사진 보기 구역 줄에 나온다 (방문.구역설정).
   현장에 가 보면 견적서 구역에 없는 이상한 공간도 있다(보일러실, 창고방 …). 여기서 이름을
   붙여 추가하고, 집에 와서 견적서 구역으로 옮긴다. 추가한 구역 사진은 견적서에 안 나온다. */
function 모든구역() {
  return C.현장구역(구역들, 지금방문, 사진들);
}

// 지금 설정(없으면 견적서 구역 전부 + 예전에 추가한 구역)을 목록으로
function 설정목록() {
  if (Array.isArray(지금방문.구역설정)) return 지금방문.구역설정.slice();
  return 유형기본().concat(지금방문.추가구역 || []);
}

/* 주택 / 상가. 주택 = 견적서 구역, 상가 = 사장실·탕비실·… (C.상가구역).
   상가 구역은 견적서에 없어서 품목이 없다 - 집에서 견적서 구역으로 옮긴다. */
function 유형기본() { return C.유형구역(지금방문, 구역들); }
// 정해진 구역 이름 (견적서 구역 + 상가 구역). 이 밖의 이름이 '추가한 구역'
function 정해진구역() { return 구역들.concat(C.상가구역.filter((z) => 구역들.indexOf(z) < 0)); }
// 구역 줄에서 보라색(추가한 구역)으로 칠할지
function 추가한구역인가(z) { return !!z && 정해진구역().indexOf(z) < 0; }

function 유형바꾸기(유형) {
  if ((지금방문.유형 || '주택') === 유형) return;
  // 고른 구역은 새 유형 구역 전부로 바꾸고, 켜 둔 추가한 구역은 그대로 둔다
  const 켜둔추가 = 설정목록().filter(추가한구역인가);
  지금방문.유형 = 유형;
  설정저장(유형기본().concat(켜둔추가));
  구역설정그리기();
}

function 설정저장(목록) {
  지금방문.구역설정 = 목록;
  delete 지금방문.추가구역;   // 구역설정으로 합쳤다
  지금방문저장();
}

let 설정닫으면 = null;   // 설정을 닫은 뒤 다시 그릴 화면 (카메라·사진 보기에서 열었을 때)

function 구역설정열기(닫으면) {
  설정닫으면 = 닫으면 || null;
  $('#zoneBack').hidden = false;
  $('#zoneSheet').hidden = false;
  document.body.classList.add('full');
  $('#zsName').value = '';
  구역설정그리기();
}

/* 모든 현장 공용 '추가한 구역' 목록. 처음 한 번은 지금까지 각 현장에서 추가한 이름으로 채운다
   (이 기능 전에 만든 것들). 그 뒤로는 지운 이름이 되살아나지 않게 저장된 목록만 쓴다. */
function 공용구역() {
  const 저장 = load(CUSTOM_ZONES_KEY);
  if (Array.isArray(저장)) return 저장;
  const 모음 = [];
  방문들().forEach((v) => (v.구역설정 || []).concat(v.추가구역 || []).forEach((z) => 모음.push(z)));
  const 처음 = C.추가구역칸(모음, 정해진구역(), []);
  save(CUSTOM_ZONES_KEY, 처음);
  return 처음;
}

function 공용구역더하기(이름) {
  const list = 공용구역();
  if (list.indexOf(이름) < 0) { list.push(이름); save(CUSTOM_ZONES_KEY, list); }
}

function 구역설정그리기() {
  const 목록 = 설정목록();
  // 누르면 이 현장에서 켜고 끈다. 추가한 구역도 끄기만 하면 다른 현장용으로 목록에 남는다
  const 칩 = (z, 켜짐, 추가한것) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = (추가한것 ? 'temp' : '') + (켜짐 ? ' on' : '');
    b.textContent = z;
    b.addEventListener('click', () => {
      const 지금 = 설정목록();
      const i = 지금.indexOf(z);
      if (i >= 0) 지금.splice(i, 1); else 지금.push(z);
      설정저장(지금);
      구역설정그리기();
    });
    return b;
  };
  const 상가 = 지금방문.유형 === '상가';
  $('#zsHouse').classList.toggle('on', !상가);
  $('#zsShop').classList.toggle('on', 상가);
  const M = $('#zsMaster');
  M.textContent = '';
  유형기본().forEach((z) => M.appendChild(칩(z, 목록.indexOf(z) >= 0, false)));
  $('#zsShopHint').hidden = !상가;

  const 추가한 = C.추가구역칸(공용구역(), 정해진구역(), 목록);
  const T = $('#zsCustom');
  T.textContent = '';
  추가한.forEach((z) => {
    const 묶음 = document.createElement('span');
    묶음.className = 'cz';
    묶음.appendChild(칩(z, 목록.indexOf(z) >= 0, true));
    // ✕ = 모든 현장의 목록에서 지우기 (찍어 둔 사진의 구역은 그대로)
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'cz-x';
    x.setAttribute('aria-label', z + ' 목록에서 지우기');
    x.textContent = '✕';
    x.addEventListener('click', () => {
      if (!confirm('‘' + z + '’ 을(를) 추가한 구역 목록에서 지울까요?\n다른 현장에도 안 나옵니다. 찍어 둔 사진은 그대로 남습니다.')) return;
      save(CUSTOM_ZONES_KEY, 공용구역().filter((n) => n !== z));
      설정저장(설정목록().filter((n) => n !== z));
      구역설정그리기();
    });
    묶음.appendChild(x);
    T.appendChild(묶음);
  });
  if (!추가한.length) T.innerHTML = '<p class="none">없음 — 견적서에 없는 공간이면 아래에 이름을 적어 추가하세요.</p>';
  $('#zsCount').textContent = 목록.length + '개 고름';
}

function 구역설정추가() {
  const 이름 = ($('#zsName').value || '').trim();
  if (!이름) { $('#zsName').focus(); return; }
  if (추가한구역인가(이름)) 공용구역더하기(이름);   // 견적서·상가 구역 이름이면 그냥 켜기만
  const 목록 = 설정목록();
  if (목록.indexOf(이름) < 0) 목록.push(이름);
  설정저장(목록);
  $('#zsName').value = '';
  구역설정그리기();
}

function 구역설정닫기() {
  $('#zoneBack').hidden = true;
  $('#zoneSheet').hidden = true;
  // 카메라·사진 보기 위에서 열었으면 그 화면은 아직 전체화면이다
  if ($('#camSheet').hidden && $('#viewer').hidden) document.body.classList.remove('full');
  구역설정버튼글();
  const f = 설정닫으면;
  설정닫으면 = null;
  if (f) f(); else 사진그리기();
}

function 구역설정버튼글() {
  const 상가 = 지금방문 && 지금방문.유형 === '상가';
  $('#zoneBtn').textContent = (상가 ? '🏢 상가' : '🧩 구역설정') +
    (Array.isArray(지금방문 && 지금방문.구역설정) ? ' ' + 지금방문.구역설정.length : '');
}

// 촬영·사진 보기 구역 줄 끝의 [⚙ 구역설정]
function 설정칩(다시그리기) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'add';
  b.textContent = '⚙ 구역설정';
  b.addEventListener('click', () => 구역설정열기(다시그리기));
  return b;
}

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
  $('#sizeSelect').value = 지금방문.평형 || '확인안됨';
  구역설정버튼글();
  촬영구역 = C.미정;     // 앞 현장에서 고른 구역이 남아 있으면 엉뚱한 구역으로 찍힌다
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
  const 임시 = C.임시수(사진들, 구역들);
  const 품목수 = 사진들.filter((p) => !C.미정인가(p) && !C.임시구역인가(p.구역, 구역들) && !(p.태그 || []).length).length;
  if (!미정 && 임시) {
    $('#todo').hidden = false;
    $('#todo').textContent = '견적서에 없는 구역 사진이 ' + 임시 + '장 있습니다. [견적서 구역으로 옮기기] 를 누르세요.';
  } else if (!미정 && 품목수 && 사진들.length) {
    $('#todo').hidden = false;
    $('#todo').textContent = '품목을 안 고른 사진이 ' + 품목수 + '장 있습니다. 사진을 눌러 품목을 고르세요.';
  }

  C.구역별묶기(사진들, 구역들).forEach((g) => {
    const sec = document.createElement('div');
    const 임시구역 = C.임시구역인가(g.구역, 구역들);
    sec.className = 'group' + (g.구역 === C.미정 ? ' unset' : '') + (임시구역 ? ' temp' : '');
    sec.innerHTML = '<h2>' + esc(g.구역 === C.미정 ? '구역 미정' : g.구역) + ' <small>' + g.사진들.length + '장</small>' +
      (임시구역 ? '<span class="temp-tag">견적서에 없는 구역</span>' : '') + '</h2>';
    if (임시구역) {
      const mv = document.createElement('button');
      mv.type = 'button';
      mv.className = 'temp-move';
      mv.textContent = '→ 견적서 구역으로 옮기기';
      mv.addEventListener('click', () => 옮기기열기(g.구역));
      sec.appendChild(mv);
    }
    // 이 구역에서 고른 품목 이름들 (사진 여러 장에 같은 품목이면 한 번만)
    const ids = [];
    g.사진들.forEach((p) => (p.태그 || []).forEach((id) => { if (ids.indexOf(id) < 0) ids.push(id); }));
    const 이름들 = ids.map((id) => C.품목이름(마스터, id)).filter(Boolean);
    if (이름들.length) sec.insertAdjacentHTML('beforeend', '<p class="items-sum">✓ ' + esc(이름들.join(', ')) + '</p>');
    const grid = document.createElement('div');
    grid.className = 'grid';
    g.사진들.forEach((p) => {
      p._url = p._url || URL.createObjectURL(p.thumb);
      const b = document.createElement('button');
      b.type = 'button';
      const n = (p.태그 || []).length;
      b.innerHTML = '<img alt="" src="' + p._url + '">' + (n ? '<span class="cnt">✓' + n + '</span>' : '');
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
  지금방문저장();
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

/* ---------- 추가한 구역 → 견적서 구역으로 한꺼번에 옮기기 ---------- */
let 옮길구역 = null;

function 옮기기열기(z) {
  옮길구역 = z;
  const n = 사진들.filter((p) => p.구역 === z).length;
  $('#moveTitle').textContent = '‘' + z + '’ 사진 ' + n + '장을 어느 구역으로 옮길까요?';
  const w = $('#moveZones');
  w.textContent = '';
  구역들.forEach((t) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t;
    b.addEventListener('click', () => 옮기기(t));
    w.appendChild(b);
  });
  $('#moveBack').hidden = false;
  $('#moveSheet').hidden = false;
}

function 옮기기닫기() {
  옮길구역 = null;
  $('#moveBack').hidden = true;
  $('#moveSheet').hidden = true;
}

async function 옮기기(대상) {
  const z = 옮길구역;
  if (!z) return;
  const 옮길것 = 사진들.filter((p) => p.구역 === z);
  try {
    for (const p of 옮길것) await PDB.필드저장(p.id, { 구역: 대상, 태그: C.구역안태그(p.태그, 마스터, 대상) });
  } catch (e) {
    toast('옮기지 못했습니다.');
    return;
  }
  // 다 옮긴 추가한 구역은 목록에서도 빼고(상가 구역은 다음 사진을 위해 남긴다), 옮겨 간 구역은 구역설정에 넣는다
  const 목록 = 추가한구역인가(z) ? 설정목록().filter((x) => x !== z) : 설정목록();
  if (목록.indexOf(대상) < 0) 목록.push(대상);
  설정저장(목록);
  옮기기닫기();
  toast('‘' + z + '’ ' + 옮길것.length + '장 → ' + 대상);
  await 사진그리기();
}

function 견적서로보내기() {
  if (!사진들.length) { toast('사진이 없습니다.'); return; }
  const 미정 = C.미정수(사진들);
  const 임시 = C.임시수(사진들, 구역들);
  if ((미정 || 임시) && !confirm(
    (미정 ? '구역을 안 정한 사진 ' + 미정 + '장\n' : '') +
    (임시 ? '견적서에 없는 구역(상가·추가한 구역) 사진 ' + 임시 + '장\n' : '') +
    '이 사진들은 방문견적서에서 안 보입니다.\n\n그래도 보낼까요?')) return;
  // 고른 품목은 견적서가 열리면서 체크된다 (quote_pro.js 사진진입)
  location.href = '/quote_pro.html?photos=' + encodeURIComponent(지금방문.현장ID);
}

/* ---------- 사진 넣기 ---------- */
let 촬영구역 = C.미정;   // 카메라에서 골라 둔 구역. 카메라를 닫았다 열어도 같은 현장에서는 그대로

async function 사진넣기(file, 구역) {
  try {
    await PDB.추가(지금방문.현장ID, 구역, file);
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
  toast(files.length + '장 넣는 중…');
  const 이유들 = [];
  for (const f of files) {
    // 앨범 사진은 어디서 찍었는지 모른다. 미정으로 넣고 하나씩 고른다
    const 이유 = await 사진넣기(f, C.미정);
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
  const 이유 = await 사진넣기(f, 촬영구역);
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
  $('#camZoneNow').textContent = 촬영구역 === C.미정 ? '찍을 구역을 고르세요 ↓ (안 골라도 됩니다)' : '📍 ' + 촬영구역 + ' 찍는 중';
  let 켜짐 = null;
  [C.미정].concat(모든구역()).forEach((z) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = (z === C.미정 ? 'unset' : '') + (추가한구역인가(z) ? ' temp' : '') + (z === 촬영구역 ? ' on' : '');
    b.textContent = z === C.미정 ? '구역 미정' : z;
    b.addEventListener('click', () => { 촬영구역 = z; 카메라구역그리기(); });
    if (z === 촬영구역) 켜짐 = b;
    w.appendChild(b);
  });
  w.appendChild(설정칩(카메라구역그리기));
  if (켜짐) 켜짐.scrollIntoView({ block: 'nearest', inline: 'center' });
}

async function 카메라열기() {
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
  document.body.classList.add('full');
}

function 카메라닫기() {
  // 트랙을 안 끄면 카메라 표시등이 계속 켜져 있고 배터리를 먹는다
  if (스트림) { 스트림.getTracks().forEach((t) => t.stop()); 스트림 = null; }
  $('#camVideo').srcObject = null;
  $('#camSheet').hidden = true;
  document.body.classList.remove('full');
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
    const 이유 = await 사진넣기(blob, 촬영구역);
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
  document.body.classList.add('full');
  보기그리기();
}

function 보기그리기() {
  const p = 사진들[보는중];
  if (!p) { 보기닫기(); return; }
  if (보기URL) URL.revokeObjectURL(보기URL);
  보기URL = URL.createObjectURL(p.blob);
  $('#vwImg').src = 보기URL;
  $('#vwPos').textContent = (보는중 + 1) + ' / ' + 사진들.length;
  $('#vwPrev').disabled = 보는중 === 0;
  $('#vwNext').disabled = 보는중 >= 사진들.length - 1;
  패널그리기();
}

/* 구역 줄과 품목 칩만 다시 그린다. 품목을 누를 때마다 사진까지 다시 만들면 깜빡인다. */
function 패널그리기() {
  const p = 사진들[보는중];
  if (!p) return;
  const 지금 = C.미정인가(p) ? C.미정 : p.구역;

  const w = $('#vwZones');
  w.textContent = '';
  let 켜짐 = null;
  [C.미정].concat(모든구역()).forEach((z) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = (z === C.미정 ? 'unset' : '') + (추가한구역인가(z) ? ' temp' : '') + (z === 지금 ? ' on' : '');
    b.textContent = z === C.미정 ? '미정' : z;
    b.addEventListener('click', () => 구역정하기(z));
    if (z === 지금) 켜짐 = b;
    w.appendChild(b);
  });
  w.appendChild(설정칩(패널그리기));
  if (켜짐) 켜짐.scrollIntoView({ block: 'nearest', inline: 'center' });

  const L = $('#vwItems');
  L.textContent = '';
  const 태그 = p.태그 || [];
  $('#vwItemHint').textContent = 태그.length ? '· ' + 태그.length + '개 고름' : '';
  if (지금 === C.미정) {
    L.innerHTML = '<p class="none">구역을 먼저 고르면 그 구역 품목이 나옵니다.</p>';
    return;
  }
  if (C.임시구역인가(지금, 구역들)) {
    L.innerHTML = '<p class="none">‘' + esc(지금) + '’ 은 견적서에 없는 구역이라 품목이 없습니다. 집에서 목록의 [→ 견적서 구역으로 옮기기] 로 옮기면 품목을 고를 수 있습니다.</p>';
    return;
  }
  const items = C.보이는품목(마스터, 지금, 지금방문.평형 || '확인안됨');
  if (!items.length) {
    L.innerHTML = '<p class="none">' + (마스터 ? '이 구역에 고를 품목이 없습니다.' : '품목 목록을 아직 못 받았습니다. 방문견적을 한 번 열어 주세요.') + '</p>';
    return;
  }
  items.forEach((it) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 태그.indexOf(it.체크_ID) >= 0 ? 'on' : '';
    b.textContent = it.표시_품목명 || it.품목명 || it.체크_ID;
    b.addEventListener('click', () => 품목바꿈(it.체크_ID));
    L.appendChild(b);
  });
}

async function 구역정하기(z) {
  const p = 사진들[보는중];
  if (!p) return;
  if ((C.미정인가(p) ? C.미정 : p.구역) === z) return;
  // 앞 구역에서 고른 품목은 뺀다 (구역 = 사진 찍은 곳)
  const 남길태그 = C.구역안태그(p.태그, 마스터, z);
  const 뺀수 = (p.태그 || []).length - 남길태그.length;
  if (뺀수 && !confirm('구역을 바꾸면 고른 품목 ' + 뺀수 + '개가 빠집니다. 바꿀까요?')) return;
  try {
    await PDB.필드저장(p.id, { 구역: z, 태그: 남길태그 });
  } catch (e) {
    toast('저장하지 못했습니다.');
    return;
  }
  p.구역 = z;
  p.태그 = 남길태그;
  패널그리기();
}

async function 품목바꿈(체크_ID) {
  const p = 사진들[보는중];
  if (!p) return;
  const 태그 = (p.태그 || []).slice();
  const at = 태그.indexOf(체크_ID);
  if (at >= 0) 태그.splice(at, 1); else 태그.push(체크_ID);
  try {
    await PDB.태그저장(p.id, 태그);
  } catch (e) {
    toast('저장하지 못했습니다.');
    return;
  }
  p.태그 = 태그;
  패널그리기();
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
  document.body.classList.remove('full');
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
$('#zoneBtn').addEventListener('click', () => 구역설정열기(null));
$('#zsDone').addEventListener('click', 구역설정닫기);
$('#zoneBack').addEventListener('click', 구역설정닫기);
$('#zsAdd').addEventListener('click', 구역설정추가);
$('#zsName').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); 구역설정추가(); } });
$('#zsAll').addEventListener('click', () => {
  const 기본 = 유형기본();
  설정저장(기본.concat(설정목록().filter((z) => 기본.indexOf(z) < 0)));
  구역설정그리기();
});
$('#zsNone').addEventListener('click', () => {
  const 기본 = 유형기본();
  설정저장(설정목록().filter((z) => 기본.indexOf(z) < 0));   // 추가한 구역은 남긴다
  구역설정그리기();
});
$('#zsHouse').addEventListener('click', () => 유형바꾸기('주택'));
$('#zsShop').addEventListener('click', () => 유형바꾸기('상가'));
$('#moveClose').addEventListener('click', 옮기기닫기);
$('#moveBack').addEventListener('click', 옮기기닫기);
$('#sizeSelect').addEventListener('change', () => {
  지금방문.평형 = $('#sizeSelect').value;
  지금방문저장();
});

// 뒤로가기 버튼으로 앱이 통째로 닫히지 않게: 현장 화면에서는 목록으로
window.addEventListener('popstate', () => {
  if (!$('#zoneSheet').hidden) { 구역설정닫기(); history.pushState(null, ''); return; }
  if (!$('#moveSheet').hidden) { 옮기기닫기(); history.pushState(null, ''); return; }
  if (!$('#viewer').hidden) { 보기닫기(); history.pushState(null, ''); return; }
  if (!$('#camSheet').hidden) { 카메라닫기(); history.pushState(null, ''); return; }
  if (지금방문) { 목록보기(); history.pushState(null, ''); }
});
history.pushState(null, '');

// 견적을 내고 몇 달 뒤 시공하기도 해서, 폰 저장공간이 부족해도 크롬이 사진을 지우지 않게 한다
PDB.영구요청();
목록그리기();
구역받기().then(() => { if (지금방문 && $('#viewer').hidden && $('#camSheet').hidden) 사진그리기(); });
