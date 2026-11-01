// 인원모집 › 답장: SMS Gateway(사장님 폰)가 받은 문자를 POST sms-in-… (sms:received). 모집 중에 물어본 번호의 답만 본다 —
// 다른 문자(가족·업체)는 그냥 지나간다. '15일 가능 16일 불가능' 처럼 날마다 읽는다.
// 다 안 됨 → '아쉽네요' + 다음 사람 / 되는 날 있음·못 읽음 → 텔레그램 [15일 넣기]…[모두 넣기][안 넣기]
const body = $('답장받음').first().json.body || {};
const pl = body.payload || body;
const msg = String(pl.message || pl.text || '').trim();
const from = tail(pl.sender || pl.phoneNumber || pl.phone || '');
if (!msg || !from) return finish();
// 그 번호를 물어본 모집 — 최근 것부터
let r = null, idx = -1;
for (const x of Object.values(sd.recruits).sort((a, b) => b.at - a.at)) {
  if (!Array.isArray(x.days)) continue;
  const i = x.people.findIndex((p) => tail(p.phone) === from && ['asked', 'yes', 'timeout'].includes(p.st));
  if (i >= 0) { r = x; idx = i; break; }
}
if (!r) return finish();
const p = r.people[idx];
p.reply = msg.slice(0, 200);
const NO = /(불가|아니|아뇨|안\s*돼|안\s*되|못\s*(해|가|할|함)|어렵|힘들|선약|ㄴㄴ|\bx\b|no\b)/i;
const YES = /(가능|네|넵|넹|예|옙|응|ㅇㅇ|ㅇㅋ|ㅇ|오케|ok|좋아|됩니다|될것|돼요|되요|돼|되|갈께|갈게|콜|o\b)/i;
const word = (t) => (NO.test(t) ? 'no' : YES.test(t) ? 'yes' : '');
// 날짜마다: '15일 가능 16 안돼요' — 숫자 다음부터 다음 숫자 앞까지가 그날 답
const ans = {};   // 날 번호 → yes|no
const re = /(\d{1,2})\s*일?/g;
const marks = [];
let m;
while ((m = re.exec(msg))) {
  const n = parseInt(m[1], 10), di = p.asked.find((x) => dom(r.days[x].date) === n);
  if (di != null) marks.push({ di, at: m.index, end: re.lastIndex });   // 물어본 날 숫자만 ('2시부터' 는 지나감)
}
// 뒤에서부터 — '15일 16일 가능' 처럼 말이 없는 날은 다음 날의 답을 따른다
let next = '';
for (let i = marks.length - 1; i >= 0; i--) {
  const w = word(msg.slice(marks[i].end, i + 1 < marks.length ? marks[i + 1].at : msg.length)) || next;
  if (w) ans[marks[i].di] = w;
  next = w;
}
const said = Object.keys(ans).length;
if (!said) { const w = word(msg); if (w) p.asked.forEach((di) => { ans[di] = w; }); }   // '네' · '다 가능' · '아니요'
else if (Object.values(ans).includes('yes')) p.asked.forEach((di) => { if (!ans[di] && !marks.some((k) => k.di === di)) ans[di] = 'no'; });   // '15일만 가능' — 말 안 한 날은 안 됨
const yes = p.asked.filter((di) => ans[di] === 'yes');
const no = p.asked.filter((di) => ans[di] === 'no');
const unk = p.asked.filter((di) => !ans[di]);   // 못 읽은 날 — 사장님이 정한다
const ds = (list) => list.map((di) => dom(r.days[di].date) + '일').join(' · ');
const head = esc(p.name) + '(' + p.pay + ')';
if (no.length === p.asked.length) {
  p.st = 'no'; p.hold = []; p.at = now;
  out.sms.push({ phone: e164(p.phone), text: SORRY });
  advance(r);
  return finish();
}
// 되는 날·못 읽은 날만 잡아 둔다 — 이미 잡아 둔 날이거나 아직 빈 자리가 있는 날
const was = p.hold || [];
p.hold = [];
const keep = yes.concat(unk).filter((di) => was.includes(di) || (!r.stopped && openOn(r, di) > 0));
p.hold = keep;
const closed = yes.filter((di) => !keep.includes(di));
p.st = keep.length ? 'yes' : 'no'; p.at = now;   // 사장님이 정할 때까지 시계를 멈춘다
if (!keep.length) {
  // 되는 날이 다 찼다 (늦게 온 답) — 마감 문자, 못 읽은 답이면 사장님께 알림만
  if (closed.length) out.sms.push({ phone: e164(p.phone), text: CLOSED(closed.map((di) => r.days[di].date)) });
  out.notify.push({ html: true, text: '👤 <b>' + head + ' 답장</b> (' + (closed.length ? ds(closed) + ' 마감 — 마감 문자 보냄' : '모집 끝 — 넣으려면 앱에서 직접') + ')\n' +
    esc(r.siteName) + '\n💬 "' + esc(p.reply) + '"' });
  advance(r);
  return finish();
}
const btn = (lab, a) => ({ text: lab, data: 'k|' + r.id + '|' + a });
const rows = [];
const per = keep.map((di) => btn(dom(r.days[di].date) + '일 넣기', 'y' + idx + 'd' + di));
if (keep.length === 1) rows.push([btn('✅ ' + dom(r.days[keep[0]].date) + '일 넣기', 'y' + idx + 'a'), btn('안 넣기', 'n' + idx)]);
else {
  for (let i = 0; i < per.length; i += 3) rows.push(per.slice(i, i + 3));
  rows.push([btn('✅ 모두 넣기', 'y' + idx + 'a'), btn('안 넣기', 'n' + idx)]);
}
out.notify.push({ html: true, buttons: rows,
  text: '👥 <b>인원 모집 답장</b> · ' + esc(r.siteName) + '\n👤 <b>' + head + '</b>\n' +
    (yes.length ? '✅ 가능: ' + ds(yes) + '\n' : '') + (no.length ? '❌ 불가: ' + ds(no) + '\n' : '') +
    (unk.length ? '❔ 못 읽음: ' + ds(unk) + ' — 답을 봐 주세요\n' : '') + (closed.length ? '⛔ 이미 마감: ' + ds(closed) + '\n' : '') +
    '💬 "' + esc(p.reply) + '"' });
advance(r);   // '불가' 한 날은 다음 사람에게
return finish();
