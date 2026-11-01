// 인원모집 공용 (2026-11-01 사장님) — 코드 노드마다 앞에 붙는다 (build.js).
// 저장 공간 sd.recruits[번호] = { id, siteId, siteName, date, label, slots, budget, band, active, exhausted, at,
//   people: [{ name, phone, pay, st: wait|asked|yes|in|no|timeout|skip, tries, at, reply }] }
// 예산 규칙은 앱 share.js pickWithinBudget 와 같다 (바꾸면 둘 다). 설계 docs/superpowers/specs/2026-11-01-인원모집-design.md
const sd = $getWorkflowStaticData('global');
sd.recruits = sd.recruits || {};
const now = Date.now();
const KST = 9 * 3600e3;
const out = { resp: { ok: true }, sms: [], notify: [], fills: [] };
// 문자 (사장님이 정한 그대로)
const ASK = (label) => '안녕하세요~\n' + label + ' 일정 가능하신가요?\n가능하시면 "네", 일정 안되시면 "아니요"라고 해주세요~';
const THANKS = '네~ 감사합니다.\n주소확정되면 보내드릴께요~';
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
const pending = (r) => r.people.filter((p) => p.st === 'asked' || p.st === 'yes');
const inCount = (r) => r.people.filter((p) => p.st === 'in').length;
function ask(r, p) {
  p.st = 'asked'; p.tries = (p.tries || 0) + 1; p.at = now;
  out.sms.push({ phone: e164(p.phone), text: ASK(r.label) });
}
// 빈 자리(필요 − 넣음 − 답 기다림)만큼 순서대로 다음 사람에게. 예산 = 이 사람 + 남은 자리를 가장 싼 사람들로 채워도 넘지 않게
function advance(r) {
  if (!r.active) return;
  for (let guard = 0; guard < 50; guard++) {
    const open = r.slots - inCount(r) - pending(r).length;
    if (open <= 0) return;
    const used = r.people.filter((p) => ['in', 'asked', 'yes'].includes(p.st)).reduce((a, p) => a + p.pay, 0);
    const left = r.budget ? r.budget - used : 0;
    const waits = r.people.filter((p) => p.st === 'wait');
    let hit = null;
    for (let i = 0; i < waits.length && !hit; i++) {
      const fill = waits.filter((_, j) => j !== i).map((p) => p.pay).sort((a, b) => a - b).slice(0, open - 1).reduce((a, b) => a + b, 0);
      if (!r.budget || waits[i].pay + fill <= left) hit = waits[i];
    }
    if (!hit) {
      if (!pending(r).length && inCount(r) < r.slots && !r.exhausted) {
        r.exhausted = true; r.active = false;
        out.notify.push({ html: true, text: '👥 <b>모두 안 됨 · ' + esc(r.label) + ' ' + (r.slots - inCount(r)) + '자리</b>\n' + esc(r.siteName) +
          '\n순서대로 다 물어봤습니다 — 밴드에서 구해 주세요.\n────\n' + esc(r.band || '') });
      }
      return;
    }
    ask(r, hit);
  }
}
const finish = () => [{ json: out }];
