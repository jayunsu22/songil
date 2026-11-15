// 현장관리_빈칸 › 빈칸고르기: 노트북이 POST site-gaps (사장님 열쇠) 로 부른다 (카톡 '비서' 4단계, 10/31).
// 현장관리 백업(Airtable)에서 오늘~days 일 안에 시작하고 A(공동현관·세대 비번·화장실)·B(필름 번호) 중 빈칸이 있거나
// 아직 답을 못 받은 업체 확인 질문(checks)이 있는 현장만.
// 비번 같은 값은 돌려주지 않는다 (빈칸 이름만).
const body = $('빈칸요청').first().json.body || {};
const seoul = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today || '') ? body.today : seoul;
const days = Math.min(Math.max(parseInt(body.days, 10) || 7, 0), 30);
const until = new Date(Date.parse(today + 'T00:00:00Z') + days * 864e5).toISOString().slice(0, 10);
const str = (v) => String(v == null ? '' : v).trim();
const clients = {};
for (const it of $('거래처읽기').all()) for (const r of (it.json.records || [])) {
  const f = r.fields || {};
  if (f.id) clients[f.id] = str(f['이름']);
}
// 업체 확인 질문 (2026-11-01) — 앱 설정(설정 표 data.checks). 앱에서 한 번도 안 고쳤으면 백업에 없으니 앱과 같은 기본 질문
const DEFAULT_CHECKS = [
  { id: 'door', text: '방문이 상하좌우 문틀에 닿는지 (닿으면 목수님 조정 부탁드려요)', ok: false },
  { id: 'overlap', text: '{날짜}에 겹치는 다른 공정', ok: false },
  { id: 'xmark', text: '현관문 부속교환할 부분에 마카펜으로 X 표시 부탁드려요', ok: true },
];
let checks = null;
for (const it of $('설정읽기').all()) for (const r of (it.json.records || [])) {
  try { const d = JSON.parse((r.fields || {}).data || '{}'); if (Array.isArray(d.checks)) checks = d.checks; } catch (e) { /* 다음 줄 */ }
}
checks = (checks || DEFAULT_CHECKS).filter((c) => c && str(c.id) && str(c.text) && !c.off).map((c) => ({ id: str(c.id), text: str(c.text), ok: !!c.ok }));
// 답을 받았거나 '이 현장은 안 물음'(skip, 11/1) 이면 묻지 않는다
const answered = (s, id) => { const a = (s.checks || {})[id]; return !!(a && typeof a === 'object' && a.skip) || !!str(a && typeof a === 'object' ? a.v : a); };
// 필름 주문 알림 (사장님 11/1) — 시공 orderDays(5)일 안이고 필름 단계가 아직 '필름 주문'(2) 전인 현장. 재고 없음·판매 중지까지 생각해 5일 전
const orderDays = Math.min(Math.max(parseInt(body.orderDays, 10) || 0, 0), 30);
const orderUntil = new Date(Date.parse(today + 'T00:00:00Z') + orderDays * 864e5).toISOString().slice(0, 10);
const last = until > orderUntil ? until : orderUntil;
// 주문 문자와 같은 모양 — 같은 번호는 한 번, 필요량은 ' + ' 로 (앱 Share.filmOrderText)
const orderFilms = (films) => {
  const seen = {}, order = [];
  (Array.isArray(films) ? films : []).filter((x) => x && str(x.code)).forEach((x) => {
    const k = str(x.code).replace(/\s+/g, ' ').toLowerCase();
    if (!seen[k]) { seen[k] = { code: str(x.code), qty: [] }; order.push(k); }
    if (str(x.qty) && !seen[k].qty.includes(str(x.qty))) seen[k].qty.push(str(x.qty));
  });
  return order.map((k) => ({ code: seen[k].code, qty: seen[k].qty.join(' + ') }));
};
const out = [], orders = [], filmChecks = [];
const tomorrow = new Date(Date.parse(today + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
for (const it of $('현장읽기').all()) for (const r of (it.json.records || [])) {
  let s = {};
  try { s = JSON.parse((r.fields || {}).data || '{}'); } catch (e) { continue; }
  if (!s.id || s.hide) continue;
  const date = str(s.date).slice(0, 10);
  if (!date || date < today || date > last) continue;
  const name0 = str(s.name);
  const squash = (v) => v.replace(/\s+/g, '');
  const extra = [str(s.unit), str(s.size)].filter((v) => v && squash(name0).indexOf(squash(v)) === -1);
  const name = [name0].concat(extra).filter(Boolean).join(' ') || '(이름없음)';
  const client = clients[s.clientId] || clients[(r.fields || {})['거래처id']] || '';
  const stage = parseInt(s.filmStage, 10) || 0;
  if (orderDays && date <= orderUntil && stage < 2) orders.push({ id: s.id, client, name, date, stage, films: orderFilms(s.films) });
  // 🚚 업체가 필름을 가져다주는 현장 — 전날 그 방에 한 번 확인 (11/5). 이미 받았으면(수령) 안 물음
  if (s.filmVendor && date === tomorrow && stage < 3 && client) filmChecks.push({ id: s.id, client, name, date });
  if (date > until) continue;
  // 사장님 11/13: 모든 질문은 기본 '이 현장은 안 물음' — 앱에서 [묻기] 를 누른 것(askOn)만 묻는다
  const on = (k) => !!(s.askOn && s.askOn[k]);
  // 11/13: 드롭다운 칸 전부 (선택형 칸은 { v } 가 '미확인' 이면 빈칸)
  const missing = ['pwLobby', 'pwUnit', 'barrier', 'gate', 'carReg', 'parking', 'cargoEv', 'toilet']
    .filter((k) => (k === 'carReg' || k === 'cargoEv') ? !(s[k] && str(s[k].v) && s[k].v !== '미확인') : !str(s[k]));
  if (!(Array.isArray(s.films) && s.films.some((x) => x && str(x.code)))) missing.push('films');
  for (let i = missing.length - 1; i >= 0; i--) if (!on(missing[i])) missing.splice(i, 1);
  const ask = checks.filter((c) => on(c.id) && !answered(s, c.id));
  // 📋 질문폼 링크 (11/13) — 노트북이 번호 질문 대신 이 링크를 보낸다
  const link = /^[a-z0-9]{12,40}$/.test(str(s.askKey)) ? 'https://jayunsu22.github.io/sitenote/ask.html#' + str(s.askKey) : '';
  // 📞 앱에서 '통화로 확인 — 그만 묻기' 를 누른 현장 (11/13) — 노트북이 묻지도 다시 묻지도 않는다
  if (str(s.askStop)) continue;
  if (!missing.length && !ask.length) continue;
  // 👤 개인고객 (11/5): 업체방이 없다 — '카톡 방 없음' 알림 대신 앱 현장 화면의 [문자로 물어보기]
  if (client.replace(/\s+/g, '') === '개인고객') continue;
  out.push({ id: s.id, client, name, date, missing, checks: ask, link });
}
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
out.sort(byDate); orders.sort(byDate);
return [{ json: { today, until, sites: out, orders, filmChecks } }];
