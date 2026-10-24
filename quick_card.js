/* 1분견적 결과 카드 (2026-10-24 사장님, 1단계 — 섬세한손길 먼저).
   채팅으로 견적을 받으면 방문견적처럼 품목 카드로 보여준다: 품목마다 체크로 빼고 넣고, 합계가 바로 바뀌고,
   고른 그대로 상담신청. 채팅으로 더 치면 같은 카드에 합쳐진다.
   몰딩·걸레받이는 방마다 풀어 보여준다 — 거실·주방·현관 합쳐 50%, 나머지 50% 를 방 수로 똑같이 (사장님 기준).
   방 수는 평수로 정한다(20평대 2 · 30평대 3 · 40평 이상 4) — 고객이 바꿀 수 있다.
   2단계: 샤시(단창/2중창/시스템)·싱크대(상하부장 전체/상부장만/하부장만)는 종류를 눌러 금액 비교 — 단가표
   (pro-addon-price, 1분견적과 같은 '시공품목정보')의 1단위 금액 비율로 바꾼다. [＋ 추가 견적 받기] 는 방문견적과
   같은 상담원 질문(quote_addon.js)으로 품목을 더한다.
   앞부분은 화면과 상관없는 계산(node 테스트: test/quick_card.test.js), 뒷부분 view 는 브라우저 전용. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QuickCard = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const 수 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const 원 = (n) => Math.round(수(n)).toLocaleString('ko-KR') + '원';

  function 평수(text) {
    const m = /(\d{2})\s*평/.exec(String(text || ''));
    return m ? Number(m[1]) : null;
  }
  function 방수(평) { return !평 ? 3 : 평 < 30 ? 2 : 평 < 40 ? 3 : 4; }
  const 묶음품목 = (name) => /몰딩|걸레받이/.test(String(name || ''));

  // 종류를 눌러 바꿀 수 있는 품목 (2단계). 표 = 단가표의 시공_품목명
  const 종류들 = {
    샤시: [{ 글: '단창', 표: '샤시(단창)' }, { 글: '2중창', 표: '샤시(2중창)' }, { 글: '시스템', 표: '시스템샤시' }],
    싱크대: [{ 글: '상하부장 전체', 표: '싱크대' }, { 글: '상부장만', 표: '싱크대 상부장' }, { 글: '하부장만', 표: '싱크대 하부장' }],
  };
  /* 이름으로 어느 종류인지 → { group, idx } 또는 null. 상가샤시는 따로라 뺀다.
     그냥 '샤시' 는 1분견적 기본(2중창)으로 본다 */
  function 종류찾기(name) {
    const n = String(name || '').replace(/\s+/g, '');
    if (/샤시|샷시/.test(n) && !/상가/.test(n)) return { group: '샤시', idx: /시스템/.test(n) ? 2 : /단창/.test(n) ? 0 : 1 };
    if (/싱크대/.test(n)) return { group: '싱크대', idx: /상하부장|전체/.test(n) ? 0 : /상부장/.test(n) ? 1 : /하부장/.test(n) ? 2 : 0 };
    return null;
  }
  // 단가표 한 줄의 1단위 금액 = (인건비 + 자재비) × 소모량
  function 단위금액(row) { return row ? (수(row.인건비단가) + 수(row.자재비단가 || 9000)) * 수(row.자재소모량) : 0; }
  /* 종류를 바꿨을 때 금액: 처음 받은 금액 × (고른 종류 1단위 ÷ 처음 종류 1단위). 길이·평수는 그대로 따라간다.
     표 = { 시공_품목명: 줄 }. 못 구하면 null */
  function 종류금액(item, idx, 표) {
    if (!item || !item.kind || !표) return null;
    const opts = 종류들[item.kind.group] || [];
    const 처음 = 단위금액(표[(opts[item.kind.base] || {}).표]), 고른 = 단위금액(표[(opts[idx] || {}).표]);
    if (!(처음 > 0) || !(고른 > 0)) return null;
    return Math.round(item.baseSubtotal * 고른 / 처음);
  }
  // 화면·상담 글에 쓸 이름 — 종류를 바꾸면 '30평 싱크대 상부장만', '샤시 단창' 처럼
  function 보이는이름(item) {
    if (!item || !item.kind || item.kind.cur === item.kind.base) return item ? item.name : '';
    const o = (종류들[item.kind.group] || [])[item.kind.cur];
    const 평 = 평수(item.name);
    return (평 ? 평 + '평 ' : '') + item.kind.group + ' ' + (o ? o.글 : '');
  }
  function 종류고르기(item, idx, 표) {
    const v = 종류금액(item, idx, 표);
    if (v == null) return false;
    item.kind.cur = idx;
    item.subtotal = v;
    return true;
  }

  /* 전체 금액 → 거실·주방·현관 50%, 방1~방n 이 나머지를 똑같이. 100원 단위, 남는 몇십 원은 마지막 방에 */
  function 나누기(total, rooms) {
    const t = Math.round(수(total));
    const n = Math.max(1, Math.floor(수(rooms)) || 1);
    const 공용 = Math.round(t / 2 / 100) * 100;
    const 방몫 = t - 공용;
    const 한방 = Math.floor(방몫 / n / 100) * 100;
    const out = [{ key: '공용', label: '거실·주방·현관', amount: 공용 }];
    for (let i = 1; i <= n; i++) out.push({ key: '방' + i, label: '방' + i, amount: i === n ? 방몫 - 한방 * (n - 1) : 한방 });
    return out;
  }

  function 새카트() { return { quoteId: '', seq: 0, items: [] }; }
  function 카트읽기(raw) {
    const c = raw && typeof raw === 'object' ? raw : {};
    const out = 새카트();
    out.quoteId = String(c.quoteId || '');
    out.seq = 수(c.seq);
    out.items = (Array.isArray(c.items) ? c.items : []).filter((x) => x && x.name).map((x) => ({
      id: String(x.id || ''), name: String(x.name), label: String(x.label || ''), subtotal: 수(x.subtotal),
      material: 수(x.material), labor: 수(x.labor), text: String(x.text || ''), on: x.on !== false,
      bundle: x.bundle && typeof x.bundle === 'object'
        ? { 평: 수(x.bundle.평) || null, rooms: Math.max(1, 수(x.bundle.rooms) || 3), off: Array.isArray(x.bundle.off) ? x.bundle.off.map(String) : [] }
        : null,
      kind: x.kind && 종류들[x.kind.group] ? { group: x.kind.group, base: 수(x.kind.base), cur: 수(x.kind.cur) } : null,
      baseSubtotal: 수(x.baseSubtotal) || 수(x.subtotal),
      added: !!x.added,
    }));
    return out;
  }
  /* 서버가 준 줄들을 카트에 붙인다. meta.message = 고객이 친 글(평수 찾기용), meta.quoteId */
  function 붙이기(cart, lines, meta) {
    const c = 카트읽기(cart);
    const m = meta || {};
    if (m.quoteId) c.quoteId = String(m.quoteId);
    /* 앞 견적에 이미 있는 품목을 다시 물으면 (예: 20평 전체 → '화장실문 2세트') 새 줄로 덧붙이지 않고 그 자리에서 바꾼다.
       c.새로 = 이번에 들어오거나 바뀐 줄 id, c.바뀐 = [{ 이름, 전, 후 }] (저장하지 않는 표시용) */
    const 키 = (n) => String(n || '').replace(/\s+/g, '');
    const 전있던 = c.items.length;
    c.새로 = []; c.바뀐 = [];
    (Array.isArray(lines) ? lines : []).forEach((l) => {
      if (!l || !l.name || !(수(l.subtotal) > 0)) return;
      c.seq += 1;
      const item = { id: 'q' + c.seq, name: String(l.name).trim(), label: String(l.label || '').trim(), subtotal: Math.round(수(l.subtotal)),
        material: Math.round(수(l.material)), labor: Math.round(수(l.labor)), on: true, bundle: null,
        text: String(l.text || '').split('\n').map((s) => s.trim()).filter((s) => s && !/^[-─=~·.\s]+$/.test(s)).join('\n') };   // '-----' 구분 줄은 뺀다
      item.baseSubtotal = item.subtotal;
      item.added = !!l.added;   // [＋ 추가 견적 받기] 로 더한 줄
      const k = 종류찾기(item.name);
      item.kind = k ? { group: k.group, base: k.idx, cur: k.idx } : null;
      if (묶음품목(item.name)) {
        const 평 = 평수(item.name + ' ' + item.label) || 평수(m.message);
        if (평) item.bundle = { 평: 평, rooms: 방수(평), off: [] };
      }
      c.새로.push(item.id);
      const 같은 = item.added ? -1 : c.items.findIndex((x, i) => i < 전있던 && !x.added && 키(x.name) === 키(item.name));
      if (같은 >= 0) {
        const 전 = c.items[같은];
        c.바뀐.push({ 이름: item.name, 전: (전.label ? 전.label + ' ' : '') + 원(줄금액(전)), 후: (item.label ? item.label + ' ' : '') + 원(item.subtotal) });
        c.items[같은] = item;
        return;
      }
      c.items.push(item);
    });
    return c;
  }
  function 묶음줄(item) { return item.bundle ? 나누기(item.subtotal, item.bundle.rooms) : []; }
  function 줄금액(item) {
    if (!item || !item.on) return 0;
    if (!item.bundle) return item.subtotal;
    return 묶음줄(item).filter((p) => item.bundle.off.indexOf(p.key) < 0).reduce((s, p) => s + p.amount, 0);
  }
  function 합계(cart) { return (cart.items || []).reduce((s, it) => s + 줄금액(it), 0); }
  // 상담신청에 붙일 글 — 고른 것만, 뺀 것은 '(뺌)'
  function 고른글(cart) {
    const out = [];
    (cart.items || []).forEach((it) => {
      const 이름 = 보이는이름(it) + (it.label ? ' ' + it.label : '') + (it.added ? ' [추가]' : '');
      if (!it.on) { out.push('- ' + 이름 + ' (뺌)'); return; }
      if (it.bundle) {
        const parts = 묶음줄(it);
        const 남은 = parts.filter((p) => it.bundle.off.indexOf(p.key) < 0).map((p) => p.label);
        const 뺀 = parts.filter((p) => it.bundle.off.indexOf(p.key) >= 0).map((p) => p.label);
        out.push('- ' + 이름 + ' (방 ' + it.bundle.rooms + '개): ' + 원(줄금액(it)) + ' · ' + 남은.join(', ') + (뺀.length ? ' / 뺌: ' + 뺀.join(', ') : ''));
        return;
      }
      out.push('- ' + 이름 + ': ' + 원(it.subtotal));
    });
    out.push('합계: ' + 원(합계(cart)));
    return out.join('\n');
  }

  /* ---------- 화면 (브라우저) ----------
     opts: { cart, partner: { manager, phone, notice }, onChange(cart), onConsult(cart, done(ok)), onAddMore() } */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function view(opts) {
    const o = opts || {};
    let cart = 카트읽기(o.cart);
    const 새로 = Array.isArray(o.hot) ? o.hot : [];   // 방금 들어오거나 바뀐 줄 — 잠깐 빛나게
    let 표 = null;                 // 단가표 { 시공_품목명: 줄 } — 종류 탭·추가 견적에 쓴다
    const 추가 = { 열림: false, 품목: null, 고른: {}, 오류: '' };
    const box = document.createElement('div');
    box.className = 'qk-card';
    if (o.getTable) o.getTable().then((m) => { 표 = m || null; paint(); }).catch(() => { 표 = null; });
    const 바뀜 = () => { 새로.length = 0; if (o.onChange) o.onChange(cart); paint(); };
    function paint() {
      const total = 합계(cart);
      const H = [];
      H.push('<div class="qk-head"><div class="qk-t">✅ 1분 가견적' + (cart.quoteId ? '<em>' + esc(cart.quoteId) + '</em>' : '') + '</div>' +
        '<div class="qk-warn">📌 기본 솔리드필름 기준 · 현장을 보면 금액이 달라질 수 있어요</div></div>');
      if (추가.열림) H.push(추가HTML());
      else H.push('<button type="button" class="qk-add" data-act="more"><span class="qk-add-ic">👩‍💼</span><span><b>＋ 추가 견적 받기</b><small>더 하고 싶은 품목을 고르면 바로 금액이 나와요</small></span></button>');
      cart.items.forEach((it) => {
        const off = !it.on;
        H.push('<div class="qk-it' + (off ? ' off' : '') + (it.bundle ? ' bundle' : '') + (새로.indexOf(it.id) >= 0 ? ' qk-hot' : '') + '" data-id="' + esc(it.id) + '">');
        H.push('<div class="qk-r"><button type="button" class="qk-ck' + (off ? '' : ' on') + '" data-act="toggle" aria-label="' + esc(it.name) + ' 넣기/빼기">✓</button>' +
          '<span class="qk-nm">' + esc(보이는이름(it)) + (it.label ? '<small>' + esc(it.label) + '</small>' : '') + (it.added ? '<em class="qk-new">추가</em>' : '') + '</span>' +
          '<span class="qk-pr">' + 원(off ? (it.bundle ? 줄금액(Object.assign({}, it, { on: true })) : it.subtotal) : 줄금액(it)) + '</span></div>');
        // 종류 탭 (샤시·싱크대) — 단가표를 받은 뒤에만, 탭마다 그 종류 금액
        if (it.kind && !off && 표) {
          const 탭 = (종류들[it.kind.group] || []).map((k, i) => ({ k, i, v: 종류금액(it, i, 표) })).filter((x) => x.v != null);
          if (탭.length > 1) H.push('<div class="qk-tabs">' + 탭.map((x) => '<button type="button" class="' + (x.i === it.kind.cur ? 'on' : '') +
            '" data-act="kind" data-i="' + x.i + '">' + esc(x.k.글) + '<small>' + 원(x.v) + '</small></button>').join('') + '</div>');
        }
        if (it.bundle && !off) {
          H.push('<div class="qk-rooms">방 개수 ' + [1, 2, 3, 4, 5].map((n) =>
            '<button type="button" class="' + (it.bundle.rooms === n ? 'on' : '') + '" data-act="rooms" data-n="' + n + '">' + n + '</button>').join('') +
            '<small>' + (it.bundle.평 ? it.bundle.평 + '평 기준' : '') + '</small></div>');
          묶음줄(it).forEach((p) => {
            const pOff = it.bundle.off.indexOf(p.key) >= 0;
            H.push('<div class="qk-sub' + (pOff ? ' off' : '') + '"><button type="button" class="qk-ck2' + (pOff ? '' : ' on') + '" data-act="part" data-key="' + esc(p.key) + '">✓</button>' +
              '<span>' + esc(p.label) + (pOff ? ' <small>(뺌)</small>' : '') + '</span><b>' + 원(p.amount) + '</b></div>');
          });
        }
        if (off) H.push('<div class="qk-mini">체크를 다시 누르면 넣어져요</div>');
        else if (it.text) H.push('<div class="qk-note">' + esc(it.text).replace(/\n/g, '<br>') + '</div>');
        H.push('</div>');
      });
      H.push('<div class="qk-sum"><span>합계</span><b>' + 원(total) + '</b><small>부가세 별도</small></div>');
      H.push('<div class="qk-consult-wrap"><button type="button" class="qk-consult" data-act="consult"' + (total > 0 ? '' : ' disabled') + '>☎ 이대로 상담신청</button></div>');
      if (o.partner && o.partner.notice) H.push('<div class="qk-notice"><b>📌 알립니다!</b><br>' + esc(o.partner.notice).replace(/\n/g, '<br>') + '</div>');
      if (o.partner && o.partner.phone) H.push('<a class="qk-tel" href="tel:' + esc(o.partner.phone) + '">📞 ' + esc(o.partner.phone) + (o.partner.manager ? ' <small>' + esc(o.partner.manager) + '</small>' : '') + '</a>');
      box.innerHTML = H.join('');
    }
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'more') { 추가열기(); return; }
      if (act === 'chat') { 추가.열림 = false; paint(); if (o.onAddMore) o.onAddMore(); return; }
      if (act.indexOf('ad-') === 0) { 추가누름(act, b); return; }
      if (act === 'consult') { openConsult(); return; }
      const row = b.closest('.qk-it');
      const it = row && cart.items.find((x) => x.id === row.dataset.id);
      if (!it) return;
      if (act === 'toggle') it.on = !it.on;
      else if (act === 'kind') { if (!종류고르기(it, Number(b.dataset.i), 표)) return; }
      else if (act === 'rooms') { it.bundle.rooms = Number(b.dataset.n) || 3; it.bundle.off = it.bundle.off.filter((k) => k === '공용' || Number(k.slice(1)) <= it.bundle.rooms); }
      else if (act === 'part') {
        const k = b.dataset.key, i = it.bundle.off.indexOf(k);
        if (i >= 0) it.bundle.off.splice(i, 1); else it.bundle.off.push(k);
      }
      바뀜();
    });
    /* ---- [＋ 추가 견적 받기] 상담원 질문 (방문견적과 같은 quote_addon.js) ---- */
    const QA = () => (typeof QuoteAddon !== 'undefined' ? QuoteAddon : null);
    function 추가열기() {
      추가.열림 = true; 추가.품목 = null; 추가.고른 = {}; 추가.오류 = '';
      if (!표 && o.getTable) {
        o.getTable().then((m) => { 표 = m || null; if (!표) 추가.오류 = '단가를 불러오지 못했어요. 아래 채팅칸에 적어 주셔도 돼요.'; paint(); })
          .catch(() => { 추가.오류 = '단가를 불러오지 못했어요. 아래 채팅칸에 적어 주셔도 돼요.'; paint(); });
      }
      paint();
      const el = box.querySelector('.qk-wiz'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    // 지금 고른 대로의 줄 (다 골랐을 때만)
    function 추가줄() {
      const A = QA(); if (!A || !표 || !추가.품목) return null;
      const s = A.선택(추가.품목, 추가.고른, 표); if (!s) return null;
      const l = A.줄만들기(표[s.표이름], s, 0, null); if (!l) return null;
      return { s, l };
    }
    function 추가HTML() {
      const A = QA();
      const 머리 = (q, sub) => '<div class="qk-wiz-h"><span class="qk-wiz-av">👩‍💼</span><div class="qk-wiz-q">' + q + (sub ? '<small>' + sub + '</small>' : '') +
        '</div><button type="button" class="qk-wiz-x" data-act="ad-close" aria-label="닫기">✕</button></div>';
      const 채팅 = '<button type="button" class="qk-wiz-chat" data-act="chat">✏️ 찾는 품목이 없으면 아래 채팅칸에 적어 주세요</button>';
      if (!A || !표) return '<div class="qk-wiz">' + 머리(추가.오류 ? '앗, 잠시만요' : '단가를 불러오는 중이에요…', 추가.오류 ? esc(추가.오류) : '') + 채팅 + '</div>';
      if (!추가.품목) {
        return '<div class="qk-wiz">' + 머리('어떤 품목을 더 할까요?', '고르면 하나씩 여쭤볼게요') +
          '<div class="qk-wiz-opts items">' + A.쓸품목(표).map((p, i) => '<button type="button" data-act="ad-item" data-i="' + i + '"><span>' + p.아이콘 + '</span>' + esc(p.이름) + '</button>').join('') + '</div>' + 채팅 + '</div>';
      }
      const 고른글 = [추가.품목.이름].concat(A.고른글(추가.품목, 추가.고른, 표));
      const crumb = '<div class="qk-wiz-crumb">' + 고른글.map((g) => '<span>' + esc(g) + '</span>').join('') + '</div>';
      const q = A.다음질문(추가.품목, 추가.고른, 표);
      if (q) {
        const 길이칸 = q.키 === '길이' ? '<div class="qk-wiz-len"><input type="number" inputmode="decimal" step="0.5" min="0.5" placeholder="직접 (m)"><button type="button" data-act="ad-len">확인</button></div>' : '';
        return '<div class="qk-wiz">' + 머리(esc(q.질문), esc(q.도움 || '')) + crumb +
          '<div class="qk-wiz-opts">' + q.보기.map((x, i) => '<button type="button" data-act="ad-pick" data-i="' + i + '">' + esc(x.글) + '</button>').join('') + '</div>' + 길이칸 +
          '<button type="button" class="qk-wiz-back" data-act="ad-back">← 처음으로</button></div>';
      }
      const r = 추가줄();
      if (!r) return '<div class="qk-wiz">' + 머리('금액을 계산하지 못했어요', '채팅칸에 적어 주시면 바로 알려드릴게요') + 채팅 + '</div>';
      return '<div class="qk-wiz">' + 머리('이렇게 더할까요?', '현장을 보면 금액이 달라질 수 있어요') + crumb +
        '<div class="qk-wiz-sum"><b>' + esc(r.s.이름) + '</b><span>' + (r.l.단위 === 'm' ? r.l.수량 + 'm' : '1' + esc(r.l.단위 || '개')) + '</span><strong>' + 원(r.l.표시금액) + '</strong></div>' +
        '<div class="qk-wiz-bt"><button type="button" data-act="ad-back">다시 고르기</button><button type="button" class="go" data-act="ad-add">이 견적에 넣기</button></div></div>';
    }
    function 추가누름(act, b) {
      const A = QA();
      if (act === 'ad-close') { 추가.열림 = false; paint(); return; }
      if (act === 'ad-back') { 추가.품목 = null; 추가.고른 = {}; paint(); return; }
      if (!A || !표) return;
      if (act === 'ad-item') { 추가.품목 = A.쓸품목(표)[Number(b.dataset.i)] || null; 추가.고른 = {}; paint(); return; }
      const q = 추가.품목 && A.다음질문(추가.품목, 추가.고른, 표);
      if (act === 'ad-pick' && q) { 추가.고른[q.키] = q.보기[Number(b.dataset.i)].값; paint(); return; }
      if (act === 'ad-len' && q) {
        const n = A.길이다듬기((box.querySelector('.qk-wiz-len input') || {}).value);
        if (n == null) { alert('0.5 ~ 30m 사이로 적어 주세요'); return; }
        추가.고른.길이 = n; paint(); return;
      }
      if (act === 'ad-add') {
        const r = 추가줄(); if (!r) return;
        cart = 붙이기(cart, [{ name: r.s.이름, label: r.l.단위 === 'm' ? r.l.수량 + 'm' : '1' + (r.l.단위 || '개'), subtotal: r.l.표시금액,
          labor: r.l.인건비표시금액, material: r.l.표시금액 - r.l.인건비표시금액, text: '', added: true }], {});
        추가.열림 = false;
        바뀜();
        if (o.onAdded) o.onAdded(r.s.이름);
      }
    }

    // 상담신청: 고른 품목 요약 + 연락처 → onConsult
    function openConsult() {
      const wrap = box.querySelector('.qk-consult-wrap');
      if (!wrap || wrap.querySelector('.qk-form')) return;
      const lines = 고른글(cart).split('\n');
      wrap.innerHTML = '<div class="qk-form"><div class="qk-form-t">☎ 이대로 상담신청</div>' +
        '<div class="qk-form-list">' + lines.map((l) => '<div>' + esc(l.replace(/^- /, '')) + '</div>').join('') + '</div>' +
        '<input type="tel" class="qk-phone" inputmode="numeric" placeholder="연락처 010-0000-0000" autocomplete="tel">' +
        '<div class="qk-form-bt"><button type="button" class="qk-cancel">취소</button><button type="button" class="qk-send">신청하기</button></div></div>';
      const input = wrap.querySelector('.qk-phone');
      input.focus();
      input.addEventListener('input', () => {
        const d = input.value.replace(/[^0-9]/g, '').slice(0, 11);
        input.value = d.length > 7 ? d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7) : d.length > 3 ? d.slice(0, 3) + '-' + d.slice(3) : d;
      });
      wrap.querySelector('.qk-cancel').onclick = () => paint();
      wrap.querySelector('.qk-send').onclick = () => {
        const digits = input.value.replace(/[^0-9]/g, '');
        if (digits.length < 9 || digits.length > 11) { alert('올바른 연락처를 입력해 주세요. (예: 010-1234-5678)'); input.focus(); return; }
        const send = wrap.querySelector('.qk-send');
        send.disabled = true; send.textContent = '접수 중…';
        if (!o.onConsult) return;
        o.onConsult(cart, input.value.trim(), (ok) => {
          if (ok) wrap.innerHTML = '<div class="qk-done">✅ 상담 신청이 접수됐어요! 곧 연락드릴게요.</div>';
          else { send.disabled = false; send.textContent = '신청하기'; alert('신청 중 오류가 발생했어요. 다시 시도해 주세요.'); }
        });
      };
    }
    paint();
    box.update = (next) => { cart = 카트읽기(next); paint(); };
    return box;
  }

  return { 평수, 방수, 나누기, 새카트, 카트읽기, 붙이기, 묶음줄, 줄금액, 합계, 고른글, 종류들, 종류찾기, 단위금액, 종류금액, 종류고르기, 보이는이름, view };
});
