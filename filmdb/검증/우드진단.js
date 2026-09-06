const path = require('path');
const { sharp, 원본폴더 } = require('./공용');
const C = require('../../film_color.js');
const 점목록 = require('./점.json');
(async () => {
  console.log('쪽                조명 추정(R,G,B)      이득            검은점        노출맞춤  날아간화소');
  for (const 쪽 of 점목록) {
    const m = await sharp(path.join(원본폴더, 쪽.파일)).rotate().metadata();
    const 배 = Math.min(1, 1400 / Math.max(m.width, m.height));
    const { data, info } = await sharp(path.join(원본폴더, 쪽.파일)).rotate()
      .resize(Math.round(m.width * 배), Math.round(m.height * 배), { fit: 'fill' })
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const 뽑음 = [];
    let 날아감 = 0, 전체 = 0;
    for (let y = 0; y < info.height; y += 4) for (let x = 0; x < info.width; x += 4) {
      const i = (y * info.width + x) * 4;
      뽑음.push(data[i], data[i + 1], data[i + 2], data[i + 3]);
      전체++;
      if (data[i] >= 250 && data[i + 1] >= 250 && data[i + 2] >= 250) 날아감++;
    }
    const 조명 = C.조명추정(뽑음, { 방식: '흰점' });
    const 계수 = C.보정계수(뽑음, { 방식: '흰점', 기준: 245, 검은점빼기: true, 한계: 2.5, 무채색문턱: 0.18 });
    console.log(쪽.쪽.padEnd(16),
      조명.map(v => v.toFixed(0).padStart(4)).join(''), '  ',
      계수.이득.map(v => v.toFixed(2).padStart(6)).join(''), '  ',
      계수.검은점.map(v => String(v).padStart(4)).join(''), '  ',
      String(계수.노출맞춤).padStart(6), (날아감 / 전체 * 100).toFixed(1).padStart(8) + '%');
  }
})();
