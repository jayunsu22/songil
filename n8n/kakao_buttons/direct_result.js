// 카톡_버튼 › 바로결과: 앱 📨 바로 주문의 SMS Gateway 응답 → 앱에 { ok, error } (11/1). 앱이 필름 탭에 기록한다
const r = $input.first().json || {};
const ok = !r.error && !!(r.id || r.state) && String(r.state || '').toLowerCase() !== 'failed';
const why = r.error ? (r.error.message || r.error.description || JSON.stringify(r.error)) : (ok ? '' : '응답 없음');
// id·state: 문자_상태 흐름으로 폰이 실제로 보냈는지 앱이 다시 본다 (11/4 — Pending 은 폰이 아직 안 받은 것)
return [{ json: { ok, error: String(why).slice(0, 200), id: String(r.id || ''), state: String(r.state || '') } }];
