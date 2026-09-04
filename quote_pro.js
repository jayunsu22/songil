/* 현장견적 작성 화면.
   금액 계산은 quote_calc.js(QuoteCalc)가 하고, 이 파일은 화면과 상태만 다룬다. */

const CONFIG = {
  masterUrl:  'https://primary-production-a6fa.up.railway.app/webhook/pro-master',
  publishUrl: 'https://primary-production-a6fa.up.railway.app/webhook/pro-publish',
};

const STORAGE_KEY = 'quote_pro_state_v1';
const MASTER_KEY  = 'quote_pro_master_v1';
const 난이도목록  = [1.0, 1.1, 1.2, 1.3, 1.5];
const 비율목록    = [-0.10, -0.05, 0, 0.05, 0.10, 0.15];

let MASTER = null;
// 평형 기본값은 '확인안됨'. 모르는 채로 40평 몰딩 같은 게 잘못 들어가는 것보다
// 평형별 품목을 아예 안 보여주는 쪽이 안전하다.
//
// 구역명: { 원래이름: 바꾼이름 } — 평면도에 '서재', '다용도실' 처럼 적혀 오는
// 경우가 있어 이번 견적에서만 구역 이름을 바꿔 쓴다. 에어테이블 원본은 안 건드린다.
let state = { 현장명: '', 평형: '확인안됨', 선택: {}, 조정: [null, null, null], 구역명: {}, 메모: '' };

// 화면·견적서·텍스트에 나갈 구역 이름
function 표시구역명(원래) {
  return (state.구역명 && state.구역명[원래]) || 원래;
}

// 체크_ID -> { item, 행 DOM } 조회용. 매번 전체를 다시 그리지 않기 위해 들고 있는다.
const ROWS = new Map();

const $  = (s) => document.querySelector(s);
const won = (n) => Math.round(n).toLocaleString('ko-KR') + '원';

/* ---------- localStorage: 실패해도 화면은 계속 돌아가야 한다 ----------
   사파리 프라이빗 모드 등에서 setItem 이 예외를 던진다. 그때 체크가
   하나도 안 먹는 것처럼 보이면 안 되므로 전부 try/catch 로 감싼다. */
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 무시 */ }
}
function load(key) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
  catch (e) { return null; }
}

/* ---------- 마스터 로드 ----------
   캐시가 있으면 그걸로 먼저 그리고(즉시 사용 가능), 뒤에서 최신을 받아 갱신한다.
   현장에서 신호가 약해도 한 번 받아둔 걸로 계속 작업할 수 있게 하려는 것. */
async function loadMaster() {
  const cached = load(MASTER_KEY);
  if (cached && cached.zones) {
    MASTER = cached;
    boot();
    setStatus('저장된 단가로 표시 중 · 최신 확인하는 중…');
  }

  try {
    const res = await fetch(CONFIG.masterUrl);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const fresh = await res.json();
    if (!fresh || !Array.isArray(fresh.zones) || !fresh.zones.length) {
      throw new Error('빈 응답');
    }
    const 바뀜 = !cached || JSON.stringify(fresh) !== JSON.stringify(cached);
    MASTER = fresh;
    save(MASTER_KEY, fresh);
    if (!cached) boot();
    else if (바뀜) { buildAll(); refresh(); }
    setStatus('');
  } catch (e) {
    if (MASTER) setStatus('최신 단가를 못 받았습니다. 저장된 단가로 계속 진행합니다.');
    else setStatus('마스터를 불러오지 못했습니다. 통신 상태를 확인하고 새로고침 해주세요.', true);
  }
}

function setStatus(msg, isErr) {
  const el = $('#status');
  el.textContent = msg || '';
  el.hidden = !msg;
  el.className = isErr ? 'err' : '';
}

/* ---------- 최초 구성 ---------- */
function boot() {
  const saved = load(STORAGE_KEY);
  if (saved) state = Object.assign(state, saved);

  $('#siteName').value = state.현장명 || '';
  $('#sizeSelect').value = state.평형 || '확인안됨';
  $('#memoText').value = state.메모 || '';

  buildAdjust();
  buildAll();
  refresh();
  $('#adjWrap').hidden = false;
}

/* ---------- 평형 필터 ---------- */
function 보이는가(item) {
  return item.적용평형 === '공통' || item.적용평형 === state.평형;
}

