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
console.log('kakao_tone ok');
