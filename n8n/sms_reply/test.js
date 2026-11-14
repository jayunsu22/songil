// node n8n/sms_reply/test.js — 코드 노드를 n8n 없이 (값은 지어낸 것)
const path = require('path');
const assert = require('assert');
const wf = JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build.js')]).toString());
const js = (name) => wf.nodes.find((n) => n.name === name).parameters.jsCode;
const sd = {};
const api = (body) => new Function('$input', '$getWorkflowStaticData', js('처리'))({ first: () => ({ json: { body } }) }, () => sd)[0].json;
// 정리는 AI 답을 비서판단에서, 앱의 지금 빈칸(site-gaps, 11/14)을 $input 에서 읽는다 — gaps 를 안 주면 빈칸 응답이 없던 것처럼 (예전 규칙)
const result = (p, ai, gaps) => new Function('$', '$input', '$getWorkflowStaticData', js('정리'))(
  (n) => (n === '비서판단' ? { isExecuted: true, first: () => ({ json: ai }) } : { first: () => ({ json: p }) }), { first: () => ({ json: gaps || {} }) }, () => sd)[0].json;

api({ action: 'watch', items: [{ phone: '010-1234-5678', name: '이다라', siteId: 's1', siteName: '하늘', client: '개인고객', fill: true, keys: ['pwLobby', 'pwUnit'] },
  { phone: '010-1111-2222', name: '마바', siteId: '-', fill: false }] });
// 모르는 번호는 버린다
assert.deepStrictEqual(api({ action: 'in', from: '+821099998888', msg: '가족 문자' }).go, false);
// 고객 답: AI 에게 그 현장만
let p = api({ action: 'in', from: '+821012345678', msg: '공현 #0000 입니다' });
assert.deepStrictEqual([p.go, p.ai, p.body.siteId], [true, true, 's1']);
let r = result(p, { fills: [{ siteId: 's1', kind: 'field', field: 'pwLobby', value: '#0000', update: false }, { siteId: 's1', kind: 'films', films: [{ code: 'a' }], update: true }] });
assert.deepStrictEqual(r.fills.map((f) => [f.siteId, f.field, f.value, f.room]), [['s1', 'pwLobby', '#0000', '이다라']]);
assert.deepStrictEqual(r.feed.lines.filter((l) => l !== '감사 문자 보냄'), ['공동현관 비번 넣음', '필름 번호 변경 요청 — 직접 바꿔 주세요']);
assert.deepStrictEqual(r.feed.left, ['세대 비번']);
assert.strictEqual(r.feed.text, '공현 #0000 입니다');
assert.ok(!r.notify.text.includes('#0000'), '텔레그램에는 값 없이');
// 받은 칸은 다음 답에서 안 물음
assert.deepStrictEqual(sd.watch['12345678'].keys, ['pwUnit']);
// 팀원 답: AI 없이 글만
p = api({ action: 'in', from: '01011112222', msg: '네 감사합니다' });
assert.strictEqual(p.ai, false);
r = result(p, p);
assert.deepStrictEqual([r.fills.length, r.feed.siteId, r.feed.text], [0, '', '네 감사합니다']);
// 결재함 번호 질문의 답 (11/6): kakao-digest 로, 업체 확인 답까지, 칸에 넣으면 감사 문자, 텔레그램엔 값 없이
const RealNow = Date.now;
Date.now = () => Date.parse('2026-11-06T01:30:00Z');   // 한국 10시 30분
api({ action: 'watch', items: [{ phone: '010-3333-4444', name: '실장님', siteId: 's2', siteName: '보현', client: '블라', fill: true, keys: ['pwLobby', 'pwUnit', 'toilet'],
  ask: { q: '1. 공동현관 비번', date: '2026-11-13', checks: [{ id: 'door', text: '문틀 (확답)', ok: true }, { id: 'overlap', text: '겹치는 공정', ok: false }] } }] });
