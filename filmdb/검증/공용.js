// 검증 사진에서 색판 위치를 잡고 매칭 정확도를 재는 도구들의 공용 부분.
const sharp = require('sharp');
const path = require('path');

const 원본폴더 = 'D:/n8n_1분견적(필름)/검증사진';

// 사진은 전부 EXIF orientation=6(세로로 찍고 가로로 저장)이다.
// .rotate() 를 빼먹으면 좌표가 90도 어긋나므로 반드시 거쳐야 한다.
async function 읽기(파일, 폭) {
  const { data, info } = await sharp(path.join(원본폴더, 파일))
    .rotate().resize({ width: 폭 }).raw().toBuffer({ resolveWithObject: true });
  return { data, 폭: info.width, 높이: info.height, 채널: info.channels };
}

const 밝기 = (o, i) => 0.299 * o.data[i * o.채널] + 0.587 * o.data[i * o.채널 + 1] + 0.114 * o.data[i * o.채널 + 2];

// 종이의 대표 밝기. 밝은 쪽 히스토그램의 최빈값을 쓴다.
function 종이밝기(o) {
  const h = new Array(256).fill(0);
  for (let i = 0; i < o.폭 * o.높이; i++) h[Math.round(밝기(o, i))]++;
  let 최대 = 0, 값 = 255;
  for (let v = 140; v < 256; v++) if (h[v] > 최대) { 최대 = h[v]; 값 = v; }
  return 값;
}

module.exports = { sharp, 원본폴더, 읽기, 밝기, 종이밝기 };
