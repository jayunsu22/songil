// 카톡_비서 › 결과정리: AI 답을 노트북이 바로 쓸 모양으로 거르고, 답장을 자동으로 보내도 되는지 정한다 (사장님 11/4: 간단한 답만 자동).
// → { ok, fills: 확실한 것(우편함에 바로), picks: 어느 현장인지 애매한 것(결재함 카드), pays: 잔금 넣었다는 말(결재함 카드),
//     infos: 일정·AS·기타(알림만), reply: { text, type, auto, why } }
const pre = $('프롬프트').first().json;
const r = $input.first().json || {};
let text = '';
try { text = r.candidates[0].content.parts.map((p) => p.text || '').join(''); } catch (e) { text = ''; }
let ai = {};
try { ai = JSON.parse(String(text).replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (e) { ai = {}; }
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const byId = {};
(pre.sites || []).forEach((x) => { byId[x.id] = x; });
const FIELDS = ['pwLobby', 'pwUnit', 'toilet'];
const LABEL = { pwLobby: '공동현관 비번', pwUnit: '세대 비번', toilet: '화장실', films: '필름', staff: '작업자' };
const squash = (v) => String(v || '').replace(/\s+/g, '').toLowerCase();
const fills = [], picks = [], pays = [], infos = [], missed = [], tasks = [], filmVendors = [];
let noCode = false;
for (const it of (Array.isArray(ai.items) ? ai.items : []).slice(0, 20)) {
  if (!it || typeof it !== 'object') continue;
  const kind = s(it.kind, 10);
  const sid = byId[s(it.siteId, 40)] ? s(it.siteId, 40) : '';
  const cands = [sid].concat(Array.isArray(it.cands) ? it.cands.map((c) => s(c, 40)) : []).filter((c, i, a) => c && byId[c] && a.indexOf(c) === i).slice(0, 3);
  const sure = !!sid && it.sure === true;
  const quote = s(it.quote, 120);
  let f = null;
  if (kind === 'field') {
    const field = FIELDS.includes(it.field) ? it.field : '';
    const value = s(it.value, 100);
    if (!field || !value) continue;
    if (sure && squash(byId[sid].known[field]) === squash(value)) continue;   // 이미 같은 값
    f = { kind: 'field', field, value, label: LABEL[field] };
  } else if (kind === 'films') {
    const films = (Array.isArray(it.films) ? it.films : []).map((x) => ({ place: s(x && x.place, 40), code: s(x && x.code, 30) })).filter((x) => x.code).slice(0, 20);
    if (!films.length) continue;
    if (it.noCode) noCode = true;
    f = { kind: 'films', films, label: LABEL.films };
  } else if (kind === 'staff' && pre.boss) {
    // 작업자 배정 (사장님 지시만, 11/4) — 이미 배정됐는지는 앱이 현장 날짜별 인원을 보고 판단
    const names = (Array.isArray(it.names) ? it.names : []).map((n) => s(n, 20).replace(/(님|기사님?|씨)$/, '')).filter(Boolean).slice(0, 10);
    const mode = ['add', 'set', 'remove'].includes(it.mode) ? it.mode : 'add';
    if (!names.length) continue;
    f = { kind: 'staff', names, mode, date: /^\d{4}-\d{2}-\d{2}$/.test(s(it.date, 10)) ? s(it.date, 10) : '', label: LABEL.staff };
  } else if (kind === 'filmVendor' && !pre.boss) {
    // 🚚 업체가 필름을 가져다줌 (11/5) — 현장이 확실할 때만
    if (sure && !byId[sid].known.filmVendor) filmVendors.push({ siteId: sid, name: byId[sid].name, quote });
    continue;
  } else if (kind === 'request' && !pre.boss) {
    // 📌 업체가 부탁한 일 (11/5) → 앱 할 일
    const value = s(it.value, 80);
    if (value) tasks.push({ siteId: sure ? sid : '', name: sure ? byId[sid].name : '', title: value, quote });
    continue;
  } else if (kind === 'pay') {
    const pid = sid || (cands.length === 1 ? cands[0] : '');
    if (pid && !byId[pid].payDone) pays.push({ siteId: pid, name: byId[pid].name, quote });
    continue;
  } else if (['schedule', 'as', 'other'].includes(kind)) {
    const value = s(it.value, 200);
    if (value) infos.push({ kind, value, site: sid ? byId[sid].name : '', quote });
    continue;
  } else continue;
  if (sure) {
    const site = byId[sid];
    // 이미 받은 칸에 새 값 → update (비번·화장실은 고쳐 넣고, 필름은 알림만 — 사장님 11/1 규칙)
    f.update = f.kind === 'films' ? site.known.films.length > 0 : f.kind === 'staff' ? true : !!site.known[f.field];
    fills.push(Object.assign({ siteId: sid, name: site.name, date: site.date, quote }, f));
  } else {
    // 사장님 지시는 아무 현장이나 후보로 내밀지 않고 '못 찾음' 으로 알린다
    const list = cands.length ? cands : pre.boss ? [] : (pre.sites || []).filter((x) => x.date >= pre.today).slice(0, 3).map((x) => x.id);
    if (!list.length && pre.boss) missed.push(Object.assign({ quote }, f));
    if (list.length) picks.push(Object.assign({ quote, cands: list.map((c) => ({ id: c, name: byId[c].name, date: byId[c].date })) }, f));
  }
}
// 답장: ack(받았다)·ask(되묻기)만 자동 — 그래도 시간·금액·약속·거절 말이 섞이면 초안으로 (사장님 확인)
const rp = ai.reply && typeof ai.reply === 'object' ? ai.reply : {};
let type = ['ack', 'ask', 'commit', 'none', 'unsure'].includes(rp.type) ? rp.type : 'none';
const rtext = s(rp.text, 400);
if (!rtext && type !== 'unsure') type = 'none';
// 그 현장의 이미 정해진 시공 날짜(25일·11/25·11월 25일)는 위험한 말로 보지 않는다
let check = rtext;
fills.concat(pays).forEach((f) => {
  const d = (byId[f.siteId] || {}).date || '';
  if (!d) return;
  const m = +d.slice(5, 7), dd = +d.slice(8, 10);
  check = check.split(m + '월 ' + dd + '일').join('').split(m + '월' + dd + '일').join('').split(m + '/' + dd).join('').split(dd + '일').join('');
});
const RISK = /\d+\s*(원|만|천)|금액|가격|비용|견적|할인|깎|입금|계좌|오전|오후|\d+\s*시|\d+\s*일|\d+\s*\/\s*\d+|내일|모레|다음\s*주|이번\s*주|[월화수목금토일]요일|불가|어렵|어려|안\s*돼|안\s*되|못\s*해|못\s*하|취소|연기|미뤄|추가\s*(작업|시공)|가능(해요|합니다|하세요)/;
// 사장님 11/12: 사진만 온 방에 '사진 잘 봤어요~' 를 자동으로 보냄 → 확실하지 않으면 보내지 말고 사장님께 '직접 답장하세요'.
// 자동은 '받았다(ack)' + 우리가 받을 값(비번·화장실·필름·잔금)이 실제로 온 글 + 위험한 말 없음 일 때만. AS(하자)는 늘 사장님이.
const said = String(pre.said || '');
const photoOnly = !said.replace(/사진(\s*\d+\s*장)?|동영상|이모티콘|파일\s*:[^\n]*|\s/g, '');
const isAs = infos.some((i) => i.kind === 'as') || /하자|들떴|들뜸|들떠|뜯어|찢어|찢겨|벗겨|떨어졌|떨어져|(^|[^A-Za-z])AS([^A-Za-z]|$)|에이에스|보수|불량|다시\s*(해|붙)/i.test(said);
const gotValue = fills.length > 0 || pays.length > 0 || filmVendors.length > 0;
let auto = false, why = '';
if (type === 'unsure' || (photoOnly && type !== 'none')) {
  type = 'unsure';
  why = photoOnly ? '사진만 와서 무슨 뜻인지 모름' : '글 뜻이 확실하지 않음';
} else if (isAs && type !== 'none') {
  why = 'AS(하자) 얘기 — 사장님이 보고 보내세요';
} else if (type === 'ack' || type === 'ask') {
  if (RISK.test(check)) why = '시간·금액·약속 말이 들어 있음';
  else if (type === 'ask') why = '되묻는 답은 사장님이 보고 보내세요';
  else if (!gotValue) why = '받은 값이 없어서 자동으로 안 보냄';
  else auto = true;
} else if (type === 'commit') why = 'AI 가 사장님 확인이 필요한 답으로 봄';
// 사장님 지시(boss)는 답장 없음 — 사장님 본인 메모라서
return [{ json: { ok: !!text, fills, picks, pays, infos, missed, tasks, filmVendors, noCode, boss: !!pre.boss,
  reply: type === 'none' || pre.boss ? null : { text: type === 'unsure' ? '' : rtext, type, auto, why } } }];
