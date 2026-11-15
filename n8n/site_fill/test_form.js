// node n8n/site_fill/test_form.js [share.js 경로] — 📋 업체 확인 질문폼 (11/13). 현장·이름·비번은 지어낸 것
// share.js 는 앱 저장소(옆 폴더)의 것을 쓴다 — 기본 ../../../n8n_거래처별_현장관리/share.js
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const sharePath = process.argv[2] || path.join(__dirname, '..', '..', '..', 'n8n_거래처별_현장관리', 'share.js');
const shareSrc = fs.readFileSync(sharePath, 'utf8');
const wf = JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build.js')]).toString());
const code = wf.nodes.find((n) => n.name === '질문폼').parameters.jsCode;
const KEY = 'abcdef0123456789';
const site = { id: 's1', name: '한빛아파트 210동 804호', date: '2099-11-12', pwLobby: '', pwUnit: '1234', toilet: '', films: [], checks: {}, askKey: KEY,
  askOn: { pwLobby: true, toilet: true, films: true, door: true, overlap: true } };
const sd = {};
function run({ get, post, s = site, settings = { toiletOpts: ['안방 화장실', '거실 화장실'] } }) {
  const $ = (n) => {
    if (n === '질문폼열기') return { isExecuted: !!get, first: () => ({ json: { query: get || {} } }) };
    if (n === '질문폼보내기') return { isExecuted: !!post, first: () => ({ json: { body: post || {} } }) };
    if (n === '현장읽기폼') return { all: () => [{ json: { records: s ? [{ fields: { data: JSON.stringify(s) } }, { fields: { data: JSON.stringify({ id: 'x', askKey: 'zzzzzzzzzzzzzzzz' }) } }] : [] } }] };
    if (n === '설정읽기폼') return { all: () => [{ json: { records: [{ fields: { data: JSON.stringify(settings) } }] } }] };
    if (n === '앱코드받기폼') return { first: () => ({ json: { data: shareSrc } }) };
    throw new Error('no ' + n);
  };
  return new Function('$', '$getWorkflowStaticData', code)($, () => sd)[0].json;
}
// 주소가 이상하면
assert.strictEqual(run({ get: { k: 'BAD' } }).ok, false);
assert.strictEqual(run({ get: { k: 'nnnnnnnnnnnnnnnn' }, s: null }).ok, false);
// 지난 현장은 닫힘
assert.strictEqual(run({ get: { k: KEY }, s: Object.assign({}, site, { date: '2020-01-01' }) }).closed, true);
// 열기: 사장님이 [묻기] 한 것만, 이미 있는 칸(세대 비번)은 빼고
let o = run({ get: { k: KEY } });
assert.ok(o.ok);
assert.strictEqual(o.site.title.startsWith('한빛아파트'), true);
assert.deepStrictEqual(o.items.map((q) => [q.id, q.type]), [['pwLobby', 'pw'], ['toilet', 'choice'], ['films', 'text'], ['door', 'choice'], ['overlap', 'choice']]);
assert.deepStrictEqual(o.items[1].opts, ['안방 화장실', '거실 화장실']);
assert.ok(!JSON.stringify(o).includes('1234'), '이미 받은 비번은 업체 화면에 안 나감');
// 보내기: 우편함에 그대로 (AI 해석 없이)
o = run({ post: { k: KEY, answers: { pwLobby: '#1234*', toilet: '안방 화장실', films: '거실 ps170\n안방 px450-4', door: '안 닿음', pwUnit: '9999', hack: 'x' } } });
assert.ok(o.ok && o.notify);
const f = sd.fills;
assert.deepStrictEqual(f.map((x) => [x.kind, x.field || x.checkId || '']), [['field', 'pwLobby'], ['field', 'toilet'], ['films', ''], ['check', 'door']], '묻지 않은 칸(세대 비번·이상한 id)은 안 받음');
assert.deepStrictEqual(f[2].films, [{ place: '거실', code: 'ps170' }, { place: '안방', code: 'px450-4' }]);
assert.ok(f.every((x) => x.siteId === 's1' && x.room === '질문폼'));
assert.ok(!o.notify.text.includes('#1234*'), '알림에 비번은 안 씀');
assert.ok(o.notify.text.includes('공동현관 비번: 받음') && o.notify.text.includes('화장실: 안방 화장실'));
// 다시 열면 보낸 것은 '이미 보냄'
o = run({ get: { k: KEY } });
assert.deepStrictEqual(o.items.filter((q) => q.sent).map((q) => q.id), ['pwLobby', 'toilet', 'films', 'door']);
// 비번 없음·당일 알려드림
sd.fills = [];
run({ post: { k: KEY, answers: { pwLobby: '비번 없음(열려 있음)' } } });
assert.strictEqual(sd.fills[0].value, '없음(열려 있음)');
sd.fills = [];
o = run({ post: { k: KEY, answers: { pwLobby: '당일 알려드림' } } });
assert.strictEqual(sd.fills.length, 0, '당일 알려준다 — 칸은 비워 둠');
assert.ok(o.notify.text.includes('당일 알려드림'));
// 칸마다 드롭다운 (11/13 둘째 판): 입구차단기·차량등록도 고른 그대로 그 칸에
const site2 = Object.assign({}, site, { barrier: '', carReg: { v: '미확인' }, askOn: { barrier: true, carReg: true } });
o = run({ get: { k: KEY }, s: site2, settings: { fieldOpts: { barrier: ['경비호출', '비번 1234'] } } });
assert.deepStrictEqual(o.items.map((q) => [q.id, q.type, q.free]), [['barrier', 'choice', true], ['carReg', 'choice', false]]);
assert.deepStrictEqual(o.items[0].opts, ['경비호출', '비번 1234']);
assert.deepStrictEqual(o.items[1].opts, ['필요', '불필요']);
sd.fills = [];
run({ post: { k: KEY, answers: { barrier: '경비호출', carReg: '필요' } }, s: site2 });
assert.deepStrictEqual(sd.fills.map((x) => [x.kind, x.field, x.value]), [['field', 'barrier', '경비호출'], ['field', 'carReg', '필요']]);
// 흐름
const c = wf.connections;
assert.deepStrictEqual(c['질문폼열기'].main[0].map((x) => x.node), ['현장읽기폼']);
assert.deepStrictEqual(c['질문폼'].main[0].map((x) => x.node), ['질문폼응답', '질문폼알림인가']);
const formula = wf.nodes.find((n) => n.name === '현장읽기폼').parameters.queryParameters.parameters[0].value;
const ev = new Function('$json', 'return ' + formula.slice(3, -2))({ query: { k: KEY + "')x" } });
assert.strictEqual(ev, 'FIND(\'"askKey":"' + KEY + 'x"\', {data})', ev);
assert.ok(!wf.nodes.find((n) => n.name === '질문폼열기').credentials, '업체용이라 열쇠 없음');
console.log('form ok');
