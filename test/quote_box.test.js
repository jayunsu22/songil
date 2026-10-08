const test = require('node:test');
const assert = require('node:assert');
const { 바뀐것, 큐합치기, 보낸것빼기, 서버와합치기, 발행을상태로 } = require('../quote_box.js');

test('바뀐것: 새 건·고친 건은 put, 빠진 건은 delete, 그대로인 건은 안 보낸다', () => {
  const a = { id: 1, 이름: 'A' }, b = { id: 2, 이름: 'B' }, c = { id: 3, 이름: 'C' };
  const ops = 바뀐것([a, b], [{ id: 1, 이름: 'A2' }, c]);
  assert.deepStrictEqual(ops.map((o) => o.op + o.id), ['put1', 'put3', 'delete2']);
  assert.deepStrictEqual(바뀐것([a], [a]), []);
});

test('큐합치기: 같은 건은 마지막 일만 남는다 / 보낸것빼기: 그 사이 바뀐 건은 남긴다', () => {
  const q = 큐합치기([{ op: 'put', id: '1', data: { v: 1 } }], [{ op: 'delete', id: '1' }, { op: 'put', id: '2', data: {} }]);
  assert.deepStrictEqual(q.map((o) => o.op + o.id), ['delete1', 'put2']);
  const 보낸 = [{ op: 'put', id: '2', data: {} }];
  const 지금 = [{ op: 'put', id: '2', data: { 고침: 1 } }, { op: 'delete', id: '1' }];
  assert.deepStrictEqual(보낸것빼기(지금, 보낸).length, 2);
  assert.deepStrictEqual(보낸것빼기(보낸, 보낸), []);
});

test('서버와합치기: 폰이 비었으면 서버 것으로 되살리고, 폰에만 있는 건 올린다', () => {
  const 서버 = [{ id: 1, 저장일시: '2026-09-01' }, { id: 2, 저장일시: '2026-09-03' }];
  const r = 서버와합치기([], 서버, []);
  assert.strictEqual(r.되살림, 2);
  assert.deepStrictEqual(r.목록.map((x) => x.id), [2, 1]);   // 늦게 저장한 것이 위
  assert.deepStrictEqual(r.올릴것, []);

  const r2 = 서버와합치기([{ id: 1, 저장일시: '2026-09-05', 이름: '폰' }, { id: 9, 저장일시: '2026-09-02' }], 서버, [{ op: 'delete', id: '2' }]);
  assert.strictEqual(r2.되살림, 0);                              // 2는 폰에서 지우는 중이라 안 되살린다
  assert.strictEqual(r2.목록.find((x) => x.id === 1).이름, '폰'); // 폰 것이 이긴다
  assert.deepStrictEqual(r2.올릴것.map((o) => o.id), ['9']);
});

test('발행을상태로: 품목·종류·수량·조정·구역이름·방개수·직접입력을 되살린다', () => {
  const master = { zones: [
    { 구역: '전체공통', items: [] },
    { 구역: '거실', items: [
      { 체크_ID: 'z03_거실_가벽_공통', 표시_품목명: '가벽', 적용평형: '공통', 옵션들: [{ 품목명: '가벽', 품목설명: '기본설명' }] },
      { 체크_ID: 'z03_거실_샤시_공통', 표시_품목명: '샤시', 적용평형: '공통', 옵션들: [{ 품목명: '단창' }, { 품목명: '시스템샤시' }] },
      { 체크_ID: 'z03_거실_몰딩 (실측)_32평', 표시_품목명: '몰딩 (실측)', 적용평형: '32평', 파생: true, 옵션들: [{ 품목명: '몰딩' }] },
    ] },
    { 구역: '방2', items: [
      { 체크_ID: 'z06_방2_몰딩 (실측)_32평', 표시_품목명: '몰딩 (실측)', 적용평형: '32평', 파생: true, 옵션들: [{ 품목명: '몰딩' }] },
    ] },
  ] };
  const d = {
    견적코드: 'ABCD2345', 현장명: '월곡레미안', 평형: '', 총액: 1000,
    조정_내역: [{ 항목명: '업자단가', 비율: -0.05 }], 메모: 'm', 소비자_전달사항: 'r', 안내문구_수정: 'n',
    라인들: [
      { 체크_ID: 'z03_거실_가벽_공통', 구역: '서재', 품목명: '가벽', 수량: 3, 난이도: 1.2, 품목설명: '고친설명', 자재비단가: 18000 },
      { 체크_ID: 'z03_거실_샤시_공통', 구역: '서재', 품목명: '샤시 (시스템샤시)', 수량: 2, 난이도: 1, 품목설명: '' },
      { 체크_ID: 'z06_방2_몰딩 (실측)_32평', 구역: '방2', 품목명: '몰딩 (실측)', 수량: 5, 품목설명: '몰딩\n방 몫 5m (전체 40m 의 50% 를 방 4개로 나눔)' },
      { 체크_ID: 'cmtvjrfu848a', 구역: '서재', 품목명: '현관방화문', 직접금액: 250000, 인건비: 200000, 자재비: 50000, 품목설명: '앞뒤면' },
      { 체크_ID: 'z09_없어진_품목_공통', 구역: '거실', 품목명: '없어진 품목', 수량: 1, 라인금액: 70000, 인건비금액: 50000 },
    ],
  };
  const r = 발행을상태로(d, master, 15000);
  const st = r.상태;
  assert.strictEqual(st.현장코드, 'ABCD2345');
  assert.strictEqual(st.평형, '32평');                      // 평형별 품목에서 되찾는다
  assert.strictEqual(st.방수, 4);
  assert.strictEqual(st.자재비, 18000);
  assert.deepStrictEqual(st.구역명, { 거실: '서재' });
  assert.deepStrictEqual(st.선택['z03_거실_가벽_공통'], { 수량: 3, 난이도: 1.2, 옵션: 0 });
  assert.strictEqual(st.선택['z03_거실_샤시_공통'].옵션, 1);
  assert.strictEqual(st.설명['z03_거실_가벽_공통'], '고친설명');
  assert.strictEqual(st.설명['z06_방2_몰딩 (실측)_32평'], undefined);   // 파생 설명은 자동으로 붙는 것
  assert.deepStrictEqual(st.조정, [{ 항목명: '업자단가', 비율: -0.05 }, null, null]);
  assert.strictEqual(st.전달사항, 'r');
  assert.strictEqual(st.안내문구, 'n');
  assert.strictEqual(st.직접품목.length, 2);
  assert.deepStrictEqual(st.직접품목[0], { id: 'cmtvjrfu848a', 구역: '거실', 품목명: '현관방화문', 금액: 250000, 설명: '앞뒤면', 인건비: 200000, 자재비: 50000 });
  assert.strictEqual(st.직접품목[1].금액, 70000);
  assert.strictEqual(st.직접품목[1].인건비, 50000);
  assert.strictEqual(st.직접품목[1].자재비, 20000);
  assert.strictEqual(r.직접으로, 1);
});

