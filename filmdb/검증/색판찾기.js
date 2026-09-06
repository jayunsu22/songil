// 샘플북 사진에서 색판(swatch) 사각형을 자동으로 찾는다.
// 완전 자동을 믿지 않는다. 찾은 결과를 사진 위에 번호로 그려 눈으로 확인하는 것이 전제다.
const { sharp, 읽기, 밝기, 종이밝기 } = require('./공용');

// 조건이 참인 픽셀들의 연결 요소(4방향, 반복 스택).
function 덩어리들(폭, 높이, 마스크) {
  const 참 = i => 마스크[i] === 1;
  const 라벨 = new Int32Array(폭 * 높이).fill(-1);
  const 결과 = [], 스택 = new Int32Array(폭 * 높이);
  for (let s = 0; s < 폭 * 높이; s++) {
    if (라벨[s] !== -1 || !참(s)) continue;
    const id = 결과.length;
    let 끝 = 0; 스택[끝++] = s; 라벨[s] = id;
    let 수 = 0, x0 = 폭, x1 = 0, y0 = 높이, y1 = 0, sx = 0, sy = 0;
    while (끝 > 0) {
      const i = 스택[--끝], x = i % 폭, y = (i / 폭) | 0;
      수++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && 라벨[i - 1] === -1 && 참(i - 1)) { 라벨[i - 1] = id; 스택[끝++] = i - 1; }
      if (x < 폭 - 1 && 라벨[i + 1] === -1 && 참(i + 1)) { 라벨[i + 1] = id; 스택[끝++] = i + 1; }
      if (y > 0 && 라벨[i - 폭] === -1 && 참(i - 폭)) { 라벨[i - 폭] = id; 스택[끝++] = i - 폭; }
      if (y < 높이 - 1 && 라벨[i + 폭] === -1 && 참(i + 폭)) { 라벨[i + 폭] = id; 스택[끝++] = i + 폭; }
    }
    결과.push({ id, 수, x0, x1, y0, y1, cx: sx / 수, cy: sy / 수, 씨앗: s });
  }
  return 결과;
}

// 색판끼리는 얇은 흰 여백으로만 갈라져 있어서, 문턱을 낮추면 전부 한 덩어리로 붙는다.
// 침식으로 그 다리를 먼저 끊고 나서 라벨링해야 색판이 낱개로 잡힌다.
function 침식(마스크, 폭, 높이, 번) {
  let a = 마스크;
  for (let t = 0; t < 번; t++) {
    const b = new Uint8Array(a.length);
    for (let y = 1; y < 높이 - 1; y++) for (let x = 1; x < 폭 - 1; x++) {
      const i = y * 폭 + x;
      if (a[i] && a[i - 1] && a[i + 1] && a[i - 폭] && a[i + 폭]) b[i] = 1;
    }
    a = b;
  }
  return a;
}

// 종이 덩어리의 구멍(=색판)을 메워 페이지 실루엣을 만든다.
// 상자만 쓰면 책상·배경이 함께 들어와 전부 한 덩어리로 붙어버린다.
function 구멍메우기(덩어리마스크, 폭, 높이) {
  const 바깥 = new Uint8Array(덩어리마스크.length);
  const 큐 = new Int32Array(덩어리마스크.length);
  let 앞 = 0, 뒤 = 0;
  const 넣 = i => { if (!바깥[i] && !덩어리마스크[i]) { 바깥[i] = 1; 큐[뒤++] = i; } };
  for (let x = 0; x < 폭; x++) { 넣(x); 넣((높이 - 1) * 폭 + x); }
  for (let y = 0; y < 높이; y++) { 넣(y * 폭); 넣(y * 폭 + 폭 - 1); }
  while (앞 < 뒤) {
    const i = 큐[앞++], x = i % 폭, y = (i / 폭) | 0;
    if (x > 0) 넣(i - 1); if (x < 폭 - 1) 넣(i + 1);
    if (y > 0) 넣(i - 폭); if (y < 높이 - 1) 넣(i + 폭);
  }
  const 채움 = new Uint8Array(덩어리마스크.length);
  for (let i = 0; i < 채움.length; i++) if (!바깥[i]) 채움[i] = 1;
  return 채움;
}

