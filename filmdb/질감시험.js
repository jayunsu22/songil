const sharp = require('sharp');
const fs = require('fs');
const arr = JSON.parse(fs.readFileSync('../film/film-db.json','utf8'));

// 잔결(거칠기) 측정: 큰 무늬를 걷어내고 남는 미세한 요철만 본다.
// 엠보싱은 미세한 그림자를 만들고, 나뭇결은 큰 무늬라 흐리면 사라진다.
// 어두운 필름이 무조건 매끈해 보이지 않게 밝기로 나눠서 정규화한다.
async function 잔결(파일) {
  const 원 = sharp(파일).greyscale();
  const { data, info } = await 원.raw().toBuffer({ resolveWithObject: true });
  const 흐림 = await sharp(파일).greyscale().blur(2.2).raw().toBuffer();
  let 합 = 0, 밝기합 = 0, n = 0;
  const W = info.width, H = info.height;
  // 가장자리는 잘린 부분이 섞이므로 안쪽만 본다
  for (let y = Math.floor(H*0.1); y < H*0.9; y++)
    for (let x = Math.floor(W*0.1); x < W*0.9; x++) {
      const i = y*W + x;
      합 += Math.abs(data[i] - 흐림[i]);
      밝기합 += data[i];
      n++;
    }
  const 평균밝기 = 밝기합 / n;
  return (합 / n) / Math.max(20, 평균밝기) * 100;
}

(async () => {
  const 무리 = {
    '엠보스+솔리드엠보': arr.filter(p=>/엠보/.test(p.세부분류||'')),
    '민 솔리드':        arr.filter(p=>p.세부분류==='솔리드'),
    '수퍼매트/소프트매트': arr.filter(p=>/매트/.test(p.세부분류||'')),
    '패브릭/텍스타일':    arr.filter(p=>/패브릭|텍스타일/.test(p.세부분류||'')),
    '스타코/콘크리트':    arr.filter(p=>/스타코|콘크리트/.test(p.세부분류||'')),
    '메탈':             arr.filter(p=>p.카테고리==='메탈'),
    '우드':             arr.filter(p=>p.카테고리==='우드'),
  };
  const 중앙 = a => { const b=[...a].sort((x,y)=>x-y); return b[Math.floor(b.length/2)]; };
  console.log('무리                  n    잔결 중앙   25%    75%');
  for (const [이름, 목] of Object.entries(무리)) {
    const 뽑 = 목.filter(p=>!p.사진무효).slice(0, 60);
    const 값 = [];
    for (const p of 뽑) {
      const f = '../film/img/card/' + p.키 + '.webp';   // 디스크에는 한글 그대로 저장돼 있다
      if (!fs.existsSync(f)) continue;
      try { 값.push(await 잔결(f)); } catch(e) {}
    }
    if (!값.length) { console.log(이름.padEnd(20), '측정 실패'); continue; }
    값.sort((a,b)=>a-b);
    console.log(이름.padEnd(20), String(값.length).padStart(3),
      중앙(값).toFixed(2).padStart(9),
      값[Math.floor(값.length*0.25)].toFixed(2).padStart(7),
      값[Math.floor(값.length*0.75)].toFixed(2).padStart(7));
  }
})();
