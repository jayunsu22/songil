/* 견적요청 입력 화면 (2026-10-17).
   카톡으로 온 견적요청(사진·글)을 한꺼번에 받아 방문견적 품목으로 바꾼다.
     ① 사진: 여러 장 올리고, 여러 장 골라 구역·품목을 한 번에 붙인다
     ② 글:   카톡 글을 붙여넣으면 줄마다 구역·품목·수량으로 바뀐다 (RequestParse)
     ③ 견적 항목: 둘을 합친다 (RequestMerge). 글만 있는 품목은 시공사진에서 고른다
   [방문견적으로] 를 누르면 state.선택 에 넣고 평소 견적 화면으로 돌아간다 - 계산·발행은 그대로.

   quote_pro.js 뒤에 로드된다. 그 파일의 전역(state, MASTER, PDB, $, toast, save, load,
   현장ID확보, 보이는가, buildAll, refresh, persist, 구역장수갱신, 저장함에담기, 업체키 ...)을 쓴다.
   요청 내용은 state.요청 에 둔다 → 자동저장·저장함·서버 백업을 그대로 탄다.
     state.요청 = { 접수일시, 원문, 거래처ID, 거래처명, 고침: {줄키: 줄}, 수량: {체크_ID: n}, 옵션: {체크_ID: i} } */

const 요청구역 = '__요청__';            // 아직 구역을 안 정한 카톡 사진이 머무는 자리
const 요청단어장_LS = 'quote_req_wordbook_v1';   // 사용자가 가르친 말 (기본 단어장은 코드에)
let 요청탭 = '글';
let 요청사진 = [];          // 지금 현장의 사진 (썸네일 URL 포함)
const 요청고른사진 = new Set();
let 요청칩구역 = null;      // ① 아래 칩에서 고른 구역
let 요청고치는줄 = null;    // ② 줄 고치기 창이 다루는 줄
let 요청디비대상 = null;    // 시공사진 고르기 창의 대상 항목
const 요청디비고름 = new Set();
let 요청디비목록 = [];

/* ---------- 데이터 ---------- */

function 요청보이는구역() {
  return (MASTER && MASTER.zones || []).map((z) => ({ 구역: z.구역, items: z.items.filter(보이는가) }))
    .filter((z) => z.items.length);
}
function 요청품목(체크_ID) {
  for (const z of (MASTER && MASTER.zones) || []) {
    const it = z.items.find((x) => x.체크_ID === 체크_ID);
    if (it) return { 구역: z.구역, item: it };
  }
  return null;
}
function 요청단어장() {
  return RequestWordbook.합치기(RequestWordbook.기본(), load(요청단어장_LS) || {});
}
function 요청사전() { return { zones: 요청보이는구역(), 단어장: 요청단어장() }; }

/* 글 → 줄. 같은 원문 줄이 여러 품목으로 나뉘므로 '원문#순번' 을 줄키로 쓴다.
   사용자가 고친 줄(고침)은 해석 결과를 덮는다. 글을 고쳐 원문이 바뀌면 그 고침은 저절로 빠진다. */
function 요청글줄() {
  const 요 = state.요청 || {};
  const 셈 = {};
  return RequestParse.해석(요.원문 || '', 요청사전()).map((줄) => {
    const n = 셈[줄.원문] = (셈[줄.원문] || 0) + 1;
    const 키 = 줄.원문 + '#' + n;
    const 고친 = 요.고침 && 요.고침[키];
    return Object.assign({}, 줄, 고친 || {}, { 줄키: 키 });
  });
}

function 요청라벨() {
  const out = [];
  요청사진.forEach((p) => {
    const 태그 = (p.태그 || []).filter((id) => 요청품목(id));
    if (!태그.length) out.push({ 사진id: p.id, 구역: null, 체크_ID: null });
    태그.forEach((id) => out.push({ 사진id: p.id, 구역: p.구역, 체크_ID: id }));
  });
  return out;
}

function 요청합친결과() {
  const 사전 = 요청사전();
  const r = RequestMerge.합치기(요청글줄(), 요청라벨(), (id) => RequestParse.한개(id, 사전));
  const 요 = state.요청 || {};
  r.항목.forEach((h) => {
    if (!h.체크_ID) return;
    if (요.수량 && 요.수량[h.체크_ID] != null) { h.수량 = 요.수량[h.체크_ID]; h.기본길이 = false; }
    if (요.옵션 && 요.옵션[h.체크_ID] != null) h.옵션 = 요.옵션[h.체크_ID];
  });
  return r;
}

