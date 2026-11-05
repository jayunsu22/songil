// 카톡_보내기 › 처리: 앱 🤖 비서가 시킨 카톡을 노트북(카톡 읽기)이 보내게 맡기는 우편함 (사장님 11/4: '문자는 가는데 왜 카톡은 안 돼').
// POST kakao-send (사장님 열쇠) body:
//   { action: 'add', id, room, client, text }   ← 앱: 보낼 카톡 맡기기
//   { action: 'take' }                          ← 노트북: 맡긴 것 가져가기 (가져가면 글은 여기서 지움)
//   { action: 'result', id, ok, why, room }     ← 노트북: 보냈는지 알리기
//   { action: 'status', ids: [...] }            ← 앱: 보냈는지 보기 → items [{ id, state: wait|taken|sent|failed, why, room, at }]
const b = $input.first().json.body || {};
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const sd = $getWorkflowStaticData('global');
const now = Date.now();
sd.q = (sd.q || []).filter((x) => now - x.at < 2 * 864e5);       // 2일 지난 건 버린다
// 30분 넘게 안 가져간 건 보내지 않는다 — 노트북이 꺼져 있다 켜지면 지난 카톡이 한꺼번에 늦게 나가지 않게 (사장님 11/4)
sd.q.forEach((x) => { if (x.state === 'wait' && now - x.at > 30 * 60000) { x.state = 'failed'; x.why = '노트북이 30분 안에 못 가져가서 안 보냈어요'; x.text = ''; x.done = now; } });
const clean = (v) => s(v, 40).replace(/[^A-Za-z0-9_-]/g, '');
const act = s(b.action, 10);
if (act === 'add') {
  const id = clean(b.id), text = s(b.text, 1500), room = s(b.room, 60), client = s(b.client, 60);
  if (!id || !text || !(room || client)) return [{ json: { ok: false, error: '방·글이 비어 있음' } }];
  // watch = 👤 개인고객 카톡 (11/5): 보낸 뒤 그 방 답장을 시공일까지 지켜본다 { siteId, name, until, keys }
  const w = b.watch && typeof b.watch === 'object' ? { siteId: s(b.watch.siteId, 40), name: s(b.watch.name, 80), until: s(b.watch.until, 10), keys: (Array.isArray(b.watch.keys) ? b.watch.keys : []).map((k) => s(k, 12)).slice(0, 6) } : null;
  // ask = 업체에 빈칸 묻기 (11/5): 노트북이 번호 매긴 질문으로 보내고 답을 기다린다 { id, client, name, date, missing, checks }
  const ask = b.ask && typeof b.ask === 'object' ? { id: s(b.ask.id, 40), client: s(b.ask.client, 60), name: s(b.ask.name, 120), date: s(b.ask.date, 10),
    missing: (Array.isArray(b.ask.missing) ? b.ask.missing : []).map((k) => s(k, 12)).slice(0, 6),
    checks: (Array.isArray(b.ask.checks) ? b.ask.checks : []).slice(0, 20).map((c) => ({ id: s(c && c.id, 40), text: s(c && c.text, 200), ok: !!(c && c.ok) })) } : null;
  if (!sd.q.some((x) => x.id === id)) sd.q.push({ id, room, client, text, watch: w, ask, state: 'wait', at: now });
  return [{ json: { ok: true, id } }];
}
if (act === 'take') {
  const out = sd.q.filter((x) => x.state === 'wait').map((x) => ({ id: x.id, room: x.room, client: x.client, text: x.text, watch: x.watch || null, ask: x.ask || null }));
  sd.q.forEach((x) => { if (x.state === 'wait') { x.state = 'taken'; x.taken = now; } });
  return [{ json: { ok: true, jobs: out } }];
}
if (act === 'result') {
  const x = sd.q.find((y) => y.id === clean(b.id));
  if (x) { x.state = b.ok ? 'sent' : 'failed'; x.why = s(b.why, 200); x.sentRoom = s(b.room, 60); x.text = ''; x.done = now; }
  return [{ json: { ok: !!x } }];
}
// 💬 카톡방 알려 주기 (11/5): 앱에 적은 방 ↔ 노트북 config client_rooms. side 가 자기 것을 두고 상대 것을 받아 간다. { rooms: { 거래처: [방] } }
if (act === 'rooms') {
  const side = b.side === 'laptop' ? 'laptop' : 'app';
  const out = {};
  Object.entries(b.rooms && typeof b.rooms === 'object' ? b.rooms : {}).slice(0, 300).forEach(([k, v]) => {
    const list = (Array.isArray(v) ? v : [v]).map((x) => s(x, 60)).filter(Boolean).slice(0, 10);
    if (s(k, 60) && list.length) out[s(k, 60)] = list;
  });
  sd.rooms = sd.rooms || {};
  sd.rooms[side] = out;
  // off = 앱에서 ✕ 로 뺀 방 { 거래처: [방] } — 노트북 설정에 있어도 안 쓴다
  if (side === 'app') {
    const off = {};
    Object.entries(b.off && typeof b.off === 'object' ? b.off : {}).slice(0, 300).forEach(([k, v]) => {
      const list = (Array.isArray(v) ? v : [v]).map((x) => s(x, 60)).filter(Boolean).slice(0, 20);
      if (s(k, 60) && list.length) off[s(k, 60)] = list;
    });
    sd.rooms.off = off;
  }
  return [{ json: { ok: true, rooms: sd.rooms[side === 'app' ? 'laptop' : 'app'] || {}, off: side === 'laptop' ? (sd.rooms.off || {}) : undefined } }];
}
if (act === 'status') {
  const ids = (Array.isArray(b.ids) ? b.ids : []).map(clean).filter(Boolean).slice(0, 30);
  const items = ids.map((id) => {
    const x = sd.q.find((y) => y.id === id);
    if (!x) return { id, state: 'unknown' };
    // 노트북이 10분 넘게 안 가져가면 꺼져 있는 것
    return { id, state: x.state, why: x.why || '', room: x.sentRoom || x.room || x.client, at: x.done || x.taken || x.at, stale: x.state === 'wait' && now - x.at > 10 * 60000 };
  });
  return [{ json: { ok: true, items } }];
}
return [{ json: { ok: false, error: 'action 은 add·take·result·status' } }];
