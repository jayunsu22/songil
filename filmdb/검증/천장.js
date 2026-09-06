// "카메라 보정이 완벽했다면 몇 %인가" — 달성 가능한 천장.
// 각 쪽의 정답들로 그 쪽에 가장 잘 맞는 Lab 1차 변환을 맞춘 뒤(반칙) 다시 검색한다.
const { 재기 } = require('./측정');
const M = require('../../film_match.js');
const 전체 = JSON.parse(require('fs').readFileSync('../film/film-db.json', 'utf8'));
const 몫 = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '-';

function 맞추기(점들, 뽑기) {
  const n = 4, S = Array.from({ length: n }, () => new Array(n + 1).fill(0));
  for (const p of 점들) {
    const v = [p.사진lab.L, p.사진lab.a, p.사진lab.b, 1];
    for (let a = 0; a < n; a++) { for (let b = 0; b < n; b++) S[a][b] += v[a] * v[b]; S[a][n] += v[a] * 뽑기(p); }
  }
  for (let c = 0; c < n; c++) {
    let q = c; for (let r = c + 1; r < n; r++) if (Math.abs(S[r][c]) > Math.abs(S[q][c])) q = r;
    [S[c], S[q]] = [S[q], S[c]];
    if (Math.abs(S[c][c]) < 1e-9) return null;
    for (let r = 0; r < n; r++) if (r !== c) { const f = S[r][c] / S[c][c]; for (let b = c; b <= n; b++) S[r][b] -= f * S[c][b]; }
  }
  const k = S.map((r, a) => r[n] / r[a]);
  return lab => k[0] * lab.L + k[1] * lab.a + k[2] * lab.b + k[3];
}

(async () => {
  const 기록 = (await 재기()).filter(r => r.제품 && r.사진lab);
  for (const 상한 of [5, 999]) {
    const 결과 = [];
    for (const 쪽 of [...new Set(기록.map(r => r.쪽))]) {
      const g = 기록.filter(r => r.쪽 === 쪽);
      if (g.length < 5) continue;
      const fL = 맞추기(g, p => p.제품.lab.L), fa = 맞추기(g, p => p.제품.lab.a), fb = 맞추기(g, p => p.제품.lab.b);
      for (const r of g) {
        const 질의 = { lab: { L: fL(r.사진lab), a: fa(r.사진lab), b: fb(r.사진lab) }, 대비폭: r.대비폭 };
        const 목 = M.검색(전체, 질의, null, { 개수: 30, 상한 });
        const 순위 = 목.findIndex(x => x.제품.id === r.제품.id);
        결과.push({ 순위: 순위 < 0 ? null : 순위 + 1, 쪽 });
      }
    }
    const 안에 = n => 결과.filter(r => r.순위 && r.순위 <= n).length;
    console.log('완벽 보정 가정, 상한', String(상한).padStart(3),
      '| 1위', 몫(안에(1), 결과.length).padStart(6),
      '5위내', 몫(안에(5), 결과.length).padStart(6),
      '10위내', 몫(안에(10), 결과.length).padStart(6),
      '30위내', 몫(안에(30), 결과.length).padStart(6), '(n=' + 결과.length + ')');
    if (상한 === 999) {
      console.log('  쪽별 5위내:');
      [...new Set(결과.map(r => r.쪽))].forEach(k => {
        const g = 결과.filter(r => r.쪽 === k);
        console.log('   ', k.padEnd(16), 몫(g.filter(r => r.순위 && r.순위 <= 5).length, g.length).padStart(6), '(n=' + g.length + ')');
      });
    }
  }
})();