function 요청저장() { persist(); }

/* ---------- 단어장 서버 ---------- */

async function 요청단어장받기() {
  const 키 = 업체키();
  if (!키) return;
  try {
    const res = await fetch(CONFIG.wordbookUrl + '?key=' + encodeURIComponent(키));
    if (!res.ok) return;
    const j = await res.json();
    if (j && j.단어장) save(요청단어장_LS, Object.assign({}, j.단어장, load(요청단어장_LS) || {}));
  } catch (e) { /* 통신이 안 되면 폰에 있는 단어장으로 */ }
}

async function 요청단어장올리기() {
  const 키 = 업체키();
  if (!키) return;
  try {
    const res = await fetch(CONFIG.wordbookUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 키, 단어장: load(요청단어장_LS) || {} }),
    });
    if (res.ok) {
      const j = await res.json();
      if (j && j.단어장) save(요청단어장_LS, j.단어장);
    }
  } catch (e) { /* 다음에 배울 때 같이 올라간다 */ }
}

/* ---------- 열기·닫기 ---------- */

async function 요청시트열기() {
  if (!MASTER) { toast('단가를 아직 못 받았습니다. 잠시 뒤 다시 해 주세요.'); return; }
  if (!state.요청) {
    state.요청 = { 접수일시: new Date().toISOString(), 원문: '', 거래처ID: (state.업체 && state.업체.id) || '', 거래처명: (state.업체 && state.업체.이름) || '' };
    요청저장();
  }
  $('#reqBack').hidden = false;
  $('#reqSheet').hidden = false;
  $('#reqSite').value = state.현장명 || '';
  $('#reqText').value = state.요청.원문 || '';
  $('#reqVendor').textContent = state.요청.거래처명 ? '🏢 ' + state.요청.거래처명 : '';
  요청바그리기();
  await 요청사진읽기();
  요청탭바꾸기(요청탭);
  요청단어장받기().then(() => { if (요청탭 !== '사진') 요청그리기(); });
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
  $('#reqPanePhoto').hidden = 탭 !== '사진';
  $('#reqPaneText').hidden = 탭 !== '글';
  $('#reqPaneItems').hidden = 탭 !== '항목';
  $('#reqPhotoBar').hidden = 탭 !== '사진';
  $('#reqItemsBar').hidden = 탭 !== '항목';
  $('#reqTextBar').hidden = 탭 !== '글';
  요청그리기();
}

function 요청그리기() {
  if (요청탭 === '사진') 요청사진그리기();
  else if (요청탭 === '글') 요청글그리기();
  else 요청항목그리기();
  요청탭숫자();
}

function 요청탭숫자() {
  const 결과 = 요청합친결과();
  const 글수 = 요청글줄().filter((x) => !x.건너뜀).length;
  const 미지정 = 결과.미지정사진.length;
  $('#reqTabPhoto').textContent = '① 사진 ' + 요청사진.length + (미지정 ? ' · 미지정 ' + 미지정 : '');
  $('#reqTabText').textContent = '② 글 ' + 글수;
  $('#reqTabItems').textContent = '③ 견적 항목 ' + 결과.항목.length;
}

/* ---------- ① 사진 ---------- */

function 요청사진비우기() {
  요청사진.forEach((p) => { if (p._url) URL.revokeObjectURL(p._url); });
  요청사진 = [];
}

async function 요청사진읽기() {
  요청사진비우기();
  if (!사진가능) return;
  try {
    요청사진 = await PDB.현장사진(현장ID확보());
  } catch (e) { 사진못씀(e); 요청사진 = []; }
  요청사진.forEach((p) => { p._url = URL.createObjectURL(p.thumb || p.blob); });
  // 지운 사진이 고른 목록에 남지 않게
  const 있는 = new Set(요청사진.map((p) => p.id));
  [...요청고른사진].forEach((id) => { if (!있는.has(id)) 요청고른사진.delete(id); });
}