// 종이 밝기는 사진 안에서 고르지 않다(조명 기울기·페이지 휨). 밝은 픽셀만 골라
// 2차 곡면을 최소제곱으로 맞춰 "이 자리의 종이는 얼마나 밝아야 하는가"를 만든다.
// 이걸 안 하면 흰색 색판(종이와 밝기차 15 이하)은 절대 문턱으로 못 잡는다.
function 종이곡면(o, 면, P) {
  const A = [], y = [];
  for (let py = 면.y0; py <= 면.y1; py += 3) for (let px = 면.x0; px <= 면.x1; px += 3) {
    const i = py * o.폭 + px, v = 밝기(o, i);
    if (v < P * 0.93) continue;                 // 종이로 볼 만큼 밝은 픽셀만
    const u = (px - 면.x0) / (면.x1 - 면.x0), w = (py - 면.y0) / (면.y1 - 면.y0);
    A.push([1, u, w, u * u, u * w, w * w]); y.push(v);
  }
  // 정규방정식 (6x6) 을 가우스 소거로 푼다.
  const n = 6, M = Array.from({ length: n }, () => new Array(n + 1).fill(0));
  for (let k = 0; k < A.length; k++) for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) M[a][b] += A[k][a] * A[k][b];
    M[a][n] += A[k][a] * y[k];
  }
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-9) return () => P;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let b = c; b <= n; b++) M[r][b] -= f * M[c][b]; }
  }
  const k = M.map((r, a) => r[n] / r[a]);
  return (px, py) => {
    const u = (px - 면.x0) / (면.x1 - 면.x0), w = (py - 면.y0) / (면.y1 - 면.y0);
    return k[0] + k[1] * u + k[2] * w + k[3] * u * u + k[4] * u * w + k[5] * w * w;
  };
}

// 위→아래, 왼→오른쪽. 줄 간격은 색판 높이의 중앙값으로 판단한다.
function 읽는순서(후보) {
  if (!후보.length) return 후보;
  const 높이들 = 후보.map(c => c.y1 - c.y0).sort((a, b) => a - b);
  const 허용 = 높이들[Math.floor(높이들.length / 2)] * 0.55;
  const 정렬 = [...후보].sort((a, b) => a.cy - b.cy);
  const 줄 = [[정렬[0]]];
  for (let i = 1; i < 정렬.length; i++) {
    const 현 = 줄[줄.length - 1];
    if (정렬[i].cy - 현[0].cy <= 허용) 현.push(정렬[i]); else 줄.push([정렬[i]]);
  }
  return 줄.flatMap(r => r.sort((a, b) => a.cx - b.cx));
}

