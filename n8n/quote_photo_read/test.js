// node n8n/quote_photo_read/test.js — 코드 노드를 n8n 없이 (값은 지어낸 것)
const path = require('path');
const assert = require('assert');
const wf = JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build.js')]).toString());
const js = (name) => wf.nodes.find((n) => n.name === name).parameters.jsCode;
const D = 'A'.repeat(200);
const pre = new Function('$input', js('프롬프트'))({ first: () => ({ json: { body: { items: [{ id: 'd1', 구역: '현관', 이름: '현관문' }, { id: 'd2', 구역: '현관', 이름: '중문' }],
  photos: [{ mime: 'image/jpeg', data: D }, { data: D }, { data: 'x' }], start: 6 } } }) })[0].json;
assert.deepStrictEqual([pre.start, pre.count, pre.ids], [6, 2, ['d1', 'd2']]);
const parts = pre.gemini.contents[0].parts;
assert.ok(parts[0].text.includes('d1 : 현관 현관문') && parts[1].text === '사진6:' && parts[3].text === '사진7:' && parts[4].inline_data.mime_type === 'image/jpeg');
const res = (ans) => new Function('$', '$input', js('결과정리'))(() => ({ first: () => ({ json: pre }) }), { first: () => ({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(ans) }] } }] } }) })[0].json;
let r = res({ photos: [{ n: 7, id: '지어냄', qty: 0, film: 'ps170', text: '중문  ps170' }, { n: 6, id: 'd1', qty: 1, film: 'px451 화이트스톤', memo: '도어락 교체 예정', text: '현관 방화문 px451' }] });
assert.deepStrictEqual(r.photos.map((p) => [p.n, p.id, p.qty, p.film, p.memo]), [[6, 'd1', 1, 'px451 화이트스톤', '도어락 교체 예정'], [7, null, 1, 'ps170', '']]);
assert.strictEqual(r.photos[1].text, '중문 ps170');
r = res('엉뚱');
assert.deepStrictEqual([r.ok, r.photos.length, r.photos[0].id], [false, 2, null]);
console.log('quote_photo_read ok');
