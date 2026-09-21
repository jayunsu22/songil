/* 정산견적(품수 기반 사후 견적) 작성 화면.
   금액 계산은 settle_calc.js(SettleCalc)가 하고, 이 파일은 화면과 상태만 다룬다.

   데이터 흐름:
     settle-master?site=rec…  → MASTER { 현장, 작업목록, 시공품목, 단가표, 회사정보 }
     state (localStorage 'settle_state_<현장ID>')  → 사용자가 고친 것만 담는다
     발행 → settle-publish → /s/<코드>?n=<현장명 base64url> */

const CONFIG = {
  masterUrl:   'https://primary-production-a6fa.up.railway.app/webhook/settle-master',
  publishUrl:  'https://primary-production-a6fa.up.railway.app/webhook/settle-publish',
  settingsUrl: 'https://primary-production-a6fa.up.railway.app/webhook/settle-settings',
};

// admin.html 과 같은 PIN(SHA-256 해시로만 비교). 정산 화면은 단가가 다 보이는 관리자용이다.
const ADMIN_PIN_HASH = '7e25b45addda2b4082938558981200dfe5a3cfb20ee4a81092510d26715c2049';
const UNLOCK_KEY = 'settleUnlocked';
const CUSTOM_WAGE = '__custom';

const $ = (s) => document.querySelector(s);
const won = (n) => Math.round(Number(n) || 0).toLocaleString('ko-KR') + '원';
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const 방순서 = ['방1', '방2', '방3', '방4', '방5', '거실', '주방', '현관', '기타'];

const 현장ID = new URLSearchParams(location.search).get('site') || '';
const STORAGE_KEY = 'settle_state_' + 현장ID;

let MASTER = null;
let state = 빈상태();
let 자재표 = {};      // 자재ID -> { 항목명, 단가 }  (사용여부 켜진 것만)
let 발행결과 = null;
let toastTimer = null;
let keySeq = 1;

function 빈상태() {
  return { 품수: '', 품단가ID: '', 품단가직접: '', 전체자재ID: '', 줄들: [], 부가: [], 메모: '', 부가세별도: true };
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* 시크릿 모드 등 */ }
}
function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { return null; }
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
}
function status(msg, isErr) {
  const el = $('#status');
  el.textContent = msg || '';
  el.hidden = !msg;
  el.className = isErr ? 'err' : '';
  $('#retryBtn').hidden = !isErr;
}

/* =========================================================================
   관리자 잠금
   ========================================================================= */
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function 잠금확인() {
  let ok = false;
  try { ok = localStorage.getItem(UNLOCK_KEY) === '1'; } catch (e) { ok = false; }
  if (ok) return Promise.resolve();
  $('#pinLockOverlay').hidden = false;
  $('#pinLockInput').focus();
  return new Promise((resolve) => {
    $('#pinLockForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const v = $('#pinLockInput').value.trim();
      if (await sha256Hex(v) === ADMIN_PIN_HASH) {
        try { localStorage.setItem(UNLOCK_KEY, '1'); } catch (e) { /* 무시 */ }
        $('#pinLockOverlay').hidden = true;
        resolve();
      } else {
        $('#pinLockError').hidden = false;
        $('#pinLockInput').value = '';
        $('#pinLockInput').focus();
      }
    });
  });
}

/* =========================================================================
   마스터 로드 · 상태 병합
   ========================================================================= */
async function loadMaster() {
  status('현장 정보를 불러오는 중…');
  $('#doc').hidden = true;
  $('#totalBar').hidden = true;
  try {
    const res = await fetch(CONFIG.masterUrl + '?site=' + encodeURIComponent(현장ID));
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error) {
      status(j && j.error ? j.error : '현장 정보를 불러오지 못했습니다. 통신 상태를 확인해 주세요.', true);
      return false;
    }
    MASTER = j;
  } catch (e) {
    status('현장 정보를 불러오지 못했습니다. 통신 상태를 확인해 주세요.', true);
    return false;
  }
  단가표적용();
  mergeSaved();
  renderAll();
  status('');
  $('#doc').hidden = false;
  $('#totalBar').hidden = false;
  return true;
}

function 단가표적용() {
  자재표 = {};
  (MASTER.단가표 || []).forEach((r) => {
    if (r.구분 === '자재단가' && r.사용여부) 자재표[r.id] = { 항목명: r.항목명, 단가: r.단가 };
  });
}
const 자재목록 = () => (MASTER.단가표 || []).filter((r) => r.구분 === '자재단가' && r.사용여부);
const 품단가목록 = () => (MASTER.단가표 || []).filter((r) => r.구분 === '품단가' && r.사용여부);
const 부가목록 = () => (MASTER.단가표 || []).filter((r) => r.구분 === '부가항목' && r.사용여부);

