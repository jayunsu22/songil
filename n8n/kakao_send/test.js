// node n8n/kakao_send/test.js
const path = require('path');
const assert = require('assert');
const wf = JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build.js')]).toString());
const code = wf.nodes.find((x) => x.name === '처리').parameters.jsCode;
const sd = {};
const call = (body) => new Function('$input', '$getWorkflowStaticData', code)({ first: () => ({ json: { body } }) }, () => sd)[0].json;
assert.strictEqual(call({ action: 'add', id: 'k1', client: '류춘화', text: '' }).ok, false);
assert.ok(call({ action: 'add', id: 'k1', client: '류춘화', text: '좋은 하루 되세요' }).ok);
call({ action: 'add', id: 'k1', client: '류춘화', text: '좋은 하루 되세요' });
assert.strictEqual(call({ action: 'status', ids: ['k1'] }).items[0].state, 'wait');
const t = call({ action: 'take' });
assert.deepStrictEqual(t.jobs.map((j) => [j.id, j.client, j.text]), [['k1', '류춘화', '좋은 하루 되세요']]);
assert.strictEqual(call({ action: 'take' }).jobs.length, 0, '두 번 안 줌');
call({ action: 'result', id: 'k1', ok: true, room: '류춘화' });
const st = call({ action: 'status', ids: ['k1', 'zz'] }).items;
assert.deepStrictEqual([st[0].state, st[0].room, st[1].state], ['sent', '류춘화', 'unknown']);
assert.strictEqual(sd.q[0].text, '', '보낸 뒤 글은 지움');
// 30분 지난 건 안 줌
call({ action: 'add', id: 'old', client: '류춘화', text: '늦은 글' });
sd.q.find((x) => x.id === 'old').at -= 31 * 60000;
assert.strictEqual(call({ action: 'take' }).jobs.length, 0);
assert.strictEqual(call({ action: 'status', ids: ['old'] }).items[0].state, 'failed');
console.log('kakao_send ok');