function 요청라벨글(p) {
  const id = (p.태그 || []).find((x) => 요청품목(x));
  if (!id) return null;
  const f = 요청품목(id);
  return 표시구역명(f.구역) + ' · ' + f.item.표시_품목명;
}

function 요청사진그리기() {
  const g = $('#reqGrid');
  g.textContent = '';
  $('#reqPhotoEmpty').hidden = 요청사진.length > 0;
  요청사진.forEach((p) => {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'req-ph' + (요청고른사진.has(p.id) ? ' on' : '');
    d.style.backgroundImage = 'url("' + p._url + '")';
    const 라벨 = 요청라벨글(p);
    d.innerHTML = '<span class="req-ck">' + (요청고른사진.has(p.id) ? '✓' : '') + '</span>' +
      '<span class="' + (라벨 ? 'req-lab' : 'req-none') + '">' + esc(라벨 || '미지정') + '</span>';
    d.addEventListener('click', () => {
      if (요청고른사진.has(p.id)) 요청고른사진.delete(p.id); else 요청고른사진.add(p.id);
      요청사진그리기();
    });
    g.appendChild(d);
  });
  요청칩그리기();
}

function 요청칩그리기() {
  const n = 요청고른사진.size;
  $('#reqPickInfo').textContent = n ? '고른 ' + n + '장 → 구역과 품목을 누르세요' : '사진을 눌러 고르세요 (여러 장)';
  const zones = 요청보이는구역();
  if (!요청칩구역 || !zones.some((z) => z.구역 === 요청칩구역)) 요청칩구역 = zones.length ? zones[0].구역 : null;
  const zc = $('#reqZoneChips');
  zc.textContent = '';
  zones.forEach((z) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'req-chip' + (z.구역 === 요청칩구역 ? ' on' : '');
    b.textContent = 표시구역명(z.구역);
    b.addEventListener('click', () => { 요청칩구역 = z.구역; 요청칩그리기(); });
    zc.appendChild(b);
  });
  const ic = $('#reqItemChips');
  ic.textContent = '';
  const z = zones.find((x) => x.구역 === 요청칩구역);
  (z ? z.items : []).forEach((it) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'req-chip';
    b.textContent = it.표시_품목명;
    b.disabled = !n;
    b.addEventListener('click', () => 요청사진붙이기(z.구역, it));
    ic.appendChild(b);
  });
}

async function 요청사진붙이기(구역, item) {
  const ids = [...요청고른사진];
  if (!ids.length) return;
  try {
    for (const id of ids) {
      await PDB.필드저장(id, { 구역: 구역 });
      await PDB.태그저장(id, [item.체크_ID]);
    }
  } catch (e) {
    toast('사진에 품목을 붙이지 못했습니다.');
    console.warn(e);
    return;
  }
  toast(ids.length + '장에 ‘' + 표시구역명(구역) + ' · ' + item.표시_품목명 + '’ 를 붙였습니다');
  요청고른사진.clear();
  await 요청사진읽기();
  요청그리기();
  구역장수갱신();
}

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
  if (실패.length) toast(실패.length + '장 실패 · ' + 실패[0]);
  else toast('사진 ' + files.length + '장 넣었습니다');
}

/* ---------- ② 글 ---------- */

function 요청글그리기() {
  const box = $('#reqLines');
  box.textContent = '';
  const 줄들 = 요청글줄();
  $('#reqLinesHint').hidden = !줄들.length;
  줄들.forEach((줄) => {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'req-line' + (줄.건너뜀 ? ' skip' : 줄.확인필요 ? ' bad' : '');
    let 오른쪽;
    if (줄.건너뜀) 오른쪽 = '<span class="req-muted">건너뜀 · 누르면 품목으로</span>';
    else {
      const 구역 = 줄.구역 ? 표시구역명(줄.구역) : '위치?';
      const 이름 = 줄.체크_ID ? 줄.품목명 : (줄.품목명 || 줄.모르는말 || '품목?');
      const f = 줄.체크_ID && 요청품목(줄.체크_ID);
      const 종류 = f && 줄.옵션 != null && (f.item.옵션들 || []).length > 1 ? ' · ' + f.item.옵션들[줄.옵션].품목명 : '';
      const 수 = f && f.item.단위 === 'm' ? 줄.개수 + '개 → ' + 줄.수량 + 'm' : 줄.수량 + (f ? f.item.단위 : '');
      오른쪽 = '<span class="req-z' + (줄.구역 ? '' : ' bad') + '">' + esc(구역) + '</span>' +
        '<b class="' + (줄.체크_ID ? '' : 'bad') + '">' + esc(이름 + 종류) + '</b>' +
        '<span class="req-q">' + esc(수) + '</span>';
    }
    d.innerHTML = '<span class="req-raw">' + esc(줄.원문) + '</span><span class="req-arrow">→</span>' + 오른쪽;
    d.addEventListener('click', () => 요청줄고치기열기(줄));
    box.appendChild(d);
  });
}

