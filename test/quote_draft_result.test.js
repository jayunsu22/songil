// n8n 견적초안_읽기 › 결과정리 (n8n/quote_draft_read/result.js) - 샤시 수량을 원문으로 다시 읽는 부분 (2026-11-02)
// 김성현님 문의 '32평형대 기준 … 전체샷시필름 견적' 에 AI 는 30평 패키지의 샤시(단창) 10세트(30m) 를 읽었는데,
// 다시 읽기가 숫자 없는 줄을 1세트로 덮어써서 가견적이 샤시 1틀로 나왔다.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const 코드 = fs.readFileSync(path.join(__dirname, '../n8n/quote_draft_read/result.js'), 'utf8');

// n8n 코드 노드처럼 $('노드이름')·$input 을 흉내 낸다
function 실행(글, AI답) {
  const $ = (n) => ({ first: () => ({ json: n === '프롬프트' ? { user_request: 글 } : {} }), all: () => [] });
  const $input = { first: () => ({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(AI답) }] } }] } }) };
  return new Function('$', '$input', 코드)($, $input)[0].json.items;
}
const 샤시 = (수량, 표시수량, 근거) => ({ items: [{ 품목명: '샤시(단창)', 수량, 표시수량, 구역: '', 근거 }] });

test('수량이 안 적힌 샤시는 AI 가 읽은 수량(평형 패키지 10세트)을 그대로 둔다', () => {
  const 글 = '사장님~ \n혹시 32평형대 기준 평균적으로 \n전체샷시필름 견적이 어느정도 나올까요?';
  const r = 실행(글, 샤시(30, '10세트', '전체샷시필름 견적이 어느정도 나올까요?'));
  assert.deepStrictEqual([r[0].품목명, r[0].수량, r[0].표시수량], ['샤시(단창)', 30, '10세트']);
});

test("'30평 아파트 샤시' 의 30 을 수량(30세트)으로 읽지 않는다", () => {
  const r = 실행('30평 아파트 샤시 전체 견적', 샤시(30, '10세트', '30평 아파트 샤시 전체'));
  assert.deepStrictEqual([r[0].수량, r[0].표시수량], [30, '10세트']);
});

test('수량·길이를 적은 샤시는 예전처럼 원문으로 다시 계산한다', () => {
  assert.deepStrictEqual(실행('샤시 3', 샤시(3, '1세트', '샤시 3')).map((x) => [x.품목명, x.수량, x.표시수량]), [['샤시(단창)', 9, '3세트']]);
  assert.deepStrictEqual(실행('샤시2중창3개', 샤시(3, '1세트', '샤시2중창3개')).map((x) => [x.품목명, x.수량, x.표시수량]), [['샤시(2중창)', 9, '3세트']]);
  assert.deepStrictEqual(실행('샤시 4m 2세트', 샤시(4, '4m', '샤시 4m 2세트')).map((x) => [x.수량, x.표시수량]), [[8, '4m 2세트']]);
  assert.deepStrictEqual(실행('104동 샤시 2틀', 샤시(6, '2세트', '샤시 2틀')).map((x) => [x.수량, x.표시수량]), [[6, '2세트']]);
});

test('종류는 원문으로 맞춘다 - 수량이 없어도 2중창이면 2중창', () => {
  const r = 실행('전체 이중창 샤시 견적요', 샤시(30, '10세트', '전체 이중창 샤시'));
  assert.deepStrictEqual([r[0].품목명, r[0].수량], ['샤시(2중창)', 30]);
});
