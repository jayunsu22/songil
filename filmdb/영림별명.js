/* 영림 제품의 '별명'(영림06, 영림100)을 제조사 사이트에서 긁어 우리 것과 맞춰본다.
 *
 * 업자들은 코드가 아니라 별명으로 부른다. "영림 6번" 은 PW1102 다.
 * 우리 색상명에 이미 들어 있는 것이 160개인데, 나머지 183개도 별명이 있는지 확인한다.
 *
 * 사용법:  node filmdb/영림별명.js          맞춰만 보고 결과를 보여준다
 *          node filmdb/영림별명.js --쓰기   빠진 것을 에어테이블 색상명에 넣는다
 *
 * 상세 페이지 구조:
 *   <h1 class="film-no">PW924-1</h1>
 *   <p class="film-name">영림100</p>
 * 주소 끝에 / 가 없으면 리다이렉트되어 빈 응답이 온다. 붙여서 부른다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const 색상명필드 = 'fldsa4P0C0cKfmDRY';

function env읽기() {
  const p = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(p)) throw new Error('.env 가 없다.');
  const out = {};
  fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach(function (줄) {
    const m = 줄.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (m) out[m[1]] = m[2].trim();
  });
  return out;
}

const 쉬기 = (ms) => new Promise((r) => setTimeout(r, ms));

async function 한장(주소) {
  for (let 시도 = 1; 시도 <= 3; 시도++) {
    try {
      const r = await fetch(주소.replace(/\/?$/, '/'), { redirect: 'follow' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const 글 = await r.text();
      const 번호 = (글.match(/class="film-no"[^>]*>\s*([^<]+?)\s*</) || [])[1] || null;
      const 이름 = (글.match(/class="film-name"[^>]*>\s*([^<]*?)\s*</) || [])[1] || null;
      return { 번호: 번호, 이름: 이름 };
    } catch (e) {
      if (시도 === 3) return { 번호: null, 이름: null, 오류: e.message };
      await 쉬기(1200 * 시도);
    }
  }
}

(async () => {
  const 진짜쓰기 = process.argv.includes('--쓰기');
  const 캐시 = JSON.parse(fs.readFileSync(path.join(__dirname, 'cache', 'films.json'), 'utf8'));
  const 영림 = 캐시.filter((p) => p.제조사 === '영림' && p.상세페이지URL);
  console.log('영림 ' + 영림.length + '건을 사이트에서 확인한다…\n');

  const 결과 = [];
  for (let i = 0; i < 영림.length; i++) {
    const p = 영림[i];
    const 것 = await 한장(p.상세페이지URL);
    결과.push({ 제품: p, 사이트: 것 });
    process.stdout.write('  ' + (i + 1) + '/' + 영림.length + '\r');
    await 쉬기(300);
  }
  console.log('  다 봤다.                    \n');

  const 별명모양 = /^영림\s*\d+/;
  const 이미 = [];       // 우리 색상명에 이미 별명이 있음
  const 새로 = [];       // 사이트에는 별명이 있는데 우리는 없음
  const 없음 = [];       // 사이트에도 별명이 없음
  const 다름 = [];       // 둘 다 있는데 값이 다름
  const 못봄 = [];

  결과.forEach(function (r) {
    const 우리 = String(r.제품.색상명 || '').trim();
    const 저쪽 = String(r.사이트.이름 || '').trim();
    if (!r.사이트.번호) { 못봄.push(r.제품.코드); return; }
    const 우리별명 = 별명모양.test(우리);
    const 저쪽별명 = 별명모양.test(저쪽);
    if (우리별명 && 저쪽별명) { if (우리 !== 저쪽) 다름.push(r); else 이미.push(r); return; }
    if (저쪽별명) { 새로.push(r); return; }
    없음.push(r);
  });

  console.log('이미 별명 있음        ' + 이미.length);
  console.log('사이트에만 있음(추가)  ' + 새로.length);
  console.log('값이 다름             ' + 다름.length);
  console.log('사이트에도 별명 없음   ' + 없음.length);
  console.log('못 읽음               ' + 못봄.length);

  if (새로.length) {
    console.log('\n[추가할 것] 앞 25개:');
    새로.slice(0, 25).forEach(function (r) {
      console.log('   ' + r.제품.코드.padEnd(12) + '우리: ' + (r.제품.색상명 || '(빈칸)').padEnd(20) +
                  '-> 사이트: ' + r.사이트.이름);
    });
  }
  if (다름.length) {
    console.log('\n[값이 다름] 손대지 않는다. 사람이 봐야 한다:');
    다름.slice(0, 20).forEach(function (r) {
      console.log('   ' + r.제품.코드.padEnd(12) + '우리: ' + r.제품.색상명 + '  vs  사이트: ' + r.사이트.이름);
    });
  }
  if (없음.length) {
    console.log('\n[사이트에도 별명 없음] 앞 15개:');
    없음.slice(0, 15).forEach(function (r) {
      console.log('   ' + r.제품.코드.padEnd(12) + '사이트 이름: ' + (r.사이트.이름 || '(빈칸)'));
    });
  }

  if (!진짜쓰기) { console.log('\n(맞춰만 봤다. 실제로 넣으려면 --쓰기 를 붙여라)'); return; }
  if (!새로.length) { console.log('\n넣을 것이 없다.'); return; }

  const env = env읽기();
  const base = env.AIRTABLE_BASE || 'appJWgB2xIMFLENKR';
  const table = env.AIRTABLE_TABLE || 'tblin6fznxRjdqQSF';
  console.log('\n에어테이블에 넣는다…');
  for (let i = 0; i < 새로.length; i += 10) {
    const 묶음 = 새로.slice(i, i + 10);
    const res = await fetch('https://api.airtable.com/v0/' + base + '/' + table, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + env.AIRTABLE_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        records: 묶음.map(function (r) {
          // 우리 색상명이 이미 있으면 지우지 않고 뒤에 붙인다. 사람이 적어둔 이름이다.
          const 우리 = String(r.제품.색상명 || '').trim();
          const 값 = 우리 ? r.사이트.이름 + ' | ' + 우리 : r.사이트.이름;
          return { id: r.제품.id, fields: { [색상명필드]: 값 } };
        }),
      }),
    });
    if (!res.ok) throw new Error('Airtable ' + res.status + ': ' + (await res.text()).slice(0, 300));
    process.stdout.write('  ' + Math.min(i + 10, 새로.length) + '/' + 새로.length + '\r');
    await 쉬기(250);
  }
  console.log('  다 썼다: ' + 새로.length + '건            ');
})();
