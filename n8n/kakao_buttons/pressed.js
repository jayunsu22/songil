// 카톡_버튼 › 버튼정리: 사장님이 텔레그램 요약의 버튼을 누름 (카톡 읽기 3단계, 10/31).
// 콜백 'k|번호|동작' (동작 pub=가견적 발행, ask=빈칸 묻기 시작, later=나중에, ok=확인함, o0~o9=필름 주문 담당자). 사장님(가맹점 p_001 챗ID)이 누른 것만.
// 가견적 발행은 이 흐름의 저장 공간(staticData)에 '할 일' 로 적어 두고, 노트북이 kakao-jobs 로 가져간다. 글 내용은 적지 않는다.
// 필름 주문(11/1)은 주문받기가 적어 둔 sd.orders[번호] 의 담당자에게 문자 → sms 를 넘겨 문자보내기(SMS Gateway)가 보낸다.
// 📝 업무비서 앱에서 누른 버튼 (11/13) — POST kakao-press { data, text } (사장님 열쇠). 텔레그램 콜백과 똑같이 처리하고, 결과 글은 앱으로 돌려준다
let app = null;
try { if ($('앱버튼').isExecuted) app = $('앱버튼').first().json.body || {}; } catch (e) { app = null; }
const owner = ($input.first().json.fields || $input.first().json).텔레그램_챗ID;
const cq = app ? { id: '', from: { id: owner }, data: String(app.data || ''), message: { text: String(app.text || '').slice(0, 3800), chat: { id: owner } } }
  : ($('버튼누름').first().json.callback_query || {});
// 앱은 답을 기다리므로 처리 못 하는 버튼도 글을 돌려준다
const stop = () => (app ? [{ json: { query_id: '', answer: '', chat_id: String(owner || ''), message_id: '', text: '❌ 이 버튼은 처리할 수 없어요 (7일 지났거나 잘못된 버튼)' } }] : []);
if (!owner || String((cq.from || {}).id) !== String(owner)) return stop();
const [k, job, act] = String(cq.data || '').split('|');
if (k !== 'k' || !/^[a-z0-9]{6}$/.test(job || '')) return stop();
const sd = $getWorkflowStaticData('global');
// ask = 현장 빈칸을 업체 카톡 방에 물어보기 [시작해] (4단계, 10/31)
// rs·rc·rn = 능동 비서 답장 초안 [보내]·[고쳐서 보내]·[안 보냄] (11/4). rs 는 노트북이 가져가 그 업체 방에 보낸다
let 표시 = { pub: '⏳ 가견적 발행 중 — 노트북이 처리하면 링크가 옵니다', ask: '⏳ 업체에 묻는 중 — 노트북이 카톡을 보내면 알려 드립니다', later: '⏸ 나중에', ok: '✔ 확인함',
  rs: '⏳ 보내는 중 — 노트북이 카톡을 보내면 알려 드립니다', rc: '✏️ 아래 글을 눌러 복사 → 카톡 그 방에 붙여넣고 고쳐서 보내 주세요', rn: '🚫 안 보냄', ra: '⏳ 3시간 뒤에 다시 물어볼게요' }[act];   // ra = 👤 개인고객 못 받은 정보 다시 묻기 (11/5)
let sms = null, crew = null;
// y3a·y3d1·n3 = 인원 모집 '네' 한 팀원 [모두 넣기]·[1번 날 넣기]·[안 넣기] (11/1) — 인원모집 흐름(crew-act)이 처리하고 결과 글을 돌려준다
if (/^[yn]\d+(d\d+|a)?$/.test(act || '')) { crew = { rid: job, act }; 표시 = ''; }
if (/^o\d$/.test(act || '')) {
  const o = (sd.orders || {})[job];
  const p = o && o.people[Number(act.slice(1))];
  if (!p) 표시 = '❌ 주문 정보가 없습니다 (7일 지남) — 앱에서 필요량을 다시 고르거나 직접 보내 주세요';
  else if (o.sent) 표시 = '✔ 이미 ' + o.sent + '에게 보냈습니다';
  else {
    // 한국 번호 010… → +8210… (SMS Gateway 는 국제 형식)
    const d = p.phone.replace(/[^0-9+]/g, '');
    sms = { job, label: p.label, siteId: o.siteId, text: o.text, items: o.items || '', phone: d.startsWith('+') ? d : '+82' + d.replace(/^0/, '') };
    표시 = '';
  }
}
if (표시 === undefined) return stop();
if (act === 'pub' || act === 'ask' || act === 'rs' || act === 'ra') {
  sd.jobs = (sd.jobs || []).filter((j) => Date.now() - j.at < 7 * 864e5);
  if (!sd.jobs.some((j) => j.job === job && j.action === act)) sd.jobs.push({ job, action: act, at: Date.now(), taken: false });
}
const msg = cq.message || {};
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// 답장 초안은 노트북이 「 」 안에 넣어 보낸다 → [고쳐서 보내] 는 눌러서 복사되게 <code> 로
const draft = (t) => { const m = String(t || '').match(/「([\s\S]*)」/); return m ? m[1] : ''; };
return [{ json: {
  query_id: cq.id, answer: act === 'pub' || act === 'ask' || act === 'rs' || act === 'ra' ? '받았습니다 — 노트북이 곧 처리' : sms || crew ? '처리 중' : '받았습니다', crew,
  chat_id: String((msg.chat || {}).id || owner), message_id: String(msg.message_id || ''),
  text: esc(String(msg.text || '').slice(0, 3800)) + (표시 ? '\n\n' + esc(표시) : '') + (act === 'rc' ? '\n<code>' + esc(draft(msg.text)) + '</code>' : ''), sms,
} }];
