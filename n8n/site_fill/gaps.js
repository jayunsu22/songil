// 현장관리_빈칸 › 빈칸고르기: 노트북이 POST site-gaps (사장님 열쇠) 로 부른다 (카톡 '비서' 4단계, 10/31).
// 현장관리 백업(Airtable)에서 오늘~days 일 안에 시작하고 A(공동현관·세대 비번·화장실)·B(필름 번호) 중 빈칸이 있는 현장만.
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
const out = [];
for (const it of $('현장읽기').all()) for (const r of (it.json.records || [])) {
  let s = {};
  try { s = JSON.parse((r.fields || {}).data || '{}'); } catch (e) { continue; }
  if (!s.id || s.hide) continue;
  const date = str(s.date).slice(0, 10);
  if (!date || date < today || date > until) continue;
  const missing = ['pwLobby', 'pwUnit', 'toilet'].filter((k) => !str(s[k]));
  if (!(Array.isArray(s.films) && s.films.some((x) => x && str(x.code)))) missing.push('films');
  if (!missing.length) continue;
  const name = str(s.name);
  const squash = (v) => v.replace(/\s+/g, '');
  const extra = [str(s.unit), str(s.size)].filter((v) => v && squash(name).indexOf(squash(v)) === -1);
  out.push({ id: s.id, client: clients[s.clientId] || clients[(r.fields || {})['거래처id']] || '', name: [name].concat(extra).filter(Boolean).join(' ') || '(이름없음)', date, missing });
}
out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
return [{ json: { today, until, sites: out } }];
