const { 재기 } = require('./측정');
const 몫 = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '-';
const 안에 = (기, n) => 기.filter(r => r.순위 && r.순위 <= n).length;
const 중앙 = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
(async () => {
  const 후보 = [['보정 없음', {}], ['흰점(색만)', { 보정: '흰점' }]];
  for (const 기준 of [235, 245, 252])
    for (const 검은점빼기 of [false, true])
      후보.push([`흰점+노출 ${기준}${검은점빼기 ? ' +검은점' : ''}`, { 보정: '흰점', 기준, 검은점빼기, 한계: 2.5 }]);
  console.log('방식                      1위     5위내   10위내  30위내   ΔE중앙   dL중앙  da중앙  db중앙');
  for (const [이름, 옵션] of 후보) {
    const 기 = await 재기({ ...옵션, 상한: 12, 개수: 30 });
    const 유 = 기.filter(r => r.제품 && r.사진lab);
    console.log(이름.padEnd(24),
      몫(안에(기, 1), 기.length).padStart(6), 몫(안에(기, 5), 기.length).padStart(7),
      몫(안에(기, 10), 기.length).padStart(7), 몫(안에(기, 30), 기.length).padStart(7),
      중앙(유.map(r => r.ΔE정답)).toFixed(2).padStart(8),
      중앙(유.map(r => r.사진lab.L - r.제품.lab.L)).toFixed(1).padStart(8),
      중앙(유.map(r => r.사진lab.a - r.제품.lab.a)).toFixed(1).padStart(7),
      중앙(유.map(r => r.사진lab.b - r.제품.lab.b)).toFixed(1).padStart(7));
  }
})();
