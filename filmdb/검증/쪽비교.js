// 보정이 어떤 쪽에서는 오히려 나쁘게 만들지 않는가. 그게 확인돼야 배포할 수 있다.
const { 재기 } = require('./측정');
const 몫 = (a, b) => b ? (a / b * 100).toFixed(0) + '%' : '-';
const 중앙 = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const 안5 = g => g.filter(r => r.순위 && r.순위 <= 5).length;
(async () => {
  const 전 = await 재기({ 상한: 12, 개수: 30 });
  const 후 = await 재기({ 상한: 12, 개수: 30, 보정: '흰점', 기준: 245, 검은점빼기: true, 한계: 2.5 });
  console.log('쪽                 n    5위내 전→후        ΔE중앙 전→후');
  for (const 쪽 of [...new Set(전.map(r => r.쪽))]) {
    const a = 전.filter(r => r.쪽 === 쪽), b = 후.filter(r => r.쪽 === 쪽);
    const 화살 = 안5(b) > 안5(a) ? '↑' : 안5(b) < 안5(a) ? '↓ 나빠짐' : '=';
    console.log(쪽.padEnd(17), String(a.length).padStart(2),
      (몫(안5(a), a.length) + ' → ' + 몫(안5(b), b.length)).padStart(14), 화살.padEnd(9),
      (중앙(a.filter(r => r.제품).map(r => r.ΔE정답)).toFixed(1) + ' → ' +
       중앙(b.filter(r => r.제품).map(r => r.ΔE정답)).toFixed(1)).padStart(14));
  }
  console.log('\n카테고리별 5위내 (보정 후)');
  for (const k of [...new Set(후.map(r => r.제품 && r.제품.카테고리))].filter(Boolean)) {
    const g = 후.filter(r => r.제품 && r.제품.카테고리 === k);
    const g0 = 전.filter(r => r.제품 && r.제품.카테고리 === k);
    console.log(' ', k.padEnd(8), 'n=' + String(g.length).padStart(2), 몫(안5(g0), g0.length).padStart(5), '→', 몫(안5(g), g.length).padStart(5));
  }
})();
