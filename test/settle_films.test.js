const test = require('node:test');
const assert = require('node:assert');
const { 필름코드들, 필름자재목록, 남길코드들, 필름ID, 기본단가 } = require('../settle_films.js');

// 일정 앱 백업(sitenote-restore)의 sites 모양: { id, adminId, films: [{ place, code, ready }] }
const 현장들 = [
  { id: 's1', adminId: 'recAAA', films: [
    { place: '현관문뒷면', code: 'ps063', ready: true },
    { place: '거실창, 입구방', code: 'ps101' },
    { place: '방문틀2개', code: ' pw946-1 ' },
    { place: '거실게이트', code: 'ps120' },
  ] },
  { id: 's2', adminId: 'recBBB', films: [{ place: '안방', code: 'zz999' }] },
  { id: 's3', adminId: '', films: [{ place: '연결 안 됨', code: 'xx111' }] },
];

test('필름코드들: 이 현장업무에 연결된 일정앱 현장의 필름 번호만, 앞뒤 공백은 뺀다', () => {
  assert.deepStrictEqual(필름코드들(현장들, 'recAAA'), ['ps063', 'ps101', 'pw946-1', 'ps120']);
  assert.deepStrictEqual(필름코드들(현장들, 'recBBB'), ['zz999']);
});

test('필름코드들: 연결된 현장이 없거나 현장ID가 비면 빈 목록 (연결 안 된 현장은 절대 안 섞는다)', () => {
  assert.deepStrictEqual(필름코드들(현장들, 'recNONE'), []);
  assert.deepStrictEqual(필름코드들(현장들, ''), []);
  assert.deepStrictEqual(필름코드들(현장들, undefined), []);
  // adminId 가 빈 현장은 현장ID 가 비어 있어도 짝이 되면 안 된다
  assert.deepStrictEqual(필름코드들(현장들, ' '), []);
});

test('필름코드들: 빈 번호·중복(대소문자 무시)은 한 번만, 먼저 적은 표기 유지', () => {
  const s = [{ id: 'a', adminId: 'recX', films: [
    { code: 'PS063' }, { code: '' }, { code: '   ' }, { code: 'ps063' }, { place: '위치만' }, null, { code: 'ps101' },
  ] }];
  assert.deepStrictEqual(필름코드들(s, 'recX'), ['PS063', 'ps101']);
});

test('필름코드들: 이상한 입력도 안전', () => {
  assert.deepStrictEqual(필름코드들(null, 'recX'), []);
  assert.deepStrictEqual(필름코드들([null, { id: 'a', adminId: 'recX' }], 'recX'), []);
  assert.deepStrictEqual(필름코드들([{ id: 'a', adminId: 'recX', films: 'x' }], 'recX'), []);
});

test('필름코드들: 같은 현장업무에 연결된 현장이 둘이어도 둘 다 모은다', () => {
  const s = [
    { id: 'a', adminId: 'recX', films: [{ code: 'ps1' }] },
    { id: 'b', adminId: 'recX', films: [{ code: 'ps2' }, { code: 'ps1' }] },
  ];
  assert.deepStrictEqual(필름코드들(s, 'recX'), ['ps1', 'ps2']);
});

test('필름자재목록: 기본 단가는 9,000원, 번호는 항목명이 되고 id 는 film: 접두', () => {
  assert.strictEqual(기본단가, 9000);
  const rows = 필름자재목록(['ps063', 'ps101'], {});
  assert.deepStrictEqual(rows.map((r) => [r.id, r.항목명, r.단가]), [['film:ps063', 'ps063', 9000], ['film:ps101', 'ps101', 9000]]);
  assert.ok(rows.every((r) => r.사용여부 === true && r.필름 === true));
  assert.strictEqual(필름ID('ps063'), 'film:ps063');
});

test('필름자재목록: 사장님이 고친 단가가 있으면 그것을, 잘못된 값(0·음수·글자·빈칸)은 기본 단가', () => {
  const rows = 필름자재목록(['a', 'b', 'c', 'd', 'e'], { a: 12000, b: '10500', c: 0, d: -5, e: '' });
  assert.deepStrictEqual(rows.map((r) => r.단가), [12000, 10500, 9000, 9000, 9000]);
  assert.strictEqual(필름자재목록(['x'], { x: '글자' })[0].단가, 9000);
  assert.deepStrictEqual(필름자재목록(null, null), []);
});

test('남길코드들: 새 목록 + 이미 줄에서 쓰는 이전 번호 (일정앱에서 지워도 쓰던 건 유지)', () => {
  const 줄들 = [
    { 체크: true, 자재ID: 'film:ps063' },   // 쓰는 중
    { 체크: true, 자재ID: 'film:old1' },    // 쓰는 중, 일정앱에서는 지워짐
    { 체크: true, 자재ID: 'mat_x' },        // 필름 아님
  ];
  assert.deepStrictEqual(남길코드들(['ps101', 'ps063'], ['ps063', 'old1', 'old2'], 줄들), ['ps101', 'ps063', 'old1']);
});

test('남길코드들: 새 목록이 비어도 쓰던 건 남고, 안 쓰는 이전 번호는 사라진다', () => {
  assert.deepStrictEqual(남길코드들([], ['a', 'b'], [{ 체크: true, 자재ID: 'film:b' }]), ['b']);
  assert.deepStrictEqual(남길코드들([], ['a', 'b'], []), []);
  assert.deepStrictEqual(남길코드들(null, null, null), []);
});

test('남길코드들: 체크를 끈 줄이 쓰던 번호도 남긴다 (다시 켰을 때 "자재 없음" 이 되면 안 된다)', () => {
  assert.deepStrictEqual(남길코드들([], ['a'], [{ 체크: false, 자재ID: 'film:a' }]), ['a']);
});
