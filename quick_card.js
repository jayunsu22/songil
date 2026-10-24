/* 1분견적 결과 카드 (2026-10-24 사장님, 1단계 — 섬세한손길 먼저).
   채팅으로 견적을 받으면 방문견적처럼 품목 카드로 보여준다: 품목마다 체크로 빼고 넣고, 합계가 바로 바뀌고,
   고른 그대로 상담신청. 채팅으로 더 치면 같은 카드에 합쳐진다.
   몰딩·걸레받이는 방마다 풀어 보여준다 — 거실·주방·현관 합쳐 50%, 나머지 50% 를 방 수로 똑같이 (사장님 기준).
   방 수는 평수로 정한다(20평대 2 · 30평대 3 · 40평 이상 4) — 고객이 바꿀 수 있다.
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
    }));
    return out;
  }
  /* 서버가 준 줄들을 카트에 붙인다. meta.message = 고객이 친 글(평수 찾기용), meta.quoteId */
  function 붙이기(cart, lines, meta) {
    const c = 카트읽기(cart);
    const m = meta || {};
    if (m.quoteId) c.quoteId = String(m.quoteId);
    (Array.isArray(lines) ? lines : []).forEach((l) => {
      if (!l || !l.name || !(수(l.subtotal) > 0)) return;
      c.seq += 1;
      const item = { id: 'q' + c.seq, name: String(l.name).trim(), label: String(l.label || '').trim(), subtotal: Math.round(수(l.subtotal)),
        material: Math.round(수(l.material)), labor: Math.round(수(l.labor)), on: true, bundle: null,
        text: String(l.text || '').split('\n').map((s) => s.trim()).filter((s) => s && !/^[-─=~·.\s]+$/.test(s)).join('\n') };   // '-----' 구분 줄은 뺀다
      if (묶음품목(item.name)) {
        const 평 = 평수(item.name + ' ' + item.label) || 평수(m.message);
        if (평) item.bundle = { 평: 평, rooms: 방수(평), off: [] };
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
      const 이름 = it.name + (it.label ? ' ' + it.label : '');
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
    const box = document.createElement('div');
    box.className = 'qk-card';
    const 바뀜 = () => { if (o.onChange) o.onChange(cart); paint(); };
    function paint() {
      const total = 합계(cart);
      const H = [];
      H.push('<div class="qk-head"><div class="qk-t">✅ 1분 가견적' + (cart.quoteId ? '<em>' + esc(cart.quoteId) + '</em>' : '') + '</div>' +
        '<div class="qk-warn">📌 기본 솔리드필름 기준 · 현장을 보면 금액이 달라질 수 있어요</div></div>');
      H.push('<button type="button" class="qk-add" data-act="more"><span class="qk-add-ic">👩‍💼</span><span><b>＋ 추가 견적 받기</b><small>더 할 품목을 아래 채팅칸에 적으면 이 견적에 합쳐져요</small></span></button>');
      cart.items.forEach((it) => {
        const off = !it.on;
        H.push('<div class="qk-it' + (off ? ' off' : '') + (it.bundle ? ' bundle' : '') + '" data-id="' + esc(it.id) + '">');
        H.push('<div class="qk-r"><button type="button" class="qk-ck' + (off ? '' : ' on') + '" data-act="toggle" aria-label="' + esc(it.name) + ' 넣기/빼기">✓</button>' +
          '<span class="qk-nm">' + esc(it.name) + (it.label ? '<small>' + esc(it.label) + '</small>' : '') + '</span>' +
          '<span class="qk-pr">' + 원(off ? (it.bundle ? 줄금액(Object.assign({}, it, { on: true })) : it.subtotal) : 줄금액(it)) + '</span></div>');
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
      if (act === 'more') { if (o.onAddMore) o.onAddMore(); return; }
      if (act === 'consult') { openConsult(); return; }
      const row = b.closest('.qk-it');
      const it = row && cart.items.find((x) => x.id === row.dataset.id);
      if (!it) return;
      if (act === 'toggle') it.on = !it.on;
      else if (act === 'rooms') { it.bundle.rooms = Number(b.dataset.n) || 3; it.bundle.off = it.bundle.off.filter((k) => k === '공용' || Number(k.slice(1)) <= it.bundle.rooms); }
      else if (act === 'part') {
        const k = b.dataset.key, i = it.bundle.off.indexOf(k);
        if (i >= 0) it.bundle.off.splice(i, 1); else it.bundle.off.push(k);
      }
      바뀜();
    });
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

  return { 평수, 방수, 나누기, 새카트, 카트읽기, 붙이기, 묶음줄, 줄금액, 합계, 고른글, view };
});
