// 얼마나 되돌릴 것인가(세기), 바닥값을 얼마나 뺄 것인가(검은점분위).
// 우드는 DB의 45% 이고 실제로 가장 많이 찍는 대상이라 우드를 따로 본다.
const { 재기 } = require('./측정');
const 몫 = (a, b) => b ? (a / b * 100).toFixed(0) + '%' : '-';
const 안에 = (기, n) => 기.filter(r => r.순위 && r.순위 <= n).length;
const 중앙 = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
(async () => {
  console.log('세기  검은점  전체5위 우드5위 솔리드5위  ΔE중앙  우드ΔE  da중앙  dL중앙');
  for (const 세기 of [0.5, 0.7, 0.85, 1.0])
    for (const 분위 of [0.005, 0.02, 0.05]) {
      const 기 = await 재기({ 보정: '흰점', 기준: 245, 검은점빼기: true, 검은점분위: 분위,
                              한계: 2.5, 세기, 상한: 12, 개수: 30 });
      const 유 = 기.filter(r => r.제품 && r.사진lab);
      const 우 = 유.filter(r => r.제품.카테고리 === '우드');
      const 솔 = 기.filter(r => r.제품 && r.제품.카테고리 === '솔리드');
      console.log(String(세기).padEnd(5), String(분위).padEnd(7),
        몫(안에(기, 5), 기.length).padStart(6), 몫(안에(우, 5), 우.length).padStart(7), 몫(안에(솔, 5), 솔.length).padStart(8),
        중앙(유.map(r => r.ΔE정답)).toFixed(2).padStart(8),
        중앙(우.map(r => r.ΔE정답)).toFixed(2).padStart(7),
        중앙(유.map(r => r.사진lab.a - r.제품.lab.a)).toFixed(1).padStart(7),
        중앙(유.map(r => r.사진lab.L - r.제품.lab.L)).toFixed(1).padStart(7));
    }
})();
