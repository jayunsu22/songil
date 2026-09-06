// 사진의 조명색을 맞춰주면 정확도가 오르는가? 오르면 원인은 카메라이고, 안 오르면 인쇄본 차이다.
const { 재기 } = require('./측정');
const 몫 = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '-';
const 안에 = (기, n) => 기.filter(r => r.순위 && r.순위 <= n).length;
const 중앙 = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
(async () => {
  for (const [이름, 옵션] of [['보정 없음(현재)', {}], ['흰점 보정', { 보정: '흰점' }], ['그레이월드 보정', { 보정: '회색' }]]) {
    const 기 = await 재기(옵션);
    const 유효 = 기.filter(r => r.제품 && r.사진lab);
    const db = 유효.map(r => r.사진lab.b - r.제품.lab.b);
    const dL = 유효.map(r => r.사진lab.L - r.제품.lab.L);
    console.log(이름.padEnd(16),
      '1위', 몫(안에(기, 1), 기.length).padStart(6),
      '5위내', 몫(안에(기, 5), 기.length).padStart(6),
      '10위내', 몫(안에(기, 10), 기.length).padStart(6),
      '| 정답ΔE 중앙', 중앙(유효.map(r => r.ΔE정답)).toFixed(2).padStart(5),
      '| db중앙', 중앙(db).toFixed(1).padStart(6), 'dL중앙', 중앙(dL).toFixed(1).padStart(6));
  }
})();
