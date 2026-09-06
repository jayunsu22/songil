#!/usr/bin/env node
// 제조사 이미지를 내려받아 우리 쪽에 미러링하고, 제품당 3점 색을 뽑는다.
//
// 미러링이 필요한 이유는 두 가지다.
//  1) LX(lxbenifdesign.com)와 현대(ebodaq.com)는 http 전용이다. https 사이트에서
//     <img src="http://..."> 는 브라우저가 mixed content 로 차단한다. 978건, 전체의 47.8%.
//  2) 어차피 전 이미지를 디코딩하니, 그때 밝은색/어두운색을 같이 뽑아두면 추가 비용이 0이다.
//     나중에 하려면 2,100장을 처음부터 다시 받아야 한다.
//
// 색 추출은 film_color.js 의 영역색() 을 그대로 쓴다. 화면에서 사용자 사진을 처리할 때와
// 같은 함수여야 값이 어긋나지 않는다. 여기서 별도 구현을 만들면 안 된다.
//
// 사용법:
//   node filmdb/mirror.js --limit 30    먼저 30건으로 확인
//   node filmdb/mirror.js               전량 (이미 받은 건 건너뜀)
//   node filmdb/mirror.js --force       처음부터 다시

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { 영역색, 균일도, rgb를hex, hex를lab, deltaE2000 } = require('../film_color.js');

const 캐시   = path.join(__dirname, 'cache', 'films.json');
const 결과경로 = path.join(__dirname, 'cache', 'colors.json');
const 미러   = path.join(__dirname, 'mirror');

const 격자 = 96;    // 결과 격자용
const 상세 = 400;   // 상세 화면용
const 동시 = 4;     // 제조사 서버를 때리지 않도록 낮게 잡는다
const 재시도 = 2;

const 인자 = process.argv.slice(2);
const 제한 = (() => { const i = 인자.indexOf('--limit'); return i >= 0 ? +인자[i + 1] : Infinity; })();
const 강제 = 인자.includes('--force');

// 영림 URL 은 경로에 한글이 들어있어 인코딩이 필요하다.
// 그런데 encodeURI(decodeURI(u)) 로 하면 안 된다. 한솔 URL 은 쿼리에 %2B(=+)가 들어있는데,
// decodeURI 가 그걸 '+' 로 풀고 encodeURI 는 '+' 를 다시 인코딩하지 않아 파라미터가 깨진다.
// 한솔 71건이 전부 이 패턴이라 통째로 실패한다.
// new URL() 은 경로의 비ASCII 만 인코딩하고 이미 인코딩된 부분은 그대로 둔다.
function URL정리(u) {
  const s = String(u || '').trim();
  try { return new URL(s).href; }
  catch { return s; }
}

// 제조사+코드가 고유키다. 코드만으로는 브랜드 간 중복이 있다.
function 파일키(f) {
  const s = `${f.제조사}_${f.코드}`.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/-+/g, '-');
  return s.slice(0, 80);
}

async function 받기(url) {
  let 마지막;
  for (let 회 = 0; 회 <= 재시도; 회++) {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 30000);
      const res = await fetch(url, {
        signal: ac.signal,
        // 일부 제조사 서버가 UA 없는 요청을 막는다.
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; filmdamoa-mirror/1.0)' },
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      마지막 = e;
      if (회 < 재시도) await new Promise((r) => setTimeout(r, 800 * (회 + 1)));
    }
  }
  throw 마지막;
}

