// 견적사진_판단 › 결과정리: Gemini 답을 { assign: ["품목id"|null, ...] } (사진 순서대로) 로 바꾼다.
// 목록에 없는 id 는 null 로 - 모델이 지어낸 id 로 사진이 사라지면 안 된다.
const 앞 = $('프롬프트').first().json;
const r = $input.first().json || {};
let 답 = {};
try {
  const t = (((r.candidates || [])[0] || {}).content || {}).parts || [];
  답 = JSON.parse((t[0] && t[0].text) || '{}');
} catch (e) { 답 = {}; }
const ok = new Set(앞.ids);
const assign = [];
for (let i = 0; i < 앞.count; i++) {
  const v = 답['사진' + i];
  assign.push(typeof v === 'string' && ok.has(v) ? v : null);
}
return [{ json: { assign, error: r.error ? String(r.error.message || r.error) : '' } }];
