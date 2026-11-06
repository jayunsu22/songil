// 인원모집 › 시계: 10분마다. 오전 8시~저녁 8시에만 — 2시간(밤은 빼고 센다) 답이 없으면 한 번 더 묻고,
// 두 번째도 없으면 '연락이 없어서…' 를 보내고 잡아 둔 날을 다음 사람에게
// 장문 문자가 왔다는 신호만 오고 글이 10분 넘게 안 오면 — 기억한 번호면 문자_답장이 알린다 (11/6)
sd.mmsWait = sd.mmsWait || {};
for (const [k, w] of Object.entries(sd.mmsWait)) {
  if (now - w.at < 10 * 60e3) continue;
  delete sd.mmsWait[k];
  out.forward = { action: 'in', from: w.from, unread: true };
  break;
}
const h = hourKST(now);
if (h < OPEN || h >= CLOSE) return finish();
for (const r of Object.values(sd.recruits)) {
  if (!r.active || !Array.isArray(r.days)) continue;
  let moved = false;
  for (const p of r.people) {
    if (p.st !== 'asked' || now < dueAt(p.at)) continue;
    if ((p.tries || 0) < MAX_TRY) ask(r, p);
    else { p.st = 'timeout'; p.hold = []; p.at = now; out.sms.push({ phone: e164(p.phone), text: GONE }); moved = true; }
  }
  if (moved) advance(r);
}
return finish();