/* 평형을 바꾸면 이전 평형의 평형별 선택을 지운다.
   안 지우면 40평 몰딩과 50평 몰딩이 동시에 견적에 들어간다. */
function applySize(새평형) {
  Object.keys(state.선택).forEach((id) => {
    const r = ROWS.get(id);
    if (r && r.item.적용평형 !== '공통' && r.item.적용평형 !== 새평형) {
      delete state.선택[id];
    }
  });
  state.평형 = 새평형;
  buildAll();
  refresh();
  persist();
}

/* ---------- 화면 그리기 ---------- */
function buildAll() {
  const wrap = $('#zones');
  // 이름을 바꾸거나 평형을 바꿀 때 화면을 다시 그리는데,
  // 그때 펼쳐둔 구역이 전부 접히면 하던 작업을 놓친다.
  const 이전 = [...wrap.querySelectorAll('.zone')];
  const 열린구역 = new Set(이전.filter((d) => d.open).map((d) => d._zone));
  const 첫빌드 = 이전.length === 0;

  wrap.textContent = '';
  ROWS.clear();

  MASTER.zones.forEach((z, zi) => {
    const items = z.items.filter(보이는가);
    if (!items.length) return;

    const det = document.createElement('details');
    det.className = 'zone';
    det._zone = z.구역;
    // 전체공통은 거의 매번 보게 되므로 처음엔 펼쳐둔다
    det.open = 첫빌드 ? (zi === 0) : 열린구역.has(z.구역);

    const 바뀜 = !!(state.구역명 && state.구역명[z.구역]);
    const sum = document.createElement('summary');
    sum.innerHTML =
      '<span class="z-name">' + esc(표시구역명(z.구역)) + '</span>' +
      (바뀜 ? '<span class="z-orig">' + esc(z.구역) + '</span>' : '') +
      '<button type="button" class="z-edit" aria-label="구역 이름 바꾸기">✎</button>' +
      '<span class="z-count"></span><span class="z-sum"></span>';
    det.appendChild(sum);

    // summary 안의 버튼이라 기본 동작(구역 접기/펴기)을 막아야 한다
    sum.querySelector('.z-edit').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      구역이름바꾸기(z.구역);
    });

    items.forEach((item) => det.appendChild(buildItem(item)));
    wrap.appendChild(det);

    det._items = items;
    det._count = sum.querySelector('.z-count');
    det._sum = sum.querySelector('.z-sum');
  });
}

/* 이번 견적에서만 쓰는 구역 이름. 평면도에 '서재' 처럼 적혀 오면 그대로 쓴다.
   에어테이블 마스터는 건드리지 않고, '새 견적' 하면 원래 이름으로 돌아간다. */
function 구역이름바꾸기(원래) {
  const 새이름 = prompt(
    '‘' + 원래 + '’ 을(를) 뭐라고 부를까요?\n이번 견적에서만 바뀝니다.',
    표시구역명(원래)
  );
  if (새이름 === null) return;            // 취소
  const t = 새이름.trim();
  if (!t || t === 원래) delete state.구역명[원래];
  else state.구역명[원래] = t;
  buildAll();
  refresh();
  persist();
}

