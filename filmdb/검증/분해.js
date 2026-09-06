// 오차를 두 몫으로 가른다.
//  ① 사진 한 장 전체에 걸린 일정한 왜곡(노출·화이트밸런스) — 원리상 보정 가능
//  ② 그걸 다 걷어내도 남는 것 — 샘플북 인쇄색과 DB색이 애초에 다른 부분
// ②를 재려고 "정답을 알고 그 쪽에 가장 잘 맞는 변환"을 억지로 맞춰본다.
// 실제로는 쓸 수 없는 반칙이지만, 남는 오차의 하한선을 알려준다.
const { 재기 } = require('./측정');
const C = require('../../film_color.js');

// Lab 3채널 각각을 (L,a,b,1) 의 1차식으로 맞춘다 (쪽 단위 최소제곱).
function 맞추기(점들, 뽑기) {
  const n = 4;
  const S = Array.from({ length: n }, () => new Array(n + 1).fill(0));
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

const 중앙 = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };

(async () => {
  const 기록 = (await 재기()).filter(r => r.제품 && r.사진lab);
  console.log('쪽              n   보정전 ΔE중앙   쪽단위 최적보정 후 ΔE중앙');
  const 전부 = [];
  for (const 쪽 of [...new Set(기록.map(r => r.쪽))]) {
    const g = 기록.filter(r => r.쪽 === 쪽);
    if (g.length < 5) { console.log(쪽.padEnd(16), g.length, '  (표본이 적어 건너뜀)'); continue; }
    const fL = 맞추기(g, p => p.제품.lab.L), fa = 맞추기(g, p => p.제품.lab.a), fb = 맞추기(g, p => p.제품.lab.b);
    const 전 = g.map(r => r.ΔE정답);
    const 후 = g.map(r => C.deltaE2000({ L: fL(r.사진lab), a: fa(r.사진lab), b: fb(r.사진lab) }, r.제품.lab));
    전부.push(...후);
    console.log(쪽.padEnd(16), String(g.length).padStart(2), 중앙(전).toFixed(2).padStart(12), 중앙(후).toFixed(2).padStart(22));
  }
  console.log('\n전체 보정 후 ΔE  중앙', 중앙(전부).toFixed(2),
    '| 2 이하', (전부.filter(v => v <= 2).length / 전부.length * 100).toFixed(0) + '%',
    '| 5 이하', (전부.filter(v => v <= 5).length / 전부.length * 100).toFixed(0) + '%');
})();
