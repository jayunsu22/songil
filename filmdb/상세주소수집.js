/* 제조사 사이트에서 제품별 상세페이지 주소를 모은다.
 *
 * 왜 필요한가: 상세 화면의 "제조사 페이지에서 보기" 버튼은 상세페이지URL 이 있어야 나온다.
 * 영림·예림은 처음부터 들어 있었지만 나머지 넷은 비어 있었다.
 *
 * 넷 중 셋은 된다. 현대만 못 한다 — ebodaq.com 의 viewDetail(val) 이 제품 번호를 받아놓고
 * 주소에 쓰지 않는다(필터·페이지 상태만 넘기는 팝업). 제품 하나를 가리키는 주소가 없다.
 *
 * 쓰는 법: node filmdb/상세주소수집.js
 * 결과: filmdb/cache/상세주소.json  { 제조사: { 열쇠: 주소 } }
 *
 * 열쇠는 제조사마다 다르다. 삼성·LX 는 코드(NG/NF 2033, RS130)가 사이트에 그대로 나오지만
 * 한솔 사이트에는 HSF 코드가 없고 색상명(에버오크번그레이)만 있어서 이름으로 맞춘다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const 쉬기 = (ms) => new Promise((r) => setTimeout(r, ms));

// 남의 서버다. 한 장 받고 조금 쉰다.
async function 받기(주소, 옵션) {
  for (let 시도 = 1; 시도 <= 3; 시도++) {
    try {
      const r = await fetch(주소, 옵션);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } catch (e) {
      if (시도 === 3) throw e;
      await 쉬기(1500 * 시도);
    }
  }
}

/* ---------- 삼성 ----------
   목록이 자바스크립트로 그려져서 HTML 에는 없다. 페이지가 부르는 JSON 을 그대로 부른다. */
async function 삼성() {
  const 표 = {};
  let 총 = null;
  for (let 쪽 = 1; 쪽 <= 60; 쪽++) {
    const 몸 = new URLSearchParams({
      lang_f: 'Ko', flter_order1: '', orderby: '최신순', keyword: '',
      // pageScale 과 pageScaleDefault 를 같이 크게 줘야 한 번에 다 온다.
      // 둘이 다르면(예: 100/12) 서버가 12개씩 끊어 세다가 6쪽부터 빈 값을 준다.
      cata1: '', cata2: '', pageNo: String(쪽), pageScale: '1000', pageScaleDefault: '1000',
    });
    const 글 = await 받기('https://samsungfilm.co.kr/ajax/item/item_list_json.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
      body: 몸,
    });
    const j = JSON.parse(글);
    if (총 === null) 총 = j.total;
    const 줄 = j.data || [];
    if (!줄.length) break;
    줄.forEach((it) => {
      const 코드 = String(it.item_title1 || '').trim();
      const 번호 = String(it.pk_item || '').trim();
      if (코드 && 번호) 표[코드] = 'https://samsungfilm.co.kr/goods/detail.php?lang=Ko&num=' + 번호;
    });
    process.stdout.write('  삼성 ' + 쪽 + '쪽 · 누적 ' + Object.keys(표).length + '\r');
    if (Object.keys(표).length >= 총) break;
    await 쉬기(400);
  }
  console.log('  삼성 완료: ' + Object.keys(표).length + ' / 사이트 표시 ' + 총 + '        ');
  return 표;
}

/* ---------- 한솔 ----------
   목록이 HTML 에 그대로 있다. 상세는 GET 폼이라 주소를 직접 만들 수 있다.

   사이트에 HSF 코드가 없어서 색상명으로 맞추는데, 이름만으로는 5개가 겹친다
   (메종라이트오크·콘크리트샌드·콘크리트크림·클레이크림·클레이포그).
   겹치는 쌍은 방염/비방염 한 짝이라 - 우리 DB 도 그렇게 나뉘어 있다 -
   방염 분류를 따로 한 번 더 긁어서 이름에 방염 여부를 붙여 열쇠로 쓴다. */
