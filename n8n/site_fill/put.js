// 현장관리_빈칸 › 우편함넣기: 노트북이 POST site-fill (사장님 열쇠) — 업체 답에서 뽑은 칸 값을 우편함(staticData)에 둔다.
// 현장관리 앱이 site-fill-take 로 가져가 그 기기 현장 칸에 바로 넣는다 (원본이 기기에 있어서, 10/31 사장님 '우편함').
const body = $input.first().json.body || {};
const sd = $getWorkflowStaticData('global');
const now = Date.now();
sd.fills = (sd.fills || []).filter((f) => now - f.t < 14 * 864e5);
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const FIELDS = ['pwLobby', 'pwUnit', 'toilet'];
// 📋 업무 내역 (11/4): 우편함에 들어온 일을 값 없이 적는다 — 업무내역 worklog.js 가 앱에 보여 준다
sd.worklog = sd.worklog || [];
const LABEL = { pwLobby: '공동현관 비번', pwUnit: '세대 비번', toilet: '화장실' };
const logOf = (o, f) => {
  const put = f.update ? ' 바꿈' : ' 넣음';
  if (o.kind === 'field') return { kind: 'site', title: LABEL[o.field] + put, detail: o.room };
  if (o.kind === 'films') return { kind: 'site', title: '필름 번호' + put, detail: o.room };
  if (o.kind === 'check') return { kind: 'site', title: '업체 확인 답 받음', detail: o.room };
  if (o.kind === 'filmOrdered') return { kind: 'crew', title: '필름 주문 문자', detail: o.room + (o.value ? ' · ' + o.value : '') };
  if (o.kind === 'crewAdd') return { kind: 'crew', title: o.name + ' 인원 넣음', detail: o.date };
  if (o.kind === 'task') return { kind: 'site', title: '할 일 추가', detail: o.title };
  if (o.kind === 'filmVendor') return { kind: 'site', title: '필름 업체가 가져옴으로 표시', detail: o.room };
  if (o.kind === 'done') return { kind: 'site', title: { pay: '잔금 받음', as: 'AS 완료', task: '할 일 완료' }[o.what], detail: '' };
  if (o.kind === 'undo') return { kind: 'site', title: { pay: '잔금 받음 취소', as: 'AS 완료 취소', task: '할 일 완료 취소', film: '필름 직접 주문 취소' }[o.what], detail: '결재함 되돌리기' };
  return null;
};
const srcOf = (o) => (o.room === '결재함' ? '결재함' : o.room === '인원 모집' ? '인원모집' : o.kind === 'filmOrdered' ? '필름 주문' : 'auto');
let n = 0;
for (const f of (Array.isArray(body.fills) ? body.fills : []).slice(0, 50)) {
  if (!f || typeof f !== 'object') continue;
  // 내역만 남기는 줄 — 앱 우편함에 넣지 않는다 (결재함 9시 실행 등, 11/4)
  if (f.kind === 'log') {
    if (s(f.title, 120)) sd.worklog.push({ id: 'l' + now.toString(36) + n, t: now, src: srcOf({ room: s(f.room, 40) }), kind: s(f.cat, 12) || 'crew', title: s(f.title, 120), detail: s(f.detail, 200), siteId: s(f.siteId, 40), state: f.state === 'need' ? 'need' : '', key: '' });
    n++;
    continue;
  }
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
  } else if (o.kind === 'crewAdd') {
    // 인원 모집 [넣기] (인원모집 흐름, 11/1) — 그날 인원에 이름
    o.date = s(f.date, 10); o.name = s(f.name, 20);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date) || !o.name) continue;
  } else if (o.kind === 'task') {
    // 결재함 [내가할께] (업무일정표 흐름, 11/3) — 앱 할 일로. 현장과 상관없이 받는다 (siteId '-' 이면 현장 없음)
    o.title = s(f.title, 120); o.date = s(f.date, 10);
    if (!o.title || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) continue;
    if (f.vendor) o.vendor = true;   // 업체가 부탁한 일 (11/5)
  } else if (o.kind === 'filmVendor') {
    // 🚚 업체가 필름을 가져다줌 (11/5)
  } else if (o.kind === 'done') {
    // 결재함 [완료표시] (11/3): 잔금 받음·AS 완료·할 일 완료 → 앱 Kakao.fillPatch (11/4 고침: 전에는 여기서 버려져 앱에 안 들어갔다)
    o.what = ['pay', 'as', 'task'].includes(f.what) ? f.what : '';
    o.serviceId = s(f.serviceId, 60); o.taskId = s(f.taskId, 100);
    if (!o.what) continue;
  } else if (o.kind === 'undo') {
    // 결재함 [되돌리기] (11/5): 완료표시로 넣은 것을 앱에서 되돌린다 → 앱 Kakao.fillPatch
    o.what = ['pay', 'as', 'task', 'film'].includes(f.what) ? f.what : '';
    o.serviceId = s(f.serviceId, 60); o.taskId = s(f.taskId, 100);
    if (!o.what) continue;
  } else continue;   // 모르는 kind 는 버림. filmOrdered: 텔레그램 버튼으로 주문 문자를 보냄 → 앱 '필름 주문' 단계 (카톡_버튼, 11/1)
  sd.fills.push(o);
  const line = logOf(o, f);
  if (line) sd.worklog.push(Object.assign({ id: 'l' + now.toString(36) + n, t: now, src: srcOf(o), siteId: o.siteId === '-' ? '' : o.siteId, state: '', key: '' }, line));
  n++;
}
sd.worklog = sd.worklog.filter((x) => now - x.t < 90 * 864e5).slice(-2000);
return [{ json: { ok: true, n } }];
