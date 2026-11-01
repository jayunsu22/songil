// 인원모집 › 모집: 현장관리 앱이 POST crew-recruit (사장님 열쇠) — action start | status | stop
const b = $('모집요청').first().json.body || {};
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
// 지난 날 모집은 지운다 (시공일 다음 날까지만 둔다)
const yday = new Date(now + KST - 864e5).toISOString().slice(0, 10);
for (const [k, r] of Object.entries(sd.recruits)) if (r.date < yday) delete sd.recruits[k];
const siteId = s(b.siteId, 40), date = s(b.date, 10);
const mine = Object.values(sd.recruits).filter((r) => r.siteId === siteId);
if (b.action === 'status') {
  out.resp = { ok: true, recruits: mine.map((r) => ({ date: r.date, active: r.active, exhausted: !!r.exhausted,
    people: r.people.map((p) => ({ name: p.name, pay: p.pay, st: p.st, tries: p.tries || 0, at: p.at || 0 })) })) };
  return finish();
}
if (b.action === 'stop') {
  mine.filter((r) => r.date === date).forEach((r) => { r.active = false; });
  return finish();
}
if (b.action !== 'start') throw new Error('action 은 start·status·stop');
if (!siteId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('siteId·date 가 없음');
const slots = Math.max(0, Math.min(20, parseInt(b.slots, 10) || 0));
if (!slots) throw new Error('남은 자리가 없음');
// 같은 현장·날짜의 예전 모집은 멈춘다 (이미 물어본 사람의 답은 그대로 받는다)
mine.filter((r) => r.date === date).forEach((r) => { r.active = false; });
let id = '';
while (!id || sd.recruits[id]) id = (Math.random().toString(36).slice(2) + '000000').slice(0, 6);
const r = sd.recruits[id] = {
  id, siteId, siteName: s(b.siteName, 80), date, label: s(b.label, 20) || date, slots,
  budget: Math.max(0, parseInt(b.budget, 10) || 0), band: s(b.band, 600), active: true, at: now,
  people: (Array.isArray(b.queue) ? b.queue : []).slice(0, 40).map((q) => ({
    name: s(q && q.name, 20), phone: s(q && q.phone, 20).replace(/[^0-9+]/g, ''), pay: parseInt(q && q.pay, 10) || 0, st: 'wait' }))
    .filter((p) => p.name && p.phone.length >= 9 && p.pay > 0),
};
advance(r);
out.resp = { ok: true, id, sent: out.sms.length };
return finish();