function 구역정렬키(구역) {
  const m = String(구역 || '').match(/^(\d+)층\s+(.*)$/);
  const floor = m ? parseInt(m[1], 10) : 1;
  const room = m ? m[2] : (구역 || '기타');
  let i = 방순서.indexOf(room);
  if (i < 0) i = 방순서.length;
  return floor * 100 + i;
}

/* 작업목록 × 시공품목 마스터 → 줄. 저장된 상태가 있으면 사용자가 고친 값(체크·수량·길이·직접소모량·자재)을
   품목명 기준으로 이어받는다. 작업목록에 새로 생긴 품목은 줄로 추가되고, 사용자가 '+ 품목 추가'로
   넣은 줄은 그대로 남는다. */
function mergeSaved() {
  const saved = loadSaved();
  const 마스터맵 = {};
  (MASTER.시공품목 || []).forEach((m) => { 마스터맵[m.품목명] = m; });
  const 기본자재 = (자재목록()[0] || {}).id || '';

  const fresh = (MASTER.작업목록 || []).map((t) => {
    const m = 마스터맵[t.시공품목] || {};
    return {
      key: 'k' + (keySeq++),
      품목명: t.시공품목,
      구역: m.구역 || '기타',
      우선순위: m.우선순위 ?? 999,
      출처: '작업목록',
      체크: true,
      길이입력: !!m.길이입력,
      마스터소모량: (typeof m.자재소모량 === 'number') ? m.자재소모량 : 0,
      소모량없음: typeof m.자재소모량 !== 'number',
      수량: 1, 길이: null, 직접소모량: null,
      자재ID: 기본자재,
    };
  });

  if (saved && Array.isArray(saved.줄들)) {
    const byName = {};
    saved.줄들.forEach((l) => { if (l.출처 === '작업목록') byName[l.품목명] = l; });
    fresh.forEach((l) => {
      const s = byName[l.품목명];
      if (!s) return;
      l.체크 = !!s.체크;
      l.수량 = s.수량 ?? 1;
      l.길이 = s.길이 ?? null;
      l.직접소모량 = s.직접소모량 ?? null;
      if (s.자재ID) l.자재ID = s.자재ID;
    });
    saved.줄들.filter((l) => l.출처 === '추가').forEach((l) => {
      fresh.push(Object.assign({}, l, { key: 'k' + (keySeq++) }));
    });
  }
  // 자재가 설정에서 사라졌으면 기본 자재로 되돌리지 않는다 - 조용히 다른 단가로 계산되면 사고.
  // 화면에 '자재 없음'으로 보이게 두고 사장님이 고르게 한다.

  fresh.sort((a, b) => {
    if (a.출처 !== b.출처) return a.출처 === '작업목록' ? -1 : 1;
    const za = 구역정렬키(a.구역), zb = 구역정렬키(b.구역);
    if (za !== zb) return za - zb;
    if (a.우선순위 !== b.우선순위) return a.우선순위 - b.우선순위;
    return String(a.품목명).localeCompare(String(b.품목명));
  });

  // 부가 항목: 단가표 줄 + 사용자가 추가한 줄
  const 부가 = 부가목록().map((r) => ({ key: 'e' + (keySeq++), 단가ID: r.id, 항목명: r.항목명, 금액: r.단가 || '', 출처: '단가표' }));
  if (saved && Array.isArray(saved.부가)) {
    const byId = {};
    saved.부가.forEach((e) => { if (e.단가ID) byId[e.단가ID] = e; });
    부가.forEach((e) => { if (byId[e.단가ID]) e.금액 = byId[e.단가ID].금액; });
    saved.부가.filter((e) => e.출처 === '추가').forEach((e) => 부가.push(Object.assign({}, e, { key: 'e' + (keySeq++) })));
  }

  const 품단가들 = 품단가목록();
  state = Object.assign(빈상태(), saved || {}, { 줄들: fresh, 부가 });
  if (!state.품단가ID || (state.품단가ID !== CUSTOM_WAGE && !품단가들.some((w) => w.id === state.품단가ID))) {
    state.품단가ID = (품단가들[0] || {}).id || CUSTOM_WAGE;
  }
  if (!state.전체자재ID || !자재표[state.전체자재ID]) state.전체자재ID = 기본자재;
  save();
}

/* =========================================================================
   계산 입력 만들기
   ========================================================================= */
function 품단가값() {
  if (state.품단가ID === CUSTOM_WAGE) return SettleCalc.수(state.품단가직접);
  const w = 품단가목록().find((r) => r.id === state.품단가ID);
  return w ? w.단가 : 0;
}
function 계산() {
  return SettleCalc.합계({ 품수: state.품수, 품단가: 품단가값(), 줄들: state.줄들, 부가: state.부가 }, 자재표);
}