function buildItem(item) {
  const 평형별 = item.적용평형 !== '공통';

  const box = document.createElement('div');
  box.className = 'item';

  const head = document.createElement('label');
  head.className = 'item-head';
  head.innerHTML =
    '<input type="checkbox">' +
    '<span class="i-name">' + esc(item.표시_품목명) + '</span>' +
    '<span class="i-amt"></span>';
  box.appendChild(head);

  const body = document.createElement('div');
  body.className = 'item-body';
  body.hidden = true;

  if (평형별) {
    // 평형별 품목은 길이가 정해진 묶음 상품이라 수량 개념이 없다.
    // ± 버튼을 띄우지 않고 기준 길이만 읽기 전용으로 보여준다.
    body.innerHTML = '<span class="fixed-qty">' +
      esc(String(item.평형별_설정길이 || '')) + esc(item.단위) + ' 기준</span>';
  } else {
    body.innerHTML =
      '<div class="qty">' +
        '<button type="button" class="minus" aria-label="줄이기">−</button>' +
        '<input type="number" class="qnum" inputmode="numeric" min="1" max="' + item.최대수량 + '">' +
        '<span class="q-unit">' + esc(item.단위) + '</span>' +
        '<button type="button" class="plus" aria-label="늘리기">+</button>' +
      '</div>';
  }

  // 종류가 여러 개인 품목(샤시: 단창/2중창/시스템)은 드롭다운으로 고른다.
  // 구역마다 6줄로 늘어놓는 대신 한 줄에서 고르게 하려는 것.
  // body.innerHTML 을 쓴 뒤에 넣어야 한다 — 먼저 넣으면 innerHTML 이 지워버린다.
  let 종류 = null;
  if ((item.옵션들 || []).length > 1) {
    종류 = document.createElement('select');
    종류.className = 'kind';
    item.옵션들.forEach((o, i) => {
      const op = document.createElement('option');
      op.value = String(i);
      op.textContent = o.품목명;
      종류.appendChild(op);
    });
    body.insertBefore(종류, body.firstChild);
  }

  const diff = document.createElement('select');
  diff.className = 'diff';
  난이도목록.forEach((d) => {
    const o = document.createElement('option');
    o.value = String(d);
    o.textContent = '난이도 ' + d.toFixed(1);
    diff.appendChild(o);
  });
  body.appendChild(diff);
  box.appendChild(body);

  const row = { item: item, box: box, head: head, body: body, diff: diff, kind: 종류,
                cb: head.querySelector('input'), amt: head.querySelector('.i-amt'),
                num: body.querySelector('.qnum') };
  ROWS.set(item.체크_ID, row);

  /* 이벤트 */
  row.cb.addEventListener('change', () => {
    if (row.cb.checked) {
      state.선택[item.체크_ID] = {
        수량: 평형별 ? (item.평형별_설정길이 || 1) : item.기본수량,
        난이도: 1,
        옵션: 0,          // 종류 드롭다운에서 고른 순번. 종류가 하나뿐이면 항상 0.
      };
    } else {
      delete state.선택[item.체크_ID];
    }
    syncRow(row);
    refresh();
    persist();
  });

  diff.addEventListener('change', () => {
    const s = state.선택[item.체크_ID];
    if (!s) return;
    s.난이도 = parseFloat(diff.value) || 1;
    refresh();
    persist();
  });

  if (종류) {
    종류.addEventListener('change', () => {
      const s = state.선택[item.체크_ID];
      if (!s) return;
      s.옵션 = parseInt(종류.value, 10) || 0;
      refresh();
      persist();
    });
  }

  if (!평형별) {
    const 바꾸기 = (v) => {
      const s = state.선택[item.체크_ID];
      if (!s) return;
      // 1 미만이나 최대수량 초과로 못 가게 막는다
      s.수량 = Math.max(1, Math.min(item.최대수량, Math.round(v) || 1));
      row.num.value = s.수량;
      refresh();
      persist();
    };
    body.querySelector('.minus').addEventListener('click', (e) => {
      e.preventDefault();
      바꾸기((state.선택[item.체크_ID] || {}).수량 - 1);
    });
    body.querySelector('.plus').addEventListener('click', (e) => {
      e.preventDefault();
      바꾸기((state.선택[item.체크_ID] || {}).수량 + 1);
    });
    row.num.addEventListener('change', () => 바꾸기(parseFloat(row.num.value)));
  }

  syncRow(row);
  return box;
}

/* 저장된 상태를 한 행의 컨트롤에 반영한다 */
function syncRow(row) {
  const s = state.선택[row.item.체크_ID];
  row.cb.checked = !!s;
  row.body.hidden = !s;
  row.box.classList.toggle('on', !!s);
  if (s) {
    if (row.num) row.num.value = s.수량;
    row.diff.value = String(s.난이도 || 1);
    if (row.kind) row.kind.value = String(s.옵션 || 0);
  }
}

/* ---------- 전체 조정 ---------- */
function buildAdjust() {
  document.querySelectorAll('.adj-name').forEach((sel) => {
    sel.innerHTML = '<option value="">선택 안 함</option>';
    MASTER.adjustments.forEach((a) => {
      const o = document.createElement('option');
      o.value = a.항목명;
      o.textContent = a.항목명;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      const slot = +sel.dataset.slot;
      if (!sel.value) { state.조정[slot] = null; }
      else {
        const found = MASTER.adjustments.find((a) => a.항목명 === sel.value);
        // 항목을 고르면 그 항목의 기본비율이 자동으로 채워진다. 이후 비율만 따로 바꿀 수 있다.
        state.조정[slot] = { 항목명: sel.value, 비율: found ? found.기본비율 : 0 };
      }
      syncAdjust();
      refresh();
      persist();
    });
  });

  document.querySelectorAll('.adj-pct').forEach((sel) => {
    비율목록.forEach((v) => {
      const o = document.createElement('option');
      o.value = String(v);
      o.textContent = (v > 0 ? '+' : '') + Math.round(v * 100) + '%';
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      const slot = +sel.dataset.slot;
      if (state.조정[slot]) {
        state.조정[slot].비율 = parseFloat(sel.value) || 0;
        refresh();
        persist();
      }
    });
  });
  syncAdjust();
}

