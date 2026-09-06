// 쪽마다 문턱값을 바꿔가며 "기대한 색판 개수"가 나오는 조합을 찾는다.
const { 찾기 } = require('./색판찾기');
const 쪽목록 = require('./쪽목록');
(async () => {
  for (const p of 쪽목록) {
    const 기대 = p.코드.length; const 성공 = [];
    for (const 어두움 of [4, 6, 9, 13, 18, 25, 34])
      for (const 침식 of [3, 5, 7, 9]) {
        try {
          const r = await 찾기(p.파일, { 어두움, 채도: Math.max(8, 어두움), 침식 });
          if (r.후보.length === 기대) 성공.push({ 어두움, 침식 });
        } catch (e) { }
      }
    console.log(p.쪽.padEnd(16), '기대', String(기대).padStart(2),
      성공.length ? '→ ' + 성공.slice(0, 4).map(s => `어두움${s.어두움}/침식${s.침식}`).join('  ') : '→ 맞는 조합 없음');
  }
})();
