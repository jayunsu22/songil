#!/usr/bin/env node
// Airtable 의 필름 컬러 DB 를 통째로 받아 로컬에 캐시한다.
//
// 2,047건은 작다. 매번 Airtable 을 치지 말고 한 번 받아두고 계산한다.
// ΔE 계산은 Airtable 수식으로 못 하기도 하고, 반복 실험할 때마다 API 를 치면 느리다.
//
// 사용법:  node filmdb/fetch.js          (캐시 있으면 그대로 씀)
//          node filmdb/fetch.js --force  (강제로 다시 받음)

const fs = require('fs');
const path = require('path');

const 캐시경로 = path.join(__dirname, 'cache', 'films.json');

// 필드 ID 로 접근한다. 필드명에 '*' 와 한글이 섞여 있어 이름 기반은 깨지기 쉽다.
const 필드 = {
  코드:        'fld3Y5OthMmTMi5Tj',
  제조사:      'fld7Zz29Io3nUDyK9',
  색상명:      'fldsa4P0C0cKfmDRY',
  카테고리:    'fldaBmOZ9W10kMicA',
  세부분류:    'fldDoAToFdhv1c8wb',
  HEX:         'fldjtkydiHASx4HK2',
  R:           'flduT3NcfjTUrWOF4',
  G:           'fldnuj6BhNyidS6TQ',
  B:           'fldfG7PmCqexYRgB6',
  명도:        'fldbHFctrLCy1tCr0',
  색상계열:    'fld6MO3ORsVCIvsoG',
  썸네일URL:   'fldUbOyQz9As24FVd',
  원본이미지URL:'fldeQELKtGH9CbcSe',
  상세페이지URL:'fldpKqI6nsYJZ5pYt',
  특성:        'fldZcNNFq9jmw5eik',
};

// .env 를 읽는다. dotenv 를 쓰지 않는 이유는 이 저장소에 빌드 의존성을 늘리지 않기 위해서다.
function env읽기() {
  const p = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(p)) {
    throw new Error('.env 가 없다. AIRTABLE_TOKEN 을 넣어야 한다.');
  }
  const out = {};
  fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach((줄) => {
    const m = 줄.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (m) out[m[1]] = m[2].trim();
  });
  return out;
}

async function 전량받기(token, base, table) {
  const 결과 = [];
  let offset = null;
  let 페이지 = 0;

  do {
    const q = new URLSearchParams({ pageSize: '100', returnFieldsByFieldId: 'true' });
    if (offset) q.set('offset', offset);

    const res = await fetch(`https://api.airtable.com/v0/${base}/${table}?${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Airtable ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const j = await res.json();
    결과.push(...j.records);
    offset = j.offset || null;
    페이지++;
    process.stdout.write(`\r  받는 중… ${결과.length}건 (${페이지}페이지)`);

    // Airtable 제한은 5 req/sec. 여유를 둔다.
    if (offset) await new Promise((r) => setTimeout(r, 220));
  } while (offset);

  process.stdout.write('\n');
  return 결과;
}

// Airtable 레코드를 우리가 쓰기 편한 평평한 모양으로 바꾼다.
function 정리(rec) {
  const f = rec.fields || {};
  const 값 = (id) => {
    const v = f[id];
    // singleSelect 는 returnFieldsByFieldId 에서 문자열로 온다. 방어적으로 둘 다 받는다.
    if (v && typeof v === 'object' && v.name) return v.name;
    return v;
  };
  return {
    id:       rec.id,
    코드:     값(필드.코드),
    제조사:   값(필드.제조사),
    색상명:   값(필드.색상명),
    카테고리: 값(필드.카테고리),
    세부분류: 값(필드.세부분류),
    HEX:      값(필드.HEX),
    R: 값(필드.R), G: 값(필드.G), B: 값(필드.B),
    명도:     값(필드.명도),
    색상계열: 값(필드.색상계열),
    썸네일URL:    값(필드.썸네일URL),
    원본이미지URL: 값(필드.원본이미지URL),
    상세페이지URL: 값(필드.상세페이지URL),
    특성:     값(필드.특성),
  };
}

async function main() {
  const 강제 = process.argv.includes('--force');

  if (!강제 && fs.existsSync(캐시경로)) {
    const d = JSON.parse(fs.readFileSync(캐시경로, 'utf8'));
    console.log(`캐시 사용: ${d.length}건  (다시 받으려면 --force)`);
    return;
  }

  const env = env읽기();
  if (!env.AIRTABLE_TOKEN) throw new Error('.env 에 AIRTABLE_TOKEN 이 없다.');

  const base  = env.AIRTABLE_BASE  || 'appJWgB2xIMFLENKR';
  const table = env.AIRTABLE_TABLE || 'tblin6fznxRjdqQSF';

  console.log(`Airtable ${base}/${table} 에서 받는다…`);
  const raw = await 전량받기(env.AIRTABLE_TOKEN, base, table);
  const 정리됨 = raw.map(정리);

  fs.mkdirSync(path.dirname(캐시경로), { recursive: true });
  fs.writeFileSync(캐시경로, JSON.stringify(정리됨), 'utf8');

  console.log(`저장: ${path.relative(process.cwd(), 캐시경로)}  (${정리됨.length}건)`);
}

main().catch((e) => { console.error('실패:', e.message); process.exit(1); });
