/* 필름마다 공유용 정적 페이지를 만든다.  film/s/<레코드id>.html
 *
 * 왜 페이지가 따로 있나: 문자·밴드·카톡의 링크 미리보기 봇은 JS 를 돌리지 않고
 * 서버가 준 HTML 의 og 태그만 읽는다. 필름찾기는 페이지가 하나라 어느 필름인지
 * 알 수 없어서 늘 "1분견적 필름찾기" 로만 떴다.
 *
 * 처음엔 미리보기 정보를 주소에 실어 보내고(?s=…) 엣지 함수가 og 태그를 끼워 넣게
 * 했는데, 주소가 190자로 길어져서 문자에 붙이면 링크가 여덟 줄이 됐다. 필름마다
 * 페이지를 미리 만들어 두면 주소는 /film/s/recGLOCiwLDFzQN1T 로 끝난다(57자).
 * 파일 2,118개 x 700바이트라 1.5MB 다. 엣지 함수도, 조회도 없다.
 *
 * 사람이 열면 스크립트가 바로 앱(/film/?r=…&c=share)으로 보낸다. 봇은 스크립트를
 * 안 돌리니 og 태그를 읽고, 사람은 앱을 본다. meta refresh 는 쓰지 않는다 -
 * 그건 따라가는 봇이 있어서 앱 페이지의 기본 og 를 읽어 버린다.
 *
 * 여러 개를 보낼 때는 첫 필름의 페이지에 ?m=recB.recC 를 붙인다. 구분자를 . 으로
 * 둔 이유: & 는 문자 앱(sms:?body=)이 거기서 잘라 버리고, 쉼표는 카톡 같은
 * 중계자가 인코딩해서 깨뜨린다. 점은 어디서도 손대지 않는다.
 *
 * build_db.js 끝에서 부른다. 내용이 같으면 파일을 다시 쓰지 않는다(mtime 유지).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const 사이트 = 'https://songil.netlify.app';

// 화면(film_app.js 의 브랜드())과 같은 표기. 카드 제목이 앱과 다르면 헷갈린다.
const 브랜드표기 = { 'LX': 'LX지인', '현대': '현대보닥' };
const 브랜드 = (m) => 브랜드표기[m] || m || '';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function 한장(p) {
  const 제목 = 브랜드(p.제조사) + ' ' + (p.코드미확인 ? (p.색상명 || p.코드) : p.코드);
  const 설명 = [브랜드(p.제조사), p.HEX, p.카테고리].filter(Boolean).join(' · ');
  const 그림 = p.사진무효 ? '' : `${사이트}/film/img/card/${encodeURIComponent(p.키)}.webp`;
  const 주소 = `${사이트}/film/s/${p.id}`;
  const 앱 = `/film/?r=${p.id}&c=share`;
  return [
    '<!DOCTYPE html>',
    '<html lang="ko"><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(제목)}</title>`,
    '<meta name="robots" content="noindex">',
    '<meta property="og:type" content="website">',
    `<meta property="og:title" content="${esc(제목)}">`,
    `<meta property="og:description" content="${esc(설명)}">`,
    그림 ? `<meta property="og:image" content="${esc(그림)}">` : '',
    `<meta property="og:url" content="${esc(주소)}">`,
    // ?m=recB.recC 가 붙어 있으면 그 필름들도 함께 넘긴다.
    `<script>(function(){var m=new URLSearchParams(location.search).get('m')||'';` +
    `var r=[${JSON.stringify(p.id)}].concat(m.split('.').filter(Boolean));` +
    `location.replace('/film/?'+r.map(function(x){return 'r='+encodeURIComponent(x)}).join('&')+'&c=share')})()</script>`,
    '</head><body>',
    `<p><a href="${esc(앱)}">${esc(제목)} 필름 보기</a></p>`,
    '</body></html>',
    '',
  ].filter((줄) => 줄 !== '').join('\n');
}

function 만들기(목록, 뿌리) {
  const 폴더 = path.join(뿌리, 'film', 's');
  fs.mkdirSync(폴더, { recursive: true });
  let 쓴것 = 0;
  const 살릴것 = new Set();
  목록.forEach((p) => {
    if (!p.id) return;
    const 파일 = path.join(폴더, p.id + '.html');
    살릴것.add(p.id + '.html');
    const 글 = 한장(p);
    try { if (fs.readFileSync(파일, 'utf8') === 글) return; } catch (e) { /* 새로 쓴다 */ }
    fs.writeFileSync(파일, 글, 'utf8');
    쓴것++;
  });
  // 사라진 제품의 페이지는 지운다. 없는 필름 페이지가 남아 있으면 옛 링크가 빈 앱으로 간다.
  let 지운것 = 0;
  fs.readdirSync(폴더).forEach((f) => {
    if (f.endsWith('.html') && !살릴것.has(f)) { fs.unlinkSync(path.join(폴더, f)); 지운것++; }
  });
  return { 쓴것, 지운것, 전체: 살릴것.size };
}

module.exports = { 만들기, 한장 };

if (require.main === module) {
  const 뿌리 = path.join(__dirname, '..');
  const 목록 = JSON.parse(fs.readFileSync(path.join(뿌리, 'film', 'film-db.json'), 'utf8'));
  const r = 만들기(목록, 뿌리);
  console.log(`공유 페이지  ${r.전체}개 (새로 쓴 것 ${r.쓴것}, 지운 것 ${r.지운것})`);
}