/* 줄 고치기: 구역 → 품목 → 개수. 모르는 말이 있던 줄이면 단어장에 배운다 */
let 요청고침구역 = null;
let 요청고침개수 = 1;

function 요청줄고치기열기(줄) {
  요청고치는줄 = 줄;
  요청고침구역 = 줄.구역 || null;
  요청고침개수 = 줄.개수 || 1;
  $('#reqFixRaw').textContent = '‘' + 줄.원문 + '’';
  $('#reqFixLearn').hidden = !줄.모르는말;
  $('#reqFixLearn').textContent = 줄.모르는말 ? '‘' + 줄.모르는말 + '’ 을(를) 고른 품목으로 기억합니다 (다음부터 자동)' : '';
  $('#reqFixBack').hidden = false;
  $('#reqFixSheet').hidden = false;
  요청고침그리기();
}

function 요청고침그리기() {
  const zones = 요청보이는구역();
  const zc = $('#reqFixZones');
  zc.textContent = '';
  zones.forEach((z) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'req-chip' + (z.구역 === 요청고침구역 ? ' on' : '');
    b.textContent = 표시구역명(z.구역);
    b.addEventListener('click', () => { 요청고침구역 = z.구역; 요청고침그리기(); });
    zc.appendChild(b);
  });
  $('#reqFixCount').textContent = 요청고침개수 + '개';
  const ic = $('#reqFixItems');
  ic.textContent = '';
  const z = zones.find((x) => x.구역 === 요청고침구역);
  $('#reqFixItemsHint').hidden = !!z;
  (z ? z.items : []).forEach((it) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'req-chip' + (요청고치는줄 && 요청고치는줄.체크_ID === it.체크_ID ? ' on' : '');
    b.textContent = it.표시_품목명;
    b.addEventListener('click', () => 요청줄고침적용(it));
    ic.appendChild(b);
  });
}

function 요청줄고침적용(item) {
  const 줄 = 요청고치는줄;
  if (!줄) return;
  const 한 = RequestParse.한개(item.체크_ID, 요청사전());
  if (!한) return;
  const 개수 = Math.max(1, 요청고침개수);
  const 고친 = Object.assign({}, 한, {
    원문: 줄.원문, 개수: 개수,
    수량: item.단위 === 'm' ? 한.수량 * 개수 : 개수,
    옵션: 줄.옵션 != null && (item.옵션들 || []).length > 1 ? 줄.옵션 : 한.옵션,
    확인필요: false, 건너뜀: false, 모르는말: null,
  });
  if (item.최대수량 && 고친.수량 > item.최대수량) 고친.수량 = item.최대수량;
  delete 고친.줄키;
  state.요청.고침 = Object.assign({}, state.요청.고침 || {}, { [줄.줄키]: 고친 });
  if (줄.모르는말) {
    save(요청단어장_LS, RequestWordbook.배우기(load(요청단어장_LS) || {}, 줄.모르는말, RequestParse.기본이름(item.표시_품목명)));
    요청단어장올리기();
  }
  요청저장();
  요청고침닫기();
  요청그리기();
}

function 요청고침닫기() {
  $('#reqFixBack').hidden = true;
  $('#reqFixSheet').hidden = true;
  요청고치는줄 = null;
}

/* ---------- ③ 견적 항목 ---------- */

function 요청예상금액(항목) {
  let 합 = 0;
  항목.forEach((h) => {
    const f = h.체크_ID && 요청품목(h.체크_ID);
    if (!f) return;
    const o = 고른옵션(f.item, { 옵션: h.옵션 || 0 });
    합 += QuoteCalc.lineAmount({
      인건비단가: o.인건비단가, 자재비단가: 적용자재비(), 자재소모량: o.자재소모량,
      난이도: 1, 수량: h.수량,
    });
  });
  return 합;
}

