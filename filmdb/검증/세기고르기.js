// n=87 에서 '상위5위 적중률' 은 한 건이 1.1%p 라 노이즈가 크다.
// 설정은 건별 ΔE 가 좋아졌는지(연속량)로 고른다. 그게 훨씬 덜 흔들린다.
const { 재기 } = require('./측정');
const 중앙 = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
(async () => {
  const 기준선 = await 재기({ 상한: 999, 개수: 30 });
  const 원 = new Map(기준선.filter(r => r.제품).map(r => [r.쪽 + '|' + r.코드, r.ΔE정답]));
  console.log('세기   전체ΔE  우드ΔE  솔리드ΔE   좋아진비율  나빠진비율   크게나빠짐(+2 이상)');
  for (const 세기 of [0, 0.4, 0.6, 0.75, 0.85, 1.0]) {
    const 기 = 세기 === 0 ? 기준선
      : await 재기({ 보정: '흰점', 기준: 245, 검은점빼기: true, 검은점분위: 0.005, 한계: 2.5, 세기, 상한: 999, 개수: 30 });
    const 유 = 기.filter(r => r.제품 && r.사진lab);
    const 차 = 유.map(r => r.ΔE정답 - 원.get(r.쪽 + '|' + r.코드));
    const 우 = 유.filter(r => r.제품.카테고리 === '우드'), 솔 = 유.filter(r => r.제품.카테고리 === '솔리드');
    const 몫 = n => (n / 차.length * 100).toFixed(0) + '%';
    console.log(String(세기).padEnd(6),
      중앙(유.map(r => r.ΔE정답)).toFixed(2).padStart(6),
      중앙(우.map(r => r.ΔE정답)).toFixed(2).padStart(7),
      중앙(솔.map(r => r.ΔE정답)).toFixed(2).padStart(8),
      몫(차.filter(v => v < -0.2).length).padStart(11),
      몫(차.filter(v => v > 0.2).length).padStart(11),
      몫(차.filter(v => v > 2).length).padStart(18));
  }
})();
