// 업무일정표 › 요청: POST report (사장님 열쇠) — 결재함 앱·노트북.
// get { date? } → 보고서 + 결재 + inbox(능동 비서 카드) / decide { date, id, act: go|later|mine|'', to? } / outbox → 노트북이 보낼 카톡 글 (가져가면 지움)
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
// 🤖 능동 비서 받은 정보함 (사장님 11/4) — 노트북 카톡 비서가 확신 못 한 것(어느 현장?)·잔금 넣었다는 말을 결재함 카드로.
// inbox_add { items: [{ kind: pick|pay, room, title, quote, fills?, cands?, siteId?, name? }] } / inbox { id, act: pick|done|skip, siteId? }
sd.inbox = (sd.inbox || []).filter((x) => now - x.t < 14 * 864e5);
const inboxView = () => sd.inbox.map((x) => ({ id: x.id, kind: x.kind, room: x.room, title: x.title, quote: x.quote,
  cands: x.cands || [], siteId: x.siteId || '', name: x.name || '' }));
if (b.action === 'inbox_add') {
  let n = 0;
  for (const it of (Array.isArray(b.items) ? b.items : []).slice(0, 20)) {
    const kind = ['pick', 'pay'].includes(it && it.kind) ? it.kind : '';
    if (!kind) continue;
    const x = { id: 'i' + now.toString(36) + n, t: now, kind, room: s(it.room, 40), title: s(it.title, 120), quote: s(it.quote, 160) };
    if (kind === 'pick') {
      x.fills = (Array.isArray(it.fills) ? it.fills : []).slice(0, 10);
      x.cands = (Array.isArray(it.cands) ? it.cands : []).slice(0, 4).map((c) => ({ id: s(c && c.id, 40), name: s(c && c.name, 60), date: s(c && c.date, 10) })).filter((c) => c.id);
      if (!x.fills.length || !x.cands.length) continue;
    } else {
      x.siteId = s(it.siteId, 40); x.name = s(it.name, 60);
      if (!x.siteId) continue;
    }
    sd.inbox.push(x);
    n++;
  }
  out.resp = { ok: true, n };
  return finish();
}
if (b.action === 'inbox') {
  const x = sd.inbox.find((i) => i.id === s(b.id, 40));
  if (!x) { out.resp = { ok: false, error: '이미 처리했습니다' }; return finish(); }
  const today = todayKST();
  if (b.act === 'pick') {
    const c = x.cands.find((k) => k.id === s(b.siteId, 40));
    if (!c) throw new Error('없는 현장');
    x.fills.forEach((f) => out.fills.push(Object.assign({}, f, { siteId: c.id, room: x.room, at: today })));
    (sd.log[today] = sd.log[today] || []).push({ kind: 'task', title: c.name + ' — ' + x.title, res: x.room + ' 정보 넣음' });
  } else if (b.act === 'done' && x.kind === 'pay') {
    out.fills.push({ siteId: x.siteId, kind: 'done', what: 'pay', at: today, room: x.room });
    (sd.log[today] = sd.log[today] || []).push({ kind: 'pay', title: x.name + ' — 잔금 받음', res: x.room + ' "' + x.quote + '"' });
  } else if (b.act !== 'skip') throw new Error('모르는 결재');
  sd.inbox = sd.inbox.filter((i) => i !== x);
  out.resp = { ok: true, inbox: inboxView() };
  return finish();
}
const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : latest();
const box = sd.reports[date];
if (!box) { out.resp = { ok: true, date, none: true, inbox: inboxView() }; return finish(); }
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
out.resp = { ok: true, date, rep: box.rep, decisions: box.decisions, reports: Object.keys(sd.reports).sort().reverse(), inbox: inboxView() };
return finish();