/* =========================================================================
   렌더
   ========================================================================= */
function renderAll() {
  $('#siteTitle').textContent = MASTER.현장.현장명 || '현장 정산견적';
  document.title = (MASTER.현장.현장명 ? MASTER.현장.현장명 + ' 정산견적' : '현장 정산견적') + ' - 섬세한손길';
  const d = $('#siteDate');
  d.textContent = MASTER.현장.시공일자 ? '🗓 ' + MASTER.현장.시공일자 : '';
  d.hidden = !MASTER.현장.시공일자;
  renderLabor();
  renderLines();
  renderExtras();
  $('#memoText').value = state.메모 || '';
  $('#optVat').checked = state.부가세별도 !== false;
  renderTotals();
}

function renderLabor() {
  $('#manDays').value = state.품수 === '' ? '' : state.품수;
  const sel = $('#wageSelect');
  const opts = 품단가목록().map((w) => `<option value="${esc(w.id)}">${esc(w.항목명)} · ${won(w.단가)}</option>`);
  opts.push(`<option value="${CUSTOM_WAGE}">직접 입력</option>`);
  sel.innerHTML = opts.join('');
  sel.value = state.품단가ID;
  const custom = $('#wageCustom');
  custom.hidden = state.품단가ID !== CUSTOM_WAGE;
  custom.value = state.품단가직접 === '' ? '' : state.품단가직접;
}

function 자재옵션(선택) {
  const rows = 자재목록().map((r) => `<option value="${esc(r.id)}"${r.id === 선택 ? ' selected' : ''}>${esc(r.항목명)}</option>`);
  if (선택 && !자재표[선택]) rows.unshift(`<option value="${esc(선택)}" selected>자재 없음</option>`);
  return rows.join('');
}

function renderLines() {
  const all = $('#allMat');
  all.innerHTML = 자재목록().map((r) => `<option value="${esc(r.id)}">${esc(r.항목명)} · ${won(r.단가)}/m</option>`).join('');
  all.value = state.전체자재ID;

  const H = [];
  let 현재구역 = null;
  state.줄들.forEach((l) => {
    const 구역 = l.출처 === '추가' ? '직접 추가' : l.구역;
    if (구역 !== 현재구역) { H.push(`<div class="zh">${esc(구역)}</div>`); 현재구역 = 구역; }
    H.push(줄HTML(l));
  });
  $('#lines').innerHTML = H.join('');
  bindLineEvents();
}

function 줄HTML(l) {
  const 소모량 = SettleCalc.줄소모량(l);
  const 단위설명 = l.출처 === '추가' ? '' :
    (l.길이입력 ? `길이 · ${l.마스터소모량}m/m` : `${l.마스터소모량}m/개`);
  const 경고 = l.체크 && (소모량 === 0 || !자재표[l.자재ID]);
  const 직접 = l.직접소모량 !== null && l.직접소모량 !== undefined && l.직접소모량 !== '';
  const nm = l.출처 === '추가'
    ? `<div class="nm"><input type="text" data-f="품목명" value="${esc(l.품목명)}" placeholder="품목명" autocomplete="off"></div>`
    : `<div class="nm">${esc(l.품목명)}<small>${esc(단위설명)}</small></div>`;
  let ctl;
  if (l.출처 === '추가') {
    ctl = `<span class="q-unit">소모량은 오른쪽 숫자를 눌러 입력</span>`;
  } else if (l.길이입력) {
    ctl = `<input class="len" type="number" inputmode="decimal" min="0" step="0.1" data-f="길이" value="${l.길이 == null ? '' : esc(l.길이)}" placeholder="길이" autocomplete="off"><span class="q-unit">m</span>`;
  } else {
    ctl = `<div class="qty"><button type="button" data-f="qty-" aria-label="수량 줄이기">−</button><input type="number" inputmode="numeric" min="0" data-f="수량" value="${esc(l.수량)}" autocomplete="off"><button type="button" data-f="qty+" aria-label="수량 늘리기">+</button></div>`;
  }
  const del = l.출처 === '추가' ? `<button type="button" class="del" data-f="del" aria-label="줄 삭제">✕</button>` : '';
  return `<div class="row ${l.체크 ? 'on' : 'off'}${경고 ? ' warn' : ''}" data-key="${l.key}">
    <input type="checkbox" data-f="체크"${l.체크 ? ' checked' : ''}>
    ${nm}
    <button type="button" class="use${소모량 === 0 ? ' zero' : ''}" data-f="use" title="눌러서 소모량 직접 입력">${l.체크 ? 소모량 + 'm' : '—'}${직접 ? '<span class="tag">직접</span>' : ''}</button>
    ${l.체크 ? `<div class="ctl">${ctl}<select class="mat${자재표[l.자재ID] ? '' : ' none'}" data-f="자재ID">${자재옵션(l.자재ID)}</select>${del}</div>` : ''}
  </div>`;
}

