// 문자_상태 › 정리: SMS Gateway 답 → { ok, items: [{ id, state, error }] }. 받는 사람별 상태 중 가장 늦은 것을 그 문자의 상태로
const ids = $('아이디').all().map((x) => x.json.id);
const RANK = { Failed: 0, Pending: 1, Processed: 2, Sent: 3, Delivered: 4 };
const items = $input.all().map((x, i) => {
  const r = x.json || {};
  const id = ids[i] || r.id || '';
  if (id === '-') return null;
  if (r.error && !r.state) return { id, state: 'Unknown', error: String(r.error.message || r.error.description || JSON.stringify(r.error)).slice(0, 120) };
  const recs = Array.isArray(r.recipients) ? r.recipients : [];
  const rs = recs.map((p) => p && p.state).filter((v) => v in RANK);
  const state = rs.length ? rs.reduce((a, v) => (RANK[v] < RANK[a] ? v : a)) : String(r.state || 'Unknown');
  const err = recs.map((p) => p && p.error).filter(Boolean).join(', ');
  return { id, state, error: String(err).slice(0, 120) };
}).filter(Boolean);
return [{ json: { ok: true, items } }];
