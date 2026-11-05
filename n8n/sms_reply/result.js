// 문자_답장 › 정리: AI 판단(카톡_비서)으로 칸에 넣을 것·남은 것을 고르고 → 우편함·비서 대화(feed)·텔레그램. 문자 답장 자동 회신은 하지 않는다
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
const w = (sd.watch || {})[p.tailKey];
if (w) w.keys = (w.keys || []).filter((k) => !got.has(k));
const left = ((w && w.keys) || []).filter((k) => LABEL[k]).map((k) => LABEL[k]);
const feed = { id: 's' + now.toString(36), t: now, kind: 'sms', from: p.w.name, siteId: p.w.siteId === '-' ? '' : p.w.siteId, siteName: p.w.siteName, text: p.msg.slice(0, 500), lines, left };
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const notify = { html: true, text: '💬 <b>문자 답장 · ' + esc(p.w.name) + '</b>' + (p.w.siteName ? '\n' + esc(p.w.siteName) : '') +
  (lines.length ? '\n' + lines.map((l) => '✅ ' + esc(l)).join('\n') : '') + (left.length ? '\n❓ 아직 못 받음: ' + esc(left.join(' · ')) : '') + '\n(앱 🤖 비서에서 보기)' };
return [{ json: { fills, feed, notify } }];
