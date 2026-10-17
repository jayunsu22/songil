const test = require('node:test');
const assert = require('node:assert');
const P = require('../request_parse.js');
const W = require('../request_wordbook.js');
const MASTER = require('./fixtures/master_sample.json');

// quote_pro 의 보이는가() 와 같은 거르기 - 30평 현장
const zones = MASTER.zones.map((z) => ({
  구역: z.구역,
  items: z.items.filter((i) => i.적용평형 === '공통' || i.적용평형 === '30평'),
}));
const 사전 = (사용자) => ({ zones: zones, 단어장: W.합치기(W.기본(), 사용자) });
const 해석 = (글, 사용자) => P.해석(글, 사전(사용자));
const 옵션번호 = (구역, 이름, 종류) => {
  const it = zones.find((z) => z.구역 === 구역).items.find((i) => i.표시_품목명 === 이름);
  return it.옵션들.findIndex((o) => o.품목명.indexOf(종류) >= 0);
};

test('마스터에 없는 말은 빨간 줄 - 구역은 살리고 모르는 말을 남긴다', () => {
  const r = 해석('안방 분합창 1');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].구역, '방1');
  assert.strictEqual(r[0].체크_ID, null);
  assert.strictEqual(r[0].확인필요, true);
  assert.strictEqual(r[0].모르는말, '분합창');
  assert.strictEqual(r[0].개수, 1);
});

test('샤시 2 → 샤시1·샤시2 두 칸, 보통 길이 3m, 2중창', () => {
  const r = 해석('거실 샤시 2 이중창');
  assert.deepStrictEqual(r.map((x) => x.체크_ID), ['z03_거실_샤시1_공통', 'z03_거실_샤시2_공통']);
  r.forEach((x) => {
    assert.strictEqual(x.수량, 3);
    assert.strictEqual(x.기본길이, true);
    assert.strictEqual(x.옵션, 옵션번호('거실', '샤시1', '2중창'));
    assert.strictEqual(x.확인필요, false);
  });
});

test('샤시 종류를 안 쓰면 2중창이 기본', () => {
  const r = 해석('방2 샤시 1');
  assert.strictEqual(r[0].체크_ID, 'z10_방2_샤시1_공통');
  assert.strictEqual(r[0].옵션, 옵션번호('방2', '샤시1', '2중창'));
});

test('단창이라고 쓰면 단창', () => {
  const r = 해석('거실 샤시 단창');
  assert.strictEqual(r[0].옵션, 옵션번호('거실', '샤시1', '단창'));
  assert.strictEqual(r[0].개수, 1);
});

test('구역 없이 온 품목이 한 구역에만 있으면 그 구역, 수사는 숫자로', () => {
  const r = 해석('냉장고장 하나요');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].체크_ID, 'z04_주방_냉장고장_공통');
  assert.strictEqual(r[0].구역, '주방');
  assert.strictEqual(r[0].수량, 2);          // 냉장고장 보통 길이 2m × 1개
  assert.strictEqual(r[0].기본길이, true);
});

test('이랑·도 로 이어진 두 품목은 두 줄, 구역은 앞 것을 이어받는다', () => {
  const r = 해석('현관 현관문이랑 신발장도요');
  assert.deepStrictEqual(r.map((x) => x.체크_ID), ['z02_현관_현관문_공통', 'z02_현관_신발장1_공통']);
  assert.strictEqual(r[0].수량, 1);
  assert.strictEqual(r[0].기본길이, false);  // 세트 단위는 개수가 곧 수량
  assert.strictEqual(r[1].수량, 5);
});

test('품목·구역이 하나도 없는 줄(인사말)은 건너뜀', () => {
  const r = 해석('실장님 풍림 2단지 견적 부탁드려요');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].건너뜀, true);
});

test('여러 구역에 있는 품목을 구역 없이 쓰면 확인필요', () => {
  const r = 해석('수납장 2');
  assert.strictEqual(r[0].구역, null);
  assert.strictEqual(r[0].체크_ID, null);
  assert.strictEqual(r[0].품목명, '수납장');
  assert.strictEqual(r[0].확인필요, true);
});

test('사용자가 배운 말로 마스터 품목을 찾는다', () => {
  const r = 해석('거실 분합창 1', { 분합창: '베란다 중문' });
  assert.strictEqual(r[0].체크_ID, 'z03_거실_베란다 중문_공통');
  assert.strictEqual(r[0].확인필요, false);
});

test('두 낱말 품목명, 빈 줄 무시, 최대수량 넘으면 자르고 확인필요', () => {
  const r = 해석('주방 싱크대 하부장\n\n방1 방문 3');
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0].체크_ID, 'z04_주방_싱크대 하부장_공통');
  assert.strictEqual(r[0].수량, 7);
  assert.strictEqual(r[1].체크_ID, 'z07_방1_방문_공통');
  assert.strictEqual(r[1].수량, 2);
  assert.strictEqual(r[1].확인필요, true);
});

test('줄마다 원문을 남긴다', () => {
  const r = 해석('거실 샤시 2');
  assert.strictEqual(r[0].원문, '거실 샤시 2');
});

test('답장 인사(네 감사합니다)는 한글 수사가 있어도 건너뜀', () => {
  const r = 해석('네 감사합니다');
  assert.strictEqual(r[0].건너뜀, true);
});

test('사용자가 처음 보낸 예문 그대로 - 구역 없는 현관문·신발장도 현관으로', () => {
  const r = 해석('실장님 풍림 2단지 견적 부탁드려요\n안방 분합창 1\n거실 샤시 2 (이중창)\n냉장고장 하나요\n현관문이랑 신발장도요');
  const 쓸것 = r.filter((x) => !x.건너뜀);
  assert.deepStrictEqual(쓸것.map((x) => x.체크_ID), [
    null, 'z03_거실_샤시1_공통', 'z03_거실_샤시2_공통', 'z04_주방_냉장고장_공통', 'z02_현관_현관문_공통', 'z02_현관_신발장1_공통',
  ]);
  assert.strictEqual(쓸것[1].옵션, 옵션번호('거실', '샤시1', '2중창'));
});

test('괄호 안 샤시 종류도 읽는다', () => {
  const r = 해석('거실 샤시 1 (단창)');
  assert.strictEqual(r[0].옵션, 옵션번호('거실', '샤시1', '단창'));
});

test('한개: 사진에만 붙인 품목도 보통 길이·2중창으로 1개 줄', () => {
  const r = P.한개('z03_거실_샤시2_공통', 사전());
  assert.strictEqual(r.체크_ID, 'z03_거실_샤시2_공통');
  assert.strictEqual(r.수량, 3);
  assert.strictEqual(r.기본길이, true);
  assert.strictEqual(r.옵션, 옵션번호('거실', '샤시2', '2중창'));
  assert.strictEqual(P.한개('없는ID', 사전()), null);
});
