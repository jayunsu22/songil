// 현장관리_빈칸 › 내역: 📋 업무 내역 (사장님 11/4: 진행 내역을 한곳에) — POST work-log (사장님 열쇠).
// 우편함에 들어오는 일(필름 주문·인원·잔금·칸 넣기)은 우편함넣기가 여기 sd.worklog 에 함께 적는다. 앱 비서·노트북 답장은 add 로.
// add { items: [{ id?, t?, src, kind, title, detail?, siteId?, state?, key? }] } / list {} → 최근 500 / resolve { id | key } → 확인함
// 비번 값은 적지 않는다. 90일 · 2000건까지. 설계 docs/superpowers/specs/2026-11-04-업무내역-design.md
const body = $input.first().json.body || {};
const sd = $getWorkflowStaticData('global');
const now = Date.now();
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const keep = () => { sd.worklog = (sd.worklog || []).filter((x) => now - x.t < 90 * 864e5).slice(-2000); };
keep();
if (body.action === 'add') {
  let n = 0;
  const has = new Set(sd.worklog.map((x) => x.id));
  for (const it of (Array.isArray(body.items) ? body.items : []).slice(0, 200)) {
    if (!it || !s(it.title, 120)) continue;
    const id = s(it.id, 60) || 'w' + now.toString(36) + n;
    if (has.has(id)) continue;   // 옮기기를 다시 해도 두 번 안 들어가게
    const t = Number(it.t) > 0 && Number(it.t) <= now ? Number(it.t) : now;
    sd.worklog.push({ id, t, src: s(it.src, 12) || 'me', kind: s(it.kind, 12) || 'etc', title: s(it.title, 120), detail: s(it.detail, 200),
      siteId: s(it.siteId, 40), state: it.state === 'need' ? 'need' : '', key: s(it.key, 60) });
    has.add(id);
    n++;
  }
  sd.worklog.sort((a, b) => a.t - b.t);
  keep();
  return [{ json: { ok: true, n } }];
}
if (body.action === 'resolve') {
  const id = s(body.id, 60), key = s(body.key, 60);
  let n = 0;
  sd.worklog.forEach((x) => { if (x.state === 'need' && ((id && x.id === id) || (key && x.key === key))) { x.state = ''; n++; } });
  return [{ json: { ok: true, n } }];
}
return [{ json: { ok: true, items: sd.worklog.slice(-500).reverse().map((x) => ({ id: x.id, t: x.t, src: x.src, kind: x.kind, title: x.title, detail: x.detail, siteId: x.siteId, state: x.state })) } }];
