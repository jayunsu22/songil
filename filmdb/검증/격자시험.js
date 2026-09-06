const { 칸중심들 } = require('./격자');
const { sharp } = require('./공용');
const 쪽목록 = require('./쪽목록');
const 밖 = 'C:/Users/PC24-12/AppData/Local/Temp/claude/D--n8n-1-------/a018678d-624b-4e45-b417-4b65c71a280e/scratchpad/검증';
// 쪽별로 앞선 실험에서 가장 깔끔했던 문턱값
const 설정표 = {
  'p14': { 어두움: 25, 채도: 6, 침식: 2 }, 'p15': { 어두움: 25, 채도: 6, 침식: 4 },
  'p23': { 어두움: 25, 채도: 6, 침식: 7 }, 'p72': { 어두움: 18, 채도: 18, 침식: 5 },
  'p75': { 어두움: 18, 채도: 18, 침식: 5 }, 'p77': { 어두움: 18, 채도: 18, 침식: 5 },
  'p78': { 어두움: 18, 채도: 18, 침식: 5 }, 'p101': { 어두움: 4, 채도: 8, 침식: 3 },
  'p107': { 어두움: 13, 채도: 13, 침식: 5 }, 'p17': { 어두움: 8, 채도: 6, 침식: 7 },
  'p18': { 어두움: 4, 채도: 16, 침식: 7 }, 'p19': { 어두움: 9, 채도: 10, 침식: 5 },
  'p20': { 어두움: 9, 채도: 10, 침식: 5 },
};
(async () => {
  for (const 쪽 of 쪽목록) {
    if (!쪽.배치) { console.log(쪽.쪽.padEnd(16), '격자 없음 — 따로 처리'); continue; }
    const 이름 = 쪽.쪽.split(' ')[0];
    const g = await 칸중심들(쪽, 설정표[이름]);
    if (g.오류) { console.log(쪽.쪽.padEnd(16), '✗', g.오류); continue; }
    const o = g.r.o;
    const svg = `<svg width="${o.폭}" height="${o.높이}">` + g.중심.map((c, n) =>
      `<circle cx="${c.cx.toFixed(0)}" cy="${c.cy.toFixed(0)}" r="${(g.색판폭 * 0.22).toFixed(0)}" fill="none" stroke="#ff0080" stroke-width="3"/>` +
      `<text x="${c.cx.toFixed(0)}" y="${(c.cy + 6).toFixed(0)}" font-size="17" fill="#ff0080" text-anchor="middle" font-family="sans-serif" font-weight="bold">${쪽.코드[n]}</text>`).join('') + '</svg>';
    await sharp({ create: { width: o.폭, height: o.높이, channels: 3, background: '#000' } })
      .composite([{ input: o.data, raw: { width: o.폭, height: o.높이, channels: o.채널 } }, { input: Buffer.from(svg) }])
      .jpeg({ quality: 88 }).toFile(`${밖}/격자_${이름}.jpg`);
    console.log(쪽.쪽.padEnd(16), '검출', String(g.r.후보.length).padStart(2), '→ 칸', String(g.중심.length).padStart(2),
      '| 잔차 중앙', g.잔차중앙.toFixed(1), '최대', g.잔차최대.toFixed(1), 'px (색판폭', g.색판폭, 'px)');
  }
})();