function 요청항목그리기() {
  const r = 요청합친결과();
  const box = $('#reqItems');
  box.textContent = '';
  $('#reqItemsEmpty').hidden = r.항목.length > 0 || r.미지정사진.length > 0;
  const 사진맵 = new Map(요청사진.map((p) => [p.id, p]));
  const 배지 = { '사진+글': 's-both', '글만': 's-txt', '사진만': 's-ph' };

  r.항목.forEach((h) => {
    const f = h.체크_ID && 요청품목(h.체크_ID);
    const card = document.createElement('div');
    card.className = 'req-it' + (h.확인필요 ? ' bad' : '');
    const 구역 = h.구역 ? 표시구역명(h.구역) : '위치?';
    const 이름 = f ? f.item.표시_품목명 : (h.품목명 || h.모르는말 || (h.원문들 && h.원문들[0]) || '품목?');
    card.innerHTML =
      '<div class="r1"><span class="req-z' + (h.구역 ? '' : ' bad') + '">' + esc(구역) + '</span>' +
      '<b>' + esc(이름) + '</b><span class="req-src ' + 배지[h.출처] + '">' + h.출처 + '</span></div>' +
      '<div class="r2"></div>';
    const r2 = card.querySelector('.r2');

    if (f) {
      // 수량 (m 단위면 보통 길이로 채운 값 - 노란 표시로 고치라고 알린다)
      const q = document.createElement('div');
      q.className = 'req-qty' + (h.기본길이 ? ' guess' : '');
      q.innerHTML = '<button type="button" class="m">−</button><span>' + h.수량 + f.item.단위 + '</span><button type="button" class="p">＋</button>';
      const 바꾸기 = (d) => {
        const 다음 = Math.max(1, Math.min(f.item.최대수량 || 99, h.수량 + d));
        state.요청.수량 = Object.assign({}, state.요청.수량 || {}, { [h.체크_ID]: 다음 });
        요청저장();
        요청항목그리기();
      };
      q.querySelector('.m').addEventListener('click', () => 바꾸기(-1));
      q.querySelector('.p').addEventListener('click', () => 바꾸기(1));
      r2.appendChild(q);
      if (h.기본길이) {
        const s = document.createElement('span');
        s.className = 'req-guess';
        s.textContent = '보통 길이 · 확인';
        r2.appendChild(s);
      }
      if ((f.item.옵션들 || []).length > 1) {
        const sel = document.createElement('select');
        sel.className = 'req-kind';
        f.item.옵션들.forEach((o, i) => {
          const op = document.createElement('option');
          op.value = String(i); op.textContent = o.품목명;
          sel.appendChild(op);
        });
        sel.value = String(h.옵션 || 0);
        sel.addEventListener('change', () => {
          state.요청.옵션 = Object.assign({}, state.요청.옵션 || {}, { [h.체크_ID]: Number(sel.value) });
          요청저장();
        });
        r2.appendChild(sel);
      }
    } else {
      const fix = document.createElement('button');
      fix.type = 'button';
      fix.className = 'req-fix';
      fix.textContent = '구역·품목 고르기';
      const 줄 = 요청글줄().find((x) => x.줄키 === h.줄키);
      fix.addEventListener('click', () => { if (줄) 요청줄고치기열기(줄); });
      r2.appendChild(fix);
    }

    // 사진: 붙은 사진 미리보기 + 시공사진에서 고르기
    const r3 = document.createElement('div');
    r3.className = 'r3';
    h.사진ids.slice(0, 4).forEach((id) => {
      const p = 사진맵.get(id);
      if (!p) return;
      const m = document.createElement('span');
      m.className = 'req-mini';
      m.style.backgroundImage = 'url("' + p._url + '")';
      r3.appendChild(m);
    });
    if (h.사진ids.length > 4) {
      const more = document.createElement('span');
      more.className = 'req-muted';
      more.textContent = '+' + (h.사진ids.length - 4);
      r3.appendChild(more);
    }
    if (f) {
      if (!h.사진ids.length) {
        const w = document.createElement('span');
        w.className = 'req-warn';
        w.textContent = '📷 사진 없음';
        r3.appendChild(w);
      }
      const db = document.createElement('button');
      db.type = 'button';
      db.className = 'req-db' + (h.사진ids.length ? '' : ' strong');
      db.textContent = '시공사진에서 고르기';
      db.addEventListener('click', () => 요청디비열기(h));
      r3.appendChild(db);
    }
    card.appendChild(r3);
    box.appendChild(card);
  });

  if (r.미지정사진.length) {
    const c = document.createElement('div');
    c.className = 'req-it bad';
    c.innerHTML = '<div class="r1"><span class="req-none">미지정 사진 ' + r.미지정사진.length + '장</span></div>';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'req-fix';
    b.textContent = '① 사진에서 구역·품목 붙이기';
    b.addEventListener('click', () => {
      요청고른사진.clear();
      r.미지정사진.forEach((id) => 요청고른사진.add(id));
      요청탭바꾸기('사진');
    });
    c.appendChild(b);
    box.appendChild(c);
  }
  $('#reqSum').textContent = '예상 ' + won(요청예상금액(r.항목)) + ' (조정 전)';
}