function 줄찾기(key) { return state.줄들.find((l) => l.key === key); }

function bindLineEvents() {
  $('#lines').querySelectorAll('.row').forEach((row) => {
    const l = 줄찾기(row.dataset.key);
    if (!l) return;
    row.querySelectorAll('[data-f]').forEach((el) => {
      const f = el.dataset.f;
      if (f === '체크') el.addEventListener('change', () => { l.체크 = el.checked; save(); 줄다시그리기(l); renderTotals(); });
      else if (f === '수량') el.addEventListener('input', () => { l.수량 = el.value; save(); 줄갱신(l); });
      else if (f === 'qty-') el.addEventListener('click', () => { l.수량 = Math.max(0, SettleCalc.수(l.수량) - 1); save(); 줄다시그리기(l); renderTotals(); });
      else if (f === 'qty+') el.addEventListener('click', () => { l.수량 = SettleCalc.수(l.수량) + 1; save(); 줄다시그리기(l); renderTotals(); });
      else if (f === '길이') el.addEventListener('input', () => { l.길이 = el.value === '' ? null : el.value; save(); 줄갱신(l); });
      else if (f === '품목명') el.addEventListener('input', () => { l.품목명 = el.value; save(); });
      else if (f === '자재ID') el.addEventListener('change', () => { l.자재ID = el.value; save(); 줄다시그리기(l); renderTotals(); });
      else if (f === 'del') el.addEventListener('click', () => {
        state.줄들 = state.줄들.filter((x) => x !== l); save(); renderLines(); renderTotals();
      });
      else if (f === 'use') el.addEventListener('click', () => 소모량직접입력(l, el));
    });
  });
}

/* 소모량 숫자를 누르면 그 자리가 입력칸으로 바뀐다. 비우면 마스터 계산으로 돌아간다. */
function 소모량직접입력(l, btn) {
  if (!l.체크) return;
  const cur = SettleCalc.줄소모량(l);
  btn.innerHTML = `<input type="number" inputmode="decimal" min="0" step="0.1" value="${cur}" autocomplete="off"> m`;
  const inp = btn.querySelector('input');
  inp.focus(); inp.select();
  const done = () => {
    const v = inp.value.trim();
    l.직접소모량 = v === '' ? null : v;
    save(); 줄다시그리기(l); renderTotals();
  };
  inp.addEventListener('blur', done);
  inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); inp.blur(); } });
  inp.addEventListener('click', (ev) => ev.stopPropagation());
}

// 입력 중(포커스 유지)에는 소모량 표시만 갱신하고 줄 전체를 다시 그리지 않는다
function 줄갱신(l) {
  const row = $('#lines').querySelector(`.row[data-key="${l.key}"]`);
  if (row) {
    const 소모량 = SettleCalc.줄소모량(l);
    const use = row.querySelector('.use');
    use.className = 'use' + (소모량 === 0 ? ' zero' : '');
    use.textContent = 소모량 + 'm';
    row.classList.toggle('warn', l.체크 && (소모량 === 0 || !자재표[l.자재ID]));
  }
  renderTotals();
}
function 줄다시그리기(l) {
  const row = $('#lines').querySelector(`.row[data-key="${l.key}"]`);
  if (!row) return renderLines();
  const tmp = document.createElement('div');
  tmp.innerHTML = 줄HTML(l);
  row.replaceWith(tmp.firstElementChild);
  bindLineEvents();
}

function renderExtras() {
  $('#extras').innerHTML = state.부가.map((e) => `<div class="extra" data-key="${e.key}">
    ${e.출처 === '추가'
      ? `<div class="nm"><input type="text" data-f="항목명" value="${esc(e.항목명)}" placeholder="항목명" autocomplete="off"></div>`
      : `<span class="nm">${esc(e.항목명)}</span>`}
    <input class="amt" type="number" inputmode="numeric" min="0" step="1000" data-f="금액" value="${e.금액 === '' || e.금액 == null || Number(e.금액) === 0 ? '' : esc(e.금액)}" placeholder="0" autocomplete="off">
    <span class="won">원</span>
    ${e.출처 === '추가' ? `<button type="button" class="del" data-f="del" aria-label="삭제">✕</button>` : ''}
  </div>`).join('');
  $('#extras').querySelectorAll('.extra').forEach((div) => {
    const e = state.부가.find((x) => x.key === div.dataset.key);
    div.querySelectorAll('[data-f]').forEach((el) => {
      const f = el.dataset.f;
      if (f === '금액') el.addEventListener('input', () => { e.금액 = el.value; save(); renderTotals(); });
      else if (f === '항목명') el.addEventListener('input', () => { e.항목명 = el.value; save(); });
      else if (f === 'del') el.addEventListener('click', () => { state.부가 = state.부가.filter((x) => x !== e); save(); renderExtras(); renderTotals(); });
    });
  });
}

