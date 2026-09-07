const sharp = require('sharp');
const fs = require('fs');
const arr = JSON.parse(fs.readFileSync('../film/film-db.json','utf8'));
async function 잔결(f) {
  const { data, info } = await sharp(f).greyscale().raw().toBuffer({ resolveWithObject: true });
  const 흐림 = await sharp(f).greyscale().blur(2.2).raw().toBuffer();
  let 합 = 0, 밝 = 0, n = 0, W = info.width, H = info.height;
  for (let y = Math.floor(H*0.1); y < H*0.9; y++)
    for (let x = Math.floor(W*0.1); x < W*0.9; x++) {
      const i = y*W + x; 합 += Math.abs(data[i]-흐림[i]); 밝 += data[i]; n++;
    }
  return (합/n) / Math.max(20, 밝/n) * 100;
}
(async () => {
  // 300개를 고르게 뽑아 이미지가 '평평한 색칠'인지 '실제 사진'인지 본다
  const 뽑 = arr.filter((_,i)=>i % Math.floor(arr.length/300) === 0).slice(0,300);
  const 값 = [], 카별 = {};
  for (const p of 뽑) {
    const f = '../film/img/card/' + p.키 + '.webp';
    if (!fs.existsSync(f)) continue;
    try {
      const v = await 잔결(f);
      값.push({ v, p });
      (카별[p.카테고리] = 카별[p.카테고리] || []).push(v);
    } catch(e) {}
  }
  const 평평 = 값.filter(x => x.v < 0.05).length;
  console.log('표본', 값.length, '개');
  console.log('이미지가 사실상 평평한 색칠(잔결<0.05):', 평평, '개 =', (평평/값.length*100).toFixed(0) + '%');
  console.log('\n제조사별 평평한 비율:');
  const 사 = {};
  값.forEach(x => { const m = 사[x.p.제조사] = 사[x.p.제조사] || {n:0, 평:0}; m.n++; if (x.v < 0.05) m.평++; });
  Object.entries(사).forEach(([k,m]) => console.log(' ', k.padEnd(6), String(m.n).padStart(3)+'개 중', String(m.평).padStart(3)+'개 평평', (m.평/m.n*100).toFixed(0)+'%'));
  console.log('\n카테고리별 잔결 중앙값:');
  const 중앙 = a => { const b=[...a].sort((x,y)=>x-y); return b[Math.floor(b.length/2)]; };
  Object.entries(카별).sort((a,b)=>b[1].length-a[1].length).forEach(([k,v]) =>
    console.log(' ', k.padEnd(10), String(v.length).padStart(3), 중앙(v).toFixed(2).padStart(7)));
})();
