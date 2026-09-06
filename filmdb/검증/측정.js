// 정답을 아는 사진에서 색을 뽑아 실제로 검색해보고, 정답이 몇 등에 오는지 잰다.
// 앱(film_app.js)이 하는 것과 똑같은 순서를 밟아야 의미가 있다:
//   ① EXIF 회전  ② 긴 변 1400 으로 축소  ③ 반지름 = 폭*3.5% 의 원  ④ 영역색  ⑤ M.검색
const path = require('path');
const { sharp, 원본폴더 } = require('./공용');
const C = require('../../film_color.js');
const M = require('../../film_match.js');
const 전체 = JSON.parse(require('fs').readFileSync('../film/film-db.json', 'utf8'));
const 점목록 = require('./점.json');

const 노멀 = s => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');

async function 사진준비(파일) {
  // 앱은 createImageBitmap(imageOrientation:'from-image') 뒤 긴 변 1400 으로 줄인다.
  const m = await sharp(path.join(원본폴더, 파일)).rotate().metadata();
  const 배 = Math.min(1, 1400 / Math.max(m.width, m.height));
  const w = Math.max(1, Math.round(m.width * 배)), h = Math.max(1, Math.round(m.height * 배));
  const { data, info } = await sharp(path.join(원본폴더, 파일)).rotate().resize(w, h, { fit: 'fill' })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, 폭: info.width, 높이: info.height };
}

// 사진 전체에서 조명색을 추정한다.
//  '흰점' : 가장 밝은 쪽 픽셀들을 흰색으로 보고 그 색을 기준 삼는다 (종이·벽지가 있는 사진에 맞다)
//  '회색' : 화면 전체 평균이 회색이라고 보는 고전적인 그레이월드
function 조명추정(사진, 방식) {
  const N = 사진.폭 * 사진.높이;
  if (방식 === '회색') {
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < N; i++) { r += 사진.data[i * 4]; g += 사진.data[i * 4 + 1]; b += 사진.data[i * 4 + 2]; }
    return [r / N, g / N, b / N];
  }
  // 밝기 상위 2% 픽셀의 평균색
  const 밝기 = new Float32Array(N);
  for (let i = 0; i < N; i++) 밝기[i] = 0.299 * 사진.data[i * 4] + 0.587 * 사진.data[i * 4 + 1] + 0.114 * 사진.data[i * 4 + 2];
  const 정렬 = Float32Array.from(밝기).sort();
  const 문턱 = 정렬[Math.floor(N * 0.98)];
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < N; i++) if (밝기[i] >= 문턱) { r += 사진.data[i * 4]; g += 사진.data[i * 4 + 1]; b += 사진.data[i * 4 + 2]; n++; }
  return n ? [r / n, g / n, b / n] : [255, 255, 255];
}

// 조명색이 회색이 되도록 채널별로 곱해준다 (폰 카메라). 초록을 기준으로 맞춘다.
function 보정하기(사진, 방식) {
  const [r, g, b] = 조명추정(사진, 방식);
  const kr = g / Math.max(1, r), kb = g / Math.max(1, b);
  const 새 = new Uint8Array(사진.data.length);
  for (let i = 0; i < 사진.폭 * 사진.높이; i++) {
    새[i * 4] = Math.min(255, 사진.data[i * 4] * kr);
    새[i * 4 + 1] = 사진.data[i * 4 + 1];
    새[i * 4 + 2] = Math.min(255, 사진.data[i * 4 + 2] * kb);
    새[i * 4 + 3] = 255;
  }
  return { ...사진, data: 새, 조명: [r, g, b] };
}

function 원영역(사진, cx, cy, 반지름) {
  const x0 = Math.max(0, cx - 반지름), y0 = Math.max(0, cy - 반지름);
  const x1 = Math.min(사진.폭, cx + 반지름), y1 = Math.min(사진.높이, cy + 반지름);
  const 뽑음 = [], r2 = 반지름 * 반지름;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy > r2) continue;
    const i = (y * 사진.폭 + x) * 4;
    뽑음.push(사진.data[i], 사진.data[i + 1], 사진.data[i + 2], 사진.data[i + 3]);
  }
  return C.영역색(뽑음);
}

async function 재기(옵션 = {}) {
  const 반지름비 = 옵션.반지름비 ?? 0.035;
  const 검색옵션 = { 개수: 옵션.개수 ?? 30, 대비가중치: 옵션.대비가중치, kL: 옵션.kL, 상한: 옵션.상한 };
  const 기록 = [];
  for (const 쪽 of 점목록) {
    let 사진 = await 사진준비(쪽.파일);
    if (옵션.보정) 사진 = 보정하기(사진, 옵션.보정);
    const 반지름 = Math.max(8, Math.round(사진.폭 * 반지름비));
    for (const pt of 쪽.점) {
      const 정답 = 전체.find(p => 노멀(p.코드) === 노멀(pt.코드));
      if (!정답) { 기록.push({ 쪽: 쪽.쪽, 코드: pt.코드, 순위: null, 사유: 'DB에 없음' }); continue; }
      const 색 = 원영역(사진, Math.round(pt.x * 사진.폭), Math.round(pt.y * 사진.높이), 반지름);
      if (!색) { 기록.push({ 쪽: 쪽.쪽, 코드: pt.코드, 순위: null, 사유: '색 못 뽑음' }); continue; }
      const 질의 = { lab: 색.대표색, 대비폭: 색.대비폭 };
      const 결과 = M.검색(전체, 질의, null, 검색옵션);
      const 순위 = 결과.findIndex(r => r.제품.id === 정답.id);
      기록.push({
        쪽: 쪽.쪽, 코드: pt.코드, 제품: 정답,
        순위: 순위 < 0 ? null : 순위 + 1,
        후보수: 결과.length,
        ΔE정답: M.검색([정답], 질의, null, { 개수: 1, 상한: 999 })[0]?.ΔE ?? null,
        대비폭: 색.대비폭, 균일도: 색.균일도, 사진lab: 색.대표색,
      });
    }
  }
  return 기록;
}

module.exports = { 재기 };
