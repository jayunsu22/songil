// 업무일정표 공용 (2026-11-03 사장님 — 결재함). 코드 노드마다 앞에 붙는다 (build.js). 그 앞에 앱 share.js 가 Share 로 붙는다.
// 저장 공간 sd.reports[내일날짜] = { rep, decisions: { 항목id: { act: go|later|mine, to?, at } }, at }, sd.outbox = [{ id, text }],
// sd.log[날짜] = [{ kind, title, res }] (9시에 이 흐름이 한 일 → 그날 저녁 보고서 '오늘 결과'에)
// 설계 docs/superpowers/specs/2026-11-03-결재함-design.md
const sd = $getWorkflowStaticData('global');
sd.reports = sd.reports || {};
sd.outbox = sd.outbox || [];
sd.log = sd.log || {};
sd.marks = sd.marks || {};   // [완료표시] 한 항목 { 항목id: 날짜 } — 14일 동안 다시 묻지 않는다
// ❓ 출입정보 질문을 이미 물은 현장 { 현장id: { at, by: '결재함'|'노트북', via, who } } — 결재함과 노트북이 서로 알린다 (11/6, 14일)
// 🙋 사장님 11/13: 업체엔 한 번만 묻는다 (계속 물으면 실례) — 기록을 60일 두고, 물은 현장은 다시 안 묻는다
sd.asked = Object.fromEntries(Object.entries(sd.asked || {}).filter(([, v]) => Date.now() - (v.at || 0) < 60 * 864e5));
const ASK_FRESH = 60 * 864e5;   // 한 번 물었으면 (60일 안) 또 묻지 않는다
const now = Date.now();
const todayKST = () => new Date(now + 9 * 3600e3).toISOString().slice(0, 10);
const out = { resp: { ok: true }, sms: [], notify: [], fills: [], crew: [], watch: [], kakao: [] };   // kakao = 노트북이 보낼 카톡 (카톡_보내기, 11/5)
const APP_URL = 'https://jayunsu22.github.io/sitenote/';
const e164 = (p) => { const d = String(p || '').replace(/[^0-9+]/g, ''); return d.startsWith('+') ? d : '+82' + d.replace(/^0/, ''); };
const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Airtable 백업 읽기 → 앱과 같은 모양 (삭제 표시 줄은 Airtable 식에서 이미 뺐다)
function rows(node) {
  const list = [];
  let ran = false;
  try { ran = $(node).isExecuted; } catch (e) { ran = false; }
  if (!ran) return list;
  for (const it of $(node).all()) for (const r of (it.json.records || [])) {
    try { list.push(JSON.parse((r.fields || {}).data || '{}')); } catch (e) { /* 다음 줄 */ }
  }
  return list;
}
function backup() {
  const settings = rows('설정읽기')[0] || {};
  return { sites: rows('현장읽기').filter((s) => s && s.id), settings, tasks: rows('할일읽기').filter((t) => t && t.id), clients: rows('거래처읽기').filter((c) => c && c.id) };
}
function keepRecent() {
  const dates = Object.keys(sd.reports).sort();
  dates.slice(0, Math.max(0, dates.length - 14)).forEach((d) => { delete sd.reports[d]; });
  Object.keys(sd.log).sort().slice(0, -14).forEach((d) => { delete sd.log[d]; });
  const old = new Date(now + 9 * 3600e3 - 14 * 864e5).toISOString().slice(0, 10);
  Object.keys(sd.marks).forEach((k) => { if (sd.marks[k] < old) delete sd.marks[k]; });
  sd.outbox = sd.outbox.filter((o) => now - (o.t || 0) < 3 * 864e5);
}
const finish = () => [{ json: out }];
