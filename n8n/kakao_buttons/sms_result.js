// 카톡_버튼 › 문자결과: SMS Gateway(사장님 폰) 응답을 보고 텔레그램 글 끝에 ✅/❌ (2026-11-01).
// 보냈으면 같은 주문을 두 번 안 보내게 sent 를 적고, 앱 우편함(site-fill)에 '필름 주문' 단계를 넘긴다.
const pre = $('버튼정리').first().json;
const r = $input.first().json || {};
const ok = !r.error && !!(r.id || r.state) && String(r.state || '').toLowerCase() !== 'failed';
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sd = $getWorkflowStaticData('global');
const o = (sd.orders || {})[pre.sms.job];
if (ok && o) o.sent = pre.sms.label;
const why = r.error ? (r.error.message || r.error.description || JSON.stringify(r.error)) : '';
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
return [{ json: Object.assign({}, pre, {
  ok,
  answer: ok ? '보냈습니다' : '못 보냄',
  text: pre.text + '\n\n' + (ok ? '✅ ' + esc(pre.sms.label) + '에게 보냈습니다 (사장님 폰) — 앱 필름 단계는 \'주문\' 으로 바뀝니다'
    : '❌ 못 보냄 — 폰의 SMS Gateway 앱이 켜져 있는지 확인하고, 위 글을 직접 보내 주세요' + (why ? '\n(' + esc(String(why).slice(0, 200)) + ')' : '')),
  fills: [{ siteId: pre.sms.siteId, kind: 'filmOrdered', room: pre.sms.label, at: today }],
}) }];
