// 인원모집 › 버튼: 카톡_버튼 흐름이 텔레그램 [넣기]·[안 넣기] 를 POST crew-act (사장님 열쇠) 로 넘긴다 { rid, act: 'y3'|'n3' }
// 넣기 → 감사 문자 + 우편함 crewAdd (앱 그날 인원에) / 안 넣기 → 문자 없이 다음 사람. resp.msg 는 텔레그램 글 끝에 붙는다
const b = $('버튼요청').first().json.body || {};
const r = sd.recruits[String(b.rid || '')];
const m = /^([yn])(\d+)$/.exec(String(b.act || ''));
const p = r && m && r.people[Number(m[2])];
if (!p) { out.resp = { ok: true, msg: '❌ 모집 정보가 없습니다 (끝났거나 지난 날)' }; return finish(); }
if (m[1] === 'y') {
  if (p.st === 'in') out.resp = { ok: true, msg: '✔ 이미 넣었습니다' };
  else if (inCount(r) >= r.slots) out.resp = { ok: true, msg: '❗ 자리가 다 찼습니다 — 넣으려면 앱에서 직접' };
  else {
    p.st = 'in'; p.at = now;
    out.sms.push({ phone: e164(p.phone), text: THANKS });
    out.fills.push({ siteId: r.siteId, kind: 'crewAdd', date: r.date, name: p.name, room: '인원 모집', at: todayKST() });
    const done = inCount(r) >= r.slots;
    if (done) r.active = false;
    else advance(r);   // 남은 자리를 마저 (후보가 없으면 '모두 안 됨' → 밴드)
    out.resp = { ok: true, msg: '✅ ' + p.name + ' 넣음 — 감사 문자 보냄 (앱을 열면 인원에 들어갑니다)' + (done ? '\n🎉 ' + r.label + ' 자리가 다 찼습니다' : '') };
  }
} else {
  p.st = 'skip'; p.at = now;
  const before = out.sms.length;
  advance(r);
  out.resp = { ok: true, msg: '➖ ' + p.name + ' 안 넣음' + (out.sms.length > before ? ' — 다음 사람에게 보냈습니다' : '') };
}
return finish();
