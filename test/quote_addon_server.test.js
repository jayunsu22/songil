// n8n '현장견적_추가견적' 코드 노드(n8n/quote_addon_server.js)가 quote_addon.js 와 같은 금액을 내는지
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const M = require('../quote_addon.js');
const 코드 = fs.readFileSync(path.join(__dirname, '../n8n/quote_addon_server.js'), 'utf8');
// n8n 코드 노드처럼 $('노드이름') 을 흉내 낸다
const 실행 = (data) => new Function('$', 코드)((n) => ({
  all: () => (data[n] || []).map((j) => ({ json: j })), first: () => ({ json: (data[n] || [])[0] }) }));
const 계산부 = new Function(코드.slice(0, 코드.indexOf('const F = ')) + '; return A;')();

test('서버 계산 함수 = quote_addon.js', () => {
  assert.deepStrictEqual([...계산부.허용표].sort(), [...M.허용표].sort());
  assert.deepStrictEqual([...계산부.한쪽표].sort(), [...M.한쪽표].sort());
  const rows = [{ 시공_품목명: 'x', 인건비단가: 56000, 자재비단가: 9000, 자재소모량: 1.7, 견적단위: 'm' },
                { 시공_품목명: 'y', 인건비단가: 25000, 자재소모량: 3, 견적단위: '세트' }];
  for (const r of rows) for (const 길이 of [0.2, 1, 2.55, 30, 31, 'a']) for (const 한쪽 of [true, false])
    for (const 율 of [0, -0.1, 0.15]) for (const 자 of [null, 12000]) {
      assert.deepStrictEqual(계산부.줄만들기(r, { 길이, 한쪽, 이름: 'n' }, 율, 자, 'i', 't'), M.줄만들기(r, { 길이, 한쪽, 이름: 'n' }, 율, 자, 'i', 't'));
    }
  for (const [a, b] of [[[{ 표시금액: 3871500 }], 3870000], [[{ 표시금액: 100 }], 100]]) {
    assert.strictEqual(계산부.절삭했나(a, b), M.절삭했나(a, b));
    for (const c of [true, false]) assert.strictEqual(계산부.새총액(a, [{ 표시금액: 5555 }], c), M.새총액(a, [{ 표시금액: 5555 }], c));
  }
});

const 표 = [{ id: 'r1', fields: { 시공_품목명: '샤시(2중창)', 인건비단가: 56000, 자재비단가: 9000, 자재소모량: 1.7, 견적단위: 'm' } }];
const 견적 = (extra) => ({ id: 'recQ', fields: Object.assign({ 견적코드: 'ABC', 현장명: '테스트', 총액: 3870000, 소계: 3871500, 조정_합계율: 0,
  견적_스냅샷: JSON.stringify([{ 표시금액: 3871500, 자재비단가: 9000 }]) }, extra) });

test('추가: 서버가 금액을 다시 계산하고 총액을 절삭한다, 이름의 HTML 은 지운다', () => {
  const r = 실행({ 'pro-addon': [{ body: { 추가: { 표이름: '샤시(2중창)', 길이: 3, 이름: '샤시<b>', 표시금액: 1 } } }],
    견적_조회: [견적()], '시공품목정보 조회': 표, 가맹점_조회: [{ fields: { 텔레그램_챗ID: '1' } }] })[0].json;
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.총액, 4200000);
  assert.strictEqual(r.소계, 3871500 + 331500);
  assert.strictEqual(r.should_telegram, true);
  const meta = JSON.parse(r.고객_추가품목);
  assert.strictEqual(meta.절삭, true);
  assert.strictEqual(meta.줄들[0].표시금액, 331500);
  assert.strictEqual(meta.줄들[0].품목명, '샤시b');
});

test('가구에 한쪽을 보내도 서버는 절반으로 치지 않는다', () => {
  const 가구표 = [{ fields: { 시공_품목명: '붙박이장', 인건비단가: 16000, 자재비단가: 9000, 자재소모량: 2.5, 견적단위: 'm' } }];
  const r = 실행({ 'pro-addon': [{ body: { 추가: { 표이름: '붙박이장', 길이: 2, 한쪽: true, 이름: '붙박이장' } } }],
    견적_조회: [견적()], '시공품목정보 조회': 가구표, 가맹점_조회: [{}] })[0].json;
  assert.strictEqual(JSON.parse(r.고객_추가품목).줄들[0].표시금액, 125000);
});

test('삭제: 원래 총액으로 돌아간다', () => {
  const meta = { 절삭: true, 원래총액: 3870000, 원래소계: 3871500, 줄들: [{ 체크_ID: 'add1', 품목명: 'x', 단위: 'm', 수량: 3, 표시금액: 331500, 라인금액: 331500 }] };
  const r = 실행({ 'pro-addon': [{ body: { 삭제: 'add1' } }], 견적_조회: [견적({ 고객_추가품목: JSON.stringify(meta), 총액: 4200000 })], 가맹점_조회: [{}] })[0].json;
  assert.strictEqual(r.총액, 3870000);
  assert.strictEqual(r.소계, 3871500);
});

test('거절: 목록에 없는 품목, 없는 견적, 이상한 길이', () => {
  const 기본 = { 견적_조회: [견적()], '시공품목정보 조회': 표 };
  assert.strictEqual(실행(Object.assign({ 'pro-addon': [{ body: { 추가: { 표이름: '문틀' } } }] }, 기본))[0].json.error, 'bad_item');
  assert.strictEqual(실행({ 'pro-addon': [{ body: { 추가: { 표이름: '방문' } } }], 견적_조회: [] })[0].json.error, 'not_found');
  assert.strictEqual(실행(Object.assign({ 'pro-addon': [{ body: { 추가: { 표이름: '샤시(2중창)', 길이: 99 } } }] }, 기본))[0].json.error, 'bad_length');
});
