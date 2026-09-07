// 1분견적 필름찾기 — 화면.
//
// 계산은 전부 film_color.js / film_match.js 가 한다. 여기는 화면만 다룬다.
// 그렇게 나눠야 순위·분류 규칙을 node 로 테스트할 수 있고, 실사진으로 가중치를
// 조정할 때 화면 코드를 건드리지 않는다.
//
// 서버를 쓰지 않는다. film-db.json 을 한 번 받아 브라우저에서 전부 계산한다.
// 2,118건 ΔE2000 계산은 1ms 미만이라 사진을 다시 누를 때마다 즉시 갱신된다.
// 사진은 업로드하지 않는다. 캔버스에서 읽고 끝이다.

(function () {
  'use strict';

  var C = window.FilmColor;
  var M = window.FilmMatch;

  var 전체 = [];
  var 질의 = null;      // { lab, 대비폭? } — 사진에서 뽑은 색
  var 글자 = '';        // 코드·이름 입력
  var 필터 = {};        // { 제조사: [...] }

  // 한 번에 보여줄 결과 수. 사진 매칭은 원래 10개였는데, 후보를 나란히 놓고
  // 눈으로 고르는 게 이 도구의 마지막 단계라 고를 거리를 더 준다.
  // 측정상 ΔE<5 안에 중앙값 136개가 있으므로 전부 보여주는 건 소음이다. 30 에서 끊는다.
  var 결과개수 = 30;

  // 첫 화면의 브랜드 필터. 지금은 쓸모가 적어 꺼 둔다(2026-09-06).
  // 코드는 지우지 않는다 — 목록 덮개 안에서는 같은 함수를 그대로 쓰고 있고,
  // 첫 화면에도 다시 필요해질 수 있다. true 로 바꾸면 그대로 돌아온다.
  var 본문브랜드필터 = false;

  var $ = function (id) { return document.getElementById(id); };

  // 화면에 보일 브랜드 이름. 데이터의 제조사 값은 건드리지 않는다 --
  // 그 값이 이미지 파일명(제조사_코드)에 쓰여서, 고치면 2,118장이 전부 깨진다.
  var 브랜드표시 = { 'LX': 'LX지인', '현대': '현대보닥' };
  function 브랜드(v) { return 브랜드표시[v] || v; }

  // 화이트·베이지처럼 밝은 필름은 흰 카드 위에서 경계가 사라진다.
  // 업체가 가장 많이 고르는 구간이 바로 여기라, 경계가 안 보이면 비교 자체가 안 된다.
  function 밝은가(p) { return !!(p && p.lab && p.lab.L >= 78); }

  function 이스케이프(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------- 시작 ---------- */

  // 연락처는 데이터를 기다릴 필요가 없다. 화면이 뜨는 즉시 보여야 한다.
  연락처그리기();

  function 연락처그리기() {
    var 설정 = (typeof FilmAd !== 'undefined' && FilmAd) || null;
    var 문 = 설정 && 설정.문의;
    var el = $('연락처');
    if (!el || !문 || !문.전화 || 문.켜기 === false) return;
    el.href = 'tel:' + 문.전화;
    el.setAttribute('aria-label', (문.머리 || '') + ' ' + 문.전화 + ' 전화하기');
    el.innerHTML =
      (문.머리 ? '<span class="머리">' + 이스케이프(문.머리) + '</span>' : '') +
      '<span class="전화">' + 이스케이프(문.전화) + '</span>';
    el.hidden = false;
  }

  // 질감은 film-db.json 과 따로 둔다. film-db.json 은 에어테이블에서 자동 생성되는 파일이라
  // 거기 손으로 넣은 값을 적으면 다음 생성 때 지워진다(한솔 색상값에서 이미 겪었다).
  // 따로 두면 파일 하나만 고쳐 올리면 되고, 되돌리기도 쉽다.
  Promise.all([
    fetch('film-db.json').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }),
    fetch('film_texture.json').then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; }),   // 질감이 없어도 도구는 그대로 돌아가야 한다
  ])
    .then(function (둘) { 질감붙이기(둘[0], 둘[1]); 시작(둘[0]); })
    .catch(function (e) {
      $('총건수').textContent = '데이터를 불러오지 못했습니다 (' + e.message + ')';
    });

  /* ---------- 질감 ----------

     제품 이미지로는 질감을 알 수 없다. 이미지의 25%가 사진이 아니라 단색 칠이고,
     이미지로 재면 촉감이 아니라 무늬를 재게 된다 — 매끈한 우드가 무늬만 진하면
     거침으로 찍힌다. 그래서 사람이 넣는다. film_texture.json 을 보라. */

  var 질감단계 = [];

  function 질감붙이기(목록, 질) {
    if (!질) return;
    질감단계 = 질.단계 || [];
    var 규칙 = 질.규칙 || [], 낱개 = 질.낱개 || {};
    var 씻기 = function (v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); };

    목록.forEach(function (p) {
      var 값 = null;
      for (var i = 0; i < 규칙.length; i++) {
        var r = 규칙[i];
        if (r.제조사 && p.제조사 !== r.제조사) continue;
        // 코드계열: 숫자 앞 글자만 정확히 비교한다. 'PS 계열' 이라 했을 때 PSM 까지
        // 딸려오는 것을 막는다(영림 PS 100건 vs PSM 19건은 다른 시리즈다).
        if (r.코드계열 && 씻기(p.코드).replace(/[0-9].*$/, '') !== 씻기(r.코드계열)) continue;
        if (r.코드시작 && 씻기(p.코드).indexOf(씻기(r.코드시작)) !== 0) continue;
        if (r.카테고리 && p.카테고리 !== r.카테고리) continue;
        if (r.세부분류 && p.세부분류 !== r.세부분류) continue;
        // 세부분류포함: '매트' 로 걸면 수퍼매트·소프트매트를 한 번에 잡는다.
        if (r.세부분류포함 && String(p.세부분류 || '').indexOf(r.세부분류포함) < 0) continue;
        값 = r.질감;                 // 뒤에 온 규칙이 앞 규칙을 덮는다
      }
      if (낱개[p.키]) 값 = 낱개[p.키];  // 낱개는 규칙을 언제나 이긴다
      if (값) p.질감 = 값;
    });
  }

  // 아직 안 채운 제품에는 아무것도 안 띄운다. 모르는 것을 '보통' 이라고 하면 거짓말이 된다.
  function 질감칸만들기(p) {
    if (!p.질감 || !질감단계.length) return null;
    var 자리 = 질감단계.indexOf(p.질감);
    if (자리 < 0) return null;
    var 비율 = 질감단계.length > 1 ? (자리 / (질감단계.length - 1)) * 100 : 50;

    // 색상띠와 같은 모양으로 둔다. 위아래로 나란히 놓이니 같은 방식으로 읽히는 편이 낫다.
    var 칸 = document.createElement('div');
    칸.className = '질감칸';
    칸.innerHTML =
      '<div class="질감띠"><span class="점" style="left:' + 비율.toFixed(1) + '%"></span></div>' +
      '<div class="질감눈금">' +
        '<span>매끈</span>' +
        '<span class="지금">' + 이스케이프(p.질감) + '</span>' +
        '<span>거침</span>' +
      '</div>';
    return 칸;
  }

  function 시작(목록) {
    전체 = 목록;
    var 브랜드수 = new Set(목록.map(function (p) { return p.제조사; })).size;
    $('총건수').textContent =
      브랜드수 + '개사 ' + 목록.length.toLocaleString() + '개 제품에서 찾습니다';

    저장목록 = 저장읽기();
    분류그리기();
    if (본문브랜드필터) {
      필터그리기($('필터'));
      $('필터').hidden = false;
    }
    묶기();
    저장함버튼갱신();
    경로적용();
    if (이번판에처음인가('방문')) 집계보내기('방문', '');
    기록목록 = 기록읽기();
    기록그리기();
    $('기록지우기').addEventListener('click', function () {
      기록목록 = [];
      기록쓰기();
      기록그리기();
      알림('기록을 지웠습니다');
    });
    공유링크처리();
  }

  /* ---------- 저장함 (즐겨찾기) ----------
     서버를 쓰지 않는다. 이 폰(브라우저)에만 저장한다.
     로그인을 걸면 즉시성이라는 이 도구의 장점이 사라지고, 정작 저장이 필요한
     순간(현장에서 고르는 중)에 가입하라고 막게 된다.
     여러 기기를 오가는 것은 공유 링크로 해결되므로 동기화가 없어도 막히지 않는다. */

  var 저장키 = 'filmdamoa_saved_v1';
  var 저장목록 = [];

  function 저장읽기() {
    try {
      var v = JSON.parse(localStorage.getItem(저장키) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }   // 시크릿 모드 등에서 접근이 막힐 수 있다
  }
  function 저장쓰기() {
    try { localStorage.setItem(저장키, JSON.stringify(저장목록)); } catch (e) { /* 무시 */ }
    저장함버튼갱신();
  }
  function 저장됨(p) { return 저장목록.indexOf(p.키) >= 0; }
  function 저장토글(p) {
    var i = 저장목록.indexOf(p.키);
    if (i >= 0) {
      저장목록.splice(i, 1);
    } else {
      저장목록.push(p.키);
      집계보내기('즐겨찾기', 브랜드(p.제조사) + ' ' + 제목(p));
    }
    저장쓰기();
  }
  function 저장함버튼갱신() {
    var b = $('저장함버튼');
    b.hidden = 저장목록.length === 0;
    b.textContent = '⭐ 즐겨찾기 ' + 저장목록.length + '개';
  }
  function 저장된제품들() {
    return 저장목록.map(function (k) {
      return 전체.filter(function (p) { return p.키 === k; })[0];
    }).filter(Boolean);
  }

  /* ---------- 여러 개 골라 한 번에 공유 ----------

     실제 영업이 그렇게 돌아간다. 고객에게 "이 중에 고르세요" 하고 2~3개를 보낸다.
     낱개 공유를 세 번 하면 카톡에 세 개의 카드가 흩어져서 비교가 안 된다.
     최대 3개로 묶는 이유: 카카오 리스트 템플릿이 3개까지 미리보기를 보여주고,
     사람이 한 번에 비교해서 고를 수 있는 개수도 그 정도다. */

  var 최대고르기 = 3;
  var 고른것 = [];          // 제품 키 배열

  function 고른제품들() {
    return 고른것.map(function (k) {
      return 전체.filter(function (p) { return p.키 === k; })[0];
    }).filter(Boolean);
  }

  function 고르기전환(p) {
    var i = 고른것.indexOf(p.키);
    if (i >= 0) 고른것.splice(i, 1);
    else if (고른것.length >= 최대고르기) { 알림('최대 ' + 최대고르기 + '개까지 고를 수 있습니다'); return; }
    else 고른것.push(p.키);
    고른것다시그리기();
  }

  function 고르기비우기() {
    if (!고른것.length) return;
    고른것 = [];
    고른것다시그리기();
  }

  // 카드는 본문 결과와 목록 덮개 두 곳에 있다. 다시 만들지 않고 표시만 갱신한다.
  // 표시 로직은 고른표시() 한 곳에만 둔다 — 같은 계산을 두 벌 두면 반드시 어긋난다.
  function 고른것다시그리기() {
    var 카드들 = document.querySelectorAll('.카드');
    for (var i = 0; i < 카드들.length; i++) {
      var 카 = 카드들[i], 단 = 카.querySelector('.고르기');
      if (단 && 카.제품) 고른표시(카, 단, 카.제품);
    }
    고른바그리기();
  }

  function 고른바그리기() {
    var 바 = document.querySelector('.고른바');
    var 목몸 = document.querySelector('.목록몸');
    if (!고른것.length) {
      if (바) 바.remove();
      if (목몸) 목몸.classList.remove('바있음');
      return;
    }
    if (!바) {
      바 = document.createElement('div');
      바.className = '고른바';
      바.innerHTML = '<span class="센글"></span>';

      var 풀 = document.createElement('button');
      풀.type = 'button'; 풀.className = '풀기'; 풀.textContent = '해제';
      풀.addEventListener('click', 고르기비우기);
      바.appendChild(풀);

      var 공 = document.createElement('button');
      공.type = 'button'; 공.className = '공유'; 공.textContent = '공유하기';
      공.addEventListener('click', function () {
        var 목 = 고른제품들();
        if (!목.length) return;
        공유하기(목, '필름 ' + 목.length + '개');
      });
      바.appendChild(공);
      document.body.appendChild(바);
    }
    바.querySelector('.센글').innerHTML =
      '<b>' + 고른것.length + '개</b> 선택 (최대 ' + 최대고르기 + '개)';
    if (목몸) 목몸.classList.add('바있음');
  }

  /* ---------- 사용 집계 ----------

     광고를 팔려면 "한 달에 몇 명이 쓴다"를 말할 수 있어야 하는데 지금은 그 숫자가 없다.
     n8n 웹훅으로 한 줄 보내고 에어테이블에 쌓는다. 외부 분석 서비스를 붙이지 않는 이유는
     방문자 데이터가 남의 서버로 넘어가고 쿠키 동의 배너가 필요해지기 때문이다.

     보내는 것: 무작위 방문자 번호, 유입경로, 무엇을 했는지, 분류·코드 정도.
     보내지 않는 것: IP, 기기 정보, 사진, 이름 — 아무것도.

     화면에는 아무것도 표시하지 않는다. 시작 단계에 "오늘 3명"이 찍히면
     처음 온 사람이 그대로 나가버린다. 숫자는 에어테이블에서만 본다. */

  var 방문자키 = 'filmdamoa_visitor_v1';
  var 이번판키 = 'filmdamoa_session_v1';

  function 방문자번호() {
    try {
      var v = localStorage.getItem(방문자키);
      if (!v) {
        v = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        localStorage.setItem(방문자키, v);
      }
      return v;
    } catch (e) { return 'v-알수없음'; }   // 시크릿 모드 등
  }

  // 같은 판(탭)에서 한 번만 보낼 일들을 기억한다. 상세를 스무 번 열어도 줄은 하나만 쌓인다.
  function 이번판에처음인가(무엇) {
    try {
      var 본것 = JSON.parse(sessionStorage.getItem(이번판키) || '[]');
      if (본것.indexOf(무엇) >= 0) return false;
      본것.push(무엇);
      sessionStorage.setItem(이번판키, JSON.stringify(본것));
      return true;
    } catch (e) { return false; }
  }

  function 집계보내기(행동, 상세) {
    var 설정 = 광고설정();
    var 집 = 설정 && 설정.집계;
    if (!집 || !집.켜기 || !집.주소) return;
    try {
      var 몸 = JSON.stringify({
        v: 방문자번호(),
        c: 지금경로() || '직접',
        a: 행동,
        d: String(상세 || '').slice(0, 60),
      });
      // text/plain 으로 보내는 이유: application/json 이면 브라우저가 사전요청(preflight)을
      // 먼저 던지고, 그게 막히면 조용히 안 간다. no-cors + text/plain 은 그냥 나간다.
      // keepalive 는 페이지를 떠나는 중에도 요청이 살아남게 한다.
      fetch(집.주소, {
        method: 'POST', mode: 'no-cors', keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: 몸,
      }).catch(function () { /* 집계가 실패해도 도구는 돌아가야 한다 */ });
    } catch (e) { /* 무시 */ }
  }

  /* ---------- 사진 검색 광고 화면 ----------

     1분견적의 견적 로딩 광고와 같은 방식이다. 다만 거기는 서버가 실제로 20~30초 걸리는
     동안 띄우는 것이고, 여기 색 매칭은 1밀리초도 안 걸린다. 이 대기는 순전히 광고를 위한
     것이므로 사진 한 장에 한 번만 띄운다 — 탭할 때마다 막으면 도구를 못 쓴다.
     (시공기사는 사진 한 장에서 문틀·몰딩·벽을 여러 번 찍어본다.) */

  var 광고본사진 = false;      // 이 사진에서 광고를 이미 봤는가

  function 광고설정() { return (typeof FilmAd !== 'undefined' && FilmAd) || null; }

  function 광고띄우기(끝나면) {
    var 설정 = 광고설정();
    var 광고들 = (설정 && 설정.광고들) || [];
    if (!설정 || !설정.켜기 || !광고들.length) { 끝나면(); return; }

    var 총초 = Math.max(1, 설정.초 || 10);
    var 덮 = document.createElement('div');
    덮.className = '광고덮개';
    덮.setAttribute('role', 'status');
    덮.setAttribute('aria-live', 'polite');

    var 첫 = 광고들[0];
    덮.innerHTML =
      '<div class="광고속">' +
        '<div class="광고눈썹">' + 이스케이프(설정.머리 || '') + '</div>' +
        '<div class="광고바">' +
          '<div class="광고바채움"></div>' +
          '<div class="광고바글"><span class="광고초">' + 총초 + '</span>초</div>' +
        '</div>' +
        '<p class="광고안내">' + 이스케이프(설정.안내 || '') + '</p>' +
      '</div>' +
      '<div class="광고칸">' +
        '<span class="표시">광고</span>' +
        (첫.사진 ? '<img class="사진" src="' + 이스케이프(첫.사진) + '" alt="">' : '') +
        '<span class="글">' + 이스케이프(첫.글 || '') + '</span>' +
        (첫.전화 ? '<a class="전화" href="tel:' + 이스케이프(첫.전화) + '">' + 이스케이프(첫.전화) + '</a>' : '') +
      '</div>';
    document.body.appendChild(덮);
    몸잠금();

    var 남음 = 총초;
    var 초시계 = setInterval(function () {
      남음--;
      var 채움 = 덮.querySelector('.광고바채움');
      var 숫자 = 덮.querySelector('.광고초');
      if (채움) 채움.style.width = Math.max(0, (남음 / 총초) * 100) + '%';
      if (숫자) 숫자.textContent = Math.max(0, 남음);
      if (남음 > 0) return;
      clearInterval(초시계);
      clearInterval(회전시계);
      덮.remove();
      몸잠금풀기();
      끝나면();
    }, 1000);

    // 광고가 여러 개면 번갈아 보여준다.
    var 회전시계 = null;
    if (광고들.length > 1) {
      var 번 = 0;
      회전시계 = setInterval(function () {
        번 = (번 + 1) % 광고들.length;
        var a = 광고들[번];
        var 글 = 덮.querySelector('.광고칸 .글');
        var 전 = 덮.querySelector('.광고칸 .전화');
        if (글) 글.textContent = a.글 || '';
        if (전 && a.전화) { 전.textContent = a.전화; 전.href = 'tel:' + a.전화; }
      }, Math.max(2, 설정.회전초 || 5) * 1000);
    }
  }

  /* ---------- 유입 경로 ----------

     ?c=pro  인테리어 업체에게 직접 보내는 주소
     ?c=band 인테리어필름 밴드에 올리는 주소
     한 번 들어오면 이 폰에 남겨서, 다음에 주소 없이 들어와도 같은 문구를 본다. */

  var 경로키 = 'filmdamoa_channel_v1';

  // 유입 경로 판단은 첫 화면 문구와 집계 두 곳에서 쓴다. 한 곳에만 둔다.
  function 지금경로() {
    var 설정 = 광고설정();
    var 표 = (설정 && 설정.경로) || {};
    var q = new URLSearchParams(location.search).get('c');
    if (q && 표[q]) {
      try { localStorage.setItem(경로키, q); } catch (e) { /* 무시 */ }
      return q;
    }
    try {
      var v = localStorage.getItem(경로키);
      return 표[v] ? v : null;
    } catch (e) { return null; }
  }

  function 경로적용() {
    var 설정 = 광고설정();
    var 표 = (설정 && 설정.경로) || {};
    var 지금 = 지금경로();
    if (!지금 || !표[지금]) return;

    var 띠 = document.createElement('p');
    띠.className = '경로띠';
    띠.textContent = 표[지금].문구;
    var 입구 = document.querySelector('.입구');
    if (입구) 입구.insertBefore(띠, 입구.firstChild);
  }

  /* ---------- 최근 본 필름 (기록) ----------

     현장에서는 조금 전에 본 필름을 다시 찾는 일이 잦은데, 검색을 다시 하면
     그 결과는 사라진다. 그래서 '열어본 것' 과 '공유한 것' 을 이 폰에 남긴다.
     즐겨찾기와 다른 점: 즐겨찾기는 손으로 고르는 것이고, 이건 저절로 쌓인다.

     30개인 이유는 검색 결과 개수와 같은 값을 쓴 것이다. 그보다 길어지면
     스크롤만 길어지고 정작 최근 것을 찾기 어려워진다. */

  var 기록키 = 'filmdamoa_recent_v1';
  var 기록목록 = [];               // 제품 키. 앞이 최근.
  var 기록최대 = 결과개수;

  function 기록읽기() {
    try {
      var v = JSON.parse(localStorage.getItem(기록키) || '[]');
      return Array.isArray(v) ? v.slice(0, 기록최대) : [];
    } catch (e) { return []; }
  }
  function 기록쓰기() {
    try { localStorage.setItem(기록키, JSON.stringify(기록목록)); } catch (e) { /* 무시 */ }
  }
  function 기록추가(제품들) {
    var 바뀜 = false;
    // 뒤에서부터 넣어야 여러 개를 한 번에 넣을 때 원래 순서가 앞쪽에 유지된다.
    [].concat(제품들).reverse().forEach(function (p) {
      if (!p || !p.키) return;
      var i = 기록목록.indexOf(p.키);
      if (i === 0) return;
      if (i > 0) 기록목록.splice(i, 1);
      기록목록.unshift(p.키);
      바뀜 = true;
    });
    if (!바뀜) return;
    if (기록목록.length > 기록최대) 기록목록.length = 기록최대;
    기록쓰기();
    기록그리기();
  }
  function 기록제품들() {
    return 기록목록.map(function (k) {
      return 전체.filter(function (p) { return p.키 === k; })[0];
    }).filter(Boolean);
  }
  function 기록그리기() {
    var 칸 = $('기록칸'), 격 = $('기록격자');
    var 목 = 기록제품들();
    칸.hidden = 목.length === 0;
    if (!목.length) { 격.innerHTML = ''; return; }
    $('기록제목').textContent = '최근 본 필름 ' + 목.length + '개' +
      (목.length >= 기록최대 ? ' (최대 ' + 기록최대 + '개)' : '');
    격.innerHTML = '';
    목.forEach(function (p) { 격.appendChild(카드만들기({ 제품: p, 등급: null })); });
  }

  /* ---------- 공유 ---------- */

  // JavaScript 키는 공개용이다. 소스에 박혀도 되는 값이고,
  // developers.kakao.com 에 등록한 웹 도메인에서만 동작하는 것이 잠금장치다.
  var 카카오키 = 'ee8944e8f43350a56405a34c31ef6f85';
  var 카카오됨 = false;
  try {
    if (window.Kakao && !window.Kakao.isInitialized()) window.Kakao.init(카카오키);
    카카오됨 = !!(window.Kakao && window.Kakao.isInitialized() &&
                 window.Kakao.Share && window.Kakao.Share.sendDefault);
  } catch (e) { 카카오됨 = false; }

  function 절대주소(경로) { return location.origin + location.pathname.replace(/[^/]*$/, '') + 경로; }

  function 필름이미지(p) {
    return (p && !p.사진무효) ? 절대주소('img/card/' + encodeURIComponent(p.키) + '.webp') : '';
  }
  function 필름설명(p) {
    return p ? [브랜드(p.제조사), p.HEX, p.카테고리].filter(Boolean).join(' · ') : '';
  }

  function 카카오보내기(제품들, 제목, url) {
    var 링크 = { mobileWebUrl: url, webUrl: url };

    // 여러 개를 보낼 때는 리스트 템플릿을 쓴다. 피드 템플릿은 구조상 카드 하나에
    // 이미지 하나라서, 즐겨찾기 3개를 보내도 한 개만 보낸 것처럼 보인다.
    // 리스트는 각 필름이 제 이미지와 제 링크를 갖는다.
    // 카카오 리스트 템플릿은 항목 2~3개만 허용하므로 앞의 3개까지만 싣고,
    // 전체 개수는 머리말에 적는다.
    if (제품들.length >= 2) {
      var 항목 = 제품들.slice(0, 3).map(function (p) {
        var 하나 = 공유주소([p]);
        return {
          title: 브랜드(p.제조사) + ' ' + 제목표시(p),
          description: 필름설명(p),
          imageUrl: 필름이미지(p),
          link: { mobileWebUrl: 하나, webUrl: 하나 },
        };
      });
      // 머리 이미지가 없으면 카드가 글씨만 있는 밋밋한 상자로 보인다.
      // 이미지가 있는 첫 제품을 대표로 쓴다(PDF 출처 5건은 제품 사진이 아니라 시공사례라 뺀다).
      var 대표 = 제품들.filter(function (q) { return 필름이미지(q); })[0];
      var 보낼것 = {
        objectType: 'list',
        headerTitle: '필름 ' + 제품들.length + '개',
        headerLink: 링크,
        contents: 항목,
        buttons: [{ title: '전체 보기', link: 링크 }],
        installTalk: true,
      };
      if (대표) 보낼것.headerImageUrl = 필름이미지(대표);
      window.Kakao.Share.sendDefault(보낼것);
      return;
    }

    var p = 제품들[0];
    window.Kakao.Share.sendDefault({
      objectType: 'feed',
      content: {
        title: 제목,
        description: 필름설명(p),
        imageUrl: 필름이미지(p),
        link: 링크,
      },
      buttons: [{ title: '필름 보기', link: 링크 }],
      installTalk: true,
    });
  }

  // 쉼표(?f=a,b)를 쓰지 않는다. 카카오처럼 링크를 검사·가공하는 중계자를 거치면
  // 쉼표가 인코딩되거나 잘려서 클릭이 깨진다. 반복 파라미터(?f=a&f=b)는 안전하다.
  function 공유주소(제품들) {
    // 주소에 한글을 넣지 않는다. 키(예: '현대_S248')를 쓰면 퍼센트 인코딩이 들어가는데,
    // 카카오처럼 링크를 검사·가공하는 중계자를 거치면 % 가 다시 인코딩되어(%EC → %25EC)
    // 클릭이 깨진다. 쉼표 때 겪은 것과 같은 부류의 문제다.
    // 레코드 id 는 순수 영숫자(rec024JQMaq1Qlswa)라 어떤 중계자를 거쳐도 변하지 않는다.
    return location.origin + location.pathname + '?' +
      제품들.map(function (p) { return 'r=' + p.id; }).join('&');
  }

  // 카카오톡 인앱 브라우저(안드로이드 WebView)에는 navigator.share 가 아예 없다.
  // 그래서 폰에서 공유를 눌러도 시스템 공유창이 안 뜨고 조용히 복사만 됐다.
  // 있으면 시스템 공유창을 쓰고, 없으면 우리가 만든 공유창을 띄운다.
  function 공유하기(제품들, 제목) {
    기록추가(제품들);
    집계보내기('공유', 제품들.length + '개');
    var url = 공유주소(제품들);

    // 카카오톡 공유가 가능하면 우리 창을 먼저 띄운다.
    // 시스템 공유창은 주소만 넘기고, 그러면 카톡이 페이지의 OG 태그를 긁어가서
    // 어느 필름을 보내든 똑같은 카드가 된다. 우리 창의 카카오톡 항목은
    // 그 필름의 썸네일과 코드가 담긴 카드를 보낸다.
    if (카카오됨) { 공유창(제목, url, 제품들); return; }

    if (navigator.share) {
      navigator.share({ title: 제목, url: url }).catch(function (e) {
        if (e && e.name === 'AbortError') return;   // 사용자가 닫은 것
        공유창(제목, url, 제품들);
      });
      return;
    }
    공유창(제목, url, 제품들);
  }

  // 인앱 브라우저에서도 실제로 동작하는 것만 넣는다.
  // 카카오톡으로 바로 보내기는 카카오 JS SDK 와 앱키가 있어야 해서 지금은 넣지 못한다.
  function 공유창(제목, url, 공유대상) {
    var 덮 = document.createElement('div');
    덮.className = '덮개 공유덮개';

    var 시트 = document.createElement('div');
    시트.className = '공유시트';
    시트.setAttribute('role', 'dialog');
    시트.setAttribute('aria-label', '공유하기');

    var 머리 = document.createElement('div');
    머리.className = '공유머리';
    머리.textContent = 제목;
    시트.appendChild(머리);

    var 주소칸 = document.createElement('div');
    주소칸.className = '공유주소';
    주소칸.textContent = url;
    시트.appendChild(주소칸);

    var 닫기 = function () { 덮.remove(); 몸잠금풀기(); };

    var 항목들 = [];
    if (카카오됨 && 공유대상 && 공유대상.length) {
      항목들.push(['💛  카카오톡으로 보내기', function () {
        try { 카카오보내기(공유대상, 제목, url); }
        catch (e) { 알림('카카오톡 공유에 실패했습니다. 링크를 복사해 주세요'); }
        닫기();
      }]);
    }
    항목들.push(
      ['📋  링크 복사', function () {
        복사(url).then(function (ok) {
          알림(ok ? '링크를 복사했습니다. 카톡에 붙여넣기 하세요' : '복사에 실패했습니다');
        });
        닫기();
      }],
      ['💬  문자로 보내기', function () {
        // sms: 는 인앱 브라우저에서도 문자 앱이 열린다.
        location.href = 'sms:?body=' + encodeURIComponent(제목 + String.fromCharCode(10) + url);
        닫기();
      }]);
    항목들.forEach(function (쌍) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = '공유항목';
      b.textContent = 쌍[0];
      b.addEventListener('click', 쌍[1]);
      시트.appendChild(b);
    });

    var 취소 = document.createElement('button');
    취소.type = 'button';
    취소.className = '공유취소';
    취소.textContent = '취소';
    취소.addEventListener('click', 닫기);
    시트.appendChild(취소);

    덮.appendChild(시트);
    덮.addEventListener('click', function (e) { if (e.target === 덮) 닫기(); });
    document.body.appendChild(덮);
    몸잠금();
  }

  // 인앱 브라우저·http 환경에서는 navigator.clipboard 가 없을 수 있다.
  // index_app.js 에서 쓰던 것과 같은 대비책을 둔다.
  function 복사(글) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(글).then(
        function () { return true; },
        function () { return 옛복사(글); });
    }
    return Promise.resolve(옛복사(글));
  }
  function 옛복사(글) {
    var t = document.createElement('textarea');
    t.value = 글;
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.focus(); t.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(t);
    return ok;
  }

  var 알림타이머 = null;
  function 알림(글) {
    var 옛 = document.querySelector('.알림');
    if (옛) 옛.remove();
    var d = document.createElement('div');
    d.className = '알림';
    d.setAttribute('role', 'status');
    d.textContent = 글;
    document.body.appendChild(d);
    clearTimeout(알림타이머);
    알림타이머 = setTimeout(function () { d.remove(); }, 2200);
  }

  // 덮개가 여러 겹 뜰 수 있어서(목록 위에 상세, 그 위에 공유창) 열린 개수를 센다.
  // 하나만 닫혔다고 스크롤을 풀어버리면 뒤에 남은 덮개 뒤로 본문이 스크롤된다.
  var 잠금수 = 0;
  function 몸잠금() { 잠금수++; document.body.style.overflow = 'hidden'; }
  function 몸잠금풀기() { 잠금수 = Math.max(0, 잠금수 - 1); if (!잠금수) document.body.style.overflow = ''; }

  /* ---------- 컬러별 보기 ---------- */

  function 분류그리기() {
    칸에분류(그리기대상('일반색'), $('일반격자'), '일반색');
    칸에분류(그리기대상('우드'), $('우드격자'), '우드');
  }
  function 그리기대상(군) { return M.분류목록(전체, 군); }

  // 각 분류의 얼굴로 쓸 제품 하나를 고른다.
  // 그 분류의 한가운데 밝기이면서 이미지가 가장 깨끗한(균일도 낮은) 것을 고른다.
  // 연출 사진이나 조명 그라데이션이 심한 것을 얼굴로 내세우면 분류를 오해하게 된다.
  function 대표제품(목록) {
    var 후보 = 목록.filter(function (p) { return !p.사진무효; });
    if (!후보.length) return 목록[0] || null;
    var Ls = 후보.map(function (p) { return p.lab.L; }).sort(function (a, b) { return a - b; });
    var 가운데 = Ls[Ls.length >> 1];
    var 가까운 = 후보.slice().sort(function (a, b) {
      return Math.abs(a.lab.L - 가운데) - Math.abs(b.lab.L - 가운데);
    }).slice(0, Math.max(1, Math.round(후보.length * 0.3)));
    가까운.sort(function (a, b) {
      return (a.균일도 == null ? 99 : a.균일도) - (b.균일도 == null ? 99 : b.균일도);
    });
    return 가까운[0];
  }

  function 칸에분류(목록, 상자, 군) {
    상자.innerHTML = '';
    목록.forEach(function (x) {
      var 속한 = M.분류목록보기(전체, 군, x.값);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = '분류버튼';

      // 우드는 무늬가 핵심이라 실제 제품 썸네일을 보여준다.
      // 일반색은 무늬가 없으니 납작한 색칩이 오히려 잘 읽힌다.
      if (군 === '우드') {
        var 대표 = 대표제품(속한);
        var img = document.createElement('img');
        img.className = '미리' + (밝은가(대표제품(속한)) ? ' 밝음' : '');
        img.loading = 'lazy';
        img.decoding = 'async';
        img.alt = '';
        if (대표 && !대표.사진무효) img.src = 'img/grid/' + encodeURIComponent(대표.키) + '.webp';
        else if (대표) img.style.background = 대표.HEX;
        b.appendChild(img);
      } else {
        var 대표2 = 속한[Math.floor(속한.length / 2)];
        var 칩 = document.createElement('span');
        칩.className = '미리' + (밝은가(대표2) ? ' 밝음' : '');
        칩.style.background = 대표2 ? 대표2.HEX : '#ddd';
        b.appendChild(칩);
      }

      var 몸 = document.createElement('div');
      몸.className = '몸';
      몸.innerHTML =
        '<div class="이름">' + 이스케이프(x.값) + '</div>' +
        (x.설명 ? '<div class="설명">' + 이스케이프(x.설명) + '</div>' : '') +
        '<div class="건수">' + x.건수 + '개</div>';
      b.appendChild(몸);

      b.addEventListener('click', function () {
        집계보내기('컬러보기', x.값);
        목록열기({
          제목: 군 === '우드' ? x.값 + ' 우드' : x.값,
          곁: x.건수 + '개',
          설명: x.설명 || '',
          제품들: 속한,
          정렬이름: x.값,
        });
      });
      상자.appendChild(b);
    });
  }

  /* ---------- 목록 덮개 ----------
     분류·즐겨찾기·공유받은 목록을 화면 위에 덮어서 보여준다.
     본문(검색창·사진)을 밀어내지 않아서 닫으면 하던 자리로 그대로 돌아온다. */

  var 목록상태 = null;

  function 목록열기(옵션) {
    목록상태 = 옵션;
    목록그리기();
    $('목록덮개').hidden = false;
    몸잠금();
  }
  function 목록닫기() {
    if ($('목록덮개').hidden) return;
    $('목록덮개').hidden = true;
    목록상태 = null;
    고르기비우기();

    // 첫 화면에 브랜드 필터를 안 띄우는 동안에는, 목록에서 켠 브랜드를 여기서 풀어야 한다.
    // 안 그러면 본문 결과가 보이지 않는 조건으로 계속 좁혀지고 사용자는 이유를 알 수 없다.
    if (!본문브랜드필터 && (필터.제조사 || []).length) {
      필터.제조사 = [];
      if (질의 || 글자) 검색();
    }
    몸잠금풀기();
  }

  function 목록그리기() {
    if (!목록상태) return;
    var 판 = $('목록판');
    판.innerHTML = '';

    var 머리 = document.createElement('div');
    머리.className = '목록머리';
    var 줄 = document.createElement('div');
    줄.className = '줄';
    var 왼 = document.createElement('div');
    왼.innerHTML = '<h2>' + 이스케이프(목록상태.제목) +
                   (목록상태.곁 ? ' <span class="곁">(' + 이스케이프(목록상태.곁) + ')</span>' : '') +
                   '</h2>' +
                   (목록상태.설명 ? '<div class="목록설명">' + 이스케이프(목록상태.설명) + '</div>' : '');
    줄.appendChild(왼);
    var 닫 = document.createElement('button');
    닫.type = 'button'; 닫.className = '닫기'; 닫.textContent = '✕';
    닫.setAttribute('aria-label', '닫기');
    닫.addEventListener('click', 목록닫기);
    줄.appendChild(닫);
    머리.appendChild(줄);

    // 브랜드 필터는 훑어볼 때 가장 자주 쓰므로 목록 안에도 둔다.
    var 필칸 = document.createElement('div');
    필칸.className = '필터';
    필칸.style.margin = '10px 0 0';
    필터그리기(필칸, 목록상태.제품들);
    머리.appendChild(필칸);
    판.appendChild(머리);

    var 몸 = document.createElement('div');
    몸.className = '목록몸';

    var 보일것 = 목록상태.제품들
      .filter(function (p) { return M.통과(p, 필터); })
      .sort(M.훑어보기정렬(목록상태.정렬이름 || null));

    if (!보일것.length) {
      var 빈 = document.createElement('div');
      빈.className = '빈결과';
      빈.textContent = '이 브랜드에는 해당하는 제품이 없습니다.';
      몸.appendChild(빈);
    } else {
      var 격 = document.createElement('div');
      격.className = '격자';
      보일것.forEach(function (p) { 격.appendChild(카드만들기({ 제품: p, 등급: null })); });
      몸.appendChild(격);
    }

    if (목록상태.공유 && 보일것.length) {
      var 감 = document.createElement('div');
      감.className = '결과하단';
      var 공 = document.createElement('button');
      공.type = 'button';
      공.className = '상세버튼 주된';
      공.textContent = 목록상태.공유;
      공.addEventListener('click', function () {
        공유하기(보일것, '필름 ' + 보일것.length + '개');
      });
      감.appendChild(공);
      몸.appendChild(감);
    }

    판.appendChild(몸);
    몸.scrollTop = 0;
    고른바그리기();
  }

  /* ---------- 브랜드 필터 ---------- */

  // 칩 목록을 데이터에서 만든다. 한솔이 6번째로 들어왔고 앞으로도 추가된다.
  // 목록을 코드에 박아두면 그때마다 고쳐야 한다.
  //
  // 같은 필터 상태를 본문과 목록 덮개 두 곳에 그리므로 컨테이너를 받는다.
  // 건수는 '지금 보고 있는 범위' 에서 센다. 덮개에서 '블루 68개' 라고 해놓고
  // 칩에는 전체 기준(삼성 484 …)을 띄우면 합이 안 맞아 헷갈린다.
  // 그 범위에 없는 브랜드는 칩 자체를 만들지 않는다 — 눌러도 0개인 버튼은 쓸모가 없다.
  function 필터그리기(상자, 대상) {
    상자.innerHTML = '';
    var 후보 = M.필터후보(대상 || 전체, '제조사');
    if (후보.length < 2) return;

    // 예전에는 칩을 한 줄에 늘어놓고 가로로 밀어 보게 했는데, 브랜드가 6개라
    // 폰 화면에서 뒤쪽 두세 개가 잘려 보이지도 않았다. 있는 줄도 모르는 필터는 없는 것과 같다.
    // 줄바꿈 격자에 담고 이름과 건수를 위아래로 나눠 한 화면에 다 보이게 한다.
    var 라벨 = document.createElement('div');
    라벨.className = '칩분류';
    라벨.textContent = '브랜드';
    상자.appendChild(라벨);

    var 줄 = document.createElement('div');
    줄.className = '필터줄';

    후보.forEach(function (x) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = '칩버튼';
      b.innerHTML = '<span class="이름">' + 이스케이프(브랜드(x.값)) + '</span>' +
                    '<span class="건수">' + x.건수 + '</span>';
      var 켜짐 = (필터.제조사 || []).indexOf(x.값) >= 0;
      b.setAttribute('aria-pressed', String(켜짐));
      b.addEventListener('click', function () {
        var 켬 = b.getAttribute('aria-pressed') === 'true';
        필터.제조사 = (필터.제조사 || []).filter(function (v) { return v !== x.값; });
        if (!켬) 필터.제조사.push(x.값);
        if (본문브랜드필터) 필터그리기($('필터'));   // 본문 쪽은 전체 기준으로 다시 그린다
        if (목록상태) 목록그리기();      // 목록이 열려 있으면 즉시 반영
        else 검색();
      });
      줄.appendChild(b);
    });
    상자.appendChild(줄);
  }

  /* ---------- 입구 전환 ----------
     찾는 방법은 세 가지(코드·사진·컬러별)인데, 하나를 쓰면 앞서 쓰던 것이
     화면에 남아 쌓이면 안 된다. 코드로 찾았는데 위에 사진과 컬러 목록이
     그대로 있으면 지금 무엇을 보고 있는 건지 알 수가 없다.
     그래서 입구를 하나 열면 나머지는 정리한다. */
  function 입구전환(어느) {
    if (어느 !== '사진') {
      질의 = null;
      원본캔버스 = null;
      보정계수 = null;
      $('사진칸').hidden = true;
      $('탭표시').hidden = true;
      $('뽑힌색').hidden = true;
      $('사진입력').value = '';   // 같은 사진을 다시 골라도 change 가 뜨게 한다
    }
    if (어느 !== '코드') {
      글자 = '';
      $('글자입력').value = '';
    }
    if (어느 !== '컬러') {
      $('컬러버튼').setAttribute('aria-expanded', 'false');
      $('컬러칸').hidden = true;
    }
    목록닫기();
  }

  /* ---------- 묶기 ---------- */

  function 묶기() {
    $('사진입력').addEventListener('change', 사진받기);

    $('코드폼').addEventListener('submit', function (e) {
      e.preventDefault();
      var 값 = $('글자입력').value.trim();
      입구전환('코드');
      글자 = 값;
      $('글자입력').value = 값;
      $('글자입력').blur();
      if (값) 집계보내기('코드검색', 값);
      검색();
    });
    // 지우면 결과도 즉시 지운다. 검색 버튼을 다시 누르게 만들 이유가 없다.
    $('글자입력').addEventListener('input', function () {
      if (!this.value.trim() && 글자) { 글자 = ''; 검색(); }
    });

    // 첫 화면은 컬러칸을 펼친 채로 시작한다(index.html 에서 열어 둠).
    // 접혀 있으면 첫 화면에 검색창 몇 개만 남아 볼 것이 없다.
    // 코드·사진으로 찾기 시작하면 입구전환()이 알아서 접는다.
    $('컬러버튼').addEventListener('click', function () {
      var 열림 = this.getAttribute('aria-expanded') === 'true';
      if (열림) { 입구전환(null); return; }   // 접기
      입구전환('컬러');
      this.setAttribute('aria-expanded', 'true');
      $('컬러칸').hidden = false;
      결과그리기([], '');
    });

    $('저장함버튼').addEventListener('click', function () {
      var 목 = 저장된제품들();
      목록열기({
        제목: '즐겨찾기 저장함',
        곁: 목.length + '개',
        제품들: 목,
        공유: '즐겨찾기 전체 공유하기',
      });
    });

    $('캔버스').addEventListener('click', 캔버스탭);

    $('덮개').addEventListener('click', function (e) { if (e.target === $('덮개')) 상세닫기(); });
    $('목록덮개').addEventListener('click', function (e) { if (e.target === $('목록덮개')) 목록닫기(); });

    // 위에 있는 것부터 닫는다. 상세를 보다 ESC 를 누르면 상세만 닫히고 목록은 남아야 한다.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var 공 = document.querySelector('.공유덮개');
      if (공) { 공.remove(); 몸잠금풀기(); return; }
      if (!$('덮개').hidden) { 상세닫기(); return; }
      목록닫기();
    });
  }

  // 공유 링크로 들어온 경우 그 목록을 바로 덮개로 보여준다.
  function 공유링크처리() {
    var q = new URLSearchParams(location.search);
    // r= 은 레코드 id(현재 형식), f= 는 키(예전에 나간 링크). 이미 카톡에 돌아다니는
    // 링크들이 있으므로 옛 형식도 계속 읽어야 한다.
    var id들 = [], 키들 = [];
    q.getAll('r').forEach(function (v) {
      v.split(',').forEach(function (x) { if (x) id들.push(x); });
    });
    q.getAll('f').forEach(function (v) {
      v.split(',').forEach(function (x) { if (x) 키들.push(x); });
    });
    if (!id들.length && !키들.length) return;
    var 받은 = id들.map(function (v) {
      return 전체.filter(function (p) { return p.id === v; })[0];
    }).concat(키들.map(function (k) {
      return 전체.filter(function (p) { return p.키 === k; })[0];
    })).filter(Boolean);
    if (!받은.length) { 알림('공유된 필름을 찾지 못했습니다'); return; }
    목록열기({ 제목: '공유받은 필름', 곁: 받은.length + '개', 제품들: 받은 });
  }

  /* ---------- 사진 ---------- */

  var 원본캔버스 = null;
  var 보정계수 = null;      // 이 사진의 조명 보정 계수. 사진을 올릴 때 한 번 구한다.

  // 조명 보정 설정. 2026-09-06 실사진 87건 측정에서 고른 값이다.
  //   흰점        화면에서 가장 밝은 쪽(흰 종이·흰 벽)을 흰색으로 본다
  //   기준 245    그 흰색이 245 가 되도록 밀어 노출까지 맞춘다
  //   검은점빼기  유리·인화면에서 번진 빛이 모든 채널에 더해 놓은 바닥값을 뺀다
  //   무채색문턱  가장 밝은 쪽이 뚜렷한 색이면(창문·색등) 노출은 건드리지 않고 색만 맞춘다
  //   세기 0.6    추정한 만큼을 60% 만 되돌린다
  //
  // 세기를 1 이 아니라 0.6 으로 둔 이유가 중요하다. 건별로 재보니
  //   세기 1.0 → 74% 가 좋아지고 20% 가 나빠지며, 그중 10% 는 ΔE 가 2 이상 크게 나빠진다
  //   세기 0.6 → 83% 가 좋아지고 11% 가 나빠지며, 크게 나빠지는 건은 0% 다
  // '가장 밝은 것은 완전한 무채색' 이라는 가정이 늘 조금 틀리기 때문이다.
  // 끝까지 되돌리면 그 틀린 만큼이 그대로 오차가 된다. 부분만 되돌리는 쪽이 안전하다.
  var 보정설정 = { 방식: '흰점', 기준: 245, 검은점빼기: true, 한계: 2.5, 무채색문턱: 0.18, 세기: 0.6 };

  function 사진받기(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;

    // imageOrientation 을 빼면 안 된다. 폰으로 세로로 찍은 사진의 EXIF 회전이 무시되어
    // 옆으로 누운 채 들어간다. quote_photos.js 에서 같은 문제를 겪었다.
    createImageBitmap(file, { imageOrientation: 'from-image' })
      .then(function (bmp) {
        var 최대 = 1400;
        var 배 = Math.min(1, 최대 / Math.max(bmp.width, bmp.height));
        var w = Math.max(1, Math.round(bmp.width * 배));
        var h = Math.max(1, Math.round(bmp.height * 배));

        var cv = $('캔버스');
        cv.width = w; cv.height = h;
        cv.getContext('2d', { willReadFrequently: true }).drawImage(bmp, 0, 0, w, h);
        bmp.close();

        입구전환('사진');
        원본캔버스 = cv;
        보정계수 = 조명계수구하기(cv);
        광고본사진 = false;      // 사진 한 장에 한 번만 광고를 띄운다
        $('사진안내').hidden = false;
        $('사진칸').hidden = false;
        결과그리기([], '사진에서 찾으려는 부분을 눌러보세요');
      })
      .catch(function () {
        alert('사진을 읽지 못했습니다. 다른 사진으로 시도해 주세요.');
      });
  }

  // 사진 한 장에서 조명 보정 계수를 한 번만 구한다. 탭할 때마다 다시 하면 느리고,
  // 무엇보다 탭 위치에 따라 보정이 달라져서 같은 색판을 두 번 찍으면 다른 색이 나온다.
  //
  // 격자로 걸러 뽑는 이유는 속도다. 100만 화소를 다 넣으나 1/16 만 넣으나 추정값은 사실상 같다.
  // 이 간격은 filmdb/검증/측정.js 의 것과 같아야 측정값이 앱 동작과 일치한다.
  var 표본간격 = 4;

  function 조명계수구하기(cv) {
    try {
      var d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height).data;
      var 뽑음 = [];
      for (var y = 0; y < cv.height; y += 표본간격) {
        for (var x = 0; x < cv.width; x += 표본간격) {
          var i = (y * cv.width + x) * 4;
          뽑음.push(d[i], d[i + 1], d[i + 2], d[i + 3]);
        }
      }
      return C.보정계수(뽑음, 보정설정);
    } catch (e) {
      return null;   // 보정을 못 해도 검색 자체는 되어야 한다
    }
  }

  function 캔버스탭(e) {
    if (!원본캔버스) return;
    var cv = 원본캔버스;
    var r = cv.getBoundingClientRect();
    if (r.width < 5) return;
    var 배율 = cv.width / r.width;

    var x = Math.round((e.clientX - r.left) * 배율);
    var y = Math.round((e.clientY - r.top) * 배율);

    // 한 픽셀이 아니라 주변 원 영역을 읽는다. 한 점만 읽으면 노이즈 하나에 결과가 뒤집힌다.
    var 반지름 = Math.max(8, Math.round(cv.width * 0.035));
    var 색 = 영역읽기(cv, x, y, 반지름);
    if (!색) return;

    // 탭 위치 표시. 어디를 찍었는지 보여야 다시 찍을 판단이 선다.
    var 표 = $('탭표시');
    표.style.left = (x / 배율) + 'px';
    표.style.top = (y / 배율) + 'px';
    표.hidden = false;
    $('사진안내').hidden = true;

    var hex = C.rgb를hex.apply(null, labRgb(색.대표색));
    $('색칩').style.background = hex;
    $('색코드').textContent = hex;
    $('뽑힌색').hidden = false;

    질의 = { lab: 색.대표색, 대비폭: 색.대비폭 };

    // 사진에서 처음 색을 뽑는 순간에만 광고를 띄운다. 두 번째 탭부터는 바로 나온다.
    if (!광고본사진) {
      광고본사진 = true;
      집계보내기('사진찾기', '');
      광고띄우기(검색);
      return;
    }
    검색();
  }

  // 원 안의 픽셀만 모아 film_color 의 영역색() 에 넘긴다.
  // 사각형이 아니라 원인 이유: 손가락이 가리키는 건 점이지 상자가 아니다.
  function 영역읽기(cv, cx, cy, 반지름) {
    var x0 = Math.max(0, cx - 반지름), y0 = Math.max(0, cy - 반지름);
    var x1 = Math.min(cv.width, cx + 반지름), y1 = Math.min(cv.height, cy + 반지름);
    var w = x1 - x0, h = y1 - y0;
    if (w < 3 || h < 3) return null;

    var d = cv.getContext('2d', { willReadFrequently: true }).getImageData(x0, y0, w, h).data;
    var 뽑음 = [];
    var r2 = 반지름 * 반지름;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var dx = (x0 + x) - cx, dy = (y0 + y) - cy;
        if (dx * dx + dy * dy > r2) continue;
        var i = (y * w + x) * 4;
        뽑음.push(d[i], d[i + 1], d[i + 2], d[i + 3]);
      }
    }
    return C.영역색(보정계수 ? C.조명보정(뽑음, 보정계수.이득, 보정계수.검은점) : 뽑음);
  }

  // Lab -> RGB. 표시 전용이며 매칭은 Lab 으로만 한다.
  function labRgb(lab) {
    var f = function (t) { return t > 0.206893 ? t * t * t : (t - 16 / 116) / 7.787; };
    var fy = (lab.L + 16) / 116, fx = fy + lab.a / 500, fz = fy - lab.b / 200;
    var X = f(fx) * 0.95047, Y = f(fy), Z = f(fz) * 1.08883;
    var g = function (c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; };
    return [
      g(X * 3.2406 + Y * -1.5372 + Z * -0.4986) * 255,
      g(X * -0.9689 + Y * 1.8758 + Z * 0.0415) * 255,
      g(X * 0.0557 + Y * -0.2040 + Z * 1.0570) * 255,
    ];
  }

  /* ---------- 검색 (사진 · 코드) ---------- */

  function 검색() {
    // 코드·이름 검색은 색과 별개다. 코드를 아는 사람은 색이 필요 없다.
    if (글자) {
      var 낮 = 글자.toLowerCase();
      var 목 = 전체.filter(function (p) {
        if (!M.통과(p, 필터)) return false;
        return (p.코드 && p.코드.toLowerCase().indexOf(낮) >= 0) ||
               (p.색상명 && p.색상명.toLowerCase().indexOf(낮) >= 0);
      }).sort(M.훑어보기정렬(null)).slice(0, 결과개수);
      결과그리기(목.map(function (p) { return { 제품: p, 등급: null }; }),
        목.length
          ? '<b>' + 목.length + '개</b> 찾음' +
            (목.length >= 결과개수 ? ' (많아서 ' + 결과개수 + '개까지만)' : '')
          : '');
      return;
    }

    if (질의) {
      var 결과 = M.검색(전체, 질의, 필터, { 개수: 결과개수 });

      // 브랜드를 좁혀둔 채로 0개가 나오면 사용자는 왜 없는지 모른다.
      // 목록에서 켠 필터가 본문 검색에도 계속 걸려 있는 상황이라 특히 헷갈린다.
      // 풀면 몇 개가 있는지 알려주고 바로 풀 수 있게 한다.
      if (!결과.length && (필터.제조사 || []).length) {
        var 밖 = M.검색(전체, 질의, null, { 개수: 결과개수 });
        결과그리기([], '', 밖.length ? {
          안내: '고른 브랜드에는 비슷한 제품이 없습니다.',
          버튼: '브랜드 필터를 풀고 다시 찾기 (' + 밖.length + '개)',
          동작: function () {
            필터.제조사 = [];
            if (본문브랜드필터) 필터그리기($('필터'));
            if (목록상태) 목록그리기();
            검색();
          },
        } : null);
        return;
      }
      if (!결과.length) { 결과그리기([], ''); return; }

      // 상한을 5 에서 12 로 늘리면서 결과가 거의 항상 30개 나온다.
      // 가장 가까운 것이 ΔE 12 인데도 "이 중에 있습니다" 라고 하면 거짓말이다.
      // 제일 가까운 색이 얼마나 가까운지에 따라 말을 바꾼다.
      var 최고 = 결과[0].ΔE;
      var 머리글 = 최고 <= 2
        ? '거의 같은 색을 찾았습니다. 아래에서 비교해 보세요.'
        : (최고 <= 5
            ? '이 <b>' + 결과.length + '개</b> 중에 있습니다. 비교해서 고르세요.'
            : '<b>딱 맞는 색은 없습니다.</b> 가까운 순서로 보여드립니다.');
      결과그리기(결과, 머리글);
      return;
    }

    결과그리기([], '');
  }

  function 결과그리기(목록, 머리, 제안) {
    $('결과머리').innerHTML = 머리 || '';
    var 격자 = $('격자');
    격자.innerHTML = '';

    if (!목록.length) {
      if (!질의 && !글자) return;   // 첫 화면에서는 빈 상자를 띄우지 않는다
      var 빈 = document.createElement('div');
      빈.className = '빈결과';

      // 막다른 골목에서 빠져나갈 길을 같이 준다.
      if (제안) {
        빈.textContent = 제안.안내;
        var 풀기 = document.createElement('button');
        풀기.type = 'button';
        풀기.className = '빈결과버튼';
        풀기.textContent = 제안.버튼;
        풀기.addEventListener('click', 제안.동작);
        빈.appendChild(풀기);
        격자.appendChild(빈);
        return;
      }

      빈.textContent = 글자
        ? '해당하는 코드·이름이 없습니다.'
        : '비슷한 제품이 없습니다. 사진의 다른 부분을 눌러보세요.';
      격자.appendChild(빈);
      return;
    }
    목록.forEach(function (x) { 격자.appendChild(카드만들기(x)); });
  }

  /* ---------- 카드 · 상세 ---------- */

  function 카드만들기(x) {
    var p = x.제품;
    var b = document.createElement('button');
    b.type = 'button';
    // 밝은 필름은 카드째로 회색 테를 두른다. 흰 카드 위에서는 경계가 사라지기 때문이다.
    b.className = '카드' + (밝은가(p) ? ' 밝은카드' : '');
    b.제품 = p;

    // 색상출처가 PDF 카탈로그인 건은 미러링한 이미지가 시공사례 사진이라 제품이 아니다.
    // 그런 사진을 보여주면 사용자가 그게 필름 무늬라고 오해한다. 색칩으로 대체한다.
    if (p.사진무효) {
      var 칩 = document.createElement('span');
      칩.className = '칩썸';
      칩.style.background = p.HEX;
      b.appendChild(칩);
    } else {
      var img = document.createElement('img');
      img.className = '썸';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = 브랜드(p.제조사) + ' ' + 제목(p);
      img.src = 'img/grid/' + encodeURIComponent(p.키) + '.webp';
      b.appendChild(img);
    }

    var 몸 = document.createElement('div');
    몸.className = '몸';
    몸.innerHTML =
      '<div class="브랜드">' + 이스케이프(브랜드(p.제조사)) + '</div>' +
      '<div class="코드">' + 이스케이프(제목(p)) + '</div>' +
      (x.등급 ? '<div class="등급">' + x.등급 + '</div>' : '');
    b.appendChild(몸);

    b.addEventListener('click', function () { 상세열기(p, x); });

    // 여러 개를 한 번에 공유하려면 카드마다 고르는 자리가 있어야 한다.
    // 카드 본체를 누르면 상세가 열리는 동작은 그대로 두고, 동그란 단추만 따로 받는다.
    var 고 = document.createElement('button');
    고.type = 'button';
    고.className = '고르기';
    고.addEventListener('click', function (e) {
      e.stopPropagation();          // 카드 클릭(상세 열기)까지 번지면 안 된다
      고르기전환(p);
    });
    b.appendChild(고);
    고른표시(b, 고, p);
    return b;
  }

  function 고른표시(카드, 단추, p) {
    var 켜짐 = 고른것.indexOf(p.키) >= 0;
    단추.setAttribute('aria-pressed', 켜짐 ? 'true' : 'false');
    단추.setAttribute('aria-label', (켜짐 ? '선택 해제' : '공유할 필름으로 선택') + ' ' + 제목(p));
    단추.textContent = 켜짐 ? '✓' : '';
    카드.classList.toggle('골라짐', 켜짐);
  }

  /* ---------- 색 자리 ----------

     색판만 덩그러니 보여주면 기준이 없어서 "이 베이지가 얼마나 진한 건지" 판단이 안 된다.
     폰 화면에서는 특히 그렇다 — 옆에 비교할 것이 없으면 어떤 베이지든 그냥 베이지로 보인다.
     그래서 포토샵 색 선택창처럼, 그 색이 색 공간의 어디쯤에 놓이는지를 같이 보여준다.
     왼쪽 위로 갈수록 옅고, 오른쪽으로 갈수록 진하고, 아래로 갈수록 어둡다.

     캔버스를 쓰지 않고 CSS 그러데이션 두 겹으로 그린다. 포토샵이 그리는 방식과 같다:
       바탕 = 그 색의 순색(채도·명도 최대)
       가로 = 흰색 → 투명 (채도)
       세로 = 투명 → 검정 (명도) */

  function hsb(hex) {
    var c = C.hex를rgb(hex);
    var r = c.r / 255, g = c.g / 255, b = c.b / 255;
    var 최대 = Math.max(r, g, b), 최소 = Math.min(r, g, b), 폭 = 최대 - 최소;
    var h = 0;
    if (폭 > 0) {
      if (최대 === r) h = ((g - b) / 폭) % 6;
      else if (최대 === g) h = (b - r) / 폭 + 2;
      else h = (r - g) / 폭 + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h: h, s: 최대 === 0 ? 0 : 폭 / 최대, b: 최대 };
  }

  function 색자리만들기(p) {
    var v = hsb(p.HEX);
    var 순색 = 'hsl(' + v.h.toFixed(0) + ', 100%, 50%)';

    var 칸 = document.createElement('div');
    칸.className = '색자리';
    칸.innerHTML =
      '<div class="색판" style="background:' + 순색 + '">' +
        '<div class="가로덮개"></div><div class="세로덮개"></div>' +
        '<span class="점" style="left:' + (v.s * 100).toFixed(1) + '%;top:' + ((1 - v.b) * 100).toFixed(1) + '%"></span>' +
      '</div>' +
      '<div class="색상띠"><span class="점" style="left:' + (v.h / 360 * 100).toFixed(1) + '%"></span></div>' +
      '<div class="눈금">' +
        '<span><b>옅기</b>' + Math.round((1 - v.s) * 100) + '</span>' +
        '<span><b>밝기</b>' + Math.round(v.b * 100) + '</span>' +
        '<span><b>L*</b>' + (p.lab ? p.lab.L.toFixed(0) : '-') + '</span>' +
        '<span><b>a*</b>' + (p.lab ? p.lab.a.toFixed(0) : '-') + '</span>' +
        '<span><b>b*</b>' + (p.lab ? p.lab.b.toFixed(0) : '-') + '</span>' +
      '</div>';
    return 칸;
  }

  // 대소문자·공백·기호를 걷어내고 비교한다. 'ZX145(XP105)' 같은 값이 섞여 있다.
  function 맞춰보기(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  // 코드미확인 14건은 코드 자리에 제품명이 들어 있다. 그걸 코드처럼 보여주면 안 된다.
  function 제목(p) { return p.코드미확인 ? (p.색상명 || p.코드) : p.코드; }
  var 제목표시 = 제목;

  function 상세열기(p, 결과) {
    기록추가(p);
    if (이번판에처음인가('상세')) 집계보내기('상세보기', 브랜드(p.제조사) + ' ' + 제목(p));
    var el = $('상세');
    el.innerHTML = '';

    var 머리 = document.createElement('div');
    머리.className = '상세머리';
    머리.innerHTML =
      '<div><div class="브랜드">' + 이스케이프(브랜드(p.제조사)) + '</div>' +
      '<h2>' + 이스케이프(제목(p)) + '</h2></div>';
    var 닫 = document.createElement('button');
    닫.className = '닫기'; 닫.type = 'button'; 닫.textContent = '✕';
    닫.setAttribute('aria-label', '닫기');
    닫.addEventListener('click', 상세닫기);
    머리.appendChild(닫);
    el.appendChild(머리);

    // 견본은 중간 회색 바탕 위에 얹는다. 흰 판 위에 올리면 화이트·아이보리 필름이
    // 배경과 붙어버려 무슨 색인지 분간이 안 된다. 브랜드 홈페이지들도 같은 이유로
    // 견본 뒤에 짙은 바탕을 깐다.
    var 바탕 = document.createElement('div');
    바탕.className = '견본바탕';
    if (p.사진무효) {
      var 칩 = document.createElement('span');
      칩.className = '상세칩';
      칩.style.background = p.HEX;
      바탕.appendChild(칩);
    } else {
      var img = document.createElement('img');
      img.className = '상세이미지';
      img.alt = 브랜드(p.제조사) + ' ' + 제목(p);
      img.src = 'img/card/' + encodeURIComponent(p.키) + '.webp';
      바탕.appendChild(img);
    }
    el.appendChild(바탕);

    // 사용자가 알아야 할 한계를 숨기지 않는다.
    if (p.코드미확인) {
      el.appendChild(주의만들기(
        '제조사가 아직 제품 코드를 공개하지 않은 신제품입니다. ' +
        '위 이름은 제품명이며 발주용 코드가 아닙니다. 대리점에 확인이 필요합니다.'));
    }
    if (p.색출처) {
      el.appendChild(주의만들기(
        '이 제품의 색은 인쇄 카탈로그에서 얻은 값입니다(제조사 사이트에 견본 이미지가 없음). ' +
        '인쇄색이라 다른 제품과 기준이 미세하게 다를 수 있습니다.'));
    }
    if (p.균일도 != null && p.균일도 > 15) {
      el.appendChild(주의만들기(
        '견본 이미지의 색이 위치에 따라 크게 다릅니다(메탈처럼 보는 각도에 따라 색이 변하는 제품일 수 있음). ' +
        '대표색 하나로는 실물을 표현하기 어려우니 반드시 실물 견본을 확인하세요.'));
    }

    el.appendChild(색자리만들기(p));
    var 질칸 = 질감칸만들기(p);
    if (질칸) el.appendChild(질칸);

    var 표 = document.createElement('table');
    표.className = '표';
    var 줄 = [];
    // 색상명 칸에 코드가 그대로 들어 있는 제품이 482건 있다(현대가 대부분).
    // 그러면 제목에 이미 있는 코드를 '색상명' 이라는 이름표를 달고 한 번 더 보여주는 꼴이라
    // 칸 이름이 틀린 것처럼 보인다. 같은 값이면 줄을 통째로 뺀다.
    //
    // 이름표를 '필름넘버' 로 바꾸는 방법도 있지만 그러면 안 된다.
    // 색상명에 진짜 색 이름이 든 제품이 1,004건이다(Leaf Green, 베이라이트오크, 매트 딥블루…).
    // 그것들이 전부 '필름넘버: Leaf Green' 이 되어 버린다.
    var 이름과코드가같다 = 맞춰보기(p.색상명) === 맞춰보기(p.코드);
    if (p.색상명 && !p.코드미확인 && !이름과코드가같다) 줄.push(['색상명', p.색상명]);
    if (p.코드미확인) 줄.push(['코드', '미확정']);
    줄.push(['색상', p.HEX + (p.색상계열 ? ' · ' + p.색상계열 : '')]);
    if (p.카테고리) 줄.push(['종류', p.카테고리 + (p.세부분류 && p.세부분류 !== p.카테고리 ? ' · ' + p.세부분류 : '')]);
    if (p.명도) 줄.push(['밝기', p.명도]);
    if (p.광택) 줄.push(['광택', p.광택]);
    if (p.방염) 줄.push(['방염', '방염 등급 제품']);
    if (결과 && 결과.등급) 줄.push(['색 차이', 결과.등급 + ' (ΔE ' + 결과.ΔE.toFixed(2) + ')']);
    표.innerHTML = 줄.map(function (r) {
      return '<tr><th>' + 이스케이프(r[0]) + '</th><td>' + 이스케이프(String(r[1])) + '</td></tr>';
    }).join('');
    el.appendChild(표);

    // 저장·공유는 정보 바로 아래에 둔다. 정보를 보고 판단한 직후가 누를 때다.
    var 동작 = document.createElement('div');
    동작.className = '상세동작';

    var 저장버튼 = document.createElement('button');
    저장버튼.type = 'button';
    var 저장문구 = function () {
      저장버튼.textContent = 저장됨(p) ? '★ 즐겨찾기 저장됨' : '☆ 즐겨찾기 저장';
      저장버튼.setAttribute('aria-pressed', String(저장됨(p)));
    };
    저장문구();
    저장버튼.addEventListener('click', function () {
      저장토글(p);
      저장문구();
      알림(저장됨(p) ? '즐겨찾기에 담았습니다' : '즐겨찾기에서 뺐습니다');
      if (목록상태 && 목록상태.공유) {          // 즐겨찾기 목록을 보고 있으면 즉시 반영
        목록상태.제품들 = 저장된제품들();
        목록상태.곁 = 목록상태.제품들.length + '개';
        목록그리기();
      }
    });
    동작.appendChild(저장버튼);

    var 공유버튼 = document.createElement('button');
    공유버튼.type = 'button';
    공유버튼.textContent = '공유';
    공유버튼.addEventListener('click', function () {
      공유하기([p], 브랜드(p.제조사) + ' ' + 제목(p));
    });
    동작.appendChild(공유버튼);
    el.appendChild(동작);

    if (p.상세URL) {
      var a = document.createElement('a');
      a.className = '상세버튼';
      a.href = p.상세URL; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = '제조사 페이지에서 보기';
      el.appendChild(a);
    }

    // 자재상·시공기사가 매일 겪는 질문이다. "재고가 없다, 다른 브랜드로 뭐가 제일 가깝나".
    // 측정 결과 86.7% 가 타 브랜드에 ΔE 2 이내 대체품을 갖는다. 사진 매칭보다 성공률이 높다.
    var 교차 = document.createElement('button');
    교차.type = 'button';
    교차.className = '상세버튼 주된';
    교차.textContent = '다른 브랜드에서 비슷한 것 찾기';
    교차.addEventListener('click', function () { 대체품보이기(p, el); });
    el.appendChild(교차);

    $('덮개').hidden = false;
    el.scrollTop = 0;
    몸잠금();
  }

  function 대체품보이기(p, el) {
    var 결과 = M.타브랜드대체품(전체, p, { 개수: 8 });
    var 옛 = el.querySelector('.대체품');
    if (옛) 옛.remove();

    var 감 = document.createElement('div');
    감.className = '대체품';
    var 제 = document.createElement('p');
    제.className = '소제목';
    제.textContent = 결과.length
      ? '다른 브랜드의 비슷한 제품 ' + 결과.length + '개'
      : '다른 브랜드에 비슷한 제품이 없습니다';
    감.appendChild(제);

    if (결과.length) {
      var 격 = document.createElement('div');
      격.className = '격자';
      결과.forEach(function (x) { 격.appendChild(카드만들기(x)); });
      감.appendChild(격);
    }
    el.appendChild(감);
    감.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function 주의만들기(글) {
    var d = document.createElement('div');
    d.className = '주의';
    d.textContent = 글;
    return d;
  }

  function 상세닫기() {
    if ($('덮개').hidden) return;
    $('덮개').hidden = true;
    몸잠금풀기();
  }
})();
