const { 찾기, 그리기 } = require('./색판찾기');
const 쪽목록 = require('./쪽목록');
const 밖 = 'C:/Users/PC24-12/AppData/Local/Temp/claude/D--n8n-1-------/a018678d-624b-4e45-b417-4b65c71a280e/scratchpad/검증';
const 대상 = process.argv.slice(2);
(async () => {
  for (const p of 쪽목록) {
    if (대상.length && !대상.some(t => p.쪽.includes(t))) continue;
    const 기대 = p.코드.length; let 최선 = null;
    for (const 어두움 of [3, 4, 5, 6, 8, 10, 13, 18, 25])
      for (const 침식 of [2, 3, 4, 5, 7])
        for (const 채도 of [6, 10, 16]) {
          try {
            const r = await 찾기(p.파일, { 어두움, 채도, 침식 });
            const 차 = Math.abs(r.후보.length - 기대);
            if (!최선 || 차 < 최선.차 || (차 === 최선.차 && r.후보.length > 최선.r.후보.length))
              최선 = { 차, r, 설정: { 어두움, 채도, 침식 } };
          } catch (e) { }
        }
    const 이름 = p.쪽.split(' ')[0];
    await 그리기(최선.r, `${밖}/확인_${이름}.jpg`);
    console.log(이름.padEnd(6), '기대', String(기대).padStart(2), '찾음', String(최선.r.후보.length).padStart(2),
      '| 어두움', 최선.설정.어두움, '채도', 최선.설정.채도, '침식', 최선.설정.침식);
  }
})();
