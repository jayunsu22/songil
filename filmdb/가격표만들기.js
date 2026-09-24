#!/usr/bin/env node
// 필름찾기에 들어갈 단가 파일 두 개를 만든다.
//
//   filmdb/cache/단가표.json   (아티팩트 '현장 필름단가' 의 DATA 를 그대로 옮긴 것)
// → film/film_price.json        계열·코드·소비자가  (공개)
// → film/film_price_owner.json  시공가·업체가·대리점 (암호로 잠금)
//
// 원본을 cache 에 두는 이유: cache 는 .gitignore 에 들어 있다. 저장소가 공개라서
// 시공가가 적힌 원본이 한 번이라도 커밋되면 기록에 영원히 남는다.
//
// 사용법: FILM_PRICE_KEY=암호 node filmdb/가격표만들기.js
// 암호를 바꾸면 사장님 폰에서 새 암호로 ?key= 를 한 번 다시 열어야 한다.

const fs = require('fs');
const path = require('path');
const { webcrypto } = require('crypto');
const FilmPrice = require('../film/film_price.js');

const 암호 = process.env.FILM_PRICE_KEY;
if (!암호) { console.error('FILM_PRICE_KEY 가 없습니다'); process.exit(1); }

const 원본 = JSON.parse(fs.readFileSync(path.join(__dirname, 'cache', '단가표.json'), 'utf8'));
const 배포 = path.join(__dirname, '..', 'film');

// 필름 DB 에 없는 것은 넣지 않는다. 부자재는 필름이 아니고, 레놀릿은 DB 에 아직 없다.
const 쓸것 = 원본.filter((r) => r.f !== '부자재' && r.b !== '레놀릿');

function 코드들(r) {
  if (/^HE\(펄\)\s*407$/.test(r.c)) return ['HE407'];
  return r.c.split(/[^A-Za-z]+/).filter((t) => /^[A-Z]+$/.test(t));
}

const 공개 = [], 잠글 = {};
쓸것.forEach((r) => {
  const id = r.b + '|' + r.f + '|' + r.c + '|' + r.g;
  const 한솔 = r.b === '한솔 스토리필름';
  const 줄 = { id, 제조사: r.b, 구분: r.f, 묶음: r.g, 코드: 한솔 ? [] : 코드들(r), 소비자가: r.p3 };
  // 한솔 비고는 '설명 | 색상명, 색상명, …' 꼴이다. 색상명 쪽이 값을 가르는 기준이다.
  const 비고 = 한솔 ? (r.n.split('|')[0] || '').trim() : r.n;
  if (한솔) 줄.이름들 = (r.n.split('|')[1] || '').split(',').map((s) => s.trim()).filter(Boolean);
  공개.push(줄);
  잠글[id] = { 시공가: r.p1, 업체가: r.p2, 대리점: r.d, 적용일: r.dt, 비고, 롤: r.r };
});

async function 잠그기(값) {
  const 소금 = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const 횟수 = 200000;
  const 키 = await FilmPrice.키만들기(webcrypto.subtle, 암호, 소금, 횟수);
  const 암 = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, 키, new TextEncoder().encode(JSON.stringify(값)));
  const b64 = (u) => Buffer.from(u).toString('base64');
  return { 횟수, 소금: b64(소금), iv: b64(iv), 값: b64(new Uint8Array(암)) };
}

(async () => {
  const 잠긴 = await 잠그기(잠글);
  // 만든 즉시 풀어본다. 풀리지 않는 파일을 배포하면 사장님 화면에서만 조용히 깨진다.
  const 확인 = await FilmPrice.풀기(잠긴, 암호, webcrypto.subtle);
  if (Object.keys(확인).length !== 공개.length) throw new Error('잠근 값이 다시 안 풀립니다');

  fs.writeFileSync(path.join(배포, 'film_price.json'), JSON.stringify(공개));
  fs.writeFileSync(path.join(배포, 'film_price_owner.json'), JSON.stringify(잠긴));

  // 필름 DB 에 대 보고 몇 개에 값이 붙는지 알려준다
  const db = JSON.parse(fs.readFileSync(path.join(배포, 'film-db.json'), 'utf8'));
  const 셈 = {};
  db.forEach((p) => {
    const s = 셈[p.제조사] || (셈[p.제조사] = { 전체: 0, 단가: 0, 소비자가: 0 });
    const 찾음 = FilmPrice.찾기(공개, p);
    s.전체++;
    if (찾음.length) s.단가++;
    if (찾음.some((x) => x.줄.소비자가 != null)) s.소비자가++;
  });
  console.log('줄', 공개.length, '개');
  console.table(셈);
})().catch((e) => { console.error(e); process.exit(1); });
