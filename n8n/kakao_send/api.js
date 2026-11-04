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
const clean = (v) => s(v, 40).replace(/[^A-Za-z0-9_-]/g, '');
const act = s(b.action, 10);
if (act === 'add') {
  const id = clean(b.id), text = s(b.text, 1500), room = s(b.room, 60), client = s(b.client, 60);
  if (!id || !text || !(room || client)) return [{ json: { ok: false, error: '방·글이 비어 있음' } }];
  if (!sd.q.some((x) => x.id === id)) sd.q.push({ id, room, client, text, state: 'wait', at: now });
  return [{ json: { ok: true, id } }];
}
if (act === 'take') {
  const out = sd.q.filter((x) => x.state === 'wait').map((x) => ({ id: x.id, room: x.room, client: x.client, text: x.text }));
  sd.q.forEach((x) => { if (x.state === 'wait') { x.state = 'taken'; x.taken = now; } });
  return [{ json: { ok: true, jobs: out } }];
}
if (act === 'result') {
  const x = sd.q.find((y) => y.id === clean(b.id));
  if (x) { x.state = b.ok ? 'sent' : 'failed'; x.why = s(b.why, 200); x.sentRoom = s(b.room, 60); x.text = ''; x.done = now; }
  return [{ json: { ok: !!x } }];
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
