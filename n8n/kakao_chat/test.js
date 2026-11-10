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
assert.deepStrictEqual(r, { ok: true, say: '네', actions: [{ tool: 'mark_paid', siteId: 's1' }], chips: ['응'] });
assert.strictEqual(run('결과정리', gem('이상한 답')).ok, false);
assert.strictEqual(run('결과정리', { error: { message: '실패' } }).ok, false);
console.log('kakao_chat ok');
