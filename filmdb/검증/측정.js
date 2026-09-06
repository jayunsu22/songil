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

// 조명 추정은 화소가 백만 개라 느리다. 격자로 걸러 뽑아도 추정값은 사실상 같다.
// 이 간격은 film_app.js 의 것과 반드시 같아야 한다.
const 표본간격 = 4;

function 조명표본(사진) {
  const 뽑음 = [];
  for (let y = 0; y < 사진.높이; y += 표본간격) for (let x = 0; x < 사진.폭; x += 표본간격) {
    const i = (y * 사진.폭 + x) * 4;
    뽑음.push(사진.data[i], 사진.data[i + 1], 사진.data[i + 2], 사진.data[i + 3]);
  }
  return 뽑음;
}

function 원영역(사진, cx, cy, 반지름, 계수) {
  const x0 = Math.max(0, cx - 반지름), y0 = Math.max(0, cy - 반지름);
  const x1 = Math.min(사진.폭, cx + 반지름), y1 = Math.min(사진.높이, cy + 반지름);
  const 뽑음 = [], r2 = 반지름 * 반지름;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy > r2) continue;
    const i = (y * 사진.폭 + x) * 4;
    뽑음.push(사진.data[i], 사진.data[i + 1], 사진.data[i + 2], 사진.data[i + 3]);
  }
  return C.영역색(계수 ? C.조명보정(뽑음, 계수.이득, 계수.검은점) : 뽑음);
}

async function 재기(옵션 = {}) {
  const 반지름비 = 옵션.반지름비 ?? 0.035;
  const 검색옵션 = { 개수: 옵션.개수 ?? 30, 대비가중치: 옵션.대비가중치, kL: 옵션.kL, 상한: 옵션.상한 };
  const 기록 = [];
  for (const 쪽 of 점목록) {
    const 사진 = await 사진준비(쪽.파일);
    // 앱과 똑같이: 조명은 사진 전체에서 한 번 추정하고, 뽑은 화소에만 이득을 곱한다.
    // 앱과 똑같이: 사진 한 장에서 계수를 한 번 만들고, 뽑은 화소에만 적용한다.
    const 계수 = 옵션.보정 ? C.보정계수(조명표본(사진), {
      방식: 옵션.보정, 지수: 옵션.지수, 한계: 옵션.한계,
      기준: 옵션.기준, 검은점빼기: 옵션.검은점빼기, 검은점분위: 옵션.검은점분위, 무채색문턱: 옵션.무채색문턱, 세기: 옵션.세기, 검은점상한비: 옵션.검은점상한비, 검은점절대상한: 옵션.검은점절대상한,
    }) : null;
    const 반지름 = Math.max(8, Math.round(사진.폭 * 반지름비));
    for (const pt of 쪽.점) {
      const 정답 = 전체.find(p => 노멀(p.코드) === 노멀(pt.코드));
      if (!정답) { 기록.push({ 쪽: 쪽.쪽, 코드: pt.코드, 순위: null, 사유: 'DB에 없음' }); continue; }
      const 색 = 원영역(사진, Math.round(pt.x * 사진.폭), Math.round(pt.y * 사진.높이), 반지름, 계수);
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
