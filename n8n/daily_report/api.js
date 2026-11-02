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
  const act = ['go', 'later', 'mine', 'done'].includes(b.act) ? b.act : '';
  const was = box.decisions[id];
  if (was && was.doneAt) { out.resp = { ok: false, error: '이미 처리했습니다' }; return finish(); }
  if (!act) { delete box.decisions[id]; delete sd.marks[id]; }
  else box.decisions[id] = { act, at: now, to: b.to && b.to.phone ? { label: s(b.to.label, 60), phone: s(b.to.phone, 20).replace(/[^0-9+]/g, '') } : null };
  // [완료표시] (사장님 11/3) — 이미 끝났다 → 바로 앱 기록에 반영(우편함) + 오늘 결과에 + 다시 묻지 않음(marks)
  if (act === 'done') {
    const it = box.rep.next.find((n) => n.id === id);
    const today = todayKST();
    const p = id.split(':');
    if (it.kind === 'pay') out.fills.push({ siteId: it.siteId, kind: 'done', what: 'pay', at: today, room: '결재함' });
    if (it.kind === 'as') out.fills.push({ siteId: it.siteId, kind: 'done', what: 'as', serviceId: p[2] || '', at: today, room: '결재함' });
    if (it.kind === 'task') out.fills.push({ siteId: it.siteId || '-', kind: 'done', what: 'task', taskId: p.slice(1).join(':'), at: today, room: '결재함' });
    if (it.kind === 'film') out.fills.push({ siteId: it.siteId, kind: 'filmOrdered', value: it.res || '직접 주문', room: '직접 주문', at: today });
    sd.marks[id] = today;
    (sd.log[today] = sd.log[today] || []).push({ kind: it.kind, title: it.title + ' — 완료', res: '결재함 완료표시' });
  }
}
out.resp = { ok: true, date, rep: box.rep, decisions: box.decisions, reports: Object.keys(sd.reports).sort().reverse() };
return finish();
