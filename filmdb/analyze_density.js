#!/usr/bin/env node
// 7-1 검증: 제품들이 색 공간에서 얼마나 촘촘히 몰려 있는가.
//
// 답하려는 질문은 하나다.
//   "사용자가 어떤 필름을 완벽하게 촬영해서 그 제품의 색을 정확히 뽑아냈다고 치자.
//    그때 그 제품과 구분이 안 되는 다른 제품이 몇 개나 있는가?"
//
// 이게 B(시공된 필름 코드 역추적)의 상한선이다.
// 사진을 아무리 잘 찍어도, 아무리 알고리즘을 다듬어도 이 한계는 못 넘는다.
// 데이터 자체가 그 이상을 구분할 정보를 담고 있지 않기 때문이다.
//
// 사용법: node filmdb/analyze_density.js

const fs = require('fs');
const path = require('path');
const { rgb를lab, deltaE2000 } = require('../film_color.js');

const 캐시 = path.join(__dirname, 'cache', 'films.json');
if (!fs.existsSync(캐시)) {
  console.error('캐시가 없다. 먼저 node filmdb/fetch.js 를 돌릴 것.');
  process.exit(1);
}

const 전체 = JSON.parse(fs.readFileSync(캐시, 'utf8'));

/* ---------- 1. 데이터 현황 ---------- */

