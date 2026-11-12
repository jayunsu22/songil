// 카톡_대화 › 결과정리: AI 답을 거른다. 어떤 일을 할지 최종 검사와 실행은 앱(boss_chat.js)이 한다 → { ok, say, actions, chips, by }
// 클로드(소넷 5.5, 11/12) 답과 Gemini 답 둘 다 읽는다. 클로드 답이 없거나 못 읽으면 fallback:true → 흐름이 Gemini 로 다시 묻는다.
const r = $input.first().json || {};
const claude = Array.isArray(r.content) || r.type === 'message' || (r.error && r.error.type);
let text = '';
try {
  text = claude ? (r.content || []).filter((c) => c && c.type === 'text').map((c) => c.text || '').join('')
    : r.candidates[0].content.parts.map((p) => p.text || '').join('');
} catch (e) { text = ''; }
// 클로드는 JSON 앞에 한두 줄 설명이나 ```json 을 붙이기도 한다 → 그 안의 JSON 객체를 찾는다
function pickJson(t) {
  const s = String(t || '').trim();
  const tries = [s.replace(/^```(?:json)?\s*|\s*```$/g, '')];
  const fences = s.match(/```(?:json)?\s*([\s\S]*?)```/g) || [];
  fences.reverse().forEach((f) => tries.push(f.replace(/^```(?:json)?\s*|\s*```$/g, '')));
  const end = s.lastIndexOf('}');
  for (let i = s.indexOf('{'); i !== -1 && i < end; i = s.indexOf('{', i + 1)) tries.push(s.slice(i, end + 1));
  for (const x of tries) {
    try { const o = JSON.parse(x); if (o && typeof o === 'object' && !Array.isArray(o) && ('say' in o || 'actions' in o)) return o; } catch (e) { /* 다음 */ }
  }
  return null;
}
let ai = (!claude || r.stop_reason !== 'refusal') ? pickJson(text) : null;
// 클로드가 JSON 없이 말로만 답했으면 그 말을 그대로 보여 준다 (할 일은 없음 — 실행은 actions 로만 하니 안전)
if (!ai && claude && r.stop_reason === 'end_turn' && text.trim() && !text.includes('"actions"')) ai = { say: text.trim(), actions: [], chips: [] };
if (!ai) {
  const why = r.error ? String(r.error.message || r.error.type || '오류').slice(0, 120) : r.stop_reason === 'refusal' ? '답 거절' : text ? 'AI 답을 읽지 못함' : 'AI 답 없음';
  return [{ json: claude ? { ok: false, fallback: true, error: why } : { ok: false, error: why } }];
}
const TOOLS = ['set_field', 'set_films', 'mark_paid', 'set_film_vendor', 'set_staff', 'send_site_info', 'send_text', 'save_phone', 'add_task', 'undo', 'find_sites', 'send_kakao', 'ask_site'];
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const actions = (Array.isArray(ai.actions) ? ai.actions : []).filter((a) => a && TOOLS.includes(a.tool)).slice(0, 8);
const chips = (Array.isArray(ai.chips) ? ai.chips : []).map((c) => s(c, 40)).filter(Boolean).slice(0, 5);
return [{ json: { ok: true, say: s(ai.say, 2000), actions, chips, by: claude ? 'claude' : 'gemini' } }];
