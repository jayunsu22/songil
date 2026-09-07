// 질감이 얼마나 채워졌는지, 각 규칙이 몇 건을 잡았는지 확인한다.
//
// 왜 필요한가: 'PW84' 처럼 한 글자 빠뜨린 규칙은 조용히 30건을 잘못 칠한다.
// 넣을 때마다 몇 건이 걸렸는지 눈으로 보고 넘어가야 한다.
const fs = require('fs');
const arr = JSON.parse(fs.readFileSync('../film/film-db.json', 'utf8'));
const 질 = JSON.parse(fs.readFileSync('../film/film_texture.json', 'utf8'));

const 코드 = p => String(p.코드 || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function 맞나(규칙, p) {
  if (규칙.제조사 && p.제조사 !== 규칙.제조사) return false;
  // 코드계열은 숫자 앞 글자만 정확히 비교한다. 'PS 계열' 에 PSM 이 딸려오지 않게 한다.
  if (규칙.코드계열 && 코드(p).replace(/[0-9].*$/, '') !== 규칙.코드계열.toUpperCase().replace(/[^A-Z0-9]/g, '')) return false;
  if (규칙.코드시작 && !코드(p).startsWith(규칙.코드시작.toUpperCase().replace(/[^A-Z0-9]/g, ''))) return false;
  if (규칙.카테고리 && p.카테고리 !== 규칙.카테고리) return false;
  if (규칙.세부분류 && p.세부분류 !== 규칙.세부분류) return false;
  if (규칙.세부분류포함 && String(p.세부분류 || '').indexOf(규칙.세부분류포함) < 0) return false;
  return true;
}

function 질감찾기(p) {
  let 값 = null;
  for (const r of 질.규칙) if (맞나(r, p)) 값 = r.질감;      // 뒤에 온 규칙이 이긴다
  const 낱 = 질.낱개[p.키];
  return 낱 || 값;                                          // 낱개가 언제나 이긴다
}

const 채움 = arr.filter(p => 질감찾기(p));
console.log('전체', arr.length, '개 중', 채움.length, '개 채움 (' + (채움.length / arr.length * 100).toFixed(1) + '%)');

if (질.규칙.length) {
  console.log('\n규칙별로 몇 건이 걸렸나 (뒤 규칙이 앞 규칙을 덮어쓴다):');
  질.규칙.forEach((r, i) => {
    const g = arr.filter(p => 맞나(r, p));
    const 최종 = g.filter(p => 질감찾기(p) === r.질감 && !질.낱개[p.키]);
    const 조건 = [r.제조사, r.코드계열 && r.코드계열 + '계열', r.코드시작 && r.코드시작 + '*',
                  r.카테고리, r.세부분류, r.세부분류포함 && '*' + r.세부분류포함 + '*'].filter(Boolean).join(' ') || '(전체)';
    console.log(' ', String(i + 1).padStart(2) + '.', 조건.padEnd(22), '→', String(r.질감).padEnd(7),
      String(g.length).padStart(4) + '건 걸림', '/', String(최종.length).padStart(4) + '건 최종 적용');
    if (g.length === 0) console.log('       ⚠ 한 건도 안 걸렸다. 코드나 제조사 이름을 확인할 것.');
  });
}

const 낱수 = Object.keys(질.낱개).length;
if (낱수) {
  const 없는것 = Object.keys(질.낱개).filter(k => !arr.some(p => p.키 === k));
  console.log('\n낱개 지정', 낱수, '건' + (없는것.length ? ' — ⚠ DB에 없는 키: ' + 없는것.join(', ') : ''));
}

const 단계별 = {};
채움.forEach(p => { const v = 질감찾기(p); 단계별[v] = (단계별[v] || 0) + 1; });
if (채움.length) {
  console.log('\n단계별:');
  질.단계.forEach(s => console.log(' ', s.padEnd(8), String(단계별[s] || 0).padStart(5)));
  const 모르는 = Object.keys(단계별).filter(k => !질.단계.includes(k));
  if (모르는.length) console.log('  ⚠ 단계 목록에 없는 값:', 모르는.join(', '));
}

const 빈 = arr.filter(p => !질감찾기(p));
console.log('\n아직 안 채운', 빈.length, '건 — 제조사별:');
const m = {};
빈.forEach(p => { m[p.제조사] = (m[p.제조사] || 0) + 1; });
Object.entries(m).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(' ', k.padEnd(6), String(v).padStart(5)));
