// 문자_상태 › 아이디: { ids } → 한 줄에 하나 (최대 20개, 이상한 글자 빼고)
const b = $input.first().json.body || {};
const ids = (Array.isArray(b.ids) ? b.ids : []).map((v) => String(v || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)).filter(Boolean).slice(0, 20);
if (!ids.length) return [{ json: { id: '-' } }];
return ids.map((id) => ({ json: { id } }));