function renderTotals() {
  const r = 계산();
  $('#laborSum').textContent = won(r.인건비);
  $('#laborAmt').textContent = '= ' + won(r.인건비);
  $('#matSum').textContent = won(r.자재비);
  $('#extraSum').textContent = won(r.부가);
  $('#matSubtotals').innerHTML = r.자재소계.map((s) =>
    `<div><span>${esc(s.자재명)} · ${won(s.단가)}/m × ${s.소모량합}m</span><b>${won(s.금액)}</b></div>`).join('');
  $('#totalAmount').innerHTML = won(r.총액) + (state.부가세별도 !== false ? '<small>부가세 별도</small>' : '');
  $('#publishBtn').disabled = r.총액 <= 0;
}

/* =========================================================================
   입력 이벤트 (인건비 · 전체 자재 · 메모 · 추가 버튼)
   ========================================================================= */
$('#manDays').addEventListener('input', (ev) => { state.품수 = ev.target.value; save(); renderTotals(); });
$('#wageSelect').addEventListener('change', (ev) => {
  state.품단가ID = ev.target.value; save();
  $('#wageCustom').hidden = state.품단가ID !== CUSTOM_WAGE;
  if (state.품단가ID === CUSTOM_WAGE) $('#wageCustom').focus();
  renderTotals();
});
$('#wageCustom').addEventListener('input', (ev) => { state.품단가직접 = ev.target.value; save(); renderTotals(); });
$('#allMat').addEventListener('change', (ev) => {
  state.전체자재ID = ev.target.value;
  state.줄들.forEach((l) => { l.자재ID = state.전체자재ID; });
  save(); renderLines(); renderTotals();
});
$('#addLineBtn').addEventListener('click', () => {
  state.줄들.push({ key: 'k' + (keySeq++), 품목명: '', 구역: '직접 추가', 우선순위: 999, 출처: '추가', 체크: true,
    길이입력: false, 마스터소모량: 0, 소모량없음: true, 수량: 1, 길이: null, 직접소모량: null, 자재ID: state.전체자재ID });
  save(); renderLines(); renderTotals();
  const last = $('#lines').querySelector('.row:last-child input[data-f="품목명"]');
  if (last) last.focus();
});
$('#addExtraBtn').addEventListener('click', () => {
  state.부가.push({ key: 'e' + (keySeq++), 항목명: '', 금액: '', 출처: '추가' });
  save(); renderExtras();
  const last = $('#extras').querySelector('.extra:last-child input[data-f="항목명"]');
  if (last) last.focus();
});
$('#memoText').addEventListener('input', (ev) => { state.메모 = ev.target.value; save(); });
$('#optVat').addEventListener('change', (ev) => { state.부가세별도 = ev.target.checked; save(); renderTotals(); });
$('#resetBtn').addEventListener('click', () => {
  if (!confirm('입력한 품수·길이·부가 항목을 모두 지우고 처음부터 다시 시작할까요?')) return;
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* 무시 */ }
  발행결과 = null;
  mergeSaved(); renderAll();
});
$('#retryBtn').addEventListener('click', loadMaster);

/* =========================================================================
   발행
   ========================================================================= */
function 스냅샷만들기() {
  const r = 계산();
  return {
    인건비: { 품수: SettleCalc.수(state.품수), 품단가: 품단가값(), 금액: r.인건비 },
    품목: state.줄들.filter((l) => l.체크).map((l) => ({
      품목명: l.품목명, 구역: l.출처 === '추가' ? '직접 추가' : l.구역,
      수량: l.길이입력 ? null : SettleCalc.수(l.수량),
      길이: l.길이입력 ? SettleCalc.수(l.길이) : null,
      소모량: SettleCalc.줄소모량(l),
      자재명: 자재표[l.자재ID] ? 자재표[l.자재ID].항목명 : '자재 없음',
    })),
    자재소계: r.자재소계.map((s) => ({ 자재명: s.자재명, 단가: s.단가, 소모량합: s.소모량합, 금액: s.금액 })),
    부가: state.부가.filter((e) => Math.round(SettleCalc.수(e.금액)) !== 0).map((e) => ({ 항목명: e.항목명 || '기타', 금액: Math.round(SettleCalc.수(e.금액)) })),
    합계: { 인건비: r.인건비, 자재비: r.자재비, 부가: r.부가, 총액: r.총액 },
  };
}

