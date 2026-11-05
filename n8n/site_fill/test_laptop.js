// node n8n/site_fill/test_laptop.js — 노트북 멈춤 알림
const fs = require('fs'), path = require('path'), assert = require('assert');
const code = fs.readFileSync(path.join(__dirname, 'laptop.js'), 'utf8');
const sd = {};
let clock = Date.parse('2026-11-05T03:00:00Z');   // 한국 12시
const run = () => { const R = Date.now; Date.now = () => clock; try { return new Function('$getWorkflowStaticData', code)(() => sd); } finally { Date.now = R; } };
assert.strictEqual(run().length, 0, '신호를 받은 적 없으면 조용히');
sd.beat = { at: clock - 10 * 60e3 };
assert.strictEqual(run().length, 0, '10분은 괜찮음');
sd.beat = { at: clock - 40 * 60e3 };
assert.ok(run()[0].json.text.includes('40분째'));
assert.strictEqual(run().length, 0, '한 번만');
sd.beat = { at: clock };
assert.ok(run()[0].json.text.includes('돌아왔'));
// 밤에는 안 깨우고 아침에
sd.beat = { at: clock };
clock = Date.parse('2026-11-05T15:00:00Z');   // 한국 0시
assert.strictEqual(run().length, 0);
clock = Date.parse('2026-11-05T23:00:00Z');   // 한국 8시
assert.strictEqual(run().length, 1);
console.log('laptop ok');
