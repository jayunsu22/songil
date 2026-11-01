// 현장관리_빈칸 › 우편함넣기: 노트북이 POST site-fill (사장님 열쇠) — 업체 답에서 뽑은 칸 값을 우편함(staticData)에 둔다.
// 현장관리 앱이 site-fill-take 로 가져가 그 기기 현장 칸에 바로 넣는다 (원본이 기기에 있어서, 10/31 사장님 '우편함').
const body = $input.first().json.body || {};
const sd = $getWorkflowStaticData('global');
const now = Date.now();
sd.fills = (sd.fills || []).filter((f) => now - f.t < 14 * 864e5);
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const FIELDS = ['pwLobby', 'pwUnit', 'toilet'];
let n = 0;
for (const f of (Array.isArray(body.fills) ? body.fills : []).slice(0, 50)) {
  if (!f || typeof f !== 'object') continue;
  const o = { id: 'f' + now.toString(36) + n, t: now, siteId: s(f.siteId, 40), kind: f.kind, room: s(f.room, 40), at: s(f.at, 10) };
  if (!o.siteId) continue;
  if (o.kind === 'field') {
    o.field = FIELDS.includes(f.field) ? f.field : '';
    o.value = s(f.value, 300);
    if (!o.field || !o.value) continue;
  } else if (o.kind === 'films') {
    o.films = (Array.isArray(f.films) ? f.films : []).map((x) => ({ place: s(x && x.place, 40), code: s(x && x.code, 30) })).filter((x) => x.code).slice(0, 30);
    if (!o.films.length) continue;
  } else if (o.kind === 'check') {
    // 업체 확인 질문의 답 (2026-11-01)
    o.checkId = s(f.checkId, 40);
    o.value = s(f.value, 300);
    if (!o.checkId || !o.value) continue;
  } else if (o.kind === 'filmOrdered') {
    o.value = s(f.value, 300);   // 주문한 필름 'ps170 1롤 · px450 30m 이상'
  } else continue;   // 모르는 kind 는 버림. filmOrdered: 텔레그램 버튼으로 주문 문자를 보냄 → 앱 '필름 주문' 단계 (카톡_버튼, 11/1)
  sd.fills.push(o);
  n++;
}
return [{ json: { ok: true, n } }];
