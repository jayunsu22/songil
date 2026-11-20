/* 긴급구인 화면 공용: n8n 웹훅 부르기, 글 이스케이프, 알림, 아이콘. 열쇠는 주소 끝(/e/w/<열쇠>)에서 읽는다.
   ?demo 를 붙이면 n8n 대신 가짜 응답(EJ_DEMO)으로 화면만 본다. 설계 D:\n8n_긴급구인\docs\superpowers\specs */
var EJ = (function () {
  var API = 'https://primary-production-a6fa.up.railway.app/webhook/gj';
  var demo = /[?&]demo/.test(location.search);
  var parts = location.pathname.split('/').filter(Boolean);
  var key = decodeURIComponent(parts[parts.length - 1] || '');
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function call(action, extra) {
    var body = Object.assign({ action: action, key: key }, extra || {});
    if (demo && window.EJ_DEMO) return new Promise(function (ok) { setTimeout(function () { ok(window.EJ_DEMO(body)); }, 350); });
    return fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .catch(function () { return { ok: false, error: '연결이 잠깐 끊겼어요. 잠시 뒤 다시 눌러 주세요', net: true }; });
  }
  var toastEl;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('on');
    clearTimeout(toast.t); toast.t = setTimeout(function () { toastEl.classList.remove('on'); }, 3200);
  }
  // 버튼을 누르는 동안 막아 두기 (두 번 누름 방지)
  function busy(btn, p) { if (btn) btn.classList.add('busy'); return p.finally(function () { if (btn) btn.classList.remove('busy'); }); }
  var DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  function today(now) { var d = new Date((now && now.date ? now.date : new Date().toISOString().slice(0, 10)) + 'T00:00:00'); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + DAYS[d.getDay()] + '요일'; }
  var I = {
    bolt: '<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
    boltBig: '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
    check: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
    thumb: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="좋아요"><path d="M7 10v11H4V10h3z"/><path d="M7 10l4-8c1.7 0 3 1.3 3 3v3h5.5a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.1 21H7"/></svg>',
    phone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
    lock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>'
  };
  function logo() { return '<div class="logo"><i>' + I.bolt + '</i>긴급구인</div>'; }
  // 막힌 열쇠(대기·정지·틀림) 화면
  function blocked(root, r) {
    root.innerHTML = '<div class="top">' + logo() + '</div><h1>' + (r.waiting ? '승인을 기다리는 중이에요' : r.stopped ? '이용이 멈춰 있어요' : r.badKey ? '링크가 맞지 않아요' : '잠깐 문제가 생겼어요') +
      '</h1><div class="card"><p style="margin:0">' + esc(r.error) + '</p>' + (r.net ? '<button class="btn line" onclick="location.reload()">다시 불러오기</button>' : '') + '</div>';
  }
  function tel(p) { return 'tel:' + String(p || '').replace(/[^0-9]/g, ''); }
  // ?demo 미리보기는 n8n 을 안 부른다 — 진짜로 착각하지 않게 맨 위에 띠를 붙인다 (11/21 사장님이 미리보기로 올렸다가 문자가 안 감)
  if (demo) document.addEventListener('DOMContentLoaded', function () {
    var bar = document.createElement('div');
    bar.setAttribute('role', 'note');
    bar.style.cssText = 'position:sticky;top:0;z-index:8;background:#1A1A1A;color:#fff;font-size:15px;font-weight:700;text-align:center;padding:10px 16px;line-height:1.4';
    bar.textContent = '미리보기 화면이에요 · 눌러도 실제로 보내지지 않아요';
    document.body.insertBefore(bar, document.body.firstChild);
  });
  return { call: call, esc: esc, toast: toast, busy: busy, today: today, I: I, logo: logo, blocked: blocked, tel: tel, demo: demo, key: key };
})();
