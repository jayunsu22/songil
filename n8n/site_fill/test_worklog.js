// node n8n/site_fill/test_worklog.js — 우편함넣기·내역 코드 노드를 n8n 없이 (값은 지어낸 것)
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const sd = {};
const run = (file, body) => new Function('$input', '$getWorkflowStaticData', read(file))({ first: () => ({ json: { body } }) }, () => sd)[0].json;

// 우편함: 칸은 앱으로, 내역에는 값 없이
run('put.js', { fills: [
  { siteId: 's1', kind: 'field', field: 'pwLobby', value: '#0000', room: '가실장', at: '2026-11-04' },
  { siteId: 's1', kind: 'done', what: 'pay', room: '결재함', at: '2026-11-04' },
  { siteId: 's2', kind: 'filmOrdered', value: 'ps1 1롤', room: '라마상사', at: '2026-11-04' },
  { siteId: 's2', kind: 'crewAdd', date: '2026-11-05', name: '마바', room: '인원 모집', at: '2026-11-04' },
  { siteId: 's3', kind: 'log', title: '인원 모집 못 함', detail: '자리 없음', room: '결재함', state: 'need' },
] });
assert.deepStrictEqual(sd.fills.map((f) => f.kind), ['field', 'done', 'filmOrdered', 'crewAdd'], 'log 는 앱 우편함에 안 들어감');
assert.strictEqual(sd.fills[1].what, 'pay', '완료표시 우편이 앱까지 간다 (전에 버려지던 것)');
assert.ok(!JSON.stringify(sd.worklog).includes('#0000'), '비번 값은 내역에 없음');
assert.deepStrictEqual(sd.worklog.map((x) => [x.src, x.title, x.state]), [
  ['auto', '공동현관 비번 넣음', ''], ['결재함', '잔금 받음', ''], ['필름 주문', '필름 주문 문자', ''], ['인원모집', '마바 인원 넣음', ''], ['결재함', '인원 모집 못 함', 'need'],
]);
// done 모르는 종류·task 는 그대로
run('put.js', { fills: [{ siteId: 's1', kind: 'done', what: '???' }, { siteId: '-', kind: 'done', what: 'task', taskId: 't1', room: '결재함' }] });
assert.strictEqual(sd.fills[sd.fills.length - 1].taskId, 't1');
assert.strictEqual(sd.fills.length, 5);

// 내역
sd.worklog = [];
assert.strictEqual(run('worklog.js', { action: 'add', items: [
  { id: 'a', t: Date.now() - 1000, src: 'me', kind: 'sms', title: '문자', state: 'need', key: 'k1' },
  { id: 'a', title: '또' }, { title: '' }, { src: 'auto', kind: 'reply', title: '답장' }] }).n, 2);
let l = run('worklog.js', {}).items;
assert.deepStrictEqual(l.map((x) => x.title), ['답장', '문자'], '최신이 위');
assert.strictEqual(l[1].state, 'need');
run('worklog.js', { action: 'resolve', key: 'k1' });
assert.strictEqual(run('worklog.js', {}).items[1].state, '');
// 90일 지나면 사라짐
sd.worklog.push({ id: 'old', t: Date.now() - 91 * 864e5, title: '옛날' });
assert.ok(!run('worklog.js', {}).items.some((x) => x.id === 'old'));
console.log('worklog ok');
