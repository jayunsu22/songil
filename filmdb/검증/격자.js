// 검출된 색판 몇 개로 격자를 역산해, 놓친 칸까지 포함한 모든 색판 중심을 만든다.
//
// 왜 이렇게 하나: 흰색 페이지는 색판과 종이의 밝기 차가 15 이하라 자동 검출이
// 16개 중 6개밖에 못 잡는다. 하지만 카탈로그는 규칙적인 격자라서,
// 잡힌 몇 개만 있으면 나머지 위치는 계산으로 정확히 채울 수 있다.
const { 찾기, 그리기 } = require('./색판찾기');

// 1차원 k-평균. 줄/칸 번호를 매기는 데 쓴다.
function 묶기(값들, k) {
  const 정렬 = [...값들].sort((a, b) => a - b);
  let 중심 = Array.from({ length: k }, (_, i) => 정렬[Math.min(정렬.length - 1, Math.floor((i + 0.5) * 정렬.length / k))]);
  for (let t = 0; t < 40; t++) {
    const 합 = new Array(k).fill(0), 수 = new Array(k).fill(0);
    for (const v of 값들) { let b = 0; for (let i = 1; i < k; i++) if (Math.abs(v - 중심[i]) < Math.abs(v - 중심[b])) b = i; 합[b] += v; 수[b]++; }
    const 새 = 중심.map((c, i) => 수[i] ? 합[i] / 수[i] : c);
    if (새.every((v, i) => Math.abs(v - 중심[i]) < 0.01)) { 중심 = 새; break; }
    중심 = 새;
  }
  return v => { let b = 0; for (let i = 1; i < k; i++) if (Math.abs(v - 중심[i]) < Math.abs(v - 중심[b])) b = i; return b; };
}

// (칸, 줄) → (x, y) 아핀 사상을 최소제곱으로 맞춘다.
// 사진이 약간 기울고 원근이 들어가도 아핀이면 색판 안에 점을 넣기에 충분하다.
// 한 줄짜리·한 칸짜리 쪽(p101 처럼 4단 띠)은 그 축이 상수라 정규방정식이 특이해진다.
// 그럴 때는 해당 항을 빼고 푼다.
function 아핀(점들) {
  const 칸변함 = new Set(점들.map(p => p.칸)).size > 1;
  const 줄변함 = new Set(점들.map(p => p.줄)).size > 1;
  const 항 = [p => 1];
  if (칸변함) 항.push(p => p.칸);
  if (줄변함) 항.push(p => p.줄);
  const n = 항.length;
  if (점들.length < n) return null;

  const 풀기 = 값 => {
    const S = Array.from({ length: n }, () => new Array(n + 1).fill(0));
    for (const p of 점들) {
      const v = 항.map(f => f(p));
      for (let a = 0; a < n; a++) { for (let b = 0; b < n; b++) S[a][b] += v[a] * v[b]; S[a][n] += v[a] * 값(p); }
    }
    for (let c = 0; c < n; c++) {
      let q = c; for (let r = c + 1; r < n; r++) if (Math.abs(S[r][c]) > Math.abs(S[q][c])) q = r;
      [S[c], S[q]] = [S[q], S[c]];
      if (Math.abs(S[c][c]) < 1e-9) return null;
      for (let r = 0; r < n; r++) if (r !== c) { const f = S[r][c] / S[c][c]; for (let b = c; b <= n; b++) S[r][b] -= f * S[c][b]; }
    }
    return S.map((r, a) => r[n] / r[a]);
  };
  const kx = 풀기(p => p.cx), ky = 풀기(p => p.cy);
  if (!kx || !ky) return null;
  const 값 = (k, 칸, 줄) => { const p = { 칸, 줄 }; return 항.reduce((s, f, i) => s + k[i] * f(p), 0); };
  return (칸, 줄) => ({ cx: 값(kx, 칸, 줄), cy: 값(ky, 칸, 줄) });
}

// 자동 검출 → 격자 역산 → 모든 칸의 중심.
async function 칸중심들(쪽, 설정) {
  const 줄수 = 쪽.배치.length, 칸수 = Math.max(...쪽.배치);
  const r = await 찾기(쪽.파일, 설정);
  if (r.후보.length < 3) return { 오류: '검출 ' + r.후보.length + '개 — 격자를 세울 수 없다', r };

  const 줄번호 = 묶기(r.후보.map(c => c.cy), Math.min(줄수, r.후보.length));
  const 칸번호 = 묶기(r.후보.map(c => c.cx), Math.min(칸수, r.후보.length));
  const 점들 = r.후보.map(c => ({ cx: c.cx, cy: c.cy, 줄: 줄번호(c.cy), 칸: 칸번호(c.cx) }));

  // 첫 배정(k-평균)은 검출이 드문드문할 때 자주 틀린다.
  // 격자를 맞춘 뒤 각 검출을 "가장 가까운 예측 칸"으로 다시 배정하고 재계산한다.
  const 유효칸 = [];
  쪽.배치.forEach((n2, 줄) => { for (let 칸 = 0; 칸 < n2; 칸++) 유효칸.push({ 줄, 칸 }); });
  let f = 아핀(점들);
  if (!f) return { 오류: '격자 계산 실패', r };
  for (let 회 = 0; 회 < 8; 회++) {
    let 바뀜 = false;
    for (const p of 점들) {
      let 최선 = null, 최소 = Infinity;
      for (const c of 유효칸) {
        const q = f(c.칸, c.줄), d = Math.hypot(p.cx - q.cx, p.cy - q.cy);
        if (d < 최소) { 최소 = d; 최선 = c; }
      }
      if (최선 && (최선.줄 !== p.줄 || 최선.칸 !== p.칸)) { p.줄 = 최선.줄; p.칸 = 최선.칸; 바뀜 = true; }
    }
    const f2 = 아핀(점들);
    if (!f2) break;
    f = f2;
    if (!바뀜) break;
  }

  const 중심 = [];
  쪽.배치.forEach((n, 줄) => { for (let 칸 = 0; 칸 < n; 칸++) 중심.push({ ...f(칸, 줄), 줄, 칸 }); });

  // 잔차: 검출된 점이 예측 위치에서 얼마나 벗어나는가. 격자가 맞는지 판정하는 숫자.
  const 잔차 = 점들.map(p => { const q = f(p.칸, p.줄); return Math.hypot(p.cx - q.cx, p.cy - q.cy); });
  잔차.sort((a, b) => a - b);
  const 폭 = r.후보.map(c => c.x1 - c.x0).sort((a, b) => a - b);
  return { 중심, r, 잔차중앙: 잔차[Math.floor(잔차.length / 2)], 잔차최대: 잔차[잔차.length - 1], 색판폭: 폭[Math.floor(폭.length / 2)] };
}

module.exports = { 칸중심들, 그리기 };