test('사진서명: 태그만 바뀌면 이미지서명은 그대로, 사진을 바꾸면 이미지서명이 바뀐다', () => {
  const { 사진서명, 이미지서명 } = require('../quote_box.js');
  const p = { blob: { size: 1000 }, 구역: '거실', 태그: ['a'], 표시: {} };
  const q = Object.assign({}, p, { 태그: ['a', 'b'] });
  assert.notStrictEqual(사진서명(p), 사진서명(q));
  assert.strictEqual(이미지서명(p), 이미지서명(q));
  assert.notStrictEqual(이미지서명(p), 이미지서명(Object.assign({}, p, { 바뀐때: 5 })));
});

test('정리할현장: 되살린 직후(사진 0장·보낸 적 없음)에는 서버 사진을 지우지 않는다', () => {
  const { 정리할현장 } = require('../quote_box.js');
  // 폰이 지워지고 저장함만 되살아난 상태 — 사진은 아직 없다
  assert.deepStrictEqual(정리할현장(['s1'], {}, {}).일, []);
  // 처음 올린 뒤
  let r = 정리할현장(['s1'], { s1: ['k2', 'k1'] }, {});
  assert.deepStrictEqual(r.일, [{ 현장ID: 's1', 키들: ['k1', 'k2'] }]);
  // 그대로면 안 보낸다
  assert.deepStrictEqual(정리할현장(['s1'], { s1: ['k1', 'k2'] }, r.맵).일, []);
  // 사진을 다 지웠으면 0장 남김을 보낸다 (전에 보낸 적이 있으니)
  assert.deepStrictEqual(정리할현장(['s1'], { s1: [] }, r.맵).일, [{ 현장ID: 's1', 키들: [] }]);
  // 저장함에서 빠진 현장
  r = 정리할현장([], {}, { s1: 'k1' });
  assert.deepStrictEqual(r.일, [{ 현장ID: 's1', 키들: [] }]);
  assert.deepStrictEqual(r.맵, {});
});

test('정리후보: 기간보다 오래되고 사진이 있는 건만, 오래된 것부터', () => {
  const { 정리후보 } = require('../quote_box.js');
  const 목록 = [
    { id: 1, 이름: '최근', 현장ID: 'a', 저장일시: '2026-09-20T00:00:00Z' },
    { id: 2, 이름: '넉달전', 현장ID: 'b', 저장일시: '2026-06-01T00:00:00Z' },
    { id: 3, 이름: '반년전', 현장ID: 'c', 저장일시: '2026-03-01T00:00:00Z' },
    { id: 4, 이름: '사진없음', 현장ID: 'd', 저장일시: '2026-01-01T00:00:00Z' },
  ];
  const 통계 = { a: { 장수: 3, 용량: 900 }, b: { 장수: 2, 용량: 600 }, c: { 장수: 5, 용량: 1500 } };
  const 지금 = '2026-10-05T00:00:00Z';
  assert.deepStrictEqual(정리후보(목록, 통계, 3, 지금).map((x) => x.이름), ['반년전', '넉달전']);
  assert.deepStrictEqual(정리후보(목록, 통계, 6, 지금).map((x) => x.이름), ['반년전']);
  assert.deepStrictEqual(정리후보(목록, 통계, 1, 지금).map((x) => x.장수), [5, 2]);
  assert.deepStrictEqual(정리후보(목록, 통계, 12, 지금), []);
});
