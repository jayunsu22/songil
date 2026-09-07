#!/usr/bin/env node
// 배포용 데이터 파일과 이미지를 만든다.
//
//   filmdb/cache/films.json   (Airtable 원본)
// + filmdb/cache/colors.json  (미러링하며 뽑은 3점 색)
// → film/film-db.json  +  film/img/{grid,card}/*.webp
//
// 브라우저는 Airtable 을 직접 치지 않는다. API 키가 노출되지 않고, 2,118건 계산이 즉시 끝난다.
//
// 작업 폴더(filmdb/mirror)와 배포 폴더(film/img)를 나눠 둔 이유:
// 배포되는 이미지 집합이 film-db.json 이 참조하는 것과 정확히 일치하도록 보장하기 위해서다.
// 미러 폴더에는 실험하다 남은 파일이 섞일 수 있다.
//
// 사용법: node filmdb/build_db.js

const fs = require('fs');
const path = require('path');

const 뿌리   = path.join(__dirname, '..');
const 배포   = path.join(뿌리, 'film');
const 배포img = path.join(배포, 'img');
const 미러   = path.join(__dirname, 'mirror');

const films  = JSON.parse(fs.readFileSync(path.join(__dirname, 'cache', 'films.json'), 'utf8'));
const colors = JSON.parse(fs.readFileSync(path.join(__dirname, 'cache', 'colors.json'), 'utf8'));
const 색맵 = new Map(colors.map((c) => [c.id, c]));

/* ---------- 데이터 정리 ---------- */

// Airtable 의 '특성' 한 컬럼에 서로 다른 의미가 여러 개 섞여 있다. 2026-09-06 기준:
//   현대 468건 = 광택 (극무광/무광/반광/유광)
//   예림  51건 + 한솔 12건 = 방염
//   한솔  14건 = "코드미확인"        ← 제조사가 제품 코드를 확정하지 못한 건
//   한솔   5건 = "색상출처:PDF카탈로그" ← 실물 스캔이 아니라 PDF 에서 뽑은 색
//
// 인수인계 문서는 "현대만 광택 정보" 라고 했고, 실측했을 때는 두 가지였는데,
// 한솔이 들어오면서 네 가지가 됐다. 브랜드가 계속 추가되는 필드이므로
// 아는 것만 골라내고 나머지는 버리면 안 된다. 모르는 값은 '비고' 로 남겨서
// 다음 사람이 볼 수 있게 한다.
//
// '코드미확인' 을 따로 빼는 이유: B(코드 역추적)는 코드를 보여주는 기능인데,
// 제조사조차 확정하지 못한 코드를 확정된 것처럼 보여주면 안 된다.
function 특성분리(특성) {
  const s = String(특성 || '').trim();
  const 기본 = { 광택: null, 방염: false, 코드미확인: false, 색출처: null, 비고: null };
  if (!s) return 기본;

  if (/극무광|무광|반광|유광/.test(s)) return { ...기본, 광택: s };
  if (s.indexOf('방염') >= 0)          return { ...기본, 방염: true };
  if (s.indexOf('코드미확인') >= 0)     return { ...기본, 코드미확인: true };
  if (s.indexOf('색상출처') >= 0)       return { ...기본, 색출처: s.split(':').slice(1).join(':').trim() || s };

  // 앞으로 새 브랜드가 또 다른 의미를 넣을 수 있다. 조용히 버리지 않는다.
  return { ...기본, 비고: s };
}

// 선택지에 오타가 섞여 있다. 필터를 두 벌로 만들지 말고 여기서 통일한다.
//   '엘로' 3건 -> '옐로'    '네추럴우드' -> '내추럴우드'
const 오타 = { '엘로': '옐로', '네추럴우드': '내추럴우드' };
const 고침 = (v) => (v && 오타[v]) || v || null;

/* ---------- 조립 ---------- */

const 목록 = [];
const 누락 = [];

// R,G,B 에서 Lab 을 다시 계산한다. Airtable 의 L*a*b* 는 소수점 1자리로 반올림되어 있다.
const { rgb를lab } = require('../film_color.js');