function openPublish() {
  const r = 계산();
  const 자재없음 = SettleCalc.자재없음줄(state.줄들, 자재표);
  if (자재없음.length) {
    alert('자재가 정해지지 않은 품목이 있습니다:\n\n' + 자재없음.map((l) => '· ' + l.품목명).join('\n') + '\n\n줄의 자재를 골라 주세요.');
    return;
  }
  const 영 = state.줄들.filter((l) => l.체크 && SettleCalc.줄소모량(l) === 0);
  if (영.length && !confirm('소모량이 0m 인 품목이 ' + 영.length + '개 있습니다 (' +
      영.slice(0, 5).map((l) => l.품목명).join(', ') + (영.length > 5 ? ' …' : '') +
      ').\n자재비 0원으로 견적서에 나갑니다. 그래도 발행할까요?')) return;
  $('#pubSummary').innerHTML =
    `<div><span>인건비</span><span>${won(r.인건비)}</span></div>` +
    `<div><span>자재비</span><span>${won(r.자재비)}</span></div>` +
    `<div><span>부가 항목</span><span>${won(r.부가)}</span></div>` +
    `<div class="tot"><span>합계${state.부가세별도 !== false ? ' (부가세 별도)' : ''}</span><span>${won(r.총액)}</span></div>`;
  $('#pubBefore').hidden = false;
  $('#pubAfter').hidden = true;
  $('#doPublish').disabled = false;
  $('#doPublish').textContent = '발행하기';
  $('#pubBack').hidden = false;
  $('#pubSheet').hidden = false;
}
function closePublish() { $('#pubBack').hidden = true; $('#pubSheet').hidden = true; }
$('#publishBtn').addEventListener('click', openPublish);
$('#pubClose').addEventListener('click', closePublish);
$('#pubBack').addEventListener('click', closePublish);

$('#doPublish').addEventListener('click', async () => {
  const btn = $('#doPublish');
  btn.disabled = true; btn.textContent = '발행 중…';
  const 스냅샷 = 스냅샷만들기();
  try {
    const res = await fetch(CONFIG.publishUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        현장ID, 현장명: MASTER.현장.현장명, 스냅샷, 총액: 스냅샷.합계.총액,
        부가세_별도표기: state.부가세별도 !== false, 메모: state.메모 || '',
      }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    if (!j || !j.견적코드) throw new Error('견적코드 없음');
    발행결과 = { 견적코드: j.견적코드, 현장명: MASTER.현장.현장명 };
    $('#pubLink').textContent = 링크();
    $('#pubBefore').hidden = true;
    $('#pubAfter').hidden = false;
  } catch (e) {
    btn.disabled = false; btn.textContent = '발행하기';
    toast('발행에 실패했습니다. 통신 상태를 확인해 주세요.');
  }
});

/* 한글을 base64url 로 (quote_pro.js 와 같은 방식). Edge Function 이 ?n= 을 읽어 카톡 카드 제목을 만든다. */
function b64u(글) {
  const bytes = new TextEncoder().encode(글);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).split('+').join('-').split('/').join('_').split('=').join('');
}
function 링크() {
  if (!발행결과) return '';
  const p = new URLSearchParams();
  if (발행결과.현장명) p.set('n', b64u(발행결과.현장명));
  const qs = p.toString();
  return location.origin + '/s/' + 발행결과.견적코드 + (qs ? '?' + qs : '');
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
}
$('#copyLink').addEventListener('click', async () => {
  toast((await copy(링크())) ? '링크를 복사했습니다' : '복사에 실패했습니다. 링크를 길게 눌러 복사해 주세요.');
});
$('#shareLink').addEventListener('click', async () => {
  const u = 링크();
  if (navigator.share) {
    try { await navigator.share({ title: 발행결과.현장명 + ' 정산 견적서', url: u }); } catch (e) { /* 취소 */ }
  } else {
    toast((await copy(u)) ? '이 브라우저는 공유창이 없어 링크를 복사했습니다' : '복사에 실패했습니다.');
  }
});
$('#openLink').addEventListener('click', () => { const u = 링크(); if (u) window.open(u, '_blank', 'noopener'); });

/* =========================================================================
   ⚙ 단가 설정 모달
   ========================================================================= */
let setTab = '자재단가';
let setRows = [];     // 단가표 편집 사본: { id|null, 항목명, 구분, 단가, 순서, 사용여부, _del, _orig }
let setItems = [];    // 시공품목 소모량 편집 사본: { id, 품목명, 구역, 자재소모량, 길이입력, _orig }