function syncAdjust() {
  document.querySelectorAll('.adj-name').forEach((sel) => {
    const a = state.조정[+sel.dataset.slot];
    sel.value = a ? a.항목명 : '';
  });
  document.querySelectorAll('.adj-pct').forEach((sel) => {
    const a = state.조정[+sel.dataset.slot];
    sel.value = a ? String(a.비율) : '0';
    sel.disabled = !a;
  });
}

/* ---------- 계산 및 갱신 ---------- */
/* 종류 드롭다운에서 고른 옵션. 종류가 하나뿐이면 그 하나를 돌려준다. */
function 고른옵션(item, s) {
  const list = item.옵션들 || [];
  return list[(s && s.옵션) || 0] || list[0] || item;
}

function 선택품목들() {
  const out = [];
  MASTER.zones.forEach((z) => {
    z.items.forEach((item) => {
      const s = state.선택[item.체크_ID];
      if (!s || !보이는가(item)) return;
      // 종류를 고르는 품목이면 고른 종류의 단가·설명을 쓴다
      const o = 고른옵션(item, s);
      out.push({
        체크_ID: item.체크_ID,
        // 바꾼 이름으로 내보낸다. 발행 스냅샷·견적서·카톡 텍스트가 전부 이걸 쓴다.
        구역: 표시구역명(z.구역),
        // 종류가 여럿이면 견적서에 '샤시1 (시스템샤시)' 처럼 어느 종류인지 남긴다
        품목명: (item.옵션들 || []).length > 1
          ? item.표시_품목명 + ' (' + o.품목명 + ')'
          : item.표시_품목명,
        단위: o.단위,
        수량: s.수량,
        난이도: s.난이도 || 1,
        인건비단가: o.인건비단가,
        자재비단가: o.자재비단가,
        자재소모량: o.자재소모량,
        품목설명: o.품목설명,
        견적기준: o.견적기준,
        공통설명: o.공통설명,
      });
    });
  });
  return out;
}

function 조정목록() {
  return state.조정.filter(Boolean);
}

function refresh() {
  const items = 선택품목들();
  const r = QuoteCalc.calcQuote(items, 조정목록());

  // 작성 화면에서는 조정 전 금액(라인금액)을 보여준다. 단가를 확인하는 화면이라
  // 여기서 조정까지 섞으면 사장님이 단가표와 대조할 수 없다.
  const 금액맵 = {};
  r.라인들.forEach((l) => { 금액맵[l.체크_ID] = l.라인금액; });
  ROWS.forEach((row, id) => {
    row.amt.textContent = 금액맵[id] != null ? won(금액맵[id]) : '';
  });

  document.querySelectorAll('.zone').forEach((det) => {
    let n = 0, sum = 0;
    (det._items || []).forEach((item) => {
      if (금액맵[item.체크_ID] != null) { n++; sum += 금액맵[item.체크_ID]; }
    });
    det._count.textContent = n;
    det._count.classList.toggle('on', n > 0);
    det._sum.textContent = n ? won(sum) : '';
  });

  const 율 = r.조정_합계율;
  $('#adjSum').textContent = 조정목록().length
    ? '합계 조정 ' + (율 > 0 ? '+' : '') + Math.round(율 * 1000) / 10 + '%'
      + (율 === 0 ? ' (상쇄되어 그대로 나갑니다)' : '')
    : '';

  $('#totalAmount').innerHTML = won(r.총액) +
    (율 !== 0 ? ' <small>조정 전 ' + won(r.소계) + '</small>' : '');
  $('#publishBtn').disabled = items.length === 0;

  window.__quote = { items: items, result: r };   // Task 6(발행)에서 읽는다
}

