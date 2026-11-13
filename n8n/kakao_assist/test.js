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

// 사장님 지시 (김정헌방 메모): 글에 나온 거래처 현장만, 답장 없음, 이미 적힌 비번도 새 값이면 update, 못 맞추면 missed
const bossBody = { mode: 'boss', room: '김정헌', client: '', today: '2026-11-04',
  messages: [{ d: '11/4', t: '07:19', who: '김정헌', text: '나디자인 다른업체현장\n세대비번 2222변경됐다' }] };
const bp = run('프롬프트', Object.assign({ 비서요청: { body: bossBody } }, air));
assert.deepStrictEqual(bp.sites.map((s) => s.id), ['s5'], '글에 나온 거래처(나디자인) 현장만');
assert.ok(bp.boss && bp.prompt.includes('사장님 메모') && bp.prompt.includes('나디자인'));
const bres = (o) => run('결과정리', { 프롬프트: Object.assign({}, p, { boss: true }), $input: gem(o) });
r = bres({ items: [{ kind: 'field', field: 'pwUnit', value: '2222', siteId: 's2', sure: true },
  { kind: 'field', field: 'pwLobby', value: '#77', siteId: '', sure: false, cands: [] }], reply: { type: 'ack', text: '네' } });
assert.deepStrictEqual(r.fills.map((f) => [f.siteId, f.field, f.value]), [['s2', 'pwUnit', '2222']]);
assert.strictEqual(r.reply, null);
assert.strictEqual(r.picks.length, 0, '사장님 지시는 아무 현장이나 후보로 안 냄');
assert.strictEqual(r.missed[0].value, '#77');
// 작업자 배정: names 정리('님' 빼기), mode, date
r = bres({ items: [{ kind: 'staff', names: ['김정헌님'], mode: 'set', date: '', siteId: 's2', sure: true }] });
assert.deepStrictEqual([r.fills[0].kind, r.fills[0].names, r.fills[0].mode, r.fills[0].label], ['staff', ['김정헌'], 'set', '작업자']);
assert.strictEqual(res({ items: [{ kind: 'staff', names: ['a'], siteId: 's2', sure: true }] }).fills.length, 0, '업체 방 글로는 작업자 안 바꿈');
// 거래처 이름이 글에 없으면 모든 업체 현장
const bp2 = run('프롬프트', Object.assign({ 비서요청: { body: Object.assign({}, bossBody, { messages: [{ text: '은하수 세대비번 1234' }] }) } }, air));
assert.strictEqual(bp2.sites.length, 5);
// 🙋 사장님 11/12: 사진만 온 방에 '사진 잘 봤어요~' 자동 → 뜻이 확실하지 않으면 보내지 않고 사장님께
const resSaid = (said, o) => run('결과정리', { 프롬프트: Object.assign({}, p, { said }), $input: gem(o) });
r = resSaid('사진', { items: [], reply: { type: 'ack', text: '사진 잘 봤어요~' } });
assert.deepStrictEqual([r.reply.type, r.reply.auto, r.reply.text], ['unsure', false, '']);
assert.ok(r.reply.why.includes('사진만'));
r = resSaid('그건 좀 그렇네요', { items: [], reply: { type: 'unsure', text: '' } });
assert.deepStrictEqual([r.reply.type, r.reply.auto], ['unsure', false]);
// 받은 값 없이 '받았어요' 만은 자동으로 안 보냄
r = resSaid('확인했어요', { items: [], reply: { type: 'ack', text: '네~ 감사합니다😊' } });
assert.deepStrictEqual([r.reply.auto, r.reply.why], [false, '받은 값이 없어서 자동으로 안 보냄']);
// AS(하자)는 값이 있어도 늘 사장님이
r = resSaid('방문 필름이 들떴어요 공현 *1234#', { items: [{ kind: 'field', field: 'pwLobby', value: '*1234#', siteId: 's1', sure: true }], reply: { type: 'ack', text: '죄송합니다. 확인하겠습니다' } });
assert.deepStrictEqual([r.reply.auto, r.reply.why], [false, 'AS(하자) 얘기 — 사장님이 보고 보내세요']);
// 되묻기도 사장님이 보고
assert.strictEqual(resSaid('필름 보내드릴게요', { items: [], reply: { type: 'ask', text: '품번도 알 수 있을까요?' } }).reply.auto, false);
// 잡담(none)은 답장 없음 그대로
assert.strictEqual(resSaid('사진', { items: [], reply: { type: 'none', text: '' } }).reply, null);
assert.ok(p.prompt.includes('"unsure"') && p.prompt.includes('[AS 때] 말투로 정중하게 사과'));
// 🗣 사장님 말투 (11/12): 프롬프트 → 말투가져오기 → 말투붙이기 → Gemini, 최근 대화 앞에 말투 예시. 못 받아도 그대로
assert.deepStrictEqual(wf.connections['프롬프트'].main[0].map((x) => x.node), ['말투가져오기']);
assert.deepStrictEqual(wf.connections['말투붙이기'].main[0].map((x) => x.node), ['Gemini']);
const attach = (tone) => new Function('$', wf.nodes.find((n) => n.name === '말투붙이기').parameters.jsCode)((n) => ({ first: () => { if (n === '말투가져오기' && tone === null) throw new Error('x'); return { json: n === '프롬프트' ? p : tone }; } }))[0].json;
let ap = attach({ normal: [{ prev: '몇시에 오세요?', text: '넵! 8시까지 갈게요~' }], as: [{ prev: '들떴어요', text: '죄송합니다,, 금요일에 갈께요' }] });
assert.ok(ap.prompt.includes('[평소]') && ap.prompt.includes('[AS 때]') && ap.prompt.indexOf('[사장님 말투]') < ap.prompt.indexOf('[그 방 최근 대화'));
assert.strictEqual(attach(null).prompt, p.prompt);
assert.strictEqual(attach({}).prompt, p.prompt);
assert.ok(wf.nodes.find((n) => n.name === '말투가져오기').continueOnFail);
console.log('kakao_assist ok');
