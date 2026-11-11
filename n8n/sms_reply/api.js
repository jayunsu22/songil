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
    // 결재함 출입정보 질문 (11/6): 번호 질문의 답은 카톡과 같은 kakao-digest 로 — 업체 확인 답까지 칸에 넣는다
    if (it.ask && s(it.ask.q, 1500)) sd.watch[k].ask = { q: s(it.ask.q, 1500), date: s(it.ask.date, 10),
      checks: (Array.isArray(it.ask.checks) ? it.ask.checks : []).map((c) => ({ id: s(c && c.id, 40), text: s(c && c.text, 200), ok: !!(c && c.ok) })).filter((c) => c.id).slice(0, 12) };
    n++;
  });
  return [{ json: { resp: { ok: true, n }, go: false } }];
}
// 📱 번호부 (11/11 사장님 A안): 앱이 업체·발주처 번호와 그 가까운 현장들을 보낸다 — 통째로 바꾼다
// { action: 'book', items: [{ phone, name, client, sites: [{ id, name, date, known }] }] }
if (b.action === 'book') {
  const book = {};
  (Array.isArray(b.items) ? b.items : []).slice(0, 200).forEach((it) => {
    const k = tail(it && it.phone);
    if (k.length < 8) return;
    const sites = (Array.isArray(it.sites) ? it.sites : []).slice(0, 12).map((x) => ({ id: s(x && x.id, 40), name: s(x && x.name, 120), date: s(x && x.date, 10),
      known: (x && x.known && typeof x.known === 'object') ? Object.fromEntries(Object.entries(x.known).slice(0, 10).map(([kk, v]) => [s(kk, 12), s(v, 300)])) : {} })).filter((x) => x.id);
    if (sites.length) book[k] = { name: s(it.name, 60), client: s(it.client, 60), sites };
  });
  sd.book = book; sd.bookAt = now;
  return [{ json: { resp: { ok: true, n: Object.keys(book).length }, go: false } }];
}
if (b.action === 'in') {
  let w = sd.watch[tail(b.from)];
  // 비서가 문자를 보낸 적 없는 번호라도 번호부(업체·발주처)에 있으면 읽는다 — 그 업체 가까운 현장 중에서 AI 가 고른다 (11/11)
  const bk = !w && (sd.book || {})[tail(b.from)];
  if (bk) {
    const msgB = b.unread ? '(글을 못 읽은 장문 문자 — 폰에서 확인해 주세요)' : s(b.msg, 1000);
    if (!msgB) return [{ json: { resp: { ok: true, known: true, book: true }, go: false } }];
    const todayB = new Date(now + 9 * 3600e3).toISOString().slice(0, 10);
    w = { name: bk.name, siteId: '', siteName: '', client: bk.client, fill: true, keys: [], book: true, sites: bk.sites };
    if (b.unread) return [{ json: { resp: { ok: true, known: true, book: true }, go: true, ai: false, digest: false, book: true, unread: true, from: s(b.from, 30), msg: msgB, tailKey: tail(b.from), w, today: todayB, body: {} } }];
    const bodyB = { room: { client: bk.client, name: bk.name + ' (문자)' }, today: todayB, sites: bk.sites, messages: [{ d: todayB, t: '', who: bk.name, text: msgB }] };
    return [{ json: { resp: { ok: true, known: true, book: true }, go: true, ai: true, digest: true, book: true, unread: false, from: s(b.from, 30), msg: msgB, tailKey: tail(b.from), w, today: todayB, body: bodyB } }];
  }
  const msg = b.unread ? '(글을 못 읽은 장문 문자 — 폰에서 확인해 주세요)' : s(b.msg, 1000);
  if (!w || !msg) return [{ json: { resp: { ok: true, known: false }, go: false } }];
  const ai = !b.unread && w.fill && !!w.siteId && w.siteId !== '-';
  const today = new Date(now + 9 * 3600e3).toISOString().slice(0, 10);
  const line = { d: today, t: '', who: w.name, text: msg };
  const digest = !!(ai && w.ask);
  const body = digest
    ? { room: w.name, today, asked: w.ask.q, messages: [line], sites: [{ id: w.siteId, name: w.siteName, date: w.ask.date, known: {}, checks: w.ask.checks }] }
    : { room: w.name, client: w.client, siteId: w.siteId, today, mine: ['김정헌'], recent: [], messages: [line] };
  return [{ json: { resp: { ok: true, known: true }, go: true, ai, digest, unread: !!b.unread, from: s(b.from, 30), msg, tailKey: tail(b.from), w, today, body } }];
}
return [{ json: { resp: { ok: false, error: 'action 은 watch·book·in' }, go: false } }];
