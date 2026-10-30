// 카톡_분류 › 프롬프트: 업체·고객 카톡 방의 새 글을 Gemini 에게 분류·요약시키는 요청을 만든다 (사장님 10/30 '비서' 2단계 B안).
// 받는 것: { room: 방 이름, messages: [{ time, sender, text }] } — 노트북이 비번 숫자는 가려서 보낸다.
const b = $input.first().json.body || {};
const room = String(b.room || '').slice(0, 100);
const msgs = Array.isArray(b.messages) ? b.messages.slice(-40) : [];
if (!room || !msgs.length) throw new Error('room 과 messages 가 필요합니다');

const 대화 = msgs.map((m) => '[' + (m.time || '') + '] ' + (m.sender || '') + ': ' + String(m.text || '').slice(0, 800)).join('\n');
const 글 = [
  '너는 인테리어 필름 시공 업체(섬세한손길) 사장님의 비서다. 거래처·고객 카톡 방에 새로 온 글을 읽고 사장님이 바로 판단할 수 있게 분류하고 요약한다.',
  '',
  '방: ' + room,
  '새 글:',
  대화,
  '',
  '종류 (하나만):',
  '- 견적 문의: 새 현장 견적 요청 (주소·품목·사진·평수)',
  '- 견적 추가: 이미 받은/낸 견적에 품목 추가·변경·빼기',
  '- 하자보수: 시공 뒤 들뜸·찢김·찍힘·AS 요청',
  '- 일정 변경: 시공 날짜·시간을 바꾸거나 확인·문의',
  '- 결제: 입금·계좌·계산서·잔금·견적 금액 문의',
  '- 기타: 인사·고맙다·잡담·광고·그 밖',
  '',
  '요약 규칙:',
  '- 한두 줄. 누가 무엇을 원하는지, 현장 이름·주소, 날짜(예 11/14 → 11/16), 품목·수량을 넣는다.',
  '- 비밀번호·계좌번호·주민번호 같은 숫자는 요약에 적지 않는다.',
  '- 글에 없는 것은 지어내지 않는다.',
  '- 급함: 오늘·내일 일정, 하자, 화난 말투, 사장님 답을 기다리는 질문이면 true.',
  '',
  '답은 JSON 하나만: {"종류": "...", "요약": "...", "현장": "현장 이름이나 주소, 없으면 빈 글", "급함": true/false}',
].join('\n');

return [{ json: {
  room,
  gemini: { contents: [{ role: 'user', parts: [{ text: 글 }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } },
} }];