function persist() {
  state.현장명 = $('#siteName').value.trim();
  state.메모 = $('#memoText').value.trim();
  save(STORAGE_KEY, state);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ---------- 헤더 이벤트 ---------- */
$('#siteName').addEventListener('input', persist);
$('#memoText').addEventListener('input', persist);
$('#sizeSelect').addEventListener('change', (e) => applySize(e.target.value));
$('#resetBtn').addEventListener('click', () => {
  if (!confirm('지금 체크한 내용을 모두 지우고 새로 시작할까요?')) return;
  // 평형도 같이 초기화한다. 앞 현장 평형이 남아 있으면 다음 현장에서
  // 그 평형의 몰딩/걸레받이가 그대로 보여 잘못 체크하기 쉽다.
  state = { 현장명: '', 평형: '확인안됨', 선택: {}, 조정: [null, null, null], 구역명: {}, 메모: '' };
  $('#siteName').value = '';
  $('#sizeSelect').value = '확인안됨';
  $('#memoText').value = '';
  save(STORAGE_KEY, state);
  syncAdjust();
  buildAll();
  refresh();
});

/* 발행은 Task 6에서 붙인다 */
$('#publishBtn').addEventListener('click', () => {
  if (typeof openPublish === 'function') openPublish();
  else alert('발행 기능은 아직 연결 전입니다.');
});

loadMaster();

// 상태 유지: 브라우저가 화면을 접었다 펼 때 값이 사라지지 않게 마지막으로 한 번 더 저장
window.addEventListener('pagehide', persist);

/* =========================================================================
   발행
   ========================================================================= */

let 발행결과 = null;   // { 견적코드, opts }

function openPublish() {
  발행결과 = null;
  $('#pubBefore').hidden = false;
  $('#pubAfter').hidden = true;
  $('#doPublish').disabled = false;
  $('#doPublish').textContent = '발행하기';
  $('#pubBack').hidden = false;
  $('#pubSheet').hidden = false;
}

function closePublish() {
  $('#pubBack').hidden = true;
  $('#pubSheet').hidden = true;
}

function 링크() {
  if (!발행결과) return '';
  // '품목설명 포함'은 저장이 아니라 링크 뒤에 붙는 표시일 뿐이라,
  // 재발행 없이 같은 견적을 업자용/소비자용으로 각각 보낼 수 있다.
  //
  // t = 현장명. 카톡 미리보기 카드 제목에 쓴다. Edge Function 이 이 값을
  // 읽어 og:title 을 바꾸는데, 백엔드 조회 없이 문자열만 읽으므로 안전하다.
  const p = new URLSearchParams();
  if ($('#optDesc').checked) p.set('d', '1');
  if (발행결과.현장명) p.set('t', 발행결과.현장명);
  const qs = p.toString();
  return location.origin + '/q/' + 발행결과.견적코드 + (qs ? '?' + qs : '');
}

/* 여러 줄짜리 설명의 둘째 줄부터 앞에 공백을 붙여 한 덩어리로 보이게 한다.
   (줄 안의 정렬이 아니라 줄머리 들여쓰기라 글꼴 폭과 무관하게 안정적이다) */
function 들여쓰기(s, pad) {
  return String(s).trim().replace(/\n/g, '\n' + pad);
}

/* 카톡은 고정폭 글꼴이 아니라 공백으로 맞춘 정렬이 폰마다 깨진다.
   그래서 공백 정렬을 아예 쓰지 않는 형태로 만든다. */
function buildText() {
  const q = window.__quote;
  if (!q) return '';
  const 설명포함 = $('#optDesc').checked;
  const 부가세 = $('#optVat').checked;

  const L = ['[' + (MASTER.업체명 || '섬세한손길') + '] 인테리어필름 견적'];
  if (state.현장명) L.push('현장: ' + state.현장명);
  L.push('');

  let 현재구역 = null;
  q.result.라인들.forEach((l) => {
    if (l.구역 !== 현재구역) {
      if (현재구역 !== null) L.push('');
      L.push('■ ' + l.구역);
      현재구역 = l.구역;
    }
    L.push('· ' + l.품목명 + ' ' + l.수량 + l.단위 + ' — ' + l.표시금액.toLocaleString('ko-KR') + '원');
    // 품목설명이 여러 줄이면 둘째 줄부터 들여쓰기가 풀려 다음 품목처럼 보인다.
    if (설명포함 && l.품목설명) L.push('   ㄴ ' + 들여쓰기(l.품목설명, '     '));
  });

  L.push('');
  if ($('#optAdj').checked && q.result.조정_합계율 !== 0) {
    L.push('소계 ' + q.result.소계.toLocaleString('ko-KR') + '원');
    L.push('조정 ' + (q.result.조정_합계율 > 0 ? '+' : '')
      + Math.round(q.result.조정_합계율 * 1000) / 10 + '%');
  }
  L.push('합계 ' + q.result.총액.toLocaleString('ko-KR') + '원' + (부가세 ? ' (부가세 별도)' : ''));

  // 메모는 업자용/소비자용 상관없이 항상 넣는다. '안방-앞방 연결문 포함' 같은
  // 내용은 받는 쪽이 꼭 알아야 할 것이라 설명 토글로 감추면 안 된다.
  if (state.메모) L.push('', '[메모] ' + 들여쓰기(state.메모, '       '));

  if (설명포함) {
    // 공통설명은 품목마다 반복하지 않고 맨 아래 한 번만 모은다. 안 그러면 도배된다.
    const 공통 = [...new Set(q.result.라인들.map((l) => l.공통설명).filter(Boolean))];
    if (공통.length) { L.push(''); 공통.forEach((c) => L.push('※ ' + 들여쓰기(c, '   '))); }
    if (MASTER.안내문구) L.push('', MASTER.안내문구.replace(/<[^>]*>/g, '').trim());
  }
  return L.join('\n');
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // HTTPS가 아니거나 오래된 안드로이드 웹뷰에는 clipboard API가 없다
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
}

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

$('#doPublish').addEventListener('click', async () => {
  const q = window.__quote;
  if (!q || !q.items.length) { toast('선택한 품목이 없습니다.'); return; }

  const btn = $('#doPublish');
  btn.disabled = true;
  btn.textContent = '발행 중…';

  try {
    const res = await fetch(CONFIG.publishUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        현장명: state.현장명,
        평형: state.평형,
        라인들: q.result.라인들,
        소계: q.result.소계,
        조정_합계율: q.result.조정_합계율,
        총액: q.result.총액,
        조정_내역: 조정목록(),
        조정내역_표시: $('#optAdj').checked,
        부가세_별도표기: $('#optVat').checked,
        메모: state.메모,
      }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    if (!j || !j.견적코드) throw new Error('견적코드 없음');

    발행결과 = { 견적코드: j.견적코드, 현장명: state.현장명 };
    링크표시();
    $('#pubBefore').hidden = true;
    $('#pubAfter').hidden = false;
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '발행하기';
    toast('발행에 실패했습니다. 통신 상태를 확인해 주세요.');
  }
});

/* 화면에는 한글이 그대로 보이게 디코딩해서 띄운다. 퍼센트 인코딩된 주소를
   그대로 보여주면 알아볼 수가 없다. 복사·열기는 인코딩된 원본을 쓴다. */
function 링크표시() {
  const u = 링크();
  let 보기 = u;
  try { 보기 = decodeURIComponent(u).replace(/\+/g, ' '); } catch (e) { /* 원본 유지 */ }
  $('#pubLink').textContent = 보기;
}

// '품목설명 포함'을 켜고 끄면 복사될 링크가 즉시 바뀐다 (재발행 불필요)
$('#optDesc').addEventListener('change', () => {
  if (발행결과) 링크표시();
});

$('#copyLink').addEventListener('click', async () => {
  toast(await copy(링크()) ? '링크를 복사했습니다' : '복사에 실패했습니다. 링크를 길게 눌러 복사해 주세요.');
});

$('#copyText').addEventListener('click', async () => {
  toast(await copy(buildText()) ? '견적 내용을 복사했습니다' : '복사에 실패했습니다.');
});

$('#pubClose').addEventListener('click', closePublish);
$('#pubBack').addEventListener('click', closePublish);

/* =========================================================================
   링크 열기 · 다시 발행 · 저장함
   ========================================================================= */

$('#openLink').addEventListener('click', () => {
  const u = 링크();
  if (u) window.open(u, '_blank', 'noopener');
});

/* 고쳐서 다시 발행: 새 견적코드로 새로 저장한다.
   이미 보낸 링크를 덮어쓰지 않는다 — 업자가 어제 받은 링크의 금액이
   말없이 바뀌면 사고다. 옛 링크는 그대로 살아 있고 새 링크가 하나 더 생긴다. */
$('#rePublish').addEventListener('click', () => {
  발행결과 = null;
  $('#pubAfter').hidden = true;
  $('#pubBefore').hidden = false;
  $('#doPublish').disabled = false;
  $('#doPublish').textContent = '발행하기';
  $('#pubSheet').scrollTop = 0;
  toast('내용을 고친 뒤 발행하기를 누르세요');
});

/* ---------- 저장함 ----------
   작성 중인 내용은 자동저장되지만 한 건뿐이다. 현장을 여러 곳 도는 날에는
   앞 현장 견적이 덮여버리므로, 이름을 붙여 따로 담아둘 수 있게 한다. */
const BOX_KEY = 'quote_pro_box_v1';

function 저장함읽기() {
  const v = load(BOX_KEY);
  return Array.isArray(v) ? v : [];
}

function 저장함쓰기(list) {
  save(BOX_KEY, list);
}

$('#saveDraft').addEventListener('click', () => {
  persist();
  const 건수 = Object.keys(state.선택).length;
  if (!건수) { toast('체크한 품목이 없습니다.'); return; }

  const 이름 = (state.현장명 || '').trim() || prompt('저장할 이름을 적어주세요.', '') || '';
  if (!이름.trim()) { toast('이름이 없어 저장하지 않았습니다.'); return; }

  const list = 저장함읽기();
  const 항목 = {
    id: Date.now(),
    이름: 이름.trim(),
    저장일시: new Date().toISOString(),
    건수: 건수,
    총액: (window.__quote && window.__quote.result.총액) || 0,
    상태: JSON.parse(JSON.stringify(state)),
  };
  // 같은 이름이 있으면 덮어쓴다. 같은 현장을 두 번 저장했을 때 목록이 지저분해진다.
  const i = list.findIndex((x) => x.이름 === 항목.이름);
  if (i >= 0) list[i] = 항목; else list.unshift(항목);

  저장함쓰기(list.slice(0, 30));   // 폰 저장공간이 한정되어 30건까지만
  toast('‘' + 항목.이름 + '’ 저장함에 담았습니다');
});

function openBox() {
  const list = 저장함읽기();
  const L = $('#boxList');
  if (!list.length) {
    L.innerHTML = '<p class="hint">아직 저장한 견적이 없습니다.</p>';
  } else {
    L.innerHTML = list.map((x) =>
      '<div class="box-row" data-id="' + x.id + '">' +
        '<div class="box-info">' +
          '<b>' + esc(x.이름) + '</b>' +
          '<span>' + 짧은날짜(x.저장일시) + ' · ' + x.건수 + '개 · ' + won(x.총액) + '</span>' +
        '</div>' +
        '<button type="button" class="box-load">불러오기</button>' +
        '<button type="button" class="box-del" aria-label="삭제">✕</button>' +
      '</div>').join('');
  }
  $('#boxBack').hidden = false;
  $('#boxSheet').hidden = false;
}

function closeBox() {
  $('#boxBack').hidden = true;
  $('#boxSheet').hidden = true;
}

function 짧은날짜(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

$('#boxList').addEventListener('click', (e) => {
  const row = e.target.closest('.box-row');
  if (!row) return;
  const id = +row.dataset.id;
  const list = 저장함읽기();
  const 항목 = list.find((x) => x.id === id);
  if (!항목) return;

  if (e.target.classList.contains('box-del')) {
    if (!confirm('‘' + 항목.이름 + '’ 을(를) 저장함에서 지울까요?')) return;
    저장함쓰기(list.filter((x) => x.id !== id));
    openBox();
    return;
  }

  if (e.target.classList.contains('box-load')) {
    if (!confirm('‘' + 항목.이름 + '’ 을(를) 불러옵니다.\n지금 작성 중인 내용은 사라집니다.')) return;
    state = Object.assign(
      { 현장명: '', 평형: '확인안됨', 선택: {}, 조정: [null, null, null], 구역명: {}, 메모: '' },
      항목.상태
    );
    $('#siteName').value = state.현장명 || '';
    $('#sizeSelect').value = state.평형 || '확인안됨';
    $('#memoText').value = state.메모 || '';
    syncAdjust();
    buildAll();
    refresh();
    save(STORAGE_KEY, state);
    closeBox();
    toast('‘' + 항목.이름 + '’ 불러왔습니다');
  }
});

$('#boxBtn').addEventListener('click', openBox);
$('#boxClose').addEventListener('click', closeBox);
$('#boxBack').addEventListener('click', closeBox);
