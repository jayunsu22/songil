/* 에어테이블의 팬톤대응표를 받아 film/pantone.json 으로 만든다.
 *
 * 왜 표가 필요한가: 팬톤 번호는 계산으로 색이 나오지 않는다. RGB·HSL 처럼 수식이 있는 게
 * 아니라 잉크 배합을 적어둔 목록의 일련번호라서, 번호에서 색으로 가려면 누군가 실물 칩을
 * 재어 만든 표를 봐야 한다. 그 표가 바로 팬톤이 라이선스를 파는 물건이다.
 * 그래서 통째로 옮겨오지 않고, 고객이 실제로 물어본 번호만 사장님이 채워 넣는다.
 *
 * 사용법:  node filmdb/pantone.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const 베이스 = 'appJWgB2xIMFLENKR';
const 표 = 'tblwSyjTHSRROqAWS';
const 필드 = {
  번호: 'fldkXOO3V0CfUqEsw',
  HEX: 'fldV7Qx1gwnFyINSf',
  계열: 'fldJDztykXaiRUIYa',
  출처: 'fldEV5aQF94ct9tJN',
};

function env읽기() {
  const p = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(p)) throw new Error('.env 가 없다. AIRTABLE_TOKEN 을 넣어야 한다.');
  const out = {};
  fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach(function (줄) {
    const m = 줄.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (m) out[m[1]] = m[2].trim();
  });
  return out;
}

const 값 = (v) => (v && typeof v === 'object' && v.name ? v.name : v);

// 검색할 때 쓰는 열쇠. 사람은 'PANTONE 15-1247 TCX', '15-1247tcx', '15 1247 TCX' 를
// 다 같은 뜻으로 쓴다. 영숫자만 남기고 대문자로 눌러 편다.
function 열쇠(s) {
  return String(s || '').toUpperCase().replace(/PANTONE/g, '').replace(/[^A-Z0-9]/g, '');
}

async function 전량받기(token) {
  const 결과 = [];
  let offset = null;
  do {
    const q = new URLSearchParams({ pageSize: '100', returnFieldsByFieldId: 'true' });
    if (offset) q.set('offset', offset);
    const res = await fetch('https://api.airtable.com/v0/' + 베이스 + '/' + 표 + '?' + q, {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (!res.ok) throw new Error('Airtable ' + res.status + ': ' + (await res.text()).slice(0, 200));
    const j = await res.json();
    결과.push.apply(결과, j.records);
    offset = j.offset;
    await new Promise((r) => setTimeout(r, 220));
  } while (offset);
  return 결과;
}

(async () => {
  const env = env읽기();
  if (!env.AIRTABLE_TOKEN) throw new Error('.env 에 AIRTABLE_TOKEN 이 없다.');

  const raw = await 전량받기(env.AIRTABLE_TOKEN);
  const 나온것 = [];
  const 버린것 = [];

  raw.forEach(function (r) {
    const f = r.fields || {};
    const 번호 = String(값(f[필드.번호]) || '').trim();
    const hex = String(값(f[필드.HEX]) || '').trim().toUpperCase();
    if (!번호) return;
    // 색이 없으면 검색에 못 쓴다. 조용히 빼지 말고 무엇이 빠졌는지 알려준다.
    if (!/^#?[0-9A-F]{6}$/.test(hex)) { 버린것.push(번호 + ' (HEX ' + (hex || '비어 있음') + ')'); return; }
    나온것.push({
      번호: 번호,
      열쇠: 열쇠(번호),
      HEX: hex[0] === '#' ? hex : '#' + hex,
      계열: 값(f[필드.계열]) || null,
      출처: 값(f[필드.출처]) || null,
    });
  });

  const 갈곳 = path.join(__dirname, '..', 'film', 'pantone.json');
  fs.writeFileSync(갈곳, JSON.stringify(나온것, null, 0), 'utf8');
  console.log('pantone.json  ' + 나온것.length + '건');
  if (버린것.length) {
    console.log('색이 없어 뺀 것 ' + 버린것.length + '건:');
    버린것.slice(0, 20).forEach(function (x) { console.log('   ' + x); });
  }
})();
