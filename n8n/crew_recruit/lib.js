// 인원모집 공용 (2026-11-01 사장님, 11/1 여러 날 한 번에) — 코드 노드마다 앞에 붙는다 (build.js).
// 저장 공간 sd.recruits[번호] = { id, siteId, siteName, active, stopped, at,
//   days: [{ date, label, slots, budget, band, exhausted }],
//   people: [{ name, phone, pay, free:[날 번호], st: wait|asked|yes|in|no|timeout|skip, asked:[날], hold:[날], in:[날], tries, at, reply }] }
// hold = 답을 기다리거나 사장님 [넣기] 를 기다리며 자리를 잡아 둔 날. in = 넣은 날.
// 예산 규칙은 앱 share.js pickWithinBudget·recruitMulti 와 같다 (바꾸면 둘 다). 설계 docs/superpowers/specs/2026-11-01-인원모집-design.md
const sd = $getWorkflowStaticData('global');
sd.recruits = sd.recruits || {};
const now = Date.now();
const KST = 9 * 3600e3;
const out = { resp: { ok: true }, sms: [], notify: [], fills: [] };
const dom = (iso) => parseInt(String(iso).slice(8, 10), 10);
const mon = (iso) => parseInt(String(iso).slice(5, 7), 10);
// '11월 15일,16일,18일' · 달이 바뀌면 '11월 30일, 12월 1일'
function datesText(isos) {
  const g = [];
  isos.forEach((d) => { const m = mon(d); if (!g.length || g[g.length - 1].m !== m) g.push({ m, d: [] }); g[g.length - 1].d.push(dom(d) + '일'); });
  return g.map((x) => x.m + '월 ' + x.d.join(',')).join(', ');
}
// 문자 (사장님이 정한 그대로, 11/1)
const ASK = (isos) => '안녕하세요. 김정헌실장님의\nAI 인원모집비서입니다.\n\n' + datesText(isos) + ' 구인중입니다.\n일정 되시는날을 알려주세요.\n\n' +
  isos.map((d, i) => dom(d) + '일 ' + (i === 1 ? '불가능' : '가능')).join('\n') + '\n\n이렇게 보내주시면 됩니다.\n감사합니다.';
const THANKS = (isos) => isos.map((d) => dom(d) + '일').join(', ') + ' 확정입니다. 감사합니다~\n주소확정되면 보내드릴께요~';
const CLOSED = (isos) => isos.map((d) => dom(d) + '일').join(', ') + '은 마감되었어요~ 담에봐요~';
const SORRY = '아쉽네요~ 담에봐요~';
const GONE = '연락이 없어서 다른분께 연락드릴께요.\n담에봐요~';
const WAIT = 2 * 3600e3, MAX_TRY = 2, OPEN = 8, CLOSE = 20;   // 2시간, 두 번까지, 문자는 오전 8시~저녁 8시
const e164 = (p) => { const d = String(p || '').replace(/[^0-9+]/g, ''); return d.startsWith('+') ? d : '+82' + d.replace(/^0/, ''); };
const tail = (p) => String(p || '').replace(/[^0-9]/g, '').slice(-8);
const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const hourKST = (t) => new Date(t + KST).getUTCHours();
const todayKST = () => new Date(now + KST).toISOString().slice(0, 10);
// last 부터 8~20시만 세어 2시간이 되는 때 (밤에 걸리면 다음 날 8시부터 다시 센다)
function dueAt(last) {
  let t = last, left = WAIT;
  for (let i = 0; i < 60 && left > 0; i++) {
    const d = new Date(t + KST), h = d.getUTCHours();
    const day = (n, hh) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n, hh) - KST;
    if (h < OPEN) { t = day(0, OPEN); continue; }
    if (h >= CLOSE) { t = day(1, OPEN); continue; }
    const step = Math.min(left, day(0, CLOSE) - t);
    t += step; left -= step;
  }
  return t;
}
const holding = (p) => p.st === 'asked' || p.st === 'yes';
const inOn = (r, di) => r.people.filter((p) => (p.in || []).includes(di));
const holdOn = (r, di) => r.people.filter((p) => holding(p) && (p.hold || []).includes(di));
const full = (r, di) => inOn(r, di).length >= r.days[di].slots;
const openOn = (r, di) => r.days[di].slots - inOn(r, di).length - holdOn(r, di).length;
const pending = (r) => r.people.filter((p) => holding(p) && (p.hold || []).length);
function ask(r, p) {
  p.st = 'asked'; p.tries = (p.tries || 0) + 1; p.at = now;
  out.sms.push({ phone: e164(p.phone), text: ASK(p.asked.map((di) => r.days[di].date)) });
}
// 그날 이 사람을 넣어도 예산 안인가 — 이 사람 + 남은 자리를 남은 후보 중 가장 싼 사람들로 채워도 넘지 않게
function fits(r, di, p, waits) {
  const d = r.days[di];
  if (!d.budget) return true;
  const open = openOn(r, di);
  const used = inOn(r, di).concat(holdOn(r, di)).reduce((a, x) => a + x.pay, 0);
  const fill = waits.filter((x) => x !== p && x.free.includes(di)).map((x) => x.pay).sort((a, b) => a - b).slice(0, open - 1).reduce((a, b) => a + b, 0);
  return p.pay + fill <= d.budget - used;
}
// 아직 빈 날이 있으면 순서대로 다음 사람에게 — 그 사람이 되는 날(겹치지 않고 예산 안)만 묻는다
function advance(r) {
  if (!r.active) return;
  for (let guard = 0; guard < 50; guard++) {
    const waits = r.people.filter((p) => p.st === 'wait');
    let hit = null, dates = [];
    for (const p of waits) {
      dates = r.days.map((_, di) => di).filter((di) => !r.days[di].exhausted && openOn(r, di) > 0 && p.free.includes(di) && fits(r, di, p, waits));
      if (dates.length) { hit = p; break; }
    }
    if (!hit) break;
    hit.asked = dates; hit.hold = dates.slice();
    ask(r, hit);
  }
  // 물어볼 사람이 더 없는데 아직 빈 날 → 그날은 밴드로
  r.days.forEach((d, di) => {
    if (d.exhausted || openOn(r, di) <= 0 || holdOn(r, di).length) return;
    d.exhausted = true;
    out.notify.push({ html: true, text: '👥 <b>모두 안 됨 · ' + esc(d.label) + ' ' + (d.slots - inOn(r, di).length) + '자리</b>\n' + esc(r.siteName) +
      '\n순서대로 다 물어봤습니다 — 밴드에서 구해 주세요.\n────\n' + esc(d.band || '') });
  });
  if (r.days.every((d, di) => full(r, di) || d.exhausted) && !pending(r).length) r.active = false;
}
const finish = () => [{ json: out }];
