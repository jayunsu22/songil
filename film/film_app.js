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

  var $ = function (id) { return document.getElementById(id); };

  // 화면에 보일 브랜드 이름. 데이터의 제조사 값은 건드리지 않는다 --
  // 그 값이 이미지 파일명(제조사_코드)에 쓰여서, 고치면 2,118장이 전부 깨진다.
  var 브랜드표시 = { 'LX': 'LX지인', '현대': '현대보닥' };
  function 브랜드(v) { return 브랜드표시[v] || v; }

  function 이스케이프(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------- 시작 ---------- */

  fetch('film-db.json')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(시작)
    .catch(function (e) {
      $('총건수').textContent = '데이터를 불러오지 못했습니다 (' + e.message + ')';
    });

  function 시작(목록) {
    전체 = 목록;
    var 브랜드수 = new Set(목록.map(function (p) { return p.제조사; })).size;
    $('총건수').textContent =
      브랜드수 + '개사 ' + 목록.length.toLocaleString() + '개 제품에서 찾습니다';

    저장목록 = 저장읽기();
    분류그리기();
    필터그리기($('필터'));
    $('필터').hidden = false;
    묶기();
    저장함버튼갱신();
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
    if (i >= 0) 저장목록.splice(i, 1); else 저장목록.push(p.키);
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

  function 카카오보내기(제품들, 제목, url) {
    var p = 제품들[0];
    // 이미지는 있으면 좋고 없어도 카드는 나간다. 우리 썸네일은 WebP 인데
    // 카카오가 WebP 를 받아주는지 확인되지 않아, 실패해도 깨지지 않게 둔다.
    var 이미지 = (p && !p.사진무효)
      ? 절대주소('img/card/' + encodeURIComponent(p.키) + '.webp')
      : '';
    var 설명 = 제품들.length > 1
      ? '필름 ' + 제품들.length + '개'
      : (p ? [브랜드(p.제조사), p.HEX, p.카테고리].filter(Boolean).join(' · ') : '');

    window.Kakao.Share.sendDefault({
      objectType: 'feed',
      content: {
        title: 제목,
        description: 설명,
        imageUrl: 이미지,
        link: { mobileWebUrl: url, webUrl: url },
      },
      buttons: [{ title: '필름 보기', link: { mobileWebUrl: url, webUrl: url } }],
      installTalk: true,
    });
  }

  function 공유주소(제품들) {
    return location.origin + location.pathname + '?f=' +
      제품들.map(function (p) { return encodeURIComponent(p.키); }).join(',');
  }

  // 카카오톡 인앱 브라우저(안드로이드 WebView)에는 navigator.share 가 아예 없다.
  // 그래서 폰에서 공유를 눌러도 시스템 공유창이 안 뜨고 조용히 복사만 됐다.
  // 있으면 시스템 공유창을 쓰고, 없으면 우리가 만든 공유창을 띄운다.
  function 공유하기(제품들, 제목) {
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
        img.className = '미리';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.alt = '';
        if (대표 && !대표.사진무효) img.src = 'img/grid/' + encodeURIComponent(대표.키) + '.webp';
        else if (대표) img.style.background = 대표.HEX;
        b.appendChild(img);
      } else {
        var 대표2 = 속한[Math.floor(속한.length / 2)];
        var 칩 = document.createElement('span');
        칩.className = '미리';
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
        목록열기({
          제목: 군 === '우드' ? x.값 + ' 우드' : x.값,
          곁: (x.설명 ? x.설명 + ' · ' : '') + x.건수 + '개',
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
    왼.innerHTML = '<h2>' + 이스케이프(목록상태.제목) + '</h2>' +
                   (목록상태.곁 ? '<div class="곁">' + 이스케이프(목록상태.곁) + '</div>' : '');
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

    var 줄 = document.createElement('div');
    줄.className = '필터줄';
    var 라벨 = document.createElement('span');
    라벨.className = '칩분류';
    라벨.textContent = '브랜드';
    줄.appendChild(라벨);

    후보.forEach(function (x) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = '칩버튼';
      b.textContent = 브랜드(x.값) + ' ' + x.건수;
      var 켜짐 = (필터.제조사 || []).indexOf(x.값) >= 0;
      b.setAttribute('aria-pressed', String(켜짐));
      b.addEventListener('click', function () {
        var 켬 = b.getAttribute('aria-pressed') === 'true';
        필터.제조사 = (필터.제조사 || []).filter(function (v) { return v !== x.값; });
        if (!켬) 필터.제조사.push(x.값);
        필터그리기($('필터'));          // 본문 쪽은 전체 기준으로 다시 그린다
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
      검색();
    });
    // 지우면 결과도 즉시 지운다. 검색 버튼을 다시 누르게 만들 이유가 없다.
    $('글자입력').addEventListener('input', function () {
      if (!this.value.trim() && 글자) { 글자 = ''; 검색(); }
    });

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
    var f = new URLSearchParams(location.search).get('f');
    if (!f) return;
    var 받은 = f.split(',').map(function (x) {
      var k = decodeURIComponent(x);
      return 전체.filter(function (p) { return p.키 === k; })[0];
    }).filter(Boolean);
    if (!받은.length) { 알림('공유된 필름을 찾지 못했습니다'); return; }
    목록열기({ 제목: '공유받은 필름', 곁: 받은.length + '개', 제품들: 받은 });
  }

  /* ---------- 사진 ---------- */

  var 원본캔버스 = null;

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
        $('사진안내').hidden = false;
        $('사진칸').hidden = false;
        결과그리기([], '사진에서 찾으려는 부분을 눌러보세요');
      })
      .catch(function () {
        alert('사진을 읽지 못했습니다. 다른 사진으로 시도해 주세요.');
      });
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
    return C.영역색(뽑음);
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
            필터그리기($('필터'));
            if (목록상태) 목록그리기();
            검색();
          },
        } : null);
        return;
      }
      if (!결과.length) { 결과그리기([], ''); return; }
      결과그리기(결과, '이 <b>' + 결과.length + '개</b> 중에 있습니다. 비교해서 고르세요.');
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
    b.className = '카드';

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
    return b;
  }

  // 코드미확인 14건은 코드 자리에 제품명이 들어 있다. 그걸 코드처럼 보여주면 안 된다.
  function 제목(p) { return p.코드미확인 ? (p.색상명 || p.코드) : p.코드; }

  function 상세열기(p, 결과) {
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

    if (p.사진무효) {
      var 칩 = document.createElement('span');
      칩.className = '상세칩';
      칩.style.background = p.HEX;
      el.appendChild(칩);
    } else {
      var img = document.createElement('img');
      img.className = '상세이미지';
      img.alt = 브랜드(p.제조사) + ' ' + 제목(p);
      img.src = 'img/card/' + encodeURIComponent(p.키) + '.webp';
      el.appendChild(img);
    }

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

    var 표 = document.createElement('table');
    표.className = '표';
    var 줄 = [];
    if (p.색상명 && !p.코드미확인) 줄.push(['색상명', p.색상명]);
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
