// 인원모집 › 버튼: 카톡_버튼 흐름이 텔레그램 버튼을 POST crew-act (사장님 열쇠) 로 넘긴다 { rid, act }
// act: y3d1 = 3번 사람 1번 날 넣기, y3a = 잡아 둔 날 모두 넣기, n3 = 안 넣기 (남은 날은 다음 사람에게)
// 넣기 → '15일, 18일 확정입니다…' + 우편함 crewAdd (앱 그날 인원에). resp.msg 는 텔레그램 글 끝에 붙는다
const b = $('버튼요청').first().json.body || {};
const r = sd.recruits[String(b.rid || '')];
const m = /^([yn])(\d+)(?:d(\d+)|a)?$/.exec(String(b.act || ''));
const p = r && Array.isArray(r.days) && m && r.people[Number(m[2])];
if (!p) { out.resp = { ok: true, msg: '❌ 모집 정보가 없습니다 (끝났거나 지난 날)' }; return finish(); }
const ds = (list) => list.map((di) => dom(r.days[di].date) + '일').join('·');
const left = () => r.days.map((d, di) => dom(d.date) + '일 ' + Math.max(0, d.slots - inOn(r, di).length)).join(' · ');
if (m[1] === 'y') {
  p.in = p.in || [];
  const want = (m[3] != null ? [Number(m[3])] : (p.hold || []))
    .filter((di, i, a) => r.days[di] && a.indexOf(di) === i && !p.in.includes(di));
  const ok = want.filter((di) => (p.hold || []).includes(di) || !full(r, di));
  const no = want.filter((di) => !ok.includes(di));
  if (!want.length) out.resp = { ok: true, msg: '✔ 이미 넣었습니다' };
  else if (!ok.length) out.resp = { ok: true, msg: '❗ ' + ds(no) + ' 자리가 다 찼습니다 — 넣으려면 앱에서 직접' };
  else {
    ok.forEach((di) => {
      p.in.push(di);
      out.fills.push({ siteId: r.siteId, kind: 'crewAdd', date: r.days[di].date, name: p.name, room: '인원 모집', at: todayKST() });
    });
    p.hold = (p.hold || []).filter((di) => !p.in.includes(di));
    if (m[3] == null) p.hold = [];   // 모두 넣기 — 못 넣은 날(다 참)은 놓아준다
    p.st = p.hold.length ? 'yes' : 'in'; p.at = now;
    out.sms.push({ phone: e164(p.phone), text: THANKS(ok.map((di) => r.days[di].date)) });
    // 하루만 넣었으면 원래 글의 버튼은 지워지니, 남은 날 버튼을 새 글로
    if (p.hold.length) {
      const idx = Number(m[2]), btn = (lab, a) => ({ text: lab, data: 'k|' + r.id + '|' + a });
      out.notify.push({ html: true, text: '👤 <b>' + esc(p.name) + '(' + p.pay + ')</b> · ' + esc(r.siteName) + '\n남은 날: ' + ds(p.hold) + ' — 넣을까요?',
        buttons: [p.hold.map((di) => btn(dom(r.days[di].date) + '일 넣기', 'y' + idx + 'd' + di)).slice(0, 3), [btn('안 넣기', 'n' + idx)]] });
    }
    advance(r);
    const done = r.days.filter((d, di) => ok.includes(di) && full(r, di));
    out.resp = { ok: true, msg: '✅ ' + p.name + ' ' + ds(ok) + ' 넣음 — 감사 문자 보냄 (앱을 열면 인원에 들어갑니다)' +
      (no.length ? '\n❗ ' + ds(no) + '은 다 차서 못 넣음' : '') + (p.hold.length ? '\n⏳ ' + ds(p.hold) + '은 아직 잡아 둠 — 넣거나 [안 넣기]' : '') +
      '\n남은 자리: ' + left() + (done.length ? '\n🎉 ' + done.map((d) => d.label).join('·') + ' 자리가 다 찼습니다' : '') };
  }
} else {
  const had = (p.hold || []).slice();
  p.hold = []; p.st = (p.in || []).length ? 'in' : 'skip'; p.at = now;
  const before = out.sms.length;
  advance(r);
  out.resp = { ok: true, msg: '➖ ' + p.name + (had.length ? ' ' + ds(had) : '') + ' 안 넣음' + (out.sms.length > before ? ' — 다음 사람에게 보냈습니다' : '') +
    '\n남은 자리: ' + left() };
}
return finish();
