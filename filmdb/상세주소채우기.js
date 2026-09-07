/* 모아둔 제조사 상세페이지 주소를 우리 제품에 맞춰 에어테이블에 채운다.
 *
 * 먼저 node filmdb/상세주소수집.js 를 돌려 cache/상세주소.json 을 만들어 둬야 한다.
 *
 * 사용법:  node filmdb/상세주소채우기.js         맞춰만 보고 결과를 보여준다(안 쓴다)
 *          node filmdb/상세주소채우기.js --쓰기  에어테이블에 실제로 넣는다
 *
 * 맞추는 열쇠가 제조사마다 다르다:
 *   삼성 · LX  코드가 사이트에 그대로 나온다(NG/NF 2033, RS130).
 *   한솔       사이트에 HSF 코드가 없어 색상명으로 맞춘다. 이름이 겹치는 5쌍은
 *              방염/비방염 한 짝이라 방염 여부를 이름에 붙여 가른다.
 *
 * 이미 값이 있는 칸은 건드리지 않는다. 영림·예림은 처음부터 들어 있었고,
 * 사장님이 손으로 고친 주소가 있을 수도 있다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const 필드_상세페이지URL = 'fldpKqI6nsYJZ5pYt';

function env읽기() {
  const p = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(p)) throw new Error('.env 가 없다. AIRTABLE_TOKEN 을 넣어야 한다.');
  const out = {};
  fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach((줄) => {
    const m = 줄.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (m) out[m[1]] = m[2].trim();
  });
  return out;
}

// 코드는 사람이 넣은 값이라 공백·대소문자가 들쭉날쭉하다. 비교 전에 눌러 편다.
const 코드정리 = (s) => String(s || '').toUpperCase().replace(/\s+/g, '').trim();
const 이름정리 = (s) => String(s || '').replace(/\s+/g, '').trim();

function 열쇠만들기(제품) {
  if (제품.제조사 === '한솔') {
    return 이름정리(제품.색상명) + (제품.세부분류 === '방염' ? '|방염' : '');
  }
  return 코드정리(제품.코드);
}

function 주소표정리(제조사, 표) {
  const 새 = {};
  Object.keys(표).forEach((k) => {
    const 열쇠 = 제조사 === '한솔'
      ? (() => { const [이름, 꼬리] = k.split('|'); return 이름정리(이름) + (꼬리 ? '|' + 꼬리 : ''); })()
      : 코드정리(k);
    새[열쇠] = 표[k];
  });
  return 새;
}

async function 쓰기(token, base, table, 바꿀것) {
  for (let i = 0; i < 바꿀것.length; i += 10) {   // Airtable 은 한 번에 10건
    const 묶음 = 바꿀것.slice(i, i + 10);
    const res = await fetch(`https://api.airtable.com/v0/${base}/${table}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        records: 묶음.map((x) => ({ id: x.id, fields: { [필드_상세페이지URL]: x.주소 } })),
      }),
    });
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${(await res.text()).slice(0, 300)}`);
    process.stdout.write('  쓰는 중 ' + Math.min(i + 10, 바꿀것.length) + '/' + 바꿀것.length + '\r');
    await new Promise((r) => setTimeout(r, 250));   // 5 req/sec 제한
  }
  console.log('  다 썼다: ' + 바꿀것.length + '건                    ');
}

(async () => {
  const 진짜쓰기 = process.argv.includes('--쓰기');
  const 주소들 = JSON.parse(fs.readFileSync(path.join(__dirname, 'cache', '상세주소.json'), 'utf8'));
  const 제품들 = JSON.parse(fs.readFileSync(path.join(__dirname, 'cache', 'films.json'), 'utf8'));

  const 표 = {};
  Object.keys(주소들).forEach((m) => { 표[m] = 주소표정리(m, 주소들[m]); });

  const 바꿀것 = [];
  const 통계 = {};
  const 못찾음 = {};

  제품들.forEach((p) => {
    const m = p.제조사;
    통계[m] = 통계[m] || { 총: 0, 이미: 0, 새로: 0, 못: 0 };
    통계[m].총++;
    if (p.상세페이지URL) { 통계[m].이미++; return; }
    if (!표[m]) { 통계[m].못++; return; }
    const 주소 = 표[m][열쇠만들기(p)];
    if (주소) { 통계[m].새로++; 바꿀것.push({ id: p.id, 주소: 주소, 코드: p.코드 }); }
    else {
      통계[m].못++;
      (못찾음[m] = 못찾음[m] || []).push(p.코드 + (p.색상명 && p.색상명 !== p.코드 ? ' (' + p.색상명 + ')' : ''));
    }
  });

  console.log('제조사'.padEnd(8) + '총'.padStart(6) + '이미'.padStart(7) + '새로'.padStart(7) + '못찾음'.padStart(8));
  Object.keys(통계).sort((a, b) => 통계[b].총 - 통계[a].총).forEach((m) => {
    const s = 통계[m];
    console.log(m.padEnd(9) + String(s.총).padStart(5) + String(s.이미).padStart(7) +
      String(s.새로).padStart(7) + String(s.못).padStart(8));
  });
  const 합 = Object.values(통계).reduce((a, s) => ({ 총: a.총 + s.총, 있게됨: a.있게됨 + s.이미 + s.새로 }), { 총: 0, 있게됨: 0 });
  console.log('\n채우면 ' + 합.있게됨 + ' / ' + 합.총 + ' (' + (합.있게됨 / 합.총 * 100).toFixed(1) + '%)');

  Object.keys(못찾음).forEach((m) => {
    if (!못찾음[m].length) return;
    console.log('\n[' + m + '] 못 찾은 ' + 못찾음[m].length + '건 중 앞 15개:');
    console.log('  ' + 못찾음[m].slice(0, 15).join(', '));
  });

  if (!진짜쓰기) { console.log('\n(맞춰만 봤다. 실제로 넣으려면 --쓰기 를 붙여라)'); return; }

  const env = env읽기();
  if (!env.AIRTABLE_TOKEN) throw new Error('.env 에 AIRTABLE_TOKEN 이 없다.');
  const base = env.AIRTABLE_BASE || 'appJWgB2xIMFLENKR';
  const table = env.AIRTABLE_TABLE || 'tblin6fznxRjdqQSF';
  console.log('\n에어테이블에 넣는다…');
  await 쓰기(env.AIRTABLE_TOKEN, base, table, 바꿀것);
})();
