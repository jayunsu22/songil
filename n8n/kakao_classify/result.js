// 카톡_분류 › 결과정리: Gemini 답을 { 종류, 요약, 현장, 급함 } 으로. 목록에 없는 종류는 '기타'.
const 종류들 = ['견적 문의', '견적 추가', '하자보수', '일정 변경', '결제', '기타'];
const r = $input.first().json || {};
let 답 = {};
try {
  const t = (((r.candidates || [])[0] || {}).content || {}).parts || [];
  답 = JSON.parse((t[0] && t[0].text) || '{}');
} catch (e) { 답 = {}; }
const 종류 = 종류들.includes(답.종류) ? 답.종류 : '기타';
return [{ json: {
  종류,
  요약: String(답.요약 || '').slice(0, 500),
  현장: String(답.현장 || '').slice(0, 100),
  급함: 답.급함 === true,
  error: r.error ? String(r.error.message || r.error) : (답.요약 ? '' : 'Gemini 답 없음'),
} }];
