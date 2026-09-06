// 배포하는 설정 그대로 재본다. 앱과 다른 값을 쓰면 이 숫자는 의미가 없다.
const { 재기 } = require('./측정');
// film_app.js 의 보정설정과 반드시 같아야 한다. 다르면 이 숫자는 앱 이야기가 아니게 된다.
const 배포설정 = { 보정: '흰점', 기준: 245, 검은점빼기: true, 검은점분위: 0.005, 한계: 2.5, 무채색문턱: 0.18, 세기: 0.6, 상한: 12, 개수: 30 };
const 몫 = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '-';
const 안에 = (기, n) => 기.filter(r => r.순위 && r.순위 <= n).length;
const 중앙 = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const 줄 = (이름, 기) => console.log(이름.padEnd(17), ('n=' + 기.length).padEnd(6),
  '1위', 몫(안에(기, 1), 기.length).padStart(6), '5위내', 몫(안에(기, 5), 기.length).padStart(6),
  '10위내', 몫(안에(기, 10), 기.length).padStart(6), '30위내', 몫(안에(기, 30), 기.length).padStart(6));
(async () => {
  const 전 = await 재기({ 상한: 5, 개수: 30 });                 // 예전 설정
  const 후 = await 재기(배포설정);                              // 새 설정
  console.log('=== 전체 ===');
  줄('예전(상한5,보정없음)', 전);
  줄('새 설정', 후);
  const 유전 = 전.filter(r => r.제품 && r.사진lab), 유후 = 후.filter(r => r.제품 && r.사진lab);
  console.log('\n사진색 오차 ΔE 중앙   ', 중앙(유전.map(r => r.ΔE정답)).toFixed(2), '→', 중앙(유후.map(r => r.ΔE정답)).toFixed(2));
  console.log('L* 편차 중앙          ', 중앙(유전.map(r => r.사진lab.L - r.제품.lab.L)).toFixed(1), '→', 중앙(유후.map(r => r.사진lab.L - r.제품.lab.L)).toFixed(1));
  console.log('b* 편차 중앙          ', 중앙(유전.map(r => r.사진lab.b - r.제품.lab.b)).toFixed(1), '→', 중앙(유후.map(r => r.사진lab.b - r.제품.lab.b)).toFixed(1));
  console.log('상한에 걸려 탈락한 건수 ', 유전.filter(r => r.ΔE정답 > 5).length, '→', 유후.filter(r => r.ΔE정답 > 12).length, '/ 87');
  console.log('\n=== 카테고리별 (새 설정) ===');
  [...new Set(후.map(r => r.제품 && r.제품.카테고리))].filter(Boolean)
    .forEach(k => 줄(k, 후.filter(r => r.제품 && r.제품.카테고리 === k)));
})();
