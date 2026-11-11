// 업무일정표 › 요청: POST report (사장님 열쇠) — 결재함 앱·노트북.
// get { date? } → 보고서 + 결재 + inbox(능동 비서 카드) / decide { date, id, act: go|later|mine|'', to? } / outbox → 노트북이 보낼 카톡 글 (가져가면 지움)
// make 는 Airtable 을 읽어야 해서 여기선 표시만 하고 뒤(실행)로 보낸다
const b = $('보고서요청').first().json.body || {};
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const latest = () => Object.keys(sd.reports).sort().pop() || '';
if (b.action === 'make') { out.make = true; return finish(); }
// 📨 저장하자마자 내일 작업자 안내 (11/11 사장님: 낮 12시 뒤에 인원을 넣으면 문자가 안 갔다) — 백업을 읽어야 해서 실행(run.js)으로
if (b.action === 'workerNow') { out.make = true; return finish(); }
if (b.action === 'outbox') {
  out.resp = { ok: true, texts: sd.outbox.map((o) => ({ id: o.id, text: o.text })) };
  sd.outbox = [];
  return finish();
}
// ❓ 노트북 → 결재함: 노트북(텔레그램 [시작해]·비서·결재함 카톡)이 업체에 물었다 { siteId, by, via, who } (11/6)
if (b.action === 'asked') {
  const id = s(b.siteId, 40);
  if (id) sd.asked[id] = { at: Date.now(), by: s(b.by, 20) || '노트북', via: s(b.via, 10), who: s(b.who, 60) };
  out.resp = { ok: !!id };
  return finish();
}
// ❓ 결재함 → 노트북: 결재함에서 [진행해] 해 9시에 물을 현장(아직 안 보냄)과 이미 물은 현장 — 노트북은 이 현장에 [시작해] 알림을 안 띄운다
if (b.action === 'askPlan') {
  const plans = {};
  Object.keys(sd.reports).forEach((date) => {
    const x = sd.reports[date];
    (x.rep.next || []).forEach((n) => {
      const d = (x.decisions || {})[n.id];
      if (n.kind !== 'ask' || !n.siteId) return;
      // 결재 안 한 카드도 9시에 자동으로 나간다 (11/6) — 오늘·앞으로의 보고서만
      if (d ? (d.act !== 'go' || d.doneAt) : date < todayKST()) return;
      plans[n.siteId] = { date, who: (d && d.to && d.to.name) || '', via: (d && d.to && d.to.via) || '', title: n.title };
    });
  });
  out.resp = { ok: true, plans, asked: sd.asked };
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
  // ❓ 오늘 카드를 9시 뒤에 [진행해] → 다음 9시를 기다리지 않고 바로 보낸다 (11/6). 밤에는 안 보낸다
  const hourKST = new Date(now + 9 * 3600e3).getUTCHours();
  const askNow = act === 'go' && date === todayKST() && hourKST >= 9 && box.rep.next.find((n) => n.id === id).kind === 'ask';
  if (askNow && hourKST >= 20) { out.resp = { ok: false, error: '밤에는 안 보내요 — 내일 아침 9시 이후에 눌러 주세요' }; return finish(); }
  if (!act) {
    delete box.decisions[id]; delete sd.marks[id];
    // [되돌리기] (11/5) — 완료표시로 앱·결과에 넣은 것도 되돌린다
    const it = box.rep.next.find((n) => n.id === id);
    if (was && was.act === 'done' && ['pay', 'as', 'task', 'film'].includes(it.kind)) {
      const day = new Date(was.at + 9 * 3600e3).toISOString().slice(0, 10);
      const p = id.split(':');
      out.fills.push({ siteId: it.siteId || '-', kind: 'undo', what: it.kind, serviceId: p[2] || '', taskId: p.slice(1).join(':'), at: day, room: '결재함' });
      if (sd.log[day]) sd.log[day] = sd.log[day].filter((x) => !(x.title === it.title + ' — 완료' && x.res === '결재함 완료표시'));
    }
  }
  else {
    // to: 필름 = 주문처 담당자 { label, phone } · ❓ 출입정보 질문 = { name, via: kakao|sms, phone, kakaoRoom, client } (11/5 — 카톡은 번호 없어도 됨)
    const t = b.to && typeof b.to === 'object' ? b.to : null;
    const via = t && (t.via === 'kakao' || t.via === 'sms') ? t.via : '';
    const phone = t ? s(t.phone, 20).replace(/[^0-9+]/g, '') : '';
    box.decisions[id] = { act, at: now, to: t && (phone || via === 'kakao') ? Object.assign({ label: s(t.label, 60), phone },
      via ? { via, name: s(t.name, 40), kakaoRoom: s(t.kakaoRoom, 60), client: s(t.client, 60) } : {}) : null };
  }
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
  if (askNow) { out.make = true; return finish(); }   // 실행(run.js)이 보내고 응답한다
}
out.resp = { ok: true, date, rep: box.rep, decisions: box.decisions, reports: Object.keys(sd.reports).sort().reverse(), inbox: inboxView(), asked: sd.asked };
return finish();
