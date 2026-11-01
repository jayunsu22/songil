// 카톡_버튼 › 버튼정리: 사장님이 텔레그램 요약의 버튼을 누름 (카톡 읽기 3단계, 10/31).
// 콜백 'k|번호|동작' (동작 pub=가견적 발행, ask=빈칸 묻기 시작, later=나중에, ok=확인함, o0~o9=필름 주문 담당자). 사장님(가맹점 p_001 챗ID)이 누른 것만.
// 가견적 발행은 이 흐름의 저장 공간(staticData)에 '할 일' 로 적어 두고, 노트북이 kakao-jobs 로 가져간다. 글 내용은 적지 않는다.
// 필름 주문(11/1)은 주문받기가 적어 둔 sd.orders[번호] 의 담당자에게 문자 → sms 를 넘겨 문자보내기(SMS Gateway)가 보낸다.
const cq = $('버튼누름').first().json.callback_query || {};
const owner = ($input.first().json.fields || $input.first().json).텔레그램_챗ID;
if (!owner || String((cq.from || {}).id) !== String(owner)) return [];
const [k, job, act] = String(cq.data || '').split('|');
if (k !== 'k' || !/^[a-z0-9]{6}$/.test(job || '')) return [];
const sd = $getWorkflowStaticData('global');
// ask = 현장 빈칸을 업체 카톡 방에 물어보기 [시작해] (4단계, 10/31)
let 표시 = { pub: '⏳ 가견적 발행 중 — 노트북이 처리하면 링크가 옵니다', ask: '⏳ 업체에 묻는 중 — 노트북이 카톡을 보내면 알려 드립니다', later: '⏸ 나중에', ok: '✔ 확인함' }[act];
let sms = null;
if (/^o\d$/.test(act || '')) {
  const o = (sd.orders || {})[job];
  const p = o && o.people[Number(act.slice(1))];
  if (!p) 표시 = '❌ 주문 정보가 없습니다 (7일 지남) — 앱에서 필요량을 다시 고르거나 직접 보내 주세요';
  else if (o.sent) 표시 = '✔ 이미 ' + o.sent + '에게 보냈습니다';
  else {
    // 한국 번호 010… → +8210… (SMS Gateway 는 국제 형식)
    const d = p.phone.replace(/[^0-9+]/g, '');
    sms = { job, label: p.label, siteId: o.siteId, text: o.text, phone: d.startsWith('+') ? d : '+82' + d.replace(/^0/, '') };
    표시 = '';
  }
}
if (표시 === undefined) return [];
if (act === 'pub' || act === 'ask') {
  sd.jobs = (sd.jobs || []).filter((j) => Date.now() - j.at < 7 * 864e5);
  if (!sd.jobs.some((j) => j.job === job && j.action === act)) sd.jobs.push({ job, action: act, at: Date.now(), taken: false });
}
const msg = cq.message || {};
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
return [{ json: {
  query_id: cq.id, answer: act === 'pub' || act === 'ask' ? '받았습니다 — 노트북이 곧 처리' : sms ? '문자 보내는 중' : '받았습니다',
  chat_id: String((msg.chat || {}).id || owner), message_id: String(msg.message_id || ''),
  text: esc(String(msg.text || '').slice(0, 3800)) + (표시 ? '\n\n' + esc(표시) : ''), sms,
} }];
