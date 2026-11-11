/* 📷 사진으로 견적 화면 (2026-11-11 사장님 목업 확정). 방문견적 위 [📷 사진으로 견적].
   ① 카톡에서 저장한 사진을 한 번에 고른다 (30장까지) → 6장씩 n8n 견적사진_읽기(사장님 열쇠)에 보내 읽는다 (진행 막대·✓)
   ② 확인 화면: 구역별 품목 카드 (사진·품목 고르기·수량·🎞 필름·📝 메모·사진 글씨), 못 고른 사진은 '확인 필요' 노란 카드
   ③ [✅ N개 견적에 넣기] → 방문견적에 체크(이미 체크한 품목은 수량 그대로), 사진은 그 품목에 붙이고, 필름·메모는 품목 설명 뒤에.
   묶기 규칙은 photo_quote.js. quote_pro.js 전역(MASTER, state, $, esc, toast, buildAll, refresh, persist, 보이는가,
   고른옵션, 현장ID확보, PDB, 구역장수갱신)을 쓴다. */
(function () {
  const URL_ = 'https://primary-production-a6fa.up.railway.app/webhook/quote-photo-read';
  const 최대 = 30, 묶음 = 6;
  const 바 = $('#draftBar');
  if (!바 || typeof PhotoQuote === 'undefined') return;

  const 버튼 = document.createElement('button');
  버튼.type = 'button'; 버튼.id = 'pqToggle'; 버튼.textContent = '📷 사진으로 견적';
  const 고르기 = document.createElement('input');
  고르기.type = 'file'; 고르기.accept = 'image/*'; 고르기.multiple = true; 고르기.hidden = true;
  const 줄 = document.createElement('div'); 줄.className = 'pq-row';
  줄.appendChild($('#draftToggle')); 줄.appendChild(버튼);
  바.insertBefore(줄, 바.firstChild); 바.appendChild(고르기);

  const 판 = document.createElement('section'); 판.id = 'pqSheet'; 판.hidden = true;
  판.innerHTML = '<div class="pq-in"><div class="pq-head"><h2 id="pqTitle">📷 사진으로 견적</h2><button type="button" class="pq-x" aria-label="닫기">✕</button></div>' +
    '<div id="pqBody"></div></div><div class="pq-foot" id="pqFoot"></div>';
  document.body.appendChild(판);
  판.querySelector('.pq-x').onclick = 닫기;

  let 사진들 = [], 결과 = [], 줄들 = [], 확인 = [], 읽는중 = false;

  function 닫기() {
    if (읽는중 && !confirm('사진을 읽는 중이에요. 그만둘까요?')) return;
    읽는중 = false; 판.hidden = true; document.body.classList.remove('pq-open');
    사진들.forEach((p) => URL.revokeObjectURL(p.url)); 사진들 = [];
  }

  버튼.addEventListener('click', () => {
    if (!MASTER || !MASTER.zones) { toast('방문견적 품목을 아직 못 받았어요. 잠시 뒤 다시 눌러 주세요.'); return; }
    고르기.value = ''; 고르기.click();
  });
  고르기.addEventListener('change', () => {
    const files = Array.prototype.slice.call(고르기.files || []).filter((f) => /^image\//.test(f.type || '') || /\.(jpe?g|png|webp|heic)$/i.test(f.name || ''));
    if (!files.length) return;
    if (files.length > 최대) toast('사진은 ' + 최대 + '장까지예요 — 앞의 ' + 최대 + '장만 읽어요');
    시작(files.slice(0, 최대));
  });

  // AI 로 보낼 작은 사진 (긴 변 1280px JPEG) — 원본 파일은 견적 사진으로 따로 넣는다
  function 줄이기(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res({ url, data: c.toDataURL('image/jpeg', 0.8).split(',')[1] });
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('열지 못함')); };
      img.src = url;
    });
  }

  function 품목들() { return MASTER.zones.map((z) => ({ 구역: z.구역, items: z.items.filter(보이는가) })); }

  async function 시작(files) {
    사진들 = files.map((f, i) => ({ n: i, file: f, url: URL.createObjectURL(f), done: false, bad: false }));
    결과 = []; 판.hidden = false; document.body.classList.add('pq-open');
    $('#pqTitle').textContent = '📷 사진으로 견적';
    읽는중 = true; 그리기읽기();
    const 목록 = PhotoQuote.품목목록(품목들());
    for (let i = 0; i < 사진들.length && 읽는중; i += 묶음) {
      const 이번 = 사진들.slice(i, i + 묶음);
      const photos = [];
      for (const p of 이번) {
        try { photos.push({ mime: 'image/jpeg', data: (await 줄이기(p.file)).data }); }
        catch (e) { p.bad = true; photos.push({ mime: 'image/jpeg', data: '' }); }
      }
      let 답 = null;
      for (let 번 = 0; 번 < 2 && !답 && 읽는중; 번++) {
        try {
          const res = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: 목록, photos: photos.filter((x) => x.data), start: i }) });
          if (res.status === 401 || res.status === 403) { 읽는중 = false; 그리기오류('사장님 열쇠가 없는 기기라 AI 를 부를 수 없어요.'); return; }
          const j = await res.json();
          if (j && Array.isArray(j.photos)) 답 = j;
        } catch (e) { /* 한 번 더 */ }
      }
      if (!읽는중) return;
      // 못 연 사진을 빼고 보냈으면 번호를 다시 맞춘다
      const 보낸 = 이번.filter((p) => !p.bad);
      보낸.forEach((p, k) => {
        const x = 답 && 답.photos[k];
        결과.push(x ? Object.assign({}, x, { n: p.n }) : { n: p.n, id: null, qty: 1, film: '', memo: '', text: '' });
      });
      이번.filter((p) => p.bad).forEach((p) => 결과.push({ n: p.n, id: null, qty: 1, film: '', memo: '', text: '(사진을 열지 못했어요)' }));
      이번.forEach((p) => { p.done = true; });
      그리기읽기();
    }
    if (!읽는중) return;
    읽는중 = false;
    const r = PhotoQuote.합치기(결과, MASTER.zones);
    줄들 = r.rows.map((x) => Object.assign({ on: true }, x));
    확인 = r.need.map((x) => Object.assign({ id: '', qty: 1, on: true }, x));
    그리기확인();
  }

  function 그리기읽기() {
    const 끝 = 사진들.filter((p) => p.done).length;
    $('#pqBody').innerHTML = '<p class="pq-hint">사진에 적힌 위치·필름번호·메모와 사진 모습을 같이 봐요. 다 읽으면 확인 화면이 나와요.</p>' +
      '<div class="pq-prog">사진 ' + 사진들.length + '장 읽는 중… ' + 끝 + '장 끝<div class="pq-bar"><i style="width:' + Math.round(끝 / 사진들.length * 100) + '%"></i></div></div>' +
      '<div class="pq-grid">' + 사진들.map((p) => '<div class="pq-g' + (p.done ? '' : ' w') + '"><img src="' + p.url + '" alt=""><b>' + (p.done ? '✓' : '…') + '</b></div>').join('') + '</div>';
    $('#pqFoot').innerHTML = '<button type="button" class="pq-b" id="pqStop">그만두기</button>';
    $('#pqStop').onclick = 닫기;
  }
  function 그리기오류(글) {
    $('#pqBody').innerHTML = '<p class="pq-err">' + esc(글) + '</p>';
    $('#pqFoot').innerHTML = '<button type="button" class="pq-b" id="pqStop">닫기</button>';
    $('#pqStop').onclick = 닫기;
  }

  // 품목 고르기 칸 (구역별 묶음)
  function 고르기칸(지금) {
    return '<select class="pq-sel">' + (지금 ? '' : '<option value="">❓ 품목 고르기</option>') +
      품목들().map((z) => '<optgroup label="' + esc(z.구역) + '">' + z.items.filter((it) => !it.파생).map((it) =>
        '<option value="' + esc(it.체크_ID) + '"' + (it.체크_ID === 지금 ? ' selected' : '') + '>' + esc(z.구역 + ' ' + it.표시_품목명) + '</option>').join('') + '</optgroup>').join('') +
      '</select>';
  }
  function 카드(x, 확인필요) {
    const imgs = x.photos ? x.photos : [x.n];
    const 사진 = imgs.slice(0, 2).map((n) => '<img src="' + 사진들[n].url + '" alt="">').join('') + (imgs.length > 2 ? '<small>+' + (imgs.length - 2) + '장</small>' : '');
    const films = x.films || (x.film ? [x.film] : []), memos = x.memos || (x.memo ? [x.memo] : []);
    const 글 = x.texts ? x.texts.join(' / ') : x.text;
    return '<div class="pq-it' + (확인필요 ? ' need' : '') + (x.on ? '' : ' off') + '">' +
      '<div class="pq-th">' + 사진 + '</div><div class="pq-bd">' +
      '<div class="pq-l1">' + 고르기칸(x.id) + '<span class="pq-q"><button type="button" data-d="-1">−</button><b>' + x.qty + '</b><button type="button" data-d="1">+</button></span></div>' +
      '<div class="pq-l2">' + films.map((f) => '<span class="pq-film">🎞 ' + esc(f) + '</span>').join('') + memos.map((m) => '<span class="pq-memo">📝 ' + esc(m) + '</span>').join('') + '</div>' +
      '<div class="pq-src">사진 ' + imgs.map((n) => n + 1).join('·') + (글 ? ' 「' + esc(글) + '」' : 확인필요 ? ' — 글씨가 없어요. 사진을 보고 품목을 골라 주세요' : '') +
        (imgs.length > 1 && !확인필요 ? ' — 같은 품목이라 합침' : '') + '</div>' +
      '</div><button type="button" class="pq-del" aria-label="빼기">' + (x.on ? '✕' : '↩') + '</button></div>';
  }
  function 그리기확인() {
    const 켠 = 줄들.filter((x) => x.on).length + 확인.filter((x) => x.on && x.id).length;
    const 필름 = new Set(); 줄들.forEach((x) => x.films.forEach((f) => 필름.add(f.split(' ')[0].toLowerCase())));
    $('#pqTitle').textContent = '📷 사진 ' + 사진들.length + '장 → 품목 ' + 줄들.length + '개';
    let h = '<p class="pq-hint">틀린 것만 고치고 [넣기]. 품목·수량은 눌러서 바꿔요. 사진은 그 품목에 붙어 견적서에 같이 나가요.</p>' +
      '<div class="pq-sum"><span>품목 ' + 줄들.length + '</span>' + (필름.size ? '<span>필름 ' + 필름.size + '종</span>' : '') + (확인.length ? '<span class="warn">⚠ 확인 필요 ' + 확인.length + '</span>' : '') + '</div>';
    let 앞구역 = '';
    줄들.forEach((x, i) => {
      if (x.구역 !== 앞구역) { h += '<div class="pq-zone">' + esc(x.구역) + '</div>'; 앞구역 = x.구역; }
      h += '<div data-k="r' + i + '">' + 카드(x, false) + '</div>';
    });
    if (확인.length) h += '<div class="pq-zone">확인 필요</div>' + 확인.map((x, i) => '<div data-k="n' + i + '">' + 카드(x, true) + '</div>').join('');
    if (!줄들.length && !확인.length) h += '<p class="pq-err">읽은 품목이 없어요.</p>';
    $('#pqBody').innerHTML = h;
    $('#pqFoot').innerHTML = '<button type="button" class="pq-b" id="pqStop">닫기</button><button type="button" class="pq-b go" id="pqGo"' + (켠 ? '' : ' disabled') + '>✅ ' + 켠 + '개 견적에 넣기</button>';
    $('#pqStop').onclick = 닫기;
    $('#pqGo').onclick = 넣기;
    $('#pqBody').querySelectorAll('[data-k]').forEach((w) => {
      const k = w.dataset.k, x = k[0] === 'r' ? 줄들[+k.slice(1)] : 확인[+k.slice(1)];
      w.querySelector('.pq-sel').onchange = (e) => { x.id = e.target.value; 그리기확인(); };
      w.querySelectorAll('.pq-q button').forEach((b) => { b.onclick = () => { x.qty = Math.max(1, Math.min(99, x.qty + Number(b.dataset.d))); 그리기확인(); }; });
      w.querySelector('.pq-del').onclick = () => { x.on = !x.on; 그리기확인(); };
    });
  }

  async function 넣기() {
    const 묶 = {};   // 품목 id → { qty, films, memos, photos }
    const 더 = (id, x, photos) => {
      const m = 묶[id] = 묶[id] || { qty: 0, films: [], memos: [], photos: [] };
      m.qty = Math.max(m.qty, x.qty);
      (x.films || (x.film ? [x.film] : [])).forEach((f) => { if (m.films.indexOf(f) < 0) m.films.push(f); });
      (x.memos || (x.memo ? [x.memo] : [])).forEach((f) => { if (m.memos.indexOf(f) < 0) m.memos.push(f); });
      photos.forEach((n) => m.photos.push(n));
    };
    줄들.forEach((x) => { if (x.on && x.id) 더(x.id, x, x.photos); });
    확인.forEach((x) => { if (x.on && x.id) 더(x.id, x, [x.n]); });
    const ids = Object.keys(묶);
    if (!ids.length) return;
    $('#pqGo').disabled = true; $('#pqGo').textContent = '넣는 중…';
    const 찾기 = {};
    MASTER.zones.forEach((z) => z.items.forEach((it) => { 찾기[it.체크_ID] = { item: it, 구역: z.구역 }; }));
    let 새것 = 0, 사진수 = 0;
    state.설명 = state.설명 || {};
    for (const id of ids) {
      const f = 찾기[id]; if (!f) continue;
      const m = 묶[id], it = f.item;
      if (!state.선택[id]) {
        const 평형별 = it.적용평형 && it.적용평형 !== '공통';
        state.선택[id] = { 수량: 평형별 ? (it.평형별_설정길이 || 1) : m.qty, 난이도: 1, 옵션: 0, 초안: true };
        새것++;
      }
      const 원래 = state.설명[id] || ((고른옵션(it, state.선택[id]) || {}).품목설명 || '');
      const 새설명 = PhotoQuote.설명덧붙이기(원래, m.films, m.memos);
      if (새설명 && 새설명 !== 원래) state.설명[id] = 새설명;
      for (const n of m.photos) {
        try { const p = await PDB.추가(현장ID확보(), f.구역, 사진들[n].file); await PDB.태그저장(p.id, [id]); 사진수++; }
        catch (e) { console.warn('사진 넣기 실패', e); }
      }
    }
    buildAll(); refresh(); persist();
    try { await 구역장수갱신(); } catch (e) { /* 사진 표시만 늦을 뿐 */ }
    const 구역들 = new Set(ids.map((id) => 찾기[id] && 찾기[id].구역));
    document.querySelectorAll('#zones .zone').forEach((d) => { if (구역들.has(d._zone)) d.open = true; });
    읽는중 = false; 닫기();
    toast(ids.length + '개 품목' + (새것 < ids.length ? ' (새로 체크 ' + 새것 + ')' : '') + ' · 사진 ' + 사진수 + '장 넣었어요');
  }
})();
