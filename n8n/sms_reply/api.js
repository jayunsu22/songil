// 문자_답장 › 처리: 앱 🤖 비서가 보낸 문자의 답장 (사장님 11/5: 문자도 카톡처럼 답장을 띄우고 처리 결과를). POST sms-reply (사장님 열쇠)
// { action: 'watch', items: [{ phone, name, siteId, siteName, client, fill, keys }] } ← 앱: 문자를 보낸 번호를 14일 기억
// { action: 'in', from, msg } ← 인원모집 흐름: 사장님 폰이 받은 문자 중 모집 답이 아닌 것. 기억한 번호의 답만 본다 — 다른 문자는 그냥 버린다
// 설계 docs/superpowers/specs/2026-11-05-답장띄우기-design.md
const b = $input.first().json.body || {};
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const tail = (p) => String(p || '').replace(/[^0-9]/g, '').slice(-8);
const sd = $getWorkflowStaticData('global');
const now = Date.now();
sd.watch = Object.fromEntries(Object.entries(sd.watch || {}).filter(([, w]) => now - w.at < 14 * 864e5));
if (b.action === 'watch') {
  let n = 0;
  (Array.isArray(b.items) ? b.items : []).slice(0, 30).forEach((it) => {
    const k = tail(it && it.phone);
    if (k.length < 8) return;
    sd.watch[k] = { at: now, name: s(it.name, 40), siteId: s(it.siteId, 40), siteName: s(it.siteName, 120), client: s(it.client, 60), fill: !!it.fill,
      keys: (Array.isArray(it.keys) ? it.keys : []).map((x) => s(x, 12)).slice(0, 6) };
    n++;
  });
  return [{ json: { resp: { ok: true, n }, go: false } }];
}
if (b.action === 'in') {
  const w = sd.watch[tail(b.from)], msg = s(b.msg, 1000);
  if (!w || !msg) return [{ json: { resp: { ok: true, known: false }, go: false } }];
  const ai = w.fill && !!w.siteId && w.siteId !== '-';
  const today = new Date(now + 9 * 3600e3).toISOString().slice(0, 10);
  return [{ json: { resp: { ok: true, known: true }, go: true, ai, msg, tailKey: tail(b.from), w, today,
    body: { room: w.name, client: w.client, siteId: w.siteId, today, mine: ['김정헌'], recent: [], messages: [{ d: today, t: '', who: w.name, text: msg }] } } }];
}
return [{ json: { resp: { ok: false, error: 'action 은 watch·in' }, go: false } }];
