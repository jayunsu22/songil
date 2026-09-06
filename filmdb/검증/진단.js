// 사진색과 DB색이 왜 어긋나는지 본다.
// 어긋난 방향이 일정하면 조명·화이트밸런스 문제(전역 보정으로 줄일 수 있다),
// 제각각이면 샘플북 인쇄본과 제조사 제품이미지가 애초에 다른 색인 것이다.
const { 재기 } = require('./측정');
const 중앙 = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
(async () => {
  const 기록 = (await 재기()).filter(r => r.제품 && r.사진lab);
  const dL = 기록.map(r => r.사진lab.L - r.제품.lab.L);
  const da = 기록.map(r => r.사진lab.a - r.제품.lab.a);
  const db = 기록.map(r => r.사진lab.b - r.제품.lab.b);
  const 통계 = (이름, v) => {
    const 평 = v.reduce((a, b) => a + b, 0) / v.length;
    const 표 = Math.sqrt(v.reduce((a, b) => a + (b - 평) ** 2, 0) / v.length);
    console.log(이름, '평균', 평.toFixed(2).padStart(7), '중앙', 중앙(v).toFixed(2).padStart(7), '표준편차', 표.toFixed(2).padStart(6),
      '| 같은 방향 비율', (Math.max(v.filter(x => x > 0).length, v.filter(x => x < 0).length) / v.length * 100).toFixed(0) + '%');
  };
  console.log('=== 사진색 − DB색 (n=' + 기록.length + ') ===');
  통계('L*', dL); 통계('a*', da); 통계('b*', db);

  console.log('\n=== 쪽별 평균 편차 ===');
  [...new Set(기록.map(r => r.쪽))].forEach(k => {
    const g = 기록.filter(r => r.쪽 === k);
    console.log(k.padEnd(16), 'dL', (g.reduce((a, r) => a + r.사진lab.L - r.제품.lab.L, 0) / g.length).toFixed(1).padStart(6),
      'da', (g.reduce((a, r) => a + r.사진lab.a - r.제품.lab.a, 0) / g.length).toFixed(1).padStart(6),
      'db', (g.reduce((a, r) => a + r.사진lab.b - r.제품.lab.b, 0) / g.length).toFixed(1).padStart(6));
  });

  console.log('\n=== 표본 몇 개: 사진 Lab vs DB Lab ===');
  기록.slice(0, 8).concat(기록.slice(-6)).forEach(r =>
    console.log(' ', r.코드.padEnd(10),
      '사진 L' + r.사진lab.L.toFixed(0).padStart(3) + ' a' + r.사진lab.a.toFixed(0).padStart(4) + ' b' + r.사진lab.b.toFixed(0).padStart(4),
      '| DB L' + r.제품.lab.L.toFixed(0).padStart(3) + ' a' + r.제품.lab.a.toFixed(0).padStart(4) + ' b' + r.제품.lab.b.toFixed(0).padStart(4),
      '| ΔE', r.ΔE정답.toFixed(1)));
})();