async function 한건(f) {
  // 원본이 있으면 원본을 쓴다. 약 1260x2800 고해상도라 3점 추출 정확도가 훨씬 높다.
  const 원본있음 = !!f.원본이미지URL;
  const src = URL정리(f.원본이미지URL || f.썸네일URL);
  if (!src) throw new Error('이미지 URL 없음');

  const buf = await 받기(src);
  const 키 = 파일키(f);

  // 색은 가운데 60% 에서 뽑는다. 가장자리에는 촬영 여백이나 그림자가 섞인다.
  // 기존 DB 의 '중앙 10%' 보다 넓게 잡는 이유는, 우드의 결 대비를 재려면
  // 밝은 결과 어두운 결이 함께 들어와야 하기 때문이다. 10% 는 결 하나만 잡힐 수 있다.
  const meta = await sharp(buf).metadata();
  const w = meta.width, h = meta.height;
  const cw = Math.max(1, Math.round(w * 0.6));
  const ch = Math.max(1, Math.round(h * 0.6));
  const 크롭 = { left: Math.round((w - cw) / 2), top: Math.round((h - ch) / 2), width: cw, height: ch };

  // 색 계산용 해상도. 너무 줄이면 가는 나뭇결이 보간으로 뭉개져 대비폭이 실제보다 작게 나온다.
  // 대비폭이 우드와 솔리드를 가르는 핵심 신호이므로 여기서 아끼면 안 된다.
  // 병목은 CPU 가 아니라 네트워크라 256px 로 올려도 처리 속도는 그대로다.
  const raw = await sharp(buf).extract(크롭).resize(256, 256, { fit: 'fill' })
    .ensureAlpha().raw().toBuffer();

  const 색 = 영역색(raw);
  if (!색) throw new Error('색 추출 실패(유효 픽셀 없음)');

  // 이 이미지가 필름 견본이 맞는지 재둔다. 제조사가 준 URL 이 실내 연출 사진을 가리키는
  // 경우가 실제로 있었다(한솔). 그런 이미지도 유효한 JPEG 이라 여기까지 오류 없이 도달한다.
  // 값이 커도 제외하지 않는다. 메탈처럼 원래 균일하지 않은 제품이 있어서다. 신뢰도로만 쓴다.
  const 균 = 균일도(raw, 256, 256);

  // 이미지 저장. WebP 로 줄여 저장소 부담을 낮춘다.
  fs.mkdirSync(path.join(미러, 'grid'), { recursive: true });
  fs.mkdirSync(path.join(미러, 'card'), { recursive: true });
  await sharp(buf).resize(격자, 격자, { fit: 'cover' }).webp({ quality: 78 })
    .toFile(path.join(미러, 'grid', `${키}.webp`));
  await sharp(buf).resize(상세, 상세, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 })
    .toFile(path.join(미러, 'card', `${키}.webp`));

  const lab를hex = (lab) => {
    // Lab -> 화면 표시용 HEX. 근사 역변환 대신, 뽑을 때 쓴 원본 픽셀 통계를 다시 쓰기보다
    // 간단히 sRGB 로 되돌린다. 표시 전용이며 매칭은 Lab 으로만 한다.
    const f = (t) => (t > 0.206893 ? t * t * t : (t - 16 / 116) / 7.787);
    const fy = (lab.L + 16) / 116, fx = fy + lab.a / 500, fz = fy - lab.b / 200;
    const X = f(fx) * 0.95047, Y = f(fy), Z = f(fz) * 1.08883;
    const 감마 = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
    const r = 감마(X * 3.2406 + Y * -1.5372 + Z * -0.4986) * 255;
    const g = 감마(X * -0.9689 + Y * 1.8758 + Z * 0.0415) * 255;
    const b = 감마(X * 0.0557 + Y * -0.2040 + Z * 1.0570) * 255;
    return rgb를hex(r, g, b);
  };

  // 기존 Airtable HEX 와 얼마나 벌어지는지 같이 기록해 둔다.
  // 크게 벌어지면 크롭 방식이나 원본/썸네일 차이를 의심해야 한다.
  let 기존차 = null;
  const 기존 = f.HEX ? hex를lab(f.HEX) : null;
  if (기존) 기존차 = +deltaE2000(기존, 색.대표색).toFixed(2);

  return {
    id: f.id, 제조사: f.제조사, 코드: f.코드, 키: 키,
    원본사용: 원본있음,
    대표HEX: lab를hex(색.대표색),
    밝은HEX: lab를hex(색.밝은색),
    어두운HEX: lab를hex(색.어두운색),
    L: +색.대표색.L.toFixed(2), a: +색.대표색.a.toFixed(2), b: +색.대표색.b.toFixed(2),
    밝L: +색.밝은색.L.toFixed(2), 밝a: +색.밝은색.a.toFixed(2), 밝b: +색.밝은색.b.toFixed(2),
    어L: +색.어두운색.L.toFixed(2), 어a: +색.어두운색.a.toFixed(2), 어b: +색.어두운색.b.toFixed(2),
    대비폭: +색.대비폭.toFixed(2),
    균일도: +균.toFixed(2),
    기존HEX차: 기존차,
  };
}

async function main() {
  const 전체 = JSON.parse(fs.readFileSync(캐시, 'utf8'));

  let 완료 = {};
  if (!강제 && fs.existsSync(결과경로)) {
    JSON.parse(fs.readFileSync(결과경로, 'utf8')).forEach((r) => { 완료[r.id] = r; });
  }

  const 할것 = 전체.filter((f) => !완료[f.id]).slice(0, 제한);
  console.log(`전체 ${전체.length}건 / 이미 완료 ${Object.keys(완료).length}건 / 이번에 ${할것.length}건`);
  if (!할것.length) { console.log('할 일 없음.'); return; }

  const 실패 = [];
  let 처리 = 0;
  const 시작 = Date.now();

  // 동시 실행 수를 제한한다. 제조사 서버는 우리 것이 아니다.
  let 다음 = 0;
  async function 일꾼() {
    while (다음 < 할것.length) {
      const f = 할것[다음++];
      try {
        완료[f.id] = await 한건(f);
      } catch (e) {
        실패.push({ 제조사: f.제조사, 코드: f.코드, 사유: e.message });
      }
      처리++;
      if (처리 % 25 === 0 || 처리 === 할것.length) {
        const 초 = (Date.now() - 시작) / 1000;
        const 남은 = 할것.length - 처리;
        const 예상 = 처리 ? Math.round(남은 * (초 / 처리)) : 0;
        process.stdout.write(
          `\r  ${처리}/${할것.length}  실패 ${실패.length}  ` +
          `${(처리 / 초).toFixed(1)}건/초  남은시간 ~${Math.floor(예상 / 60)}분${예상 % 60}초   `);
      }
      await new Promise((r) => setTimeout(r, 60)); // 서버 배려
    }
  }
  await Promise.all(Array.from({ length: 동시 }, 일꾼));
  process.stdout.write('\n');

  const 목록 = Object.values(완료);
  fs.writeFileSync(결과경로, JSON.stringify(목록), 'utf8');
  console.log(`\n저장: cache/colors.json (${목록.length}건)`);

  if (실패.length) {
    console.log(`\n실패 ${실패.length}건 (상위 10):`);
    실패.slice(0, 10).forEach((x) => console.log(`   ${x.제조사} ${x.코드} — ${x.사유}`));
    fs.writeFileSync(path.join(__dirname, 'cache', 'mirror_failures.json'),
      JSON.stringify(실패, null, 1), 'utf8');
  }
}

main().catch((e) => { console.error('\n실패:', e.message); process.exit(1); });
