// 사장님_말투 › 요청 (사장님 11/12: 업체 사장님들과 나눈 대화의 톤으로 비서가 묻고 답하게). POST kakao-tone (사장님 열쇠)
// add  { items: [{ k, room, d, t, prevWho, prev, text }] } — 카톡 노트북(kakao_reader/tone.py)이 업체 방을 읽을 때 사장님 줄을 보낸다 (긴 숫자는 가려서)
// list { n?, room? } → { lines: [{ room, prev, text }] } 비서가 말투 예시로 쓴다 — 짧은 '넵' 만 잔뜩 오지 않게 고르고 방을 고루 섞는다
// stats → 방마다 몇 줄
const sd = $getWorkflowStaticData('global');
sd.lines = Array.isArray(sd.lines) ? sd.lines : [];
const KEEP = 3000;
const J = $input.first().json;
const b = (J.body && typeof J.body === 'object') ? J.body : {};
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
let resp = { ok: false, error: '모르는 요청' };
if (b.action === 'add') {
  const have = new Set(sd.lines.map((x) => x.k));
  let n = 0;
  for (const it of (Array.isArray(b.items) ? b.items : []).slice(0, 200)) {
    const k = s(it && it.k, 40), text = s(it && it.text, 400);
    if (!k || have.has(k) || !text) continue;
    sd.lines.push({ k, room: s(it.room, 60), d: s(it.d, 12), t: s(it.t, 10), prevWho: s(it.prevWho, 40), prev: s(it.prev, 200), text, at: Date.now() });
    have.add(k);
    n++;
  }
  sd.lines = sd.lines.slice(-KEEP);
  resp = { ok: true, added: n, total: sd.lines.length };
} else if (b.action === 'list') {
  const want = Math.max(1, Math.min(300, parseInt(b.n, 10) || 60));
  const room = s(b.room, 60);
  // 같은 글은 한 번만, 너무 짧은 대답('넵', 'ㅇㅇ')은 몇 개만 — 질문·부탁·설명 같은 긴 글이 말투를 더 잘 보여 준다
  const seen = new Set(), longs = [], shorts = [];
  for (const x of sd.lines.slice().reverse()) {
    if (room && x.room !== room) continue;
    const key = x.text.replace(/\s+/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    (x.text.length >= 8 ? longs : shorts).push(x);
  }
  // 방을 고루 섞는다 (한 업체 말투만 닮지 않게)
  const byRoom = {};
  longs.forEach((x) => { (byRoom[x.room] = byRoom[x.room] || []).push(x); });
  const rooms = Object.keys(byRoom), picked = [];
  for (let i = 0; picked.length < want && rooms.some((r) => byRoom[r][i]); i++) rooms.forEach((r) => { if (byRoom[r][i] && picked.length < want) picked.push(byRoom[r][i]); });
  shorts.slice(0, Math.max(3, Math.round(want / 8))).forEach((x) => { if (picked.length < want) picked.push(x); });
  resp = { ok: true, total: sd.lines.length, lines: picked.map((x) => ({ room: x.room, prev: x.prev, text: x.text })) };
} else if (b.action === 'stats') {
  const per = {};
  sd.lines.forEach((x) => { per[x.room] = (per[x.room] || 0) + 1; });
  resp = { ok: true, total: sd.lines.length, rooms: per };
}
return [{ json: resp }];
