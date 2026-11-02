// 업무일정표 › 요청: POST report (사장님 열쇠) — 결재함 앱·노트북.
// get { date? } → 보고서 + 결재 / decide { date, id, act: go|later|mine|'', to? } / outbox → 노트북이 보낼 카톡 글 (가져가면 지움)
// make 는 Airtable 을 읽어야 해서 여기선 표시만 하고 뒤(실행)로 보낸다
const b = $('보고서요청').first().json.body || {};
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const latest = () => Object.keys(sd.reports).sort().pop() || '';
if (b.action === 'make') { out.make = true; return finish(); }
if (b.action === 'outbox') {
  out.resp = { ok: true, texts: sd.outbox.map((o) => ({ id: o.id, text: o.text })) };
  sd.outbox = [];
  return finish();
}
if (b.action === 'list') {
  out.resp = { ok: true, reports: Object.keys(sd.reports).sort().reverse().map((d) => {
    const x = sd.reports[d];
    return { date: d, next: x.rep.next.length, decided: Object.keys(x.decisions || {}).filter((k) => (x.decisions[k] || {}).act).length };
  }) };
  return finish();
}
const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : latest();
const box = sd.reports[date];
if (!box) { out.resp = { ok: true, date, none: true }; return finish(); }
if (b.action === 'decide') {
  const id = s(b.id, 80);
  if (!box.rep.next.some((n) => n.id === id)) throw new Error('없는 항목');
  const act = ['go', 'later', 'mine'].includes(b.act) ? b.act : '';
  const was = box.decisions[id];
  if (was && was.doneAt) { out.resp = { ok: false, error: '이미 9시에 처리했습니다' }; return finish(); }
  if (!act) delete box.decisions[id];
  else box.decisions[id] = { act, at: now, to: b.to && b.to.phone ? { label: s(b.to.label, 60), phone: s(b.to.phone, 20).replace(/[^0-9+]/g, '') } : null };
}
out.resp = { ok: true, date, rep: box.rep, decisions: box.decisions, reports: Object.keys(sd.reports).sort().reverse() };
return finish();
