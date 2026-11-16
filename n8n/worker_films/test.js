// node n8n/worker_films/test.js — 기사앱_필름번호 (11/16). 현장·번호·비번은 지어낸 것
const path = require('path');
const assert = require('assert');
const wf = JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build.js')]).toString());
const code = wf.nodes.find((n) => n.name === '정리').parameters.jsCode;
const ID = 'recAAAAAAAAAAAAAA';
const run = (q, sites, quotes) => new Function('$', code)((n) => {
  if (n === '필름요청') return { first: () => ({ json: { query: q } }) };
  if (n === '현장읽기') return { all: () => [{ json: { records: sites.map((d) => ({ fields: { data: JSON.stringify(d) } })) } }] };
  if (n === '견적읽기') return { all: () => [{ json: { records: quotes.map((f) => ({ fields: f })) } }] };
  throw new Error(n);
})[0].json;
assert.deepStrictEqual(run({ code: 'bad' }, [], []), { ok: false, films: [], quote: [] });
const site = { adminId: ID, pwUnit: '0000*', films: [{ place: '방3 문틀', code: 'ps170', qty: '2롤' }, { place: '', code: '' }] };
const other = { adminId: 'recBBBBBBBBBBBBBB', films: [{ place: '거실', code: 'zz999' }] };
const quotes = [
  { 현장: [ID], 발행일시: '2026-11-10T00:00:00Z', 스냅샷: JSON.stringify({ 품목: [{ 품목명: '방3문+틀', 자재명: '영림ps' }] }) },
  { 현장: [ID], 발행일시: '2026-11-15T00:00:00Z', 스냅샷: JSON.stringify({ 시공품목: [{ 품목명: '방3문+틀', 자재명: 'ps170' }, { 품목명: '현관문' }] }) },
  { 현장: ['recBBBBBBBBBBBBBB'], 발행일시: '2026-11-16T00:00:00Z', 스냅샷: JSON.stringify({ 시공품목: [{ 품목명: '방3문+틀', 자재명: 'zz999' }] }) },
];
const o = run({ code: ID }, [site, other], quotes);
assert.deepStrictEqual(o.films, [{ place: '방3 문틀', code: 'ps170' }], '그 현장 필름만, 위치·번호만 (비번·필요량 안 나감)');
assert.deepStrictEqual(o.quote, [{ 품목명: '방3문+틀', 자재명: 'ps170' }], '그 현장의 가장 최근 견적서');
assert.ok(!JSON.stringify(o).includes('0000'));
const f = wf.nodes.find((n) => n.name === '현장읽기').parameters.queryParameters.parameters[0].value;
assert.strictEqual(new Function('$json', 'return ' + f.slice(3, -2))({ query: { code: ID + "')x" } }), 'FIND(\'"adminId":"' + ID + 'x"\', {data})');
assert.ok(!wf.nodes.find((n) => n.name === '필름요청').credentials, '기사 앱용이라 열쇠 없음');
console.log('worker_films ok');
