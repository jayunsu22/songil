// 인원모집 › 모집: 현장관리 앱이 POST crew-recruit (사장님 열쇠) — action start | status | stop
// start: { siteId, siteName, days: [{ date, label, slots, budget(남은 만원, 0=안 정함), band }], queue: [{ name, phone, pay, dates:[되는 날] }] }
// 예전 앱(하루씩): { date, label, slots, budget, band, queue } 도 받는다
const b = $('모집요청').first().json.body || {};
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
// 지난 모집은 지운다 (마지막 시공일 다음 날까지만 둔다)
const yday = new Date(now + KST - 864e5).toISOString().slice(0, 10);
for (const [k, r] of Object.entries(sd.recruits)) {
  if (!Array.isArray(r.days) || r.days.every((d) => d.date < yday)) delete sd.recruits[k];
}
const siteId = s(b.siteId, 40);
const mine = Object.values(sd.recruits).filter((r) => r.siteId === siteId);
if (b.action === 'status') {
  out.resp = { ok: true, recruits: mine.sort((x, y) => y.at - x.at).map((r) => ({ id: r.id, active: r.active, at: r.at,
    days: r.days.map((d, di) => ({ date: d.date, label: d.label, slots: d.slots, in: inOn(r, di).length, exhausted: !!d.exhausted })),
    people: r.people.map((p) => ({ name: p.name, pay: p.pay, st: p.st, tries: p.tries || 0, at: p.at || 0,
      asked: (p.asked || []).map((di) => r.days[di].date), in: (p.in || []).map((di) => r.days[di].date) })) })) };
  return finish();
}
if (b.action === 'stop') {
  mine.filter((r) => !b.id || r.id === b.id).forEach((r) => { r.active = false; r.stopped = true; });
  return finish();
}
if (b.action !== 'start') throw new Error('action 은 start·status·stop');
const raw = Array.isArray(b.days) ? b.days : [{ date: b.date, label: b.label, slots: b.slots, budget: b.budget, band: b.band }];
const days = raw.slice(0, 10).map((d) => ({ date: s(d && d.date, 10), label: s(d && d.label, 20), band: s(d && d.band, 600),
  slots: Math.max(0, Math.min(20, parseInt(d && d.slots, 10) || 0)), budget: Math.max(0, parseInt(d && d.budget, 10) || 0) }))
  .filter((d) => ISO.test(d.date) && d.slots).sort((x, y) => (x.date < y.date ? -1 : 1));
if (!siteId || !days.length) throw new Error('siteId·날짜(남은 자리) 가 없음');
days.forEach((d) => { d.label = d.label || d.date; });
// 같은 현장·같은 날을 묻던 예전 모집은 멈춘다 (이미 물어본 사람의 답은 그대로 받는다)
mine.filter((r) => r.days.some((d) => days.some((x) => x.date === d.date))).forEach((r) => { r.active = false; r.stopped = true; });
let id = '';
while (!id || sd.recruits[id]) id = (Math.random().toString(36).slice(2) + '000000').slice(0, 6);
const r = sd.recruits[id] = {
  id, siteId, siteName: s(b.siteName, 80), active: true, at: now, days,
  people: (Array.isArray(b.queue) ? b.queue : []).slice(0, 40).map((q) => {
    const ds = Array.isArray(q && q.dates) ? q.dates : days.map((d) => d.date);
    return { name: s(q && q.name, 20), phone: s(q && q.phone, 20).replace(/[^0-9+]/g, ''), pay: parseInt(q && q.pay, 10) || 0, st: 'wait',
      free: days.map((d, di) => (ds.includes(d.date) ? di : -1)).filter((di) => di >= 0) };
  }).filter((p) => p.name && p.phone.length >= 9 && p.pay > 0 && p.free.length),
};
advance(r);
out.resp = { ok: true, id, sent: out.sms.length };
return finish();
