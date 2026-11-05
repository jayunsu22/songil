// 카톡_대화 › 결과정리: AI 답을 거른다. 어떤 일을 할지 최종 검사와 실행은 앱(boss_chat.js)이 한다 → { ok, say, actions, chips }
const r = $input.first().json || {};
let text = '';
try { text = r.candidates[0].content.parts.map((p) => p.text || '').join(''); } catch (e) { text = ''; }
let ai = null;
try { ai = JSON.parse(String(text).replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (e) { ai = null; }
if (!ai || typeof ai !== 'object') return [{ json: { ok: false, error: text ? 'AI 답을 읽지 못함' : 'AI 답 없음' } }];
const TOOLS = ['set_field', 'set_films', 'mark_paid', 'set_staff', 'send_site_info', 'send_text', 'save_phone', 'add_task', 'undo', 'find_sites', 'send_kakao', 'ask_site'];
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const actions = (Array.isArray(ai.actions) ? ai.actions : []).filter((a) => a && TOOLS.includes(a.tool)).slice(0, 8);
const chips = (Array.isArray(ai.chips) ? ai.chips : []).map((c) => s(c, 40)).filter(Boolean).slice(0, 5);
return [{ json: { ok: true, say: s(ai.say, 2000), actions, chips } }];