/* [방문견적으로] - 체크·수량·종류를 넣고 평소 견적 화면으로 */
function 요청적용() {
  const r = 요청합친결과();
  const 경고 = RequestMerge.경고(r);
  if (경고.length && !confirm(경고.join('\n') + '\n\n이대로 견적 화면으로 넘어갈까요? (확인 안 된 항목은 빠집니다)')) return;
  let n = 0;
  r.항목.forEach((h) => {
    if (!h.체크_ID || !ROWS.has(h.체크_ID)) return;
    const 전 = state.선택[h.체크_ID] || {};
    state.선택[h.체크_ID] = { 수량: h.수량, 난이도: 전.난이도 || 1, 옵션: h.옵션 || 0 };
    n++;
  });
  persist();
  buildAll();
  구역장수갱신();
  refresh();
  요청시트닫기();
  toast('견적요청 ' + n + '개 품목을 넣었습니다 · 금액·사진 확인 후 발행하세요');
}

/* ---------- 시공사진에서 고르기 ---------- */

// 관리자 앱 작업 품목명은 '방2문+틀', '거실샤시1' 처럼 생겨서 방문견적 품목명과 다르다. 찾을 낱말을 늘려 준다
const 요청사진낱말 = {
  방문: ['문+틀', '방문'], 문짝: ['문+틀', '문짝'], 문틀: ['문+틀', '문틀'], 화장실문: ['화장실문'],
  냉장고장: ['냉장고'], 붙박이장: ['붙박이', '수납장'], 신발장: ['신발장'], '베란다 중문': ['베란다문', '중문'],
  중문: ['중문'], 현관문: ['현관문'], 방화문: ['방화문'], 침대: ['침대'], '침대 프레임': ['침대'],
};

function 요청찾을낱말(item) {
  const b = RequestParse.기본이름(item.표시_품목명).replace(/\s*\(.*\)$/, '');
  return 요청사진낱말[b] || [b];
}

