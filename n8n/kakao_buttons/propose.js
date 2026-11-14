// 카톡_버튼 › 제안받기: 카톡_비서가 업체 방에서 새 현장·시공일 변경을 알아보면 POST site-propose (사장님 열쇠, 2026-11-14 사장님:
// '업체가 새 현장 일정을 보내면 비서가 현장을 만들까요? 물어봐야지'). { room, client, proposals: [{ kind: newSite|dates, name, siteId, from, dates, quote }] }
// 이 흐름의 저장 공간(staticData)에 7일 두고 카톡_알림으로 [현장 만들기]·[날짜 바꾸기] 버튼을 띄운다 (누르면 버튼정리 ns·nd → 앱 우편함)
const b = $input.first().json.body || {};
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const sd = $getWorkflowStaticData('global');
const now = Date.now();
sd.proposals = Object.fromEntries(Object.entries(sd.proposals || {}).filter(([, o]) => now - o.at < 7 * 864e5));
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const md = (d) => (+d.slice(5, 7)) + '/' + (+d.slice(8, 10));
const room = s(b.room, 60), client = s(b.client, 60);
const out = [];
for (const p of (Array.isArray(b.proposals) ? b.proposals : []).slice(0, 3)) {
  const kind = p && p.kind === 'dates' ? 'dates' : 'newSite';
  const dates = (Array.isArray(p && p.dates) ? p.dates : []).map((d) => s(d, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().slice(0, 20);
  const name = s(p && p.name, 100), siteId = s(p && p.siteId, 40), quote = s(p && p.quote, 120);
  if (!dates.length || !name || (kind === 'dates' && !siteId)) continue;
  // 같은 제안이 하루 안에 또 오면 (업체가 같은 말을 되풀이) 버튼을 또 띄우지 않는다
  const key = kind + '|' + (siteId || name.replace(/\s+/g, '')) + '|' + dates.join(',');
  if (Object.values(sd.proposals).some((o) => o.key === key && now - o.at < 864e5)) continue;
  let id = '';
  while (!id || sd.proposals[id]) id = (Math.random().toString(36).slice(2) + '000000').slice(0, 6);
  sd.proposals[id] = { key, kind, client, room, name, siteId, dates, at: now };
  const when = dates.map(md).join('·');
  const lines = kind === 'newSite'
    ? ['🏗 <b>새 현장 일정 · ' + esc(client || room) + '</b>', esc(name), '📅 ' + when + ' (' + dates.length + '일)']
    : ['📅 <b>시공일 변경 · ' + esc(name) + '</b>', (s(p.from, 10) ? md(s(p.from, 10)) + ' → ' : '') + when];
  if (quote) lines.push('「' + esc(quote) + '」');
  lines.push('', kind === 'newSite' ? '현장관리에 이 현장을 만들까요?' : '현장관리 시공일을 바꿀까요?');
  out.push({ json: { text: lines.join('\n'), html: true,
    buttons: [[{ text: kind === 'newSite' ? '🏗 현장 만들기' : '📅 날짜 바꾸기', data: 'k|' + id + '|' + (kind === 'newSite' ? 'ns' : 'nd') }, { text: '아니요', data: 'k|' + id + '|later' }]] } });
}
return out;