function 집계(목록, 키) {
  const m = new Map();
  목록.forEach((x) => {
    const v = x[키] == null || x[키] === '' ? '(없음)' : x[키];
    m.set(v, (m.get(v) || 0) + 1);
  });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function 표(제목, 행들, 총계) {
  console.log(`\n${제목}`);
  행들.forEach(([k, v]) => {
    const 비율 = 총계 ? ` (${(v / 총계 * 100).toFixed(1)}%)` : '';
    console.log(`   ${String(k).padEnd(14)} ${String(v).padStart(5)}${비율}`);
  });
}

console.log('='.repeat(64));
console.log(`전체 ${전체.length}건`);
console.log('='.repeat(64));

표('제조사별', 집계(전체, '제조사'), 전체.length);
표('카테고리별', 집계(전체, '카테고리'), 전체.length);

// 색 계산이 가능한 레코드만 추린다. RGB 가 없으면 매칭 대상이 될 수 없다.
const 유효 = 전체.filter((x) =>
  Number.isFinite(x.R) && Number.isFinite(x.G) && Number.isFinite(x.B));
const 무효 = 전체.length - 유효.length;
console.log(`\nRGB 결측: ${무효}건  →  계산 대상 ${유효.length}건`);

// 인수인계 문서 권고대로 저장된 L*a*b*(소수점 1자리 반올림) 대신 R,G,B 에서 다시 변환한다.
유효.forEach((x) => { x.lab = rgb를lab(x.R, x.G, x.B); });

/* ---------- 2. 최근접이웃 거리 ---------- */

// 실제 매칭과 같은 설정(kL=2)으로 잰다. 다른 설정으로 재면 의미가 없다.
const 옵션 = { kL: 2 };
const N = 유효.length;

console.log(`\n${N}×${N} 쌍 ΔE2000(kL=2) 계산 중…`);
const 시작 = Date.now();

const 최근접 = new Float64Array(N);
const 이웃수1 = new Int32Array(N);   // ΔE < 1  : 육안 구분 거의 불가
const 이웃수2 = new Int32Array(N);   // ΔE < 2  : 나란히 놓고 봐야 구분
const 이웃수5 = new Int32Array(N);   // ΔE < 5  : 실무 후보 상한선
const 최근접상대 = new Int32Array(N);
최근접.fill(Infinity);

for (let i = 0; i < N; i++) {
  const a = 유효[i].lab;
  for (let j = i + 1; j < N; j++) {
    const d = deltaE2000(a, 유효[j].lab, 옵션);
    if (d < 최근접[i]) { 최근접[i] = d; 최근접상대[i] = j; }
    if (d < 최근접[j]) { 최근접[j] = d; 최근접상대[j] = i; }
    if (d < 1) { 이웃수1[i]++; 이웃수1[j]++; }
    if (d < 2) { 이웃수2[i]++; 이웃수2[j]++; }
    if (d < 5) { 이웃수5[i]++; 이웃수5[j]++; }
  }
}
console.log(`  완료 (${((Date.now() - 시작) / 1000).toFixed(1)}초)`);

/* ---------- 3. 결과 ---------- */

function 백분위(arr, p) {
  const v = Array.from(arr).sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(v.length * p))];
}
function 평균(arr) {
  let s = 0; for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

console.log('\n' + '='.repeat(64));
console.log('가장 가까운 다른 제품까지의 거리 (ΔE2000, kL=2)');
console.log('='.repeat(64));
[['최소', 백분위(최근접, 0)], ['하위25%', 백분위(최근접, 0.25)],
 ['중앙값', 백분위(최근접, 0.5)], ['상위25%', 백분위(최근접, 0.75)],
 ['최대', 백분위(최근접, 0.999)]].forEach(([k, v]) =>
  console.log(`   ${k.padEnd(10)} ΔE ${v.toFixed(2)}`));
console.log(`   ${'평균'.padEnd(10)} ΔE ${평균(최근접).toFixed(2)}`);

const 구분불가 = Array.from(최근접).filter((d) => d < 1).length;
console.log(`\n   ΔE 1 미만(육안 구분 불가)인 쌍둥이가 있는 제품: ${구분불가}건 (${(구분불가 / N * 100).toFixed(1)}%)`);

console.log('\n' + '='.repeat(64));
console.log('★ 핵심: 완벽하게 촬영해도 함께 딸려 나오는 경쟁 제품 수');
console.log('='.repeat(64));

function 경쟁분포(제목, cnt, 대상 /* index 배열 */) {
  const v = 대상.map((i) => cnt[i]).sort((a, b) => a - b);
  const p = (q) => v[Math.min(v.length - 1, Math.floor(v.length * q))];
  console.log(`   ${제목.padEnd(22)} 중앙값 ${String(p(0.5)).padStart(4)}개   ` +
              `상위25% ${String(p(0.75)).padStart(4)}개   최악 ${String(p(0.99)).padStart(4)}개`);
}

const 전체idx = 유효.map((_, i) => i);
console.log('\n [전체]');
경쟁분포('ΔE < 1 안에', 이웃수1, 전체idx);
경쟁분포('ΔE < 2 안에', 이웃수2, 전체idx);
경쟁분포('ΔE < 5 안에', 이웃수5, 전체idx);

// 카테고리별. 우드가 실제로 더 촘촘한지가 설계의 핵심 가정이었다.
const 카테고리들 = [...new Set(유효.map((x) => x.카테고리))]
  .filter(Boolean)
  .sort((a, b) => 유효.filter((x) => x.카테고리 === b).length
                - 유효.filter((x) => x.카테고리 === a).length);

console.log('\n [카테고리별 — ΔE < 2 안의 경쟁 제품 수]');
카테고리들.forEach((c) => {
  const idx = 전체idx.filter((i) => 유효[i].카테고리 === c);
  if (idx.length < 5) return;
  경쟁분포(`${c} (${idx.length}건)`, 이웃수2, idx);
});

/* ---------- 4. 실제로 어떻게 보이는지 ---------- */

console.log('\n' + '='.repeat(64));
console.log('가장 촘촘한 곳 — 서로 구분 안 되는 제품 예시 10쌍');
console.log('='.repeat(64));

const 쌍 = 전체idx
  .map((i) => ({ i, j: 최근접상대[i], d: 최근접[i] }))
  .sort((a, b) => a.d - b.d);

const 본것 = new Set();
let 출력 = 0;
for (const { i, j, d } of 쌍) {
  const 키 = i < j ? `${i}-${j}` : `${j}-${i}`;
  if (본것.has(키)) continue;
  본것.add(키);
  const A = 유효[i], B = 유효[j];
  console.log(`   ΔE ${d.toFixed(2)}  ${A.제조사} ${A.코드} ${A.HEX}  ↔  ${B.제조사} ${B.코드} ${B.HEX}   [${A.카테고리}/${B.카테고리}]`);
  if (++출력 >= 10) break;
}

// 브랜드 교차 검색이 실제로 쓸모 있으려면, 다른 브랜드에 가까운 대체품이 있어야 한다.
console.log('\n' + '='.repeat(64));
console.log('브랜드 교차 검색 실현성 — 타 브랜드 최근접 거리');
console.log('='.repeat(64));

const 타브랜드최근접 = new Float64Array(N).fill(Infinity);
for (let i = 0; i < N; i++) {
  const a = 유효[i].lab, 브랜드 = 유효[i].제조사;
  for (let j = 0; j < N; j++) {
    if (i === j || 유효[j].제조사 === 브랜드) continue;
    const d = deltaE2000(a, 유효[j].lab, 옵션);
    if (d < 타브랜드최근접[i]) 타브랜드최근접[i] = d;
  }
}
[['중앙값', 백분위(타브랜드최근접, 0.5)], ['상위25%', 백분위(타브랜드최근접, 0.75)],
 ['상위10%', 백분위(타브랜드최근접, 0.9)]].forEach(([k, v]) =>
  console.log(`   ${k.padEnd(10)} ΔE ${v.toFixed(2)}`));
const 대체가능 = Array.from(타브랜드최근접).filter((d) => d < 2).length;
console.log(`\n   타 브랜드에 ΔE 2 이내 대체품이 있는 제품: ${대체가능}건 (${(대체가능 / N * 100).toFixed(1)}%)`);