p = api({ action: 'in', from: '+821033334444', msg: '1. 없음 2. 0000' });
assert.deepStrictEqual([p.go, p.ai, p.digest, p.body.sites[0].checks.length, p.body.asked], [true, true, true, 2, '1. 공동현관 비번']);
r = result(p, { items: [{ kind: 'field', field: 'pwUnit', value: '0000' }, { kind: 'check', checkId: 'door', value: '문 제거' }, { kind: 'check', checkId: '모름', value: 'x' }, { siteId: '다른현장', kind: 'field', field: 'toilet', value: 'x' }] });
assert.deepStrictEqual(r.fills.map((f) => [f.kind, f.field || f.checkId, f.value]), [['field', 'pwUnit', '0000'], ['check', 'door', '문 제거']]);
assert.deepStrictEqual(r.sms.map((x) => x.phone), ['+821033334444']);
assert.ok(r.notify.text.includes('감사 문자 보냄') && !r.notify.text.includes('0000'));
assert.deepStrictEqual(r.feed.left, ['공동현관 비번', '화장실 위치', '겹치는 공정']);
// 또 답해도 감사 문자는 6시간에 한 번, 값이 없으면 안 보냄
p = api({ action: 'in', from: '01033334444', msg: '1. 없음' });
r = result(p, { items: [{ kind: 'field', field: 'pwLobby', value: '없음' }] });
assert.deepStrictEqual(r.sms, []);
p = api({ action: 'in', from: '01011112222', msg: '네' });
assert.deepStrictEqual(result(p, p).sms, []);
// 글을 못 읽은 장문 문자는 알려만 준다
p = api({ action: 'in', from: '01033334444', unread: true });
assert.deepStrictEqual([p.go, p.ai], [true, false]);
r = result(p, p);
assert.ok(r.notify.text.includes('글을 못 읽은 장문 문자'));
Date.now = RealNow;
// 📱 번호부 (11/11 A안): 비서가 보낸 적 없는 업체 번호의 문자도 읽는다 — 그 업체 가까운 현장 중에서
assert.strictEqual(api({ action: 'book', items: [{ phone: '010-5555-6666', name: '지인인테리어 김사장', client: '지인인테리어',
  sites: [{ id: 's7', name: '덕유주공', date: '2026-11-12', known: { pwUnit: '1111#' } }, { id: 's8', name: '푸르지오', date: '2026-11-20', known: {} }] }, { phone: '12', sites: [{ id: 'x' }] }] }).resp.n, 1);
p = api({ action: 'in', from: '+821055556666', msg: '덕유주공 세대 2580# 로 바뀌었고 푸르지오 공현 *1234 입니다. 주차는 지하2층' });
assert.deepStrictEqual([p.go, p.ai, p.digest, p.book, p.body.sites.length, p.body.room.client], [true, true, true, true, 2, '지인인테리어']);
r = result(p, { items: [{ siteId: 's7', kind: 'field', field: 'pwUnit', value: '2580#' }, { siteId: 's8', kind: 'field', field: 'pwLobby', value: '*1234' },
  { siteId: '', kind: 'field', field: 'toilet', value: '1층' }, { siteId: 's8', kind: 'field', field: 'parking', value: '지하2층' }] });
assert.deepStrictEqual(r.fills.map((f) => [f.siteId, f.field, f.value, f.update, f.room]), [['s7', 'pwUnit', '2580#', true, '지인인테리어 김사장 문자'], ['s8', 'pwLobby', '*1234', false, '지인인테리어 김사장 문자']]);
assert.ok(r.feed.lines.some((l) => l.includes('어느 현장인지 몰라')) && r.feed.lines.some((l) => l.includes('주차')));
assert.deepStrictEqual([r.sms.length, r.feed.siteId, r.feed.siteName], [0, 's7', '덕유주공, 푸르지오']);
assert.ok(!r.notify.text.includes('2580') && !r.notify.text.includes('*1234'), '텔레그램에는 비번 값 없이');
p = api({ action: 'in', from: '01055556666', unread: true });
assert.deepStrictEqual([p.go, p.ai], [true, false]);
assert.ok(result(p, p).notify.text.includes('글을 못 읽은 장문 문자'));
// 모르는 번호는 여전히 버린다
assert.strictEqual(api({ action: 'in', from: '01077778888', msg: '[광고] 1234' }).go, false);
// 📋 앱의 지금 빈칸 (11/14): '없습니다' 로 받은 칸·이미 시작한 현장은 '아직 못 받음' 에 안 적는다
api({ action: 'watch', items: [{ phone: '010-3333-4444', name: '실장님', siteId: 'g1', siteName: '보현', client: '블라블라', fill: true, keys: ['pwLobby', 'toilet'] }] });
p = api({ action: 'in', from: '+821033334444', msg: '거실에 필름 있습니다' });
assert.deepStrictEqual(result(p, {}, { today: '2026-11-14', sites: [{ id: 'g1', date: '2026-11-20', missing: ['toilet'], checks: [] }] }).feed.left, ['화장실 위치']);
p = api({ action: 'in', from: '+821033334444', msg: '다음에 뵙겠습니다' });
assert.deepStrictEqual(result(p, {}, { today: '2026-11-14', sites: [] }).feed.left, [], '시작했거나 다 받은 현장');
console.log('sms_reply ok');
