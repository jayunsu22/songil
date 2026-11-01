// 인원모집 › 시계: 10분마다. 오전 8시~저녁 8시에만 — 2시간(밤은 빼고 센다) 답이 없으면 한 번 더 묻고,
// 두 번째도 없으면 '연락이 없어서…' 를 보내고 다음 사람에게
const h = hourKST(now);
if (h < OPEN || h >= CLOSE) return finish();
for (const r of Object.values(sd.recruits)) {
  if (!r.active) continue;
  let moved = false;
  for (const p of r.people) {
    if (p.st !== 'asked' || now < dueAt(p.at)) continue;
    if ((p.tries || 0) < MAX_TRY) ask(r, p);
    else { p.st = 'timeout'; p.at = now; out.sms.push({ phone: e164(p.phone), text: GONE }); moved = true; }
  }
  if (moved) advance(r);
}
return finish();