async function 요청디비열기(h) {
  const f = 요청품목(h.체크_ID);
  if (!f) return;
  요청디비대상 = h;
  요청디비고름.clear();
  요청디비목록 = [];
  $('#reqDbTitle').textContent = '‘' + f.item.표시_품목명 + '’ 시공사진에서 고르기';
  $('#reqDbStatus').textContent = '불러오는 중…';
  $('#reqDbStatus').hidden = false;
  $('#reqDbGrid').textContent = '';
  $('#reqDbBack').hidden = false;
  $('#reqDbSheet').hidden = false;
  요청디비버튼();
  try {
    const res = await fetch(CONFIG.workPhotosUrl + '?q=' + encodeURIComponent(요청찾을낱말(f.item).join(',')));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    const 구역 = String(f.구역 || '');
    // 같은 구역 사진을 앞으로 (관리자 품목명이 '방1샤시' 처럼 구역으로 시작한다)
    요청디비목록 = (j && j.사진 || []).slice().sort((a, b) =>
      (String(b.시공품목).indexOf(구역) === 0) - (String(a.시공품목).indexOf(구역) === 0));
  } catch (e) {
    $('#reqDbStatus').textContent = '시공사진을 못 받았습니다 (' + (e.message || e) + ')';
    return;
  }
  if (요청디비대상 !== h) return;   // 그 사이 다른 항목을 열었다
  $('#reqDbStatus').hidden = 요청디비목록.length > 0;
  $('#reqDbStatus').textContent = '이 품목 시공사진이 없습니다.';
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
      '<span class="req-lab">' + esc((p.현장명 || '').slice(0, 14)) + '<br>' + esc(String(p.날짜 || '').slice(5)) + '</span>';
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

/* 고른 시공사진을 폰 사진으로 복사해 그 품목에 붙인다. 첨부 주소는 몇 시간 뒤 만료되므로
   주소를 저장하지 않고 이미지를 받아 둔다 - 그러면 견적서에 싣는 기존 발행 경로를 그대로 탄다. */
async function 요청디비붙이기() {
  const h = 요청디비대상;
  if (!h) return;
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
      await PDB.들여오기(현장ID확보(), h.구역, blob, { 태그: [h.체크_ID], 출처: '시공사진' });
      됨++;
    } catch (e) { console.warn('시공사진 받기 실패', e); }
  }
  요청디비닫기();
  toast(됨 === 고른.length ? 됨 + '장 붙였습니다' : 됨 + '장 붙임 · ' + (고른.length - 됨) + '장 실패');
  await 요청사진읽기();
  요청그리기();
  구역장수갱신();
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
    접수일시: new Date().toISOString(), 원문: '',
    거래처ID: 거래처ID || (state.업체 && state.업체.id) || '',
    거래처명: (state.업체 && state.업체.이름) || '',
  };
  persist();
  업체줄그리기();
  요청탭 = '글';
  요청시트열기();
}

/* ---------- 이벤트 ---------- */

document.querySelectorAll('#reqTabs button').forEach((b) => b.addEventListener('click', () => 요청탭바꾸기(b.dataset.tab)));
$('#reqClose').addEventListener('click', 요청시트닫기);
$('#reqBack').addEventListener('click', 요청시트닫기);
$('#reqBarOpen').addEventListener('click', 요청시트열기);
$('#reqText').addEventListener('input', () => {
  if (!state.요청) return;
  state.요청.원문 = $('#reqText').value;
  요청저장();
  요청글그리기();
  요청탭숫자();
});
$('#reqSite').addEventListener('input', () => {
  state.현장명 = $('#reqSite').value;
  $('#siteName').value = state.현장명;
  요청저장();
});
$('#reqAdd').addEventListener('click', () => { $('#reqFile').value = ''; $('#reqFile').click(); });
$('#reqFile').addEventListener('change', () => 요청사진넣기(Array.from($('#reqFile').files || [])));
$('#reqTextNext').addEventListener('click', () => 요청탭바꾸기('항목'));
$('#reqSave').addEventListener('click', () => { 요청저장(); 저장함에담기(); });
$('#reqApply').addEventListener('click', 요청적용);
$('#reqFixClose').addEventListener('click', 요청고침닫기);
$('#reqFixBack').addEventListener('click', 요청고침닫기);
$('#reqFixMinus').addEventListener('click', () => { 요청고침개수 = Math.max(1, 요청고침개수 - 1); 요청고침그리기(); });
$('#reqFixPlus').addEventListener('click', () => { 요청고침개수 = Math.min(20, 요청고침개수 + 1); 요청고침그리기(); });
$('#reqFixSkip').addEventListener('click', () => {
  // 견적 줄이 아니면(인사말 등) 건너뜀으로 둔다
  const 줄 = 요청고치는줄;
  if (!줄) return;
  state.요청.고침 = Object.assign({}, state.요청.고침 || {}, { [줄.줄키]: { 건너뜀: true, 확인필요: false, 체크_ID: null } });
  요청저장();
  요청고침닫기();
  요청그리기();
});
$('#reqDbClose').addEventListener('click', 요청디비닫기);
$('#reqDbBack').addEventListener('click', 요청디비닫기);
$('#reqDbAdd').addEventListener('click', 요청디비붙이기);

// 캐시된 단가로 boot() 가 이 파일보다 먼저 돌았으면 여기서 진입을 마저 한다
if (MASTER) 요청진입();
