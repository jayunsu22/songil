// 카톡_버튼 › 버튼정리: 사장님이 텔레그램 요약의 버튼을 누름 (카톡 읽기 3단계, 10/31).
// 콜백 'k|번호|동작' (동작 pub=가견적 발행, later=나중에, ok=확인함). 사장님(가맹점 p_001 챗ID)이 누른 것만.
// 가견적 발행은 이 흐름의 저장 공간(staticData)에 '할 일' 로 적어 두고, 노트북이 kakao-jobs 로 가져간다. 글 내용은 적지 않는다.
const cq = $('버튼누름').first().json.callback_query || {};
const owner = ($input.first().json.fields || $input.first().json).텔레그램_챗ID;
if (!owner || String((cq.from || {}).id) !== String(owner)) return [];
const [k, job, act] = String(cq.data || '').split('|');
if (k !== 'k' || !/^[a-z0-9]{6}$/.test(job || '')) return [];
const 표시 = { pub: '⏳ 가견적 발행 중 — 노트북이 처리하면 링크가 옵니다', later: '⏸ 나중에', ok: '✔ 확인함' }[act];
if (!표시) return [];
if (act === 'pub') {
  const sd = $getWorkflowStaticData('global');
  sd.jobs = (sd.jobs || []).filter((j) => Date.now() - j.at < 7 * 864e5);
  if (!sd.jobs.some((j) => j.job === job && j.action === act)) sd.jobs.push({ job, action: act, at: Date.now(), taken: false });
}
const msg = cq.message || {};
return [{ json: {
  query_id: cq.id, answer: act === 'pub' ? '받았습니다 — 노트북이 곧 처리' : '받았습니다',
  chat_id: String((msg.chat || {}).id || owner), message_id: String(msg.message_id || ''),
  text: (String(msg.text || '').slice(0, 3900) + '\n\n' + 표시).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
} }];
