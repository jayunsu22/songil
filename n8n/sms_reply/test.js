// node n8n/sms_reply/test.js — 코드 노드를 n8n 없이 (값은 지어낸 것)
const path = require('path');
const assert = require('assert');
const wf = JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build.js')]).toString());
const js = (name) => wf.nodes.find((n) => n.name === name).parameters.jsCode;
const sd = {};
const api = (body) => new Function('$input', '$getWorkflowStaticData', js('처리'))({ first: () => ({ json: { body } }) }, () => sd)[0].json;
const result = (p, ai) => new Function('$', '$input', '$getWorkflowStaticData', js('정리'))(() => ({ first: () => ({ json: p }) }), { first: () => ({ json: ai }) }, () => sd)[0].json;

api({ action: 'watch', items: [{ phone: '010-1234-5678', name: '이다라', siteId: 's1', siteName: '하늘', client: '개인고객', fill: true, keys: ['pwLobby', 'pwUnit'] },
  { phone: '010-1111-2222', name: '마바', siteId: '-', fill: false }] });
// 모르는 번호는 버린다
assert.deepStrictEqual(api({ action: 'in', from: '+821099998888', msg: '가족 문자' }).go, false);
// 고객 답: AI 에게 그 현장만
let p = api({ action: 'in', from: '+821012345678', msg: '공현 #0000 입니다' });
assert.deepStrictEqual([p.go, p.ai, p.body.siteId], [true, true, 's1']);
let r = result(p, { fills: [{ siteId: 's1', kind: 'field', field: 'pwLobby', value: '#0000', update: false }, { siteId: 's1', kind: 'films', films: [{ code: 'a' }], update: true }] });
assert.deepStrictEqual(r.fills.map((f) => [f.siteId, f.field, f.value, f.room]), [['s1', 'pwLobby', '#0000', '이다라']]);
assert.deepStrictEqual(r.feed.lines, ['공동현관 비번 넣음', '필름 번호 변경 요청 — 직접 바꿔 주세요']);
assert.deepStrictEqual(r.feed.left, ['세대 비번']);
assert.strictEqual(r.feed.text, '공현 #0000 입니다');
assert.ok(!r.notify.text.includes('#0000'), '텔레그램에는 값 없이');
// 받은 칸은 다음 답에서 안 물음
assert.deepStrictEqual(sd.watch['12345678'].keys, ['pwUnit']);
// 팀원 답: AI 없이 글만
p = api({ action: 'in', from: '01011112222', msg: '네 감사합니다' });
assert.strictEqual(p.ai, false);
r = result(p, p);
assert.deepStrictEqual([r.fills.length, r.feed.siteId, r.feed.text], [0, '', '네 감사합니다']);
console.log('sms_reply ok');
