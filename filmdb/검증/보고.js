const { 재기 } = require('./측정');
const 몫 = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '-';
const 안에 = (기록, n) => 기록.filter(r => r.순위 && r.순위 <= n).length;

function 표(제목, 기록) {
  if (!기록.length) return;
  console.log(제목.padEnd(18),
    ('n=' + 기록.length).padEnd(7),
    '1위', 몫(안에(기록, 1), 기록.length).padStart(6),
    '5위내', 몫(안에(기록, 5), 기록.length).padStart(6),
    '10위내', 몫(안에(기록, 10), 기록.length).padStart(6),
    '30위내', 몫(안에(기록, 30), 기록.length).padStart(6));
}

(async () => {
  const 기록 = await 재기();
  console.log('=== 전체 ===');
  표('전체', 기록);
  console.log('\n=== 쪽별 ===');
  [...new Set(기록.map(r => r.쪽))].forEach(k => 표(k, 기록.filter(r => r.쪽 === k)));
  console.log('\n=== 카테고리별 ===');
  [...new Set(기록.map(r => r.제품 && r.제품.카테고리))].filter(Boolean)
    .forEach(k => 표(k, 기록.filter(r => r.제품 && r.제품.카테고리 === k)));
  console.log('\n=== 정답 ΔE 분포 (사진색 vs DB색) ===');
  const d = 기록.filter(r => r.ΔE정답 != null).map(r => r.ΔE정답).sort((a, b) => a - b);
  const q = x => d[Math.floor(d.length * x)].toFixed(2);
  console.log('최소', d[0].toFixed(2), '| 25%', q(.25), '| 중앙', q(.5), '| 75%', q(.75), '| 95%', q(.95), '| 최대', d[d.length - 1].toFixed(2));
  console.log('ΔE>5 (검색 상한 밖이라 아예 못 찾음):', d.filter(v => v > 5).length, '/', d.length);
  console.log('\n=== 못 찾은 것 (30위 안에 없음) ===');
  기록.filter(r => !r.순위).slice(0, 25).forEach(r =>
    console.log(' ', r.코드.padEnd(10), r.쪽.padEnd(16), 'ΔE', r.ΔE정답 == null ? '-' : r.ΔE정답.toFixed(1), r.사유 || ''));
})();
