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
const out = [];
for (const it of $('현장읽기').all()) for (const r of (it.json.records || [])) {
  let s = {};
  try { s = JSON.parse((r.fields || {}).data || '{}'); } catch (e) { continue; }
  if (!s.id || s.hide) continue;
  const date = str(s.date).slice(0, 10);
  if (!date || date < today || date > until) continue;
  const missing = ['pwLobby', 'pwUnit', 'toilet'].filter((k) => !str(s[k]));
  if (!(Array.isArray(s.films) && s.films.some((x) => x && str(x.code)))) missing.push('films');
  const ask = checks.filter((c) => !answered(s, c.id));
  if (!missing.length && !ask.length) continue;
  const name = str(s.name);
  const squash = (v) => v.replace(/\s+/g, '');
  const extra = [str(s.unit), str(s.size)].filter((v) => v && squash(name).indexOf(squash(v)) === -1);
  out.push({ id: s.id, client: clients[s.clientId] || clients[(r.fields || {})['거래처id']] || '', name: [name].concat(extra).filter(Boolean).join(' ') || '(이름없음)', date, missing, checks: ask });
}
out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
return [{ json: { today, until, sites: out } }];