function openSettings() {
  setRows = (MASTER.단가표 || []).map((r) => Object.assign({ _del: false, _orig: JSON.stringify([r.항목명, r.구분, r.단가, r.순서, r.사용여부]) }, r));
  setItems = (MASTER.시공품목 || []).map((m) => Object.assign({ _orig: JSON.stringify([m.자재소모량, m.길이입력]) }, m))
    .sort((a, b) => {
      const ea = a.자재소모량 == null ? 0 : 1, eb = b.자재소모량 == null ? 0 : 1;   // 값 없는 품목이 위로
      if (ea !== eb) return ea - eb;
      const za = 구역정렬키(a.구역), zb = 구역정렬키(b.구역);
      if (za !== zb) return za - zb;
      return (a.우선순위 ?? 999) - (b.우선순위 ?? 999);
    });
  renderSettingsTab();
  $('#setBack').hidden = false;
  $('#setSheet').hidden = false;
}
function closeSettings() { $('#setBack').hidden = true; $('#setSheet').hidden = true; }

function renderSettingsTab() {
  document.querySelectorAll('#setSheet .tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === setTab));
  const body = $('#setBody');
  $('#setAddBtn').hidden = setTab !== '자재단가';   // 자재단가 탭만 아래 공용 버튼, 나머지는 그룹별 버튼
  if (setTab === '소모량') {
    $('#setHint').textContent = '품목 1개당(세트/개) 필름 소모량. "길이 입력"을 켜면 견적 화면에서 길이(m)를 받아 1m당 소모량으로 계산합니다. 값이 없는 품목이 위에 옵니다.';
    body.innerHTML = setItems.map((m, i) => `<div class="srow${m.자재소모량 == null ? ' empty' : ''}" data-i="${i}">
      <span class="lbl">${esc(m.품목명)}<small>${esc(m.구역)}</small></span>
      <input class="price" type="number" inputmode="decimal" min="0" step="0.1" data-f="자재소모량" value="${m.자재소모량 == null ? '' : esc(m.자재소모량)}" placeholder="m">
      <span class="unit">${m.길이입력 ? 'm/m' : 'm/개'}</span>
      <input class="chk" type="checkbox" data-f="길이입력"${m.길이입력 ? ' checked' : ''}><span class="chklbl">길이</span>
    </div>`).join('');
    body.querySelectorAll('.srow').forEach((div) => {
      const m = setItems[+div.dataset.i];
      div.querySelector('[data-f="자재소모량"]').addEventListener('input', (ev) => { m.자재소모량 = ev.target.value === '' ? null : ev.target.value; div.classList.toggle('empty', m.자재소모량 == null); });
      div.querySelector('[data-f="길이입력"]').addEventListener('change', (ev) => { m.길이입력 = ev.target.checked; div.querySelector('.unit').textContent = m.길이입력 ? 'm/m' : 'm/개'; });
    });
    return;
  }
  const 구분들 = setTab === '자재단가' ? ['자재단가'] : ['품단가', '부가항목'];
  $('#setHint').textContent = setTab === '자재단가'
    ? '필름 자재별 m당 단가. 견적 화면에서 줄마다 골라 씁니다. 사용을 끄면 목록에서 숨겨집니다.'
    : '품단가는 1품(1인 1일)당 인건비. 부가항목의 단가는 견적 화면에 미리 채워지는 기본 금액(0이면 빈칸).';
  const H = [];
  구분들.forEach((g) => {
    // 품단가·부가항목 탭은 종류가 둘이라 그룹마다 자기 '+ 추가' 를 둔다 (prompt 로 종류를 묻지 않는다)
    if (구분들.length > 1) H.push(`<div class="sgroup">${esc(g)}<button type="button" class="sadd" data-add="${esc(g)}">+ ${esc(g)} 추가</button></div>`);
    setRows.forEach((r, i) => {
      if (r.구분 !== g) return;
      H.push(`<div class="srow${r._del ? ' gone' : ''}" data-i="${i}">
        <input class="name" type="text" data-f="항목명" value="${esc(r.항목명)}" placeholder="항목명" autocomplete="off">
        <input class="price" type="number" inputmode="numeric" min="0" step="${g === '품단가' ? 10000 : 500}" data-f="단가" value="${esc(r.단가)}" autocomplete="off">
        <span class="unit">${g === '자재단가' ? '원/m' : g === '품단가' ? '원/품' : '원'}</span>
        <button type="button" class="sw${r.사용여부 ? '' : ' off'}" data-f="사용여부" aria-label="사용 여부"></button>
        <button type="button" class="del" data-f="del" aria-label="삭제">✕</button>
      </div>`);
    });
  });
  body.innerHTML = H.join('');
  body.querySelectorAll('.sadd').forEach((b) => b.addEventListener('click', () => 설정줄추가(b.dataset.add)));
  body.querySelectorAll('.srow').forEach((div) => {
    const r = setRows[+div.dataset.i];
    div.querySelector('[data-f="항목명"]').addEventListener('input', (ev) => { r.항목명 = ev.target.value; });
    div.querySelector('[data-f="단가"]').addEventListener('input', (ev) => { r.단가 = ev.target.value; });
    div.querySelector('[data-f="사용여부"]').addEventListener('click', (ev) => { r.사용여부 = !r.사용여부; ev.target.classList.toggle('off', !r.사용여부); });
    div.querySelector('[data-f="del"]').addEventListener('click', () => {
      if (r.구분 === '자재단가' && state.줄들.some((l) => l.체크 && l.자재ID === r.id) &&
          !confirm('지금 견적에서 쓰고 있는 자재입니다. 지우면 그 줄들이 "자재 없음"으로 바뀝니다. 지울까요?')) return;
      r._del = true; div.classList.add('gone');
    });
  });
}
document.querySelectorAll('#setSheet .tabs button').forEach((b) => b.addEventListener('click', () => { setTab = b.dataset.tab; renderSettingsTab(); }));
function 설정줄추가(구분) {
  const 순서 = setRows.filter((r) => r.구분 === 구분 && !r._del).length + 1;
  setRows.push({ id: null, 항목명: '', 구분, 단가: 0, 순서, 사용여부: true, _del: false, _orig: '' });
  renderSettingsTab();
  // 방금 넣은 줄(그 종류의 마지막 줄)에 포커스
  const rows = [...$('#setBody').querySelectorAll('.srow')].filter((d) => setRows[+d.dataset.i].구분 === 구분);
  const last = rows[rows.length - 1] && rows[rows.length - 1].querySelector('input.name');
  if (last) last.focus();
}
$('#setAddBtn').addEventListener('click', () => 설정줄추가('자재단가'));
$('#settingsBtn').addEventListener('click', openSettings);
$('#setClose').addEventListener('click', closeSettings);
$('#setBack').addEventListener('click', closeSettings);

$('#setSave').addEventListener('click', async () => {
  const norm = (r) => ({ 항목명: String(r.항목명 || '').trim(), 구분: r.구분, 단가: Math.round(SettleCalc.수(r.단가)), 순서: SettleCalc.수(r.순서) || 999, 사용여부: !!r.사용여부 });
  const body = { 단가표: { create: [], update: [], delete: [] }, 품목소모량: [] };
  setRows.forEach((r) => {
    if (r._del) { if (r.id) body.단가표.delete.push(r.id); return; }
    const n = norm(r);
    if (!n.항목명) return;   // 이름 없는 새 줄은 무시
    if (!r.id) body.단가표.create.push(n);
    else if (JSON.stringify([n.항목명, n.구분, n.단가, n.순서, n.사용여부]) !== r._orig) body.단가표.update.push(Object.assign({ id: r.id }, n));
  });
  setItems.forEach((m) => {
    const v = m.자재소모량 == null || m.자재소모량 === '' ? null : Math.round(SettleCalc.수(m.자재소모량) * 10) / 10;
    if (JSON.stringify([v, !!m.길이입력]) !== m._orig) body.품목소모량.push({ id: m.id, 자재소모량: v === null ? '' : v, 길이입력: !!m.길이입력 });
  });
  const n = body.단가표.create.length + body.단가표.update.length + body.단가표.delete.length + body.품목소모량.length;
  if (!n) { toast('바뀐 내용이 없습니다'); closeSettings(); return; }

  const btn = $('#setSave');
  btn.disabled = true; btn.textContent = '저장 중…';
  try {
    const res = await fetch(CONFIG.settingsUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || !j.success) throw new Error((j && j.errors && j.errors.join(' / ')) || ('HTTP ' + res.status));
    closeSettings();
    toast('저장했습니다. 다시 불러오는 중…');
    await loadMaster();
  } catch (e) {
    toast('저장에 실패했습니다: ' + (e.message || '통신 오류'));
  } finally {
    btn.disabled = false; btn.textContent = '저장';
  }
});

/* =========================================================================
   시작
   ========================================================================= */
(async function boot() {
  if (!현장ID) {
    status('관리자 앱의 현장 카드에서 [💰 현장견적] 버튼으로 열어 주세요.', false);
    return;
  }
  await 잠금확인();
  await loadMaster();
})();
