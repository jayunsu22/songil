// 카톡_버튼 › 모집결과: 인원모집 흐름(crew-act)의 답 { msg } 을 텔레그램 글 끝에 붙인다 (11/1)
const pre = $('버튼정리').first().json;
const r = $input.first().json || {};
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const msg = r.msg || (r.error ? '❌ 못 했습니다 — 앱에서 직접 넣어 주세요' : '');
return [{ json: Object.assign({}, pre, { answer: r.msg ? '했습니다' : '못 했습니다', text: pre.text + (msg ? '\n\n' + esc(msg) : '') }) }];
