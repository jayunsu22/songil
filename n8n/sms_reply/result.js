// 문자_답장 › 정리: AI 판단으로 칸에 넣을 것·남은 것을 고르고 → 우편함·비서 대화(feed)·텔레그램. 칸에 넣었으면 감사 문자 (사장님 11/6)
const p = $('처리').first().json;
const r = p.ai ? ($input.first().json || {}) : {};
const sd = $getWorkflowStaticData('global');
const now = Date.now();
const LABEL = { pwLobby: '공동현관 비번', pwUnit: '세대 비번', toilet: '화장실 위치', films: '필름 번호' };
const put = (f) => f.update ? ' 바꿈' : ' 넣음';
const fills = [], lines = [], got = new Set();
(Array.isArray(r.fills) ? r.fills : []).forEach((f) => {
  if (f.kind === 'films' && f.update) { lines.push('필름 번호 변경 요청 — 직접 바꿔 주세요'); return; }   // 필름 변경은 사장님이 (11/1)
  const o = { siteId: f.siteId, kind: f.kind, room: p.w.name, at: p.today };
  if (f.kind === 'field') { o.field = f.field; o.value = f.value; got.add(f.field); lines.push(LABEL[f.field] + put(f)); }
  else { o.films = f.films; got.add('films'); lines.push(LABEL.films + put(f) + ' → 수량을 골라 주세요'); }
  fills.push(o);
});
(Array.isArray(r.picks) ? r.picks : []).forEach((x) => lines.push((x.label || '내용') + ' — 확실치 않아 안 넣었어요. 글을 보고 직접 넣어 주세요'));
(Array.isArray(r.pays) ? r.pays : []).forEach(() => lines.push('잔금 넣었다고 함 — 확인되면 결재함에서 완료표시'));
(Array.isArray(r.infos) ? r.infos : []).forEach((x) => lines.push(String(x.value || '').slice(0, 120)));
// 번호 질문의 답 (kakao-digest, 11/6) — 카톡 gaps.pick_fills 와 같은 규칙. 이 현장 것만
const w = (sd.watch || {})[p.tailKey];
const checkIds = new Set(((w && w.ask && w.ask.checks) || []).map((c) => c.id)), gotChecks = new Set();
(Array.isArray(r.items) ? r.items : []).forEach((it) => {
  if (it.siteId && it.siteId !== p.w.siteId) return;
  const base = { siteId: p.w.siteId, kind: it.kind, room: p.w.name, at: p.today };
  if (it.kind === 'field' && LABEL[it.field] && it.field !== 'films' && String(it.value || '').trim()) {
    const update = !((w && w.keys) || []).includes(it.field);
    fills.push(Object.assign(base, { field: it.field, value: String(it.value).trim(), update }));
    got.add(it.field); lines.push(LABEL[it.field] + put({ update }));
  } else if (it.kind === 'films') {
    const films = (it.films || []).filter((x) => x && String(x.code || '').trim());
    if (!films.length) return;
    if (!((w && w.keys) || []).includes('films')) { lines.push('필름 번호 변경 요청 — 직접 바꿔 주세요'); return; }
    fills.push(Object.assign(base, { films })); got.add('films'); lines.push(LABEL.films + ' 넣음 → 수량을 골라 주세요');
  } else if (it.kind === 'check' && checkIds.has(it.checkId) && String(it.value || '').trim()) {
    fills.push(Object.assign(base, { checkId: it.checkId, value: String(it.value).trim() }));
    gotChecks.add(it.checkId); lines.push('업체 확인 답 받음');
  }
});
if (p.unread) lines.push(p.msg);
if (w) w.keys = (w.keys || []).filter((k) => !got.has(k));
if (w && w.ask) w.ask.checks = w.ask.checks.filter((c) => !gotChecks.has(c.id));
const left = ((w && w.keys) || []).filter((k) => LABEL[k]).map((k) => LABEL[k])
  .concat(((w && w.ask && w.ask.checks) || []).map((c) => String(c.text).replace(/\s*\(.*?\)/g, '').slice(0, 24)));
// 💌 칸에 넣었으면 감사 문자 (카톡과 같은 글). 6시간에 한 번, 밤에는 안 보낸다
const hour = new Date(now + 9 * 3600e3).getUTCHours();
const digits = String(p.from || '').replace(/[^0-9+]/g, '');
let sms = [];
if (fills.length && digits && hour >= 8 && hour < 20 && (!w || !w.thankedAt || now - w.thankedAt > 6 * 3600e3)) {
  sms = [{ phone: digits.startsWith('+') ? digits : '+82' + digits.replace(/^0/, ''), text: '알겠어요~\n또 연락드릴께요~😊' }];
  if (w) w.thankedAt = now;
  lines.push('감사 문자 보냄');
}
const feed = { id: 's' + now.toString(36), t: now, kind: 'sms', from: p.w.name, siteId: p.w.siteId === '-' ? '' : p.w.siteId, siteName: p.w.siteName, text: p.msg.slice(0, 500), lines, left };
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const notify = { html: true, text: '💬 <b>문자 답장 · ' + esc(p.w.name) + '</b>' + (p.w.siteName ? '\n' + esc(p.w.siteName) : '') +
  (lines.length ? '\n' + lines.map((l) => '✅ ' + esc(l)).join('\n') : '') + (left.length ? '\n❓ 아직 못 받음: ' + esc(left.join(' · ')) : '') + '\n(앱 🤖 비서에서 보기)' };
return [{ json: { fills, feed, notify, sms } }];
