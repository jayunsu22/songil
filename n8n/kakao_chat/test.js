// node n8n/kakao_chat/test.js — 코드 노드를 n8n 없이 돌려 본다 (값은 지어낸 것)
const path = require('path');
const assert = require('assert');
const wf = JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build.js')]).toString());
const codeOf = (name) => wf.nodes.find((n) => n.name === name).parameters.jsCode;
const run = (name, input) => new Function('$input', codeOf(name))({ first: () => ({ json: input }) })[0].json;

// 프롬프트: 대화 역할을 Gemini 모양으로, 도구 결과는 user 로 묶음, model 로 시작하지 않음
const p = run('프롬프트', { body: { context: { today: '2026-11-04', sites: [{ id: 's1', name: '하늘' }], team: [{ name: '가', phone: false }] },
  history: [{ role: 'assistant', text: '앞 답' }, { role: 'user', text: '문자 보내줘' }, { role: 'tool', text: '[앱 실행 결과] []' }, { role: 'assistant', text: '네' }, { role: 'user', text: '응' }] } });
assert.deepStrictEqual(p.contents.map((c) => c.role), ['user', 'model', 'user']);
assert.ok(p.contents[0].parts[0].text.includes('문자 보내줘') && p.contents[0].parts[0].text.includes('[앱 실행 결과]'));
assert.ok(p.system.includes('2026-11-04') && p.system.includes('"s1"') && p.system.includes('거짓말 금지'));

// 📷 사진: 내 말 뒤에 inlineData 로, 묶여도 사진이 남는다
const D = 'A'.repeat(200);
const q = run('프롬프트', { body: { context: {}, history: [{ role: 'user', text: '덕유주공 필름 정리해', photos: [{ mime: 'image/jpeg', data: D }, { mime: 'x', data: D }, { data: 'short' }] },
  { role: 'tool', text: '[앱 실행 결과] []' }] } });
assert.strictEqual(q.contents.length, 1);
assert.deepStrictEqual(q.contents[0].parts.slice(1).map((x) => x.inlineData.mimeType), ['image/jpeg', 'image/jpeg']);
assert.ok(q.contents[0].parts[0].text.includes('(사진 2장 첨부)') && q.contents[0].parts[0].text.includes('[앱 실행 결과]'));
assert.ok(q.system.includes('[사진]') && q.system.includes('ps170'));

// 결과정리
const gem = (o) => ({ candidates: [{ content: { parts: [{ text: typeof o === 'string' ? o : JSON.stringify(o) }] } }] });
let r = run('결과정리', gem({ say: '네', actions: [{ tool: 'mark_paid', siteId: 's1' }, { tool: 'rm_rf' }, null], chips: ['응', ''] }));
assert.deepStrictEqual(r, { ok: true, say: '네', actions: [{ tool: 'mark_paid', siteId: 's1' }], chips: ['응'], by: 'gemini' });
assert.strictEqual(run('결과정리', gem('이상한 답')).ok, false);
assert.strictEqual(run('결과정리', { error: { message: '실패' } }).ok, false);
// 🤖 클로드(소넷 5.5, 11/12): 답 앞에 설명·```json 을 붙여도 JSON 을 찾는다. 못 받으면 fallback → Gemini
const cl = (t, o) => Object.assign({ type: 'message', content: [{ type: 'text', text: t }], stop_reason: 'end_turn' }, o || {});
r = run('결과정리', cl('내일은 두 분 들어가요.\n\n```json\n{"say":"네","actions":[{"tool":"undo","id":"u1"}],"chips":[]}\n```'));
assert.deepStrictEqual(r, { ok: true, say: '네', actions: [{ tool: 'undo', id: 'u1' }], chips: [], by: 'claude' });
r = run('결과정리', cl('설명 한 줄\n\n{"say":"안녕 {괄호}","actions":[],"chips":["예"]}'));
assert.deepStrictEqual([r.ok, r.say, r.chips], [true, '안녕 {괄호}', ['예']]);
assert.deepStrictEqual(run('결과정리', { type: 'error', error: { type: 'invalid_request_error', message: 'credit balance is too low' } }),
  { ok: false, fallback: true, error: 'credit balance is too low' });
assert.strictEqual(run('결과정리', cl('{"say":"x"}', { stop_reason: 'refusal' })).fallback, true);
assert.deepStrictEqual(run('결과정리', cl('사진에 문이 보여요.')), { ok: true, say: '사진에 문이 보여요.', actions: [], chips: [], by: 'claude' }, '말로만 답하면 그대로');
assert.strictEqual(run('결과정리', cl('{"say": "깨진', { stop_reason: 'max_tokens' })).fallback, true);
assert.strictEqual(run('결과정리', gem('이상한 답')).fallback, undefined, 'Gemini 실패는 다시 넘기지 않는다');
// 흐름: 프롬프트 → 클로드 → 결과정리 → (fallback) Gemini·넘김알림, 사진은 image 블록으로
const conn = wf.connections;
assert.deepStrictEqual(conn['프롬프트'].main[0].map((x) => x.node), ['클로드']);
assert.deepStrictEqual(conn['제미나이로'].main.map((b) => b.map((x) => x.node)), [['Gemini', '넘김알림'], ['응답']]);
const body = wf.nodes.find((n) => n.name === '클로드').parameters.jsonBody;
const $json = { system: 'S', contents: [{ role: 'user', parts: [{ text: '사진' }, { inlineData: { mimeType: 'image/png', data: 'AAA' } }] }, { role: 'model', parts: [{ text: '네' }] }] };
const sent = JSON.parse(new Function('$json', 'return ' + body.replace(/^=\{\{\s*|\s*\}\}$/g, ''))($json));
assert.strictEqual(sent.model, 'claude-sonnet-5-5');
assert.deepStrictEqual(sent.messages[0].content[1], { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } });
assert.deepStrictEqual(sent.messages.map((m) => m.role), ['user', 'assistant']);
// 넘김 알림은 하루 한 번
const sd = {};
const notice = (j) => new Function('$getWorkflowStaticData', '$json', wf.nodes.find((n) => n.name === '넘김알림').parameters.jsCode)(() => sd, j);
assert.strictEqual(notice({ error: 'credit balance is too low' }).length, 1);
assert.ok(notice.length === 1 && notice({ error: 'x' }).length === 0);
console.log('kakao_chat ok');