async function 찾기(파일, 설정 = {}) {
  const 폭 = 설정.폭 || 700;
  const o = await 읽기(파일, 폭);
  const P = 종이밝기(o);

  const 종이마스크 = new Uint8Array(o.폭 * o.높이);
  for (let i = 0; i < 종이마스크.length; i++) if (밝기(o, i) >= P * 0.78) 종이마스크[i] = 1;
  const 종이덩어리들 = 덩어리들(o.폭, o.높이, 종이마스크);
  const 큰 = 종이덩어리들.sort((a, b) => b.수 - a.수)[0];
  const 면 = { x0: 큰.x0, x1: 큰.x1, y0: 큰.y0, y1: 큰.y1 };
  const 종이 = 종이곡면(o, 면, P);

  // 가장 큰 종이 덩어리만 남긴 뒤 구멍을 메우고, 가장자리를 깎아 페이지 안쪽만 남긴다.
  const 그덩어리 = new Uint8Array(o.폭 * o.높이);
  {
    const 라벨 = new Int32Array(o.폭 * o.높이).fill(-1), 스택 = new Int32Array(o.폭 * o.높이);
    // 중심점은 색판 구멍에 빠질 수 있다. 라벨링 때 기억해 둔 씨앗 픽셀을 쓴다.
    let 끝 = 0; const 씨 = 큰.씨앗;
    스택[끝++] = 씨; 라벨[씨] = 1; 그덩어리[씨] = 1;
    while (끝 > 0) {
      const i = 스택[--끝], x = i % o.폭, y = (i / o.폭) | 0;
      const ns = [x > 0 ? i - 1 : -1, x < o.폭 - 1 ? i + 1 : -1, y > 0 ? i - o.폭 : -1, y < o.높이 - 1 ? i + o.폭 : -1];
      for (const j of ns) if (j >= 0 && 라벨[j] === -1 && 종이마스크[j]) { 라벨[j] = 1; 그덩어리[j] = 1; 스택[끝++] = j; }
    }
  }
  const 페이지 = 침식(구멍메우기(그덩어리, o.폭, o.높이), o.폭, o.높이, 설정.가장자리 ?? 10);

  const 어두움문턱 = 설정.어두움 ?? 5;   // 종이 곡면보다 이만큼 어두우면 색판 후보
  const 채도문턱 = 설정.채도 ?? 10;
  const 최소 = 설정.최소 ?? 0.004, 최대 = 설정.최대 ?? 0.30, 채움문턱 = 설정.채움 ?? 0.6;

  const 마스크 = new Uint8Array(o.폭 * o.높이);
  for (let y = 면.y0; y <= 면.y1; y++) for (let x = 면.x0; x <= 면.x1; x++) {
    const i = y * o.폭 + x;
    if (!페이지[i]) continue;
    const r = o.data[i * o.채널], g = o.data[i * o.채널 + 1], b = o.data[i * o.채널 + 2];
    if ((종이(x, y) - 밝기(o, i)) > 어두움문턱 || (Math.max(r, g, b) - Math.min(r, g, b)) > 채도문턱) 마스크[i] = 1;
  }
  const 깎음 = 설정.침식 ?? 4;
  const 면적 = (면.x1 - 면.x0) * (면.y1 - 면.y0);
  const 전부 = 덩어리들(o.폭, o.높이, 침식(마스크, o.폭, o.높이, 깎음));
  const 후보 = 읽는순서(전부.filter(c => {
    const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1, 채움 = c.수 / (w * h), 비 = w / h;
    return c.수 > 면적 * 최소 && c.수 < 면적 * 최대 && 채움 > 채움문턱 && 비 > 0.3 && 비 < 6;
  }));
  // 침식으로 줄어든 만큼 상자를 되돌린다(중심은 영향 없음).
  후보.forEach(c => { c.x0 -= 깎음; c.x1 += 깎음; c.y0 -= 깎음; c.y1 += 깎음; });
  return { o, 면, 후보, 전부 };
}

async function 그리기(결과, 저장) {
  const { o, 면, 후보 } = 결과;
  const 조각 = 후보.map((c, n) =>
    `<rect x="${c.x0}" y="${c.y0}" width="${c.x1 - c.x0}" height="${c.y1 - c.y0}" fill="none" stroke="#ff0080" stroke-width="2"/>` +
    `<circle cx="${c.cx.toFixed(0)}" cy="${c.cy.toFixed(0)}" r="13" fill="#ff0080"/>` +
    `<text x="${c.cx.toFixed(0)}" y="${(c.cy + 5).toFixed(0)}" font-size="15" fill="#fff" text-anchor="middle" font-family="sans-serif">${n + 1}</text>`).join('');
  const svg = `<svg width="${o.폭}" height="${o.높이}"><rect x="${면.x0}" y="${면.y0}" width="${면.x1 - 면.x0}" height="${면.y1 - 면.y0}" fill="none" stroke="#00c8ff" stroke-width="2"/>${조각}</svg>`;
  await sharp({ create: { width: o.폭, height: o.높이, channels: 3, background: '#000' } })
    .composite([{ input: o.data, raw: { width: o.폭, height: o.높이, channels: o.채널 } }, { input: Buffer.from(svg) }])
    .jpeg({ quality: 90 }).toFile(저장);
}

module.exports = { 찾기, 그리기 };
