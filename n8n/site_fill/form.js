// 현장관리_빈칸 › 질문폼: 📋 업체 확인 질문폼 (사장님 11/13: 업체 답이 너무 다양해 앱에 잘 안 들어간다 → 보기에서 고르기만).
// 업체가 카톡·문자 링크(sitenote/ask.html#열쇠)를 열면 GET ask-form?k=열쇠, [보내기] 면 POST ask-form { k, answers: { id: 값 } }.
// 열쇠 = 그 현장 전용 무작위 글자 (앱이 '묻기' 를 켤 때 site.askKey 로 만든다) — 로그인 없이 그 현장 질문만 보인다.
// 질문은 배포된 앱 share.js 의 askFormItems(현장, 설정) 그대로 (앱 화면과 늘 같게). 답은 이 흐름의 우편함(sd.fills)에 넣어 앱이 가져간다.
const sd = $getWorkflowStaticData('global');
const now = Date.now();
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const req = (() => { try { return $('질문폼열기').isExecuted ? $('질문폼열기').first().json : $('질문폼보내기').first().json; } catch (e) { return {}; } })();
const post = (() => { try { return $('질문폼보내기').isExecuted; } catch (e) { return false; } })();
const key = s((post ? (req.body || {}).k : (req.query || {}).k), 40);
const COMPANY = '필름 시공팀';
const reply = (o) => [{ json: o }];
if (!/^[a-z0-9]{12,40}$/.test(key)) return reply({ ok: false, error: '주소가 잘못됨' });

// 그 열쇠의 현장 (현장읽기폼 이 FIND 로 좁혀 온 줄 중 열쇠가 정확히 같은 것)
let site = null;
for (const it of $('현장읽기폼').all()) for (const r of (it.json.records || [])) {
  try { const d = JSON.parse((r.fields || {}).data || '{}'); if (d && d.askKey === key && !d.hide) site = d; } catch (e) { /* 다음 줄 */ }
}
let settings = {};
for (const it of $('설정읽기폼').all()) for (const r of (it.json.records || [])) {
  try { const d = JSON.parse((r.fields || {}).data || '{}'); if (d && (Array.isArray(d.checks) || Array.isArray(d.toiletOpts) || (d.fieldOpts && typeof d.fieldOpts === 'object'))) settings = d; } catch (e) { /* 다음 줄 */ }
}
const today = new Date(now + 9 * 3600e3).toISOString().slice(0, 10);
// 시공일 다음 날까지만 연다 (시공 끝난 현장 링크는 닫음)
const closed = !site || !site.date || site.date < new Date(Date.parse(today + 'T00:00:00Z') - 864e5).toISOString().slice(0, 10);
if (!site) return reply({ ok: false, error: '없는 질문' });
if (closed) return reply({ ok: false, closed: true });

const Share = (function (module) { new Function('module', String($('앱코드받기폼').first().json.data || ''))(module); return module.exports; })({ exports: {} });
if (!Share || !Share.askFormItems) throw new Error('앱 share.js 를 못 읽음 (askFormItems 없음)');
sd.forms = sd.forms || {};
Object.keys(sd.forms).forEach((k) => { if (now - sd.forms[k].at > 21 * 864e5) delete sd.forms[k]; });
const sent = (sd.forms[key] || {}).ans || {};
// 업체가 이미 보냈지만 앱이 아직 안 가져간 답 — 폼에 '이미 보냄' 으로 다시 띄운다 (앱이 넣으면 질문에서 빠진다)
const items = Share.askFormItems(site, settings).map((q) => Object.assign({}, q, { sent: !!sent[q.id] }));
const days = ['일', '월', '화', '수', '목', '금', '토'];
const dateLabel = (() => { const d = new Date(site.date + 'T00:00:00Z'); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '(' + days[d.getUTCDay()] + ')'; })();
if (!post) return reply({ ok: true, company: COMPANY, site: { title: Share.titleLine(site), date: dateLabel }, items });

// 보내기 — 지금 묻는 질문의 답만 받는다
const answers = (req.body || {}).answers || {};
const byId = Object.fromEntries(items.map((q) => [q.id, q]));
const room = '질문폼';
sd.fills = (sd.fills || []).filter((f) => now - f.t < 14 * 864e5);
sd.worklog = sd.worklog || [];
const lines = [];
let n = 0;
const push = (o, title) => {
  sd.fills.push(Object.assign({ id: 'q' + now.toString(36) + n, t: now, siteId: site.id, room, at: today }, o));
  sd.worklog.push({ id: 'lq' + now.toString(36) + n, t: now, src: 'auto', kind: 'site', title, detail: Share.titleLine(site) + ' · 질문폼', siteId: site.id, state: '', key: '' });
  n++;
};
for (const id of Object.keys(answers).slice(0, 30)) {
  const q = byId[id];
  const v = s(answers[id], 300);
  if (!q || !v) continue;
  if (q.type === 'pw') {
    lines.push(q.label + ': ' + (/없음|당일/.test(v) ? v : '받음'));
    if (/당일/.test(v)) continue;   // 당일 알려준다 — 칸은 비워 둔다
    push({ kind: 'field', field: id, value: /^비번 없음/.test(v) ? '없음(열려 있음)' : v }, q.label + ' 넣음');
  } else if ((Share.ASK_KEYS || ['toilet']).indexOf(id) !== -1) {
    // 드롭다운 칸 (화장실·입구차단기·출입구·차량등록·주차·화물EV, 11/13) — 고른 그대로 그 칸에
    lines.push((id === 'toilet' ? '화장실' : q.label.slice(0, 20)) + ': ' + v);
    push({ kind: 'field', field: id, value: v }, (id === 'toilet' ? '화장실' : q.label.slice(0, 20)) + ' 넣음');
  } else if (id === 'films') {
    // 한 줄에 '위치 번호' — 마지막 낱말을 번호로
    const films = v.split(/\n|,/).map((l) => l.trim()).filter(Boolean).slice(0, 20).map((l) => {
      const m = l.match(/^(.*\S)\s+(\S+)$/);
      return m ? { place: m[1].slice(0, 40), code: m[2].slice(0, 30) } : { place: '', code: l.slice(0, 30) };
    });
    lines.push('필름: ' + films.map((f) => (f.place ? f.place + ' ' : '') + f.code).join(', '));
    push({ kind: 'films', films }, '필름 번호 넣음');
  } else {
    lines.push(q.label.slice(0, 20) + ': ' + v);
    push({ kind: 'check', checkId: id, value: v }, '업체 확인 답 받음');
  }
}
if (!n && !lines.length) return reply({ ok: false, error: '고른 답이 없음' });
sd.forms[key] = { at: now, siteId: site.id, ans: Object.assign({}, sent, Object.fromEntries(Object.keys(answers).filter((k) => byId[k] && s(answers[k], 1)).map((k) => [k, true]))) };
sd.worklog = sd.worklog.filter((x) => now - x.t < 90 * 864e5).slice(-2000);
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const notify = { html: true, text: '📋 <b>업체가 질문폼으로 답함</b> · ' + esc(Share.titleLine(site)) + ' (' + lines.length + '/' + items.length + ')\n' + lines.map((l) => '· ' + esc(l)).join('\n') };
return reply({ ok: true, n, notify });