films.forEach((f) => {
  const c = 색맵.get(f.id);
  if (!c) { 누락.push(`${f.제조사} ${f.코드}`); return; }

  const t = 특성분리(f.특성);

  // 색상출처가 PDF 카탈로그인 건은 우리가 뽑은 색을 쓰면 안 된다.
  //
  // 한솔 인수인계 문서: "사이트 이미지가 시공사례 사진뿐이라 [PDF 카탈로그로] 대체함".
  // 즉 Airtable 의 HEX 는 PDF 에서 제대로 뽑은 값인데, 썸네일URL 은 시공사례 사진 그대로다.
  // 우리 미러링은 그 URL 을 따라가 '방 사진'에서 색을 뽑았고, 그 결과 맞는 값을 틀린 값으로
  // 덮어썼다(HSF124424 는 ΔE 53.42 나 벌어졌다).
  //
  // 그래서 이 건들은 Airtable 값을 그대로 쓰고, 이미지에서 나온 대비폭·균일도는 버린다.
  // 방 사진의 대비폭은 필름의 무늬가 아니라 방의 구조이기 때문이다.
  const 사진무효 = !!t.색출처;
  const lab = 사진무효
    ? (() => { const v = rgb를lab(f.R, f.G, f.B); return { L: +v.L.toFixed(2), a: +v.a.toFixed(2), b: +v.b.toFixed(2) }; })()
    : { L: c.L, a: c.a, b: c.b };

  목록.push({
    id: f.id,
    키: c.키,                       // 이미지 파일 이름
    제조사: f.제조사,
    코드: f.코드,
    색상명: f.색상명 || null,       // 632건(30%)은 비어 있다. 화면에서 없을 때를 처리해야 한다.
    카테고리: f.카테고리 || null,
    세부분류: 고침(f.세부분류),
    명도: f.명도 || null,
    색상계열: 고침(f.색상계열),
    광택: t.광택,
    방염: t.방염,
    코드미확인: t.코드미확인,   // 제조사가 코드를 확정 못 한 건. 화면에서 코드를 단정하면 안 된다.
    색출처: t.색출처,           // 'PDF카탈로그' 등. 실물 스캔이 아니면 색 신뢰도가 낮다.
    비고: t.비고,               // 우리가 아직 모르는 특성값. 조용히 버리지 않는다.
    HEX: 사진무효 ? f.HEX : c.대표HEX,          // 표시용
    밝은HEX: 사진무효 ? null : c.밝은HEX,
    어두운HEX: 사진무효 ? null : c.어두운HEX,
    lab: lab,                                   // 매칭은 이 값으로만 한다
    대비폭: 사진무효 ? null : c.대비폭,          // 방 사진의 대비는 필름 무늬가 아니다
    균일도: 사진무효 ? null : c.균일도,          // 신뢰도. 높으면 대표색 하나로 표현이 어려운 제품.
    사진무효: 사진무효,                          // 미러링한 이미지가 제품 사진이 아님 -> 색칩으로 대체 표시
    // 에어테이블에서 손으로 넣은 질감. 비어 있으면 화면이 film_texture.json 의 규칙을 쓴다.
    질감: f.질감 || null,
    상세URL: f.상세페이지URL || null, // 585건(28.6%)만 있다
  });
});

/* ---------- 이미지 복사 ---------- */

let 복사 = 0, 없음 = 0;
['grid', 'card'].forEach((종류) => {
  fs.mkdirSync(path.join(배포img, 종류), { recursive: true });
  목록.forEach((p) => {
    const 원 = path.join(미러, 종류, `${p.키}.webp`);
    const 새 = path.join(배포img, 종류, `${p.키}.webp`);
    if (!fs.existsSync(원)) { 없음++; return; }
    // mtime 이 같으면 건너뛴다. 브랜드 하나 추가할 때 2,118장을 다시 쓰지 않기 위해서다.
    try {
      if (fs.existsSync(새) && fs.statSync(새).mtimeMs >= fs.statSync(원).mtimeMs) return;
    } catch { /* 다시 쓴다 */ }
    fs.copyFileSync(원, 새);
    복사++;
  });
});

/* ---------- 저장 ---------- */

fs.mkdirSync(배포, { recursive: true });
const 경로 = path.join(배포, 'film-db.json');
fs.writeFileSync(경로, JSON.stringify(목록), 'utf8');

const 크기 = fs.statSync(경로).size;
const gz = require('zlib').gzipSync(fs.readFileSync(경로)).length;

console.log(`film-db.json  ${목록.length}건  ${(크기 / 1024).toFixed(0)}KB (gzip ${(gz / 1024).toFixed(0)}KB)`);
console.log(`이미지 복사   ${복사}개 (변경분만), 원본 없음 ${없음}개`);
if (누락.length) console.log(`색 데이터 없어 제외: ${누락.length}건 — ${누락.slice(0, 5).join(', ')}`);

// 화면 코드가 브랜드 목록을 하드코딩하지 않도록, 실제로 뭐가 들어있는지 여기서 확인만 해둔다.
const 집계 = (키) => {
  const m = new Map();
  목록.forEach((x) => { if (x[키]) m.set(x[키], (m.get(x[키]) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
console.log('\n제조사  :', 집계('제조사').map(([k, v]) => `${k} ${v}`).join(' / '));
console.log('카테고리:', 집계('카테고리').map(([k, v]) => `${k} ${v}`).join(' / '));
console.log('광택    :', 집계('광택').map(([k, v]) => `${k} ${v}`).join(' / ') || '(없음)');
console.log('방염    :', 목록.filter((x) => x.방염).length + '건');
console.log('코드미확인:', 목록.filter((x) => x.코드미확인).length + '건  ← 화면에서 코드를 단정하지 말 것');
console.log('색출처표기:', 목록.filter((x) => x.색출처).length + '건  ← 이미지 대신 색칩 표시, Airtable HEX 사용');
const 비고 = 목록.filter((x) => x.비고);
console.log('미분류 특성:', 비고.length + '건' + (비고.length ? ' — ' + [...new Set(비고.map(x=>x.비고))].join(', ') : ' ✅'));
console.log('색상계열:', 집계('색상계열').length + '종 (오타 통합 후)');
console.log('색상명 없음:', 목록.filter((x) => !x.색상명).length + '건');
