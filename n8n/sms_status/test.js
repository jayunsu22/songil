// node n8n/sms_status/test.js
const path = require('path');
const assert = require('assert');
const wf = JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build.js')]).toString());
const code = (n) => wf.nodes.find((x) => x.name === n).parameters.jsCode;
const run = (n, ctx, input) => new Function('$', '$input', code(n))((k) => ({ all: () => ctx[k].map((j) => ({ json: j })) }), { first: () => ({ json: input[0] }), all: () => input.map((j) => ({ json: j })) });
const ids = run('아이디', {}, [{ body: { ids: ['abc', 'x y!', ''] } }]).map((x) => x.json.id);
assert.deepStrictEqual(ids, ['abc', 'xy']);
const r = run('정리', { 아이디: [{ id: 'abc' }, { id: 'xy' }] }, [
  { id: 'abc', state: 'Sent', recipients: [{ phoneNumber: '+8210', state: 'Delivered' }] },
  { error: { message: 'not found' } },
])[0].json;
assert.deepStrictEqual(r.items.map((x) => x.state), ['Delivered', 'Unknown']);
console.log('sms_status ok');
