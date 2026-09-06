// 가중치·상한을 바꿔가며 상위5위 적중률을 잰다. 이게 7-2 의 본론이다.
const { 재기 } = require('./측정');
const 몫 = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '-';
const 안에 = (기, n) => 기.filter(r => r.순위 && r.순위 <= n).length;
(async () => {
  console.log('보정      상한  대비가중치   1위     5위내   10위내  30위내');
  for (const 보정 of [null, '흰점'])
    for (const 상한 of [5, 10, 15, 25, 999])
      for (const 대비가중치 of [0.15, 0]) {
        const 기 = await 재기({ 보정, 상한, 대비가중치, 개수: 30 });
        console.log(String(보정 || '없음').padEnd(8), String(상한).padStart(4), String(대비가중치).padStart(9),
          몫(안에(기, 1), 기.length).padStart(8), 몫(안에(기, 5), 기.length).padStart(8),
          몫(안에(기, 10), 기.length).padStart(8), 몫(안에(기, 30), 기.length).padStart(8));
      }
})();
