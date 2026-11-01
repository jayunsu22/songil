// 카톡_버튼 › 바로결과: 앱 📨 바로 주문의 SMS Gateway 응답 → 앱에 { ok, error } (11/1). 앱이 필름 탭에 기록한다
const r = $input.first().json || {};
const ok = !r.error && !!(r.id || r.state) && String(r.state || '').toLowerCase() !== 'failed';
const why = r.error ? (r.error.message || r.error.description || JSON.stringify(r.error)) : (ok ? '' : '응답 없음');
return [{ json: { ok, error: String(why).slice(0, 200) } }];
