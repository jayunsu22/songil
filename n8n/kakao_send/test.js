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
// 👤 개인고객 카톡: 지켜볼 현장을 같이 맡김
assert.ok(call({ action: 'add', id: 'k9', room: '이다라', text: '안녕', watch: { siteId: 's1', name: '하늘', until: '2026-11-08', keys: ['pwUnit'] } }).ok);
assert.deepStrictEqual(call({ action: 'take' }).jobs.find((j) => j.id === 'k9').watch, { siteId: 's1', name: '하늘', until: '2026-11-08', keys: ['pwUnit'] });
// 빈칸 묻기: 물어볼 현장을 같이 맡김
assert.ok(call({ action: 'add', id: 'k8', client: '가', text: '빈칸', ask: { id: 's1', client: '가', name: '하늘', date: '2026-11-12', missing: ['pwUnit'], checks: [{ id: 'door', text: '문', ok: false }] } }).ok);
assert.deepStrictEqual(call({ action: 'take' }).jobs.find((j) => j.id === 'k8').ask.missing, ['pwUnit']);
// 💬 카톡방: 앱 ↔ 노트북
assert.deepStrictEqual(call({ action: 'rooms', side: 'app', rooms: { 봄애: ['봄애실장님'] } }).rooms, {});
assert.deepStrictEqual(call({ action: 'rooms', side: 'laptop', rooms: { 가나: '가나실장님', 빈: [] } }).rooms, { 봄애: ['봄애실장님'] });
assert.deepStrictEqual(call({ action: 'rooms', side: 'app', rooms: {} }).rooms, { 가나: ['가나실장님'] });
call({ action: 'rooms', side: 'app', rooms: {}, off: { 가나: ['가나실장님'] } });
assert.deepStrictEqual(call({ action: 'rooms', side: 'laptop', rooms: { 가나: ['가나실장님'] } }).off, { 가나: ['가나실장님'] });
// ttl 600 (9시 출입정보 질문) 은 3시간 지나도 버리지 않음
call({ action: 'add', id: 'ask1', client: '블라블라', text: '질문', ttl: 600, ask: { id: 'a1', missing: ['toilet'], checks: [] } });
sd.q.find((x) => x.id === 'ask1').at -= 3 * 3600e3;
const tk = call({ action: 'take' }).jobs;
assert.deepStrictEqual([tk.length, tk[0].ask.id], [1, 'a1']);
console.log('kakao_send ok');
