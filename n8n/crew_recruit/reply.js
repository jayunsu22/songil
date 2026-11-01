// 인원모집 › 답장: SMS Gateway(사장님 폰)가 받은 문자를 POST sms-in-… (sms:received). 모집 중에 물어본 번호의 답만 본다 —
// 다른 문자(가족·업체)는 그냥 지나간다. 네 → 텔레그램 [넣기][안 넣기], 아니요 → '아쉽네요' + 다음 사람, 애매 → 원문 + 버튼
const body = $('답장받음').first().json.body || {};
const pl = body.payload || body;
const msg = String(pl.message || pl.text || '').trim();
const from = tail(pl.sender || pl.phoneNumber || pl.phone || '');
if (!msg || !from) return finish();
// 그 번호를 물어본 모집 — 최근 것부터
let r = null, idx = -1;
for (const x of Object.values(sd.recruits).sort((a, b) => b.at - a.at)) {
  const i = x.people.findIndex((p) => tail(p.phone) === from && ['asked', 'yes', 'timeout'].includes(p.st));
  if (i >= 0) { r = x; idx = i; break; }
}
if (!r) return finish();
const p = r.people[idx];
p.reply = msg.slice(0, 200);
const NO = /(아니|아뇨|안\s*돼|안\s*되|안돼|안되|불가|못\s*(해|가|할)|어렵|힘들|선약|ㄴㄴ|no\b)/i;
const YES = /^(네|넵|넹|예|옙|응|ㅇㅇ|ㅇㅋ|오케|ok|okay|가능|좋아요|됩니다|될것|돼요|되요|갈께|갈게|콜)/i;
const kind = NO.test(msg) ? 'no' : (YES.test(msg) || /가능/.test(msg)) ? 'yes' : '';
const head = esc(p.name) + '(' + p.pay + ') · ' + esc(r.label);
const btn = (lab, a) => ({ text: lab, data: 'k|' + r.id + '|' + a + idx });
if (kind === 'no') {
  p.st = 'no'; p.at = now;
  out.sms.push({ phone: e164(p.phone), text: SORRY });
  advance(r);
  return finish();
}
const full = inCount(r) >= r.slots;
p.st = 'yes'; p.at = now;   // 애매한 답도 사장님이 정할 때까지 시계를 멈춘다
if (full || !r.active) {
  out.notify.push({ html: true, text: '👤 <b>' + head + ' ' + (kind ? '가능' : '답장') + '</b> (모집 끝 — 넣으려면 앱에서 직접)\n' +
    esc(r.siteName) + '\n답장: "' + esc(p.reply) + '"' });
  return finish();
}
out.notify.push({ html: true, buttons: [[btn('✅ 넣기', 'y'), btn('안 넣기', 'n')]],
  text: '👤 <b>' + head + ' ' + (kind ? '가능' : '— 답을 봐 주세요') + '</b>\n' + esc(r.siteName) + '\n답장: "' + esc(p.reply) + '"' });
return finish();
