// 어느 조명 추정 방식이 가장 좋은가. 감으로 고르지 않고 숫자로 고른다.
const { 재기 } = require('./측정');
const 몫 = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '-';
const 안에 = (기, n) => 기.filter(r => r.순위 && r.순위 <= n).length;
const 중앙 = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
(async () => {
  const 후보 = [
    ['보정 없음', {}],
    ['흰점', { 보정: '흰점' }],
    ['그레이월드', { 보정: '회색' }],
    ['멱평균 p=2', { 보정: '멱평균', 지수: 2 }],
    ['멱평균 p=4', { 보정: '멱평균', 지수: 4 }],
    ['멱평균 p=6', { 보정: '멱평균', 지수: 6 }],
    ['멱평균 p=10', { 보정: '멱평균', 지수: 10 }],
  ];
  console.log('방식           상한   1위     5위내   10위내  30위내  정답ΔE중앙  b*편차중앙');
  for (const [이름, 옵션] of 후보)
    for (const 상한 of [5, 12]) {
      const 기 = await 재기({ ...옵션, 상한, 개수: 30 });
      const 유효 = 기.filter(r => r.제품 && r.사진lab);
      console.log(이름.padEnd(14), String(상한).padStart(3),
        몫(안에(기, 1), 기.length).padStart(7), 몫(안에(기, 5), 기.length).padStart(7),
        몫(안에(기, 10), 기.length).padStart(7), 몫(안에(기, 30), 기.length).padStart(7),
        중앙(유효.map(r => r.ΔE정답)).toFixed(2).padStart(10),
        중앙(유효.map(r => r.사진lab.b - r.제품.lab.b)).toFixed(1).padStart(11));
    }
})();
