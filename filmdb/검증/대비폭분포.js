// 사진에서 뽑은 대비폭이 카테고리별로 어떻게 분포하는가. 무늬문턱을 정하려면 이걸 봐야 한다.
// DB 의 대비폭(제품 스캔)과 사진의 대비폭(폰 촬영)은 다른 분포다 - 사진은 인쇄 결·조명·노이즈가 얹힌다.
const { 재기 } = require('./측정');
const 배포 = { 보정: '흰점', 기준: 245, 검은점빼기: true, 검은점분위: 0.005, 한계: 2.5, 무채색문턱: 0.18, 세기: 0.6, 상한: 12, 개수: 30, 넓은원: false };
const q = (a, p) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor((b.length - 1) * p)]; };
(async () => {
  const 기 = (await 재기(배포)).filter(r => r.제품 && Number.isFinite(r.대비폭));
  for (const k of ['솔리드', '우드', '메탈']) {
    const v = 기.filter(r => r.제품.카테고리 === k).map(r => r.대비폭);
    const db = 기.filter(r => r.제품.카테고리 === k).map(r => r.제품.대비폭).filter(Number.isFinite);
    console.log(k.padEnd(5), 'n=' + v.length, '| 사진 대비폭 10%', q(v, .1).toFixed(1), '중앙', q(v, .5).toFixed(1), '90%', q(v, .9).toFixed(1),
      '| 같은 제품 DB 대비폭 중앙', q(db, .5).toFixed(1));
  }
  console.log('');
  for (const t of [2.5, 3, 4, 5, 6, 7, 8]) {
    const 솔 = 기.filter(r => r.제품.카테고리 === '솔리드').map(r => r.대비폭);
    const 우 = 기.filter(r => r.제품.카테고리 === '우드').map(r => r.대비폭);
    console.log('문턱 ' + t + ': 솔리드 사진 중 ' + (솔.filter(v => v < t).length / 솔.length * 100).toFixed(0) + '% 가 아래 · 우드 사진 중 ' + (우.filter(v => v >= t).length / 우.length * 100).toFixed(0) + '% 가 위');
  }
})();
