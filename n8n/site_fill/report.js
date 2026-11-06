// 현장관리_빈칸 › 정시보고: ⏰ 업무비서 정시 업무보고 (사장님 11/7: 매일 8시~17시 정시마다 지난 1시간 일을 폰 알림으로).
// 내역(sd.worklog)·답장(sd.feed)과 같은 저장 공간이라 이 흐름에 둔다. 두 길로 온다:
//  · 매시 정각 (정시 노드) — 한국 시간으로 설정한 시간(기본 8~17시)·요일이면 지난 1시간을 모아 비서 대화에 카드, 폰에 알림
//  · POST hourly-report (사장님 열쇠, 앱 🔔 설정): { action: 'sub', subscription } 이 폰 알림 받기 / 'unsub' { endpoint } /
//    'cfg' { cfg? } 설정 읽기·바꾸기 / 'test' 지금 지난 1시간으로 한 번 보내 보기
// → { resp, push: [{ subscription, title, message, url }] } — push 는 다음 노드가 Netlify send-push 로 보낸다 (견적 앱과 같은 VAPID).
// 설계 docs/superpowers/specs/2026-11-07-정시보고-design.md
const sd = $getWorkflowStaticData('global');
const now = Date.now();
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const APP = 'https://jayunsu22.github.io/sitenote/index.html#order';
sd.pushSubs = (sd.pushSubs || []).filter((x) => x && x.sub && x.sub.endpoint).slice(-5);
const DEF = { on: true, from: 8, to: 17, empty: false, sat: true, sun: false };
const cfg = Object.assign({}, DEF, sd.reportCfg || {});
let body = null;
try { body = $('보고요청').first().json.body || {}; } catch (e) { body = null; }   // 정각에 돌면 요청이 없다

// 한국 시간
const kst = (t) => new Date(t + 9 * 3600e3);
const hourName = (h) => (h < 12 ? '오전 ' + h : h === 12 ? '낮 12' : '오후 ' + (h - 12)) + '시';
const hm = (t) => { const d = kst(t); return d.getUTCHours() + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };

function build(end) {
  const start = end - 3600e3;
  const inWin = (t) => t >= start && t < end;
  const log = (sd.worklog || []).filter((x) => inWin(x.t));
  const done = log.filter((x) => x.state !== 'need').map((x) => ({ t: x.t, title: s(x.title, 120), detail: s(x.detail, 120) }));
  const need = log.filter((x) => x.state === 'need').map((x) => ({ t: x.t, title: s(x.title, 120), detail: s(x.detail, 120) }));
  const replies = (sd.feed || []).filter((x) => inWin(x.t) && (x.kind === 'sms' || x.kind === 'kakao' || !x.kind) && x.from)
    .map((x) => ({ t: x.t, from: s(x.from, 40), site: s(x.siteName, 60), lines: (x.lines || []).slice(0, 4) }));
  const h = kst(end).getUTCHours(), ph = kst(start).getUTCHours();
  return { start, end, hour: h, title: '⏰ ' + hourName(h) + ' 업무보고 (' + ph + '시~' + h + '시)', done, need, replies, n: done.length + need.length + replies.length };
}
// 폰 알림 글 — 첫 줄 요약, 그 아래 항목 (펼치면 보인다)
function message(r) {
  const head = ['처리 ' + r.done.length + '건', '받은 답장 ' + r.replies.length + '건', r.need.length ? '확인 필요 ' + r.need.length + '건' : '확인 필요 없음'].join(' · ');
  const lines = r.done.slice(0, 3).map((x) => '✅ ' + x.title)
    .concat(r.replies.slice(0, 2).map((x) => '💬 ' + x.from + ' 답장' + (x.site ? ' · ' + x.site : '')))
    .concat(r.need.slice(0, 2).map((x) => '⚠️ ' + x.title));
  const more = r.n - lines.length;
  return [head].concat(lines, more > 0 ? ['… 외 ' + more + '건'] : []).join('\n');
}
// 비서 대화 카드 (알림함 feed — 앱이 30초마다 가져가 대화에 붙인다)
function feedItem(r, quiet) {
  sd.feed = sd.feed || [];
  const id = 'rep' + Math.floor(r.end / 3600e3);
  if (sd.feed.some((x) => x.id === id)) return;
  sd.feed.push({ id, t: now, kind: 'report', title: r.title, quiet: !!quiet, start: r.start, end: r.end,
    done: r.done.slice(0, 20), replies: r.replies.slice(0, 10), need: r.need.slice(0, 10) });
}
function pushes(r) {
  return sd.pushSubs.map((x) => ({ subscription: x.sub, title: r.title, message: message(r), url: APP }));
}

