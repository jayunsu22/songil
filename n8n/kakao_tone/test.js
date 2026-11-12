// node n8n/kakao_tone/test.js — 말투 쌓기·고르기 (글·방은 지어낸 것)
const path = require('path');
const assert = require('assert');
const wf = JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build.js')]).toString());
const code = wf.nodes.find((n) => n.name === '쌓기').parameters.jsCode;
const sd = {};
const run = (body) => new Function('$getWorkflowStaticData', '$input', code)(() => sd, { first: () => ({ json: { body } }) })[0].json;

const it = (k, room, text, prev) => ({ k, room, d: '2026-11-12', t: '10:00', prevWho: '실장', prev: prev || '', text });
let r = run({ action: 'add', items: [it('a', '가방', '넵! 8시까지 갈게요 실장님~', '몇시에 오세요?'), it('b', '가방', '넵'), it('c', '나방', '실장님.. 궁금한거 있어서 연락드려요'), it('a', '가방', '중복')] });
assert.deepStrictEqual([r.ok, r.added, r.total], [true, 3, 3]);
assert.strictEqual(run({ action: 'add', items: [it('a', '가방', '또')] }).added, 0, '같은 지문은 한 번만');
r = run({ action: 'list', n: 10 });
assert.deepStrictEqual(r.lines.map((x) => x.text), ['실장님.. 궁금한거 있어서 연락드려요', '넵! 8시까지 갈게요 실장님~', '넵'], '긴 글 먼저, 방을 섞고, 짧은 답은 조금만');
assert.strictEqual(r.lines[1].prev, '몇시에 오세요?');
assert.deepStrictEqual(run({ action: 'list', room: '나방' }).lines.length, 1);
assert.deepStrictEqual(run({ action: 'stats' }).rooms, { 가방: 2, 나방: 1 });
assert.strictEqual(run({ action: 'zz' }).ok, false);
// 3000줄까지만
run({ action: 'add', items: Array.from({ length: 200 }, (_, i) => it('x' + i, '다방', '글 ' + i + ' 입니다 실장님')) });
for (let j = 0; j < 15; j++) run({ action: 'add', items: Array.from({ length: 200 }, (_, i) => it('y' + j + '_' + i, '다방', '글')) });
assert.strictEqual(run({ action: 'stats' }).total, 3000);
assert.strictEqual(wf.settings.saveDataSuccessExecution, 'none');
// AS 상황 줄과 평소 줄을 나눠 꺼낸다 (11/12)
run({ action: 'add', items: [it('as1', '라방', '죄송합니다.. 금요일에 가서 다시 붙여드릴께요', '방문 필름이 들떴어요'), it('nm1', '라방', '넵! 8시까지 갈게요 실장님~', '몇시에 오세요?')] });
assert.deepStrictEqual(run({ action: 'list', room: '라방', kind: 'as' }).lines.map((x) => x.text), ['죄송합니다.. 금요일에 가서 다시 붙여드릴께요']);
assert.deepStrictEqual(run({ action: 'list', room: '라방', kind: 'normal' }).lines.map((x) => x.text), ['넵! 8시까지 갈게요 실장님~']);
// examples: 평소·AS 를 한 번에 (비서가 말투를 붙일 때)
r = run({ action: 'examples', n: 5, nAs: 5 });
assert.ok(r.normal.some((x) => x.text.startsWith('넵! 8시까지')) && r.as.some((x) => x.text.startsWith('죄송합니다..')));
assert.ok(!r.normal.some((x) => x.text.startsWith('죄송합니다..')));
// 방 줄 지우기 (11/12 가족 방)
r = run({ action: 'drop', room: '라방' });
assert.deepStrictEqual([r.ok, r.removed], [true, 2]);
assert.strictEqual(run({ action: 'drop' }).ok, false);
// 4자리 숫자·링크 (11/12): 새로 들어오는 줄도, 이미 쌓인 줄도 가린다
sd.lines.push({ k: 'old', room: '가방', prev: '차 번호요', text: '12가 3456 이에요', at: 1 });
sd.lines.push({ k: 'old2', room: '가방', prev: '', text: '링크 https://x', at: 1 });
delete sd.masked;
r = run({ action: 'add', items: [it('n1', '가방', '공현 *5678# 입니다'), it('n2', '가방', 'https://a.b')] });
assert.strictEqual(r.added, 1);
assert.ok(!sd.lines.some((x) => /3456|5678|https?:/.test(x.text)), JSON.stringify(sd.lines.slice(-3)));
console.log('kakao_tone ok');