const 한솔메뉴 = 'MENU0000000000010297';
const 한솔방염 = 'MENU0000000000010318';

async function 한솔목록(분류) {
  const 것 = [];
  for (let 쪽 = 1; 쪽 <= 30; 쪽++) {
    const 글 = await 받기('https://www.hansolhomedeco.co.kr/extension/deco/product/index.do' +
      '?proMode=productList&depth2MenuId=' + 한솔메뉴 +
      (분류 ? '&depth3MenuId=' + 분류 : '') + '&pageIndex=' + 쪽);
    // <a href="javascript:fnView('PRD...');" ... >이름</a>
    const 정규 = /fnView\('(PRD[0-9]+)'\)[^>]*>\s*([^<]+?)\s*</g;
    let m, 이번 = 0;
    while ((m = 정규.exec(글))) {
      const 이름 = m[2].trim();
      if (!이름 || 이름.length > 40) continue;
      if (것.some((x) => x.id === m[1])) continue;
      것.push({ id: m[1], 이름: 이름 });
      이번++;
    }
    if (!이번) break;
    await 쉬기(400);
  }
  return 것;
}

async function 한솔() {
  const 전체 = await 한솔목록('');
  const 방염 = await 한솔목록(한솔방염);
  const 방염id = new Set(방염.map((x) => x.id));

  const 표 = {};
  전체.forEach((x) => {
    const 열쇠 = x.이름 + (방염id.has(x.id) ? '|방염' : '');
    표[열쇠] = 'https://www.hansolhomedeco.co.kr/extension/deco/product/index.do' +
      '?proMode=view&prdId=' + x.id + '&depth2MenuId=' + 한솔메뉴;
  });
  console.log('  한솔 완료: ' + Object.keys(표).length + '개 (제품 ' + 전체.length +
    ' · 그중 방염 ' + 방염.length + ')');
  return 표;
}

/* ---------- LX ----------
   목록 HTML 의 이미지 alt 에 "분류 | 색상명 | 코드" 가 들어 있다.

   mcate 를 빼고 a120000 만 부른다. mcate=a120500 은 솔리드만 285개라
   우드·메탈(PW·CW·NW·ML…)이 통째로 빠졌었다. 안 붙이면 인테리어필름 전체 910개가 나온다.

   그래도 우리 DB 의 510개를 다 덮지는 못한다. 지인 홈페이지에 없는(단종됐거나
   안 올린) 제품이 있다. */
async function LX() {
  const 표 = {};
  for (let 쪽 = 1; 쪽 <= 80; 쪽++) {
    const 글 = await 받기('https://www.lxzin.com/zin/category/a120000?page=' + 쪽);
    const 정규 = /href="(\/zin\/product\/\d+)"[^>]*class="thumb_area"[^>]*>\s*<img[^>]*alt="([^"]*)"/g;
    let m, 이번 = 0;
    while ((m = 정규.exec(글))) {
      const 조각 = m[2].split('|').map((s) => s.trim()).filter(Boolean);
      const 코드 = 조각[조각.length - 1];
      if (!코드) continue;
      if (!표[코드]) 이번++;
      표[코드] = 'https://www.lxzin.com' + m[1];
    }
    process.stdout.write('  LX ' + 쪽 + '쪽 · 누적 ' + Object.keys(표).length + '\r');
    if (!이번) break;
    await 쉬기(400);
  }
  console.log('  LX 완료: ' + Object.keys(표).length + '개                      ');
  return 표;
}

(async () => {
  console.log('제조사 사이트에서 상세페이지 주소를 모읍니다.\n');
  const 결과 = {};
  결과['삼성'] = await 삼성();
  결과['한솔'] = await 한솔();
  결과['LX'] = await LX();

  const 저장할곳 = path.join(__dirname, 'cache', '상세주소.json');
  fs.mkdirSync(path.dirname(저장할곳), { recursive: true });
  fs.writeFileSync(저장할곳, JSON.stringify(결과, null, 2), 'utf8');
  console.log('\n저장: ' + 저장할곳);
})();
