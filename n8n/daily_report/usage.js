// 🔋 서비스 사용량 (사장님 11/12: 갑자기 멈추지 않게 업무 마감 보고에) — 오후 5시에만 읽는다 (build.js 사용량 노드들).
// 레일웨이 = n8n 서버 (Hobby, 쓴 만큼 카드 결제, 한도 없음) · 넷틀리파이 = 견적·정산 화면 (Personal, 크레딧 자동충전 — 남은 크레딧은 API 로 안 나옴)
// 깃허브 = 현장관리 앱 화면 배포 · 에어테이블 = Team 요금제, 창고(베이스)마다 50,000줄 (API 호출 10만/달은 넘어도 느려지기만 해서 안 센다)
const USAGE_WARN = { railwayUsd: 25, airtableMax: 50000, airtableRate: 0.8, githubStuckMin: 30 };
const kstMD = (ms) => { const d = new Date(ms + 9 * 3600e3); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate(); };
const comma = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
// u = { railway: graphql 답, netlify: accounts 답(배열), github: actions runs 답, airtable: [{ base, rows|null }] } → { lines, alerts }
function usageReport(u, nowMs) {
  const lines = [], alerts = [];
  // 레일웨이
  const ws = (((((u.railway || {}).data || {}).me || {}).workspaces) || [])[0];
  const rc = ws && ws.customer;
  if (rc && rc.billingPeriod) {
    const s = Date.parse(rc.billingPeriod.start), e = Date.parse(rc.billingPeriod.end);
    const frac = Math.min(1, Math.max(0.05, (nowMs - s) / (e - s)));
    const cur = Number(rc.currentUsage) || 0, est = cur / frac;
    lines.push('· 레일웨이: 이번 달 $' + cur.toFixed(1) + ' / 예상 $' + est.toFixed(1) + ' (포함 $5, 카드 결제) · ' + kstMD(e) + ' 마감');
    if (rc.state && rc.state !== 'ACTIVE') alerts.push('레일웨이 계정 상태가 ' + rc.state + ' — 결제 카드를 확인하세요 (멈추면 n8n 전체가 멈춤)');
    if (est >= USAGE_WARN.railwayUsd) alerts.push('레일웨이 이번 달 예상 $' + est.toFixed(1) + ' — 평소(약 $15)보다 많습니다');
  } else lines.push('· 레일웨이: ❓ 못 읽음 (n8n 레일웨이 열쇠 확인)');
  // 넷틀리파이
  const n = Array.isArray(u.netlify) ? u.netlify[0] : u.netlify;   // n8n 은 배열 답을 한 줄씩 나눠 준다 → 첫 줄 = 계정
  if (n && n.slug) {
    const bad = [];
    if (n.lifecycle_state && n.lifecycle_state !== 'active') bad.push('계정 상태 ' + n.lifecycle_state);
    if (n.days_until_disabled != null) bad.push(n.days_until_disabled + '일 뒤 정지 예정');
    if ((n.usages_exceeded || []).length) bad.push('한도 넘음 (' + n.usages_exceeded.join(', ') + ')');
    if ((n.sites_with_usage_exceeded || []).length) bad.push('한도 넘은 사이트 ' + n.sites_with_usage_exceeded.length + '개');
    if ((n.configurable_limits_exceeded || []).length) bad.push('정해 둔 한도 넘음');
    if (n.has_stripe_payment_method === false) bad.push('결제 카드 없음');
    if (n.auto_topup_enabled === false) bad.push('크레딧 자동충전 꺼짐');
    lines.push('· 넷틀리파이: ' + (bad.length ? '❗ ' + bad.join(' · ') : '정상 · 한도 넘은 것 없음 · 자동충전 켜짐'));
    bad.forEach((b) => alerts.push('넷틀리파이 ' + b));
  } else lines.push('· 넷틀리파이: ❓ 못 읽음 (n8n 넷틀리파이 열쇠 확인)');
  // 깃허브 (현장관리 앱 배포) — 30분 넘게 밀린 배포, 마지막 배포 실패
  const runs = ((u.github || {}).workflow_runs || []).filter((r) => nowMs - Date.parse(r.created_at) < 864e5);
  if (u.github && Array.isArray(u.github.workflow_runs)) {
    const last = u.github.workflow_runs.filter((r) => r.status === 'completed')[0];
    // 그 뒤에 새 배포가 끝났으면 밀린 옛 배포는 상관없다 (11/11 밤 queued 로 남은 것)
    const okAt = last && last.conclusion === 'success' ? Date.parse(last.created_at) : 0;
    const stuck = runs.filter((r) => r.status !== 'completed' && nowMs - Date.parse(r.created_at) > USAGE_WARN.githubStuckMin * 60e3 && Date.parse(r.created_at) > okAt);
    const failed = last && last.conclusion !== 'success' && nowMs - Date.parse(last.created_at) < 864e5;
    if (stuck.length) alerts.push('깃허브 앱 배포가 ' + stuck.length + '건 ' + USAGE_WARN.githubStuckMin + '분 넘게 밀려 있습니다 — 폰 앱이 새 판으로 안 바뀔 수 있음');
    if (failed) alerts.push('깃허브 마지막 앱 배포가 실패했습니다 (' + last.conclusion + ')');
    lines.push('· 깃허브: ' + (stuck.length ? '❗ 배포 ' + stuck.length + '건 밀림' : failed ? '❗ 마지막 배포 실패' : '배포 정상'));
  } else lines.push('· 깃허브: ❓ 못 읽음');
  // 에어테이블 — 창고마다 줄 수
  const bases = {};
  (u.airtable || []).forEach((t) => {
    const b = bases[t.base] = bases[t.base] || { rows: 0, miss: 0 };
    if (t.rows == null) b.miss++; else b.rows += t.rows;
  });
  const names = Object.keys(bases);
  if (names.length) {
    lines.push('· 에어테이블: ' + names.map((k) => k + ' ' + comma(bases[k].rows) + '줄' + (bases[k].miss ? '(표 ' + bases[k].miss + '개 못 셈)' : '')).join(' · ') + ' / 창고마다 ' + comma(USAGE_WARN.airtableMax));
    names.forEach((k) => {
      if (bases[k].rows >= USAGE_WARN.airtableMax * USAGE_WARN.airtableRate) alerts.push('에어테이블 ' + k + ' ' + comma(bases[k].rows) + '줄 — 한도 ' + comma(USAGE_WARN.airtableMax) + '줄의 80% 넘음 (넘으면 새 줄 못 넣음)');
    });
  } else lines.push('· 에어테이블: ❓ 못 셈');
  return { lines, alerts };
}
