// node n8n/kakao_assist/test.js — 코드 노드를 n8n 없이 돌려 본다 (현장·비번은 지어낸 것)
const path = require('path');
const assert = require('assert');
const wf = JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build.js')]).toString());
const codeOf = (name) => wf.nodes.find((n) => n.name === name).parameters.jsCode;
function run(name, inputs) {
  const $ = (n) => ({ first: () => ({ json: inputs[n] || {} }), all: () => [{ json: inputs[n] || {} }] });
  return new Function('$', '$input', codeOf(name))($, { first: () => ({ json: inputs.$input || {} }) })[0].json;
}
const rec = (list) => ({ records: list.map((d) => ({ fields: { data: JSON.stringify(d) } })) });
const sites = [
  { id: 's1', name: '하늘마을 3단지', clientId: 'c1', date: '2026-11-25', pwLobby: '', pwUnit: '', toilet: '' },
  { id: 's2', name: '푸른숲 102동', clientId: 'c1', date: '2026-11-05', pwLobby: '*1111#', films: [{ place: '거실', code: 'AA1' }] },
  { id: 's3', name: '은하수 7단지', clientId: 'c1', date: '2026-11-06' },
  { id: 's4', name: '끝난현장', clientId: 'c1', date: '2026-10-20' },
  { id: 's5', name: '다른업체현장', clientId: 'c2', date: '2026-11-07' },
];
const air = { 현장읽기: rec(sites), 거래처읽기: { records: [{ fields: { id: 'c1', 이름: '가인테리어' } }, { fields: { id: 'c2', 이름: '나디자인' } }] } };
const body = { room: '가인테리어 실장님', client: '가인테리어', today: '2026-11-04',
  recent: [{ d: '11/1', t: '10:00', who: '김정헌', text: '네~ 알겠어요😊' }],
  messages: [{ d: '11/4', t: '14:10', who: '가실장', text: '하늘마을 공현 *1234# 세대 5678 화장실 안방' }] };
const p = run('프롬프트', Object.assign({ 비서요청: { body } }, air));
assert.deepStrictEqual(p.sites.map((s) => s.id).sort(), ['s1', 's2', 's3', 's4'], '다른 업체 현장은 빠짐');
assert.ok(p.prompt.includes('[사장님] 김정헌: 네~ 알겠어요'));

const gem = (o) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] } }] });
const res = (o) => run('결과정리', { 프롬프트: p, $input: gem(o) });

// 확실한 현장 → fills, 같은 값은 버림, 받은 칸에 새 값은 update, 이미 정해진 날짜 말은 자동 답
let r = res({ items: [
  { kind: 'field', field: 'pwLobby', value: '*1234#', siteId: 's1', sure: true, quote: '공현 *1234#' },
  { kind: 'field', field: 'pwLobby', value: '*1111#', siteId: 's2', sure: true },
  { kind: 'field', field: 'pwUnit', value: '9999', siteId: 's2', sure: true },
  { kind: 'films', films: [{ place: '방', code: 'BB2' }], siteId: 's2', sure: true },
], reply: { type: 'ack', text: '네~ 비번 받았어요👍 25일에 뵐께요~' } });
assert.deepStrictEqual(r.fills.map((f) => [f.siteId, f.kind, f.field || '', f.update]),
  [['s1', 'field', 'pwLobby', false], ['s2', 'field', 'pwUnit', false], ['s2', 'films', '', true]]);
assert.strictEqual(r.reply.auto, true, r.reply.why);

// 애매한 현장 → picks (후보), 잔금 → pays, 시간·금액 말 → 초안
r = res({ items: [
  { kind: 'field', field: 'pwLobby', value: '#4321', siteId: '', sure: false, cands: ['s2', 's3', 'zz'] },
  { kind: 'pay', siteId: 's4', sure: true, quote: '잔금 넣었어요' },
  { kind: 'schedule', value: '도배가 11/24 끝남', siteId: 's1', sure: true },
], reply: { type: 'ack', text: '네~ 오전 중에 끝내드릴께요' } });
assert.deepStrictEqual(r.picks[0].cands.map((c) => c.id), ['s2', 's3']);
assert.deepStrictEqual(r.pays, [{ siteId: 's4', name: '끝난현장', quote: '잔금 넣었어요' }]);
assert.strictEqual(r.infos[0].site, '하늘마을 3단지');
assert.strictEqual(r.reply.auto, false);

// commit 은 늘 초안, none 은 답 없음, AI 답이 깨지면 빈 결과
assert.strictEqual(res({ items: [], reply: { type: 'commit', text: '그럼 그렇게 해요' } }).reply.auto, false);
assert.strictEqual(res({ items: [], reply: { type: 'none', text: '' } }).reply, null);
r = run('결과정리', { 프롬프트: p, $input: { candidates: [{ content: { parts: [{ text: '이상한 답' }] } }] } });
assert.deepStrictEqual([r.fills.length, r.reply], [0, null]);
console.log('kakao_assist ok');