if (body) {
  const act = s(body.action, 10);
  if (act === 'sub') {
    const sub = typeof body.subscription === 'string' ? JSON.parse(body.subscription) : body.subscription;
    if (!sub || !sub.endpoint) return [{ json: { resp: { ok: false, error: '구독 정보가 없음' }, push: [] } }];
    sd.pushSubs = sd.pushSubs.filter((x) => x.sub.endpoint !== sub.endpoint).concat([{ sub, at: now, device: s(body.device, 40) }]).slice(-5);
    return [{ json: { resp: { ok: true, n: sd.pushSubs.length, cfg }, push: [] } }];
  }
  if (act === 'unsub') {
    sd.pushSubs = sd.pushSubs.filter((x) => x.sub.endpoint !== s(body.endpoint, 1000));
    return [{ json: { resp: { ok: true, n: sd.pushSubs.length }, push: [] } }];
  }
  if (act === 'cfg') {
    if (body.cfg && typeof body.cfg === 'object') {
      const c = body.cfg, hr = (v, d) => Math.min(23, Math.max(0, Number.isFinite(+v) ? Math.round(+v) : d));
      sd.reportCfg = { on: c.on !== false, from: hr(c.from, cfg.from), to: hr(c.to, cfg.to), empty: !!c.empty, sat: c.sat !== false, sun: !!c.sun };
      if (sd.reportCfg.to < sd.reportCfg.from) sd.reportCfg.to = sd.reportCfg.from;
    }
    return [{ json: { resp: { ok: true, cfg: Object.assign({}, DEF, sd.reportCfg || {}), n: sd.pushSubs.length }, push: [] } }];
  }
  if (act === 'test') {
    const r = build(now);
    if (!sd.pushSubs.length) return [{ json: { resp: { ok: false, error: '이 폰이 알림 받기에 등록되지 않음' }, push: [] } }];
    return [{ json: { resp: { ok: true, n: r.n }, push: pushes(Object.assign({}, r, { title: '🔔 시험 · ' + r.title })) } }];
  }
  return [{ json: { resp: { ok: false, error: 'action 은 sub·unsub·cfg·test' }, push: [] } }];
}

// 매시 정각 — 설정한 시간·요일만
const k = kst(now), h = k.getUTCHours(), dow = k.getUTCDay();
if (!cfg.on || h < cfg.from || h > cfg.to || (dow === 6 && !cfg.sat) || (dow === 0 && !cfg.sun)) return [{ json: { resp: { ok: true, skip: true }, push: [] } }];
const end = Math.floor(now / 3600e3) * 3600e3;   // 정각에 맞춤 (몇 초 늦게 돌아도 9:00~10:00)
const r = build(end);
if (!r.n) {
  feedItem(r, true);   // 대화에 회색 한 줄만
  return [{ json: { resp: { ok: true, empty: true }, push: cfg.empty ? pushes(Object.assign({}, r, { done: [], need: [], replies: [] })) : [] } }];
}
feedItem(r, false);
return [{ json: { resp: { ok: true, n: r.n }, push: pushes(r) } }];
