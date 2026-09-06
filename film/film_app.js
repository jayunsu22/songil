// 필름다모아 화면.
//
// 계산은 전부 film_color.js / film_match.js 가 한다. 여기는 화면만 다룬다.
// 그렇게 나눠야 순위 규칙을 node 로 테스트할 수 있고, 실사진으로 가중치를 조정할 때
// 화면 코드를 건드리지 않는다.
//
// 서버를 쓰지 않는다. film-db.json(gzip 151KB)을 한 번 받아 브라우저에서 전부 계산한다.
// 2,118건 ΔE2000 계산은 1ms 미만이라 사진을 다시 누를 때마다 즉시 갱신된다.
// 사진은 업로드하지 않는다. 캔버스에서 읽고 끝이다.

(function () {
  'use strict';

  var C = window.FilmColor;
  var M = window.FilmMatch;

  var 전체 = [];
  var 질의 = null;               // { lab, 대비폭? }  사진·색 입력
  var 글자 = '';                 // 코드·이름 입력
  var 필터 = {};                 // { 제조사: [...] }
  var 선택분류 = null;           // { 군: '우드'|'일반색', 이름: '밝은' } — 훑어보기 선택
  var 현재군 = '우드';
  var 보기 = null;               // '저장함' | '공유받음' | null

  var $ = function (id) { return document.getElementById(id); };

  // 화면에 보일 브랜드 이름. 데이터의 제조사 값은 건드리지 않는다 --
  // 그 값이 이미지 파일명(제조사_코드)에 쓰여서, 고치면 2,118장이 전부 깨진다.
  var 브랜드표시 = { 'LX': 'LX지인', '현대': '현대보닥' };
  function 브랜드(v) { return 브랜드표시[v] || v; }

  /* ---------- 저장함 ----------
     서버를 쓰지 않는다. 이 폰(브라우저)에만 저장한다.
     로그인을 걸면 즉시성이라는 이 도구의 장점이 사라지고, 정작 저장이 필요한
     순간(현장에서 고르는 중)에 가입하라고 막게 된다. 공유는 URL 로 해결되므로
     여러 기기를 오가는 것도 링크로 된다. */
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
    b.textContent = '⭐ 저장함 ' + 저장목록.length + '개';
    b.setAttribute('aria-pressed', String(보기 === '저장함'));
  }

  /* ---------- 공유 ----------
     선택한 필름을 주소에 실어 보낸다. 받는 사람도 가입이 필요 없고 서버도 없다.
     견적서 링크를 줄일 때 쓴 방식과 같은 생각이다. */
  function 공유주소(제품들) {
    var base = location.origin + location.pathname;
    return base + '?f=' + 제품들.map(function (p) { return encodeURIComponent(p.키); }).join(',');
  }

  async function 공유하기(제품들, 제목) {
    var url = 공유주소(제품들);
    // 폰에서는 카톡 등으로 바로 넘길 수 있다. 안 되면 주소를 복사해 준다.
    if (navigator.share) {
      try { await navigator.share({ title: 제목, url: url }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      알림('링크를 복사했습니다');
    } catch (e) {
      알림('복사에 실패했습니다. 주소창을 길게 눌러 복사해 주세요');
    }
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
    $('총건수').textContent = brandLine(브랜드수, 목록.length);
    저장목록 = 저장읽기();
    필터그리기();
    묶기();
    저장함버튼갱신();

    // 공유 링크로 들어온 경우 그 목록을 바로 보여준다.
    var f = new URLSearchParams(location.search).get('f');
    if (f) {
      var 키들 = f.split(',').map(function (x) { return decodeURIComponent(x); });
      var 받은 = 키들.map(function (k) {
        return 전체.filter(function (p) { return p.키 === k; })[0];
      }).filter(Boolean);
      if (받은.length) {
        보기 = '공유받음';
        공유받음목록 = 받은;
        검색();
        return;
      }
      알림('공유된 필름을 찾지 못했습니다');
    }
    결과그리기([], '');
  }

  var 공유받음목록 = [];

  // 저장함/공유받음 보기는 '그 목록만' 보여주는 상태다. 사용자가 다른 조작을 하면
  // 거기서 빠져나와야 한다. 안 그러면 공유 링크로 들어온 사람이 그 목록에 갇힌다.
  function 보기해제() {
    if (!보기) return;
    보기 = null;
    공유받음목록 = [];
    저장함버튼갱신();
  }

  function brandLine(브랜드수, 건수) {
    return 브랜드수 + '개사 ' + 건수.toLocaleString() + '개 제품에서 찾습니다';
  }

  /* ---------- 필터 칩 ---------- */

  // 칩 목록을 데이터에서 만든다. 브랜드가 늘어나면 칩도 저절로 늘어난다.
  // 한솔이 6번째로 들어왔고 앞으로도 추가된다. 목록을 코드에 박아두면 그때마다 고쳐야 한다.
  function 필터그리기() {
    var 상자 = $('필터');
    상자.innerHTML = '';
    // 종류·밝기 칩은 없앴다. 우드/일반색 훑어보기 분류가 그 둘을 이미 담고 있어서
    // 같은 일을 하는 조작이 두 벌이 되면 사용자가 헷갈린다. 브랜드만 남긴다.
    [['제조사', '브랜드']].forEach(function (쌍) {
      var 키 = 쌍[0], 이름 = 쌍[1];
      var 후보 = M.필터후보(전체, 키);
      if (후보.length < 2) return;

      var 줄 = document.createElement('div');
      줄.className = '필터줄';
      var 라벨 = document.createElement('span');
      라벨.className = '칩분류';
      라벨.textContent = 이름;
      줄.appendChild(라벨);

      후보.forEach(function (x) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = '칩버튼';
        b.textContent = 브랜드(x.값) + ' ' + x.건수;
        b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', function () {
          보기해제();
          var 켬 = b.getAttribute('aria-pressed') === 'true';
          b.setAttribute('aria-pressed', 켬 ? 'false' : 'true');
          필터[키] = (필터[키] || []).filter(function (v) { return v !== x.값; });
          if (!켬) 필터[키].push(x.값);
          검색();
        });
        줄.appendChild(b);
      });
      상자.appendChild(줄);
    });
    상자.hidden = false;
  }

  /* ---------- 입구 전환 ---------- */

  function 칸열기(어느) {
    $('사진칸').hidden = 어느 !== '사진' || !사진준비됨;
    $('분류칸').hidden = 어느 !== '분류';
    $('글자칸').hidden = 어느 !== '글자';
    $('색버튼').setAttribute('aria-pressed', String(어느 === '분류'));
    $('글자버튼').setAttribute('aria-pressed', String(어느 === '글자'));
  }

  var 사진준비됨 = false;

  function 묶기() {
    $('사진입력').addEventListener('change', 사진받기);

    $('색버튼').addEventListener('click', function () {
      보기해제();
      var 켬 = $('색버튼').getAttribute('aria-pressed') === 'true';
      칸열기(켬 ? null : '분류');
      if (켬) { 선택분류 = null; 검색(); }
      else 분류그리기();
    });

    $('저장함버튼').addEventListener('click', function () {
      보기 = (보기 === '저장함') ? null : '저장함';
      if (보기 === '저장함') { 선택분류 = null; 글자 = ''; $('글자입력').value = ''; 칸열기(null); }
      저장함버튼갱신();
      검색();
    });

    $('군우드').addEventListener('click', function () { 군바꾸기('우드'); });
    $('군일반').addEventListener('click', function () { 군바꾸기('일반색'); });

    $('글자버튼').addEventListener('click', function () {
      보기해제();
      var 켬 = $('글자버튼').getAttribute('aria-pressed') === 'true';
      // 코드를 아는 사람에게 분류 필터를 걸면 안 된다. 훑어보기가 아니라 정확한 조회다.
      // '아주 밝은 우드' 를 보던 중에 CW469(짙은 우드)를 치면 0개가 나오는데,
      // 화면만 보면 "그런 코드가 없나 보다" 로 오해한다.
      if (!켬) { 선택분류 = null; 분류그리기(); }
      칸열기(켬 ? null : '글자');
      if (!켬) setTimeout(function () { $('글자입력').focus(); }, 50);
      else { 글자 = ''; $('글자입력').value = ''; 검색(); }
    });

    $('글자입력').addEventListener('input', function () {
      보기해제();
      글자 = this.value.trim();
      검색();
    });

    var cv = $('캔버스');
    cv.addEventListener('click', 캔버스탭);

    $('덮개').addEventListener('click', function (e) {
      if (e.target === $('덮개')) 상세닫기();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') 상세닫기();
    });
  }

  /* ---------- 색·톤으로 훑어보기 ---------- */

  function 군바꾸기(군) {
    보기해제();
    현재군 = 군;
    선택분류 = null;
    $('군우드').setAttribute('aria-pressed', String(군 === '우드'));
    $('군일반').setAttribute('aria-pressed', String(군 === '일반색'));
    분류그리기();
    검색();
  }

  // 각 분류의 얼굴로 쓸 제품 하나를 고른다.
  // 그 분류의 한가운데 밝기이면서, 이미지가 가장 깨끗한(균일도 낮은) 것을 고른다.
  // 연출 사진이나 조명 그라데이션이 심한 것을 얼굴로 내세우면 분류를 오해하게 된다.
  function 대표제품(목록) {
    var 후보 = 목록.filter(function (p) { return !p.사진무효; });
    if (!후보.length) return 목록[0] || null;
    var Ls = 후보.map(function (p) { return p.lab.L; }).sort(function (a, b) { return a - b; });
    var 가운데 = Ls[Ls.length >> 1];
    // 한가운데 밝기 근처 30% 안에서 가장 깨끗한 것
    var 가까운 = 후보.slice().sort(function (a, b) {
      return Math.abs(a.lab.L - 가운데) - Math.abs(b.lab.L - 가운데);
    }).slice(0, Math.max(1, Math.round(후보.length * 0.3)));
    가까운.sort(function (a, b) { return (a.균일도 == null ? 99 : a.균일도) - (b.균일도 == null ? 99 : b.균일도); });
    return 가까운[0];
  }

  function 분류그리기() {
    var 상자 = $('분류격자');
    상자.innerHTML = '';
    M.분류목록(전체, 현재군).forEach(function (x) {
      var 속한 = M.분류목록보기(전체, 현재군, x.값);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = '분류버튼';
      b.setAttribute('aria-pressed', String(!!선택분류 && 선택분류.이름 === x.값));

      // 우드는 무늬가 핵심이라 실제 제품 썸네일을 보여준다.
      // 일반색은 무늬가 없으니 납작한 색칩이 오히려 잘 읽힌다.
      if (현재군 === '우드') {
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
        보기해제();
        var 켬 = 선택분류 && 선택분류.이름 === x.값;
        선택분류 = 켬 ? null : { 군: 현재군, 이름: x.값 };
        분류그리기();
        검색();
      });
      상자.appendChild(b);
    });
  }

  /* ---------- 사진 ---------- */

  var 원본캔버스 = null;   // 색을 읽는 원본 해상도
  var 표시배율 = 1;

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

        보기해제();
        원본캔버스 = cv;
        사진준비됨 = true;
        질의 = null;
        $('탭표시').hidden = true;
        $('뽑힌색').hidden = true;
        $('사진안내').hidden = false;
        칸열기('사진');
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
    표시배율 = cv.width / r.width;

    var x = Math.round((e.clientX - r.left) * 표시배율);
    var y = Math.round((e.clientY - r.top) * 표시배율);

    // 한 픽셀이 아니라 주변 원 영역을 읽는다. 한 점만 읽으면 노이즈 하나에 결과가 뒤집힌다.
    var 반지름 = Math.max(8, Math.round(cv.width * 0.035));
    var 색 = 영역읽기(cv, x, y, 반지름);
    if (!색) return;

    // 탭 위치 표시. 어디를 찍었는지 보여야 다시 찍을 판단이 선다.
    var 표 = $('탭표시');
    표.style.left = ((x / 표시배율)) + 'px';
    표.style.top = ((y / 표시배율)) + 'px';
    표.hidden = false;
    $('사진안내').hidden = true;

    $('색칩').style.background = C.rgb를hex(
      labRgb(색.대표색)[0], labRgb(색.대표색)[1], labRgb(색.대표색)[2]);
    $('색코드').textContent = C.rgb를hex(
      labRgb(색.대표색)[0], labRgb(색.대표색)[1], labRgb(색.대표색)[2]);
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

  /* ---------- 검색 ---------- */

  // 선택한 분류는 필터로 작동한다. 사진을 올린 상태에서 '짙은 우드'를 누르면
  // 짙은 우드 안에서만 사진과 가까운 것을 찾는다 -- 조작 두 개가 싸우지 않는다.
  function 대상목록() {
    if (!선택분류) return 전체;
    // 한 제품이 여러 분류에 속할 수 있다. 경계에 걸린 제품은 양쪽에서 다 보여야 한다.
    return 전체.filter(function (p) {
      return M.속하나(p, 선택분류.군, 선택분류.이름);
    });
  }

  // 정렬은 film_match 의 훑어보기정렬() 하나만 쓴다.
  // 화면에 따로 만들어 뒀더니 film_match 만 고쳤을 때 화면이 안 따라와서
  // 블랙이 '가장 검은 것부터'로 안 바뀌는 버그가 났다. 정렬 규칙은 한 곳에만 둔다.
  function 정렬() {
    return M.훑어보기정렬(선택분류 ? 선택분류.이름 : null);
  }

  function 분류이름() {
    return 선택분류 ? (선택분류.군 === '우드' ? 선택분류.이름 + ' 우드' : 선택분류.이름) : '';
  }

  function 검색() {
    // 저장함과 공유받은 목록은 다른 조건과 섞이지 않는다. 그 자체가 하나의 목록이다.
    if (보기 === '저장함') {
      var 저장된 = 저장목록.map(function (k) {
        return 전체.filter(function (p) { return p.키 === k; })[0];
      }).filter(Boolean).sort(M.훑어보기정렬(null));
      결과그리기(저장된.map(function (p) { return { 제품: p, 등급: null }; }),
        저장된.length ? '<b>저장함</b> ' + 저장된.length + '개' : '',
        null,
        저장된.length ? { 글: '저장함 공유하기', 동작: function () {
          공유하기(저장된, '필름 ' + 저장된.length + '개');
        } } : null);
      return;
    }
    if (보기 === '공유받음') {
      결과그리기(공유받음목록.map(function (p) { return { 제품: p, 등급: null }; }),
        '<b>공유받은 필름</b> ' + 공유받음목록.length + '개');
      return;
    }

    var 대상 = 대상목록();

    // 글자 검색은 색과 별개다. 코드를 아는 사람은 색이 필요 없다.
    if (글자) {
      var 낮 = 글자.toLowerCase();
      var 목 = 대상.filter(function (p) {
        if (!M.통과(p, 필터)) return false;
        return (p.코드 && p.코드.toLowerCase().indexOf(낮) >= 0) ||
               (p.색상명 && p.색상명.toLowerCase().indexOf(낮) >= 0);
      }).sort(정렬()).slice(0, 60);
      결과그리기(목.map(function (p) { return { 제품: p, 등급: null }; }),
        목.length ? '<b>' + 목.length + '개</b> 찾음' + (목.length >= 60 ? ' (많아서 60개까지만)' : '') : '');
      return;
    }

    // 사진이나 색이 있으면 그것과 가까운 순으로.
    if (질의) {
      var 결과 = M.검색(대상, 질의, 필터, { 개수: 10 });

      // 좁힌 분류 안에 없을 때, 그냥 "없습니다" 로 끝내면 사용자는 왜 없는지 모른다.
      // 분류를 풀면 몇 개가 있는지 알려주고 바로 풀 수 있게 한다.
      // (파란 필름 분류 안에서 회색 문짝을 찾으면 0개가 나오는 게 당연한데,
      //  화면만 보면 "이 색은 아예 없나 보다" 로 오해한다.)
      if (!결과.length && 선택분류) {
        var 밖 = M.검색(전체, 질의, 필터, { 개수: 10 });
        결과그리기([], '', 밖.length ? {
          안내: '‘' + 분류이름() + '’ 안에는 비슷한 제품이 없습니다.',
          버튼: '분류를 풀고 다시 찾기 (' + 밖.length + '개)',
          동작: function () { 선택분류 = null; 분류그리기(); 검색(); },
        } : null);
        return;
      }
      if (!결과.length) { 결과그리기([], ''); return; }
      결과그리기(결과, '이 <b>' + 결과.length + '개</b> 중에 있습니다. 비교해서 고르세요.' +
        (선택분류 ? ' <span class="좁힘">(' + 이스케이프(분류이름()) + ' 안에서)</span>' : ''));
      return;
    }

    // 질의 없이 분류만 골랐으면 그 분류를 통째로 훑어본다.
    if (선택분류) {
      var 목록 = 대상.filter(function (p) { return M.통과(p, 필터); }).sort(정렬());
      결과그리기(목록.map(function (p) { return { 제품: p, 등급: null }; }),
        '<b>' + 이스케이프(분류이름()) + '</b> ' + 목록.length + '개');
      return;
    }

    결과그리기([], '');
  }

  /* ---------- 결과 ---------- */

  function 결과그리기(목록, 머리, 제안, 하단) {
    $('결과머리').innerHTML = 머리 || '';
    var 격자 = $('격자');
    격자.innerHTML = '';
    var 옛하단 = document.querySelector('.결과하단');
    if (옛하단) 옛하단.remove();

    if (!목록.length) {
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

      if (질의 || 글자) {
        빈.textContent = 글자
          ? '해당하는 코드·이름이 없습니다.'
          : '비슷한 제품이 없습니다. 다른 부분을 눌러보거나 분류·브랜드를 풀어보세요.';
      } else {
        빈.textContent = 머리 || '사진을 올리거나 색을 골라주세요.';
      }
      격자.appendChild(빈);
      return;
    }

    목록.forEach(function (x) { 격자.appendChild(카드만들기(x)); });

    if (하단) {
      var 감 = document.createElement('div');
      감.className = '결과하단';
      var b = document.createElement('button');
      b.type = 'button';
      b.className = '상세버튼 주된';
      b.textContent = 하단.글;
      b.addEventListener('click', 하단.동작);
      감.appendChild(b);
      격자.parentNode.appendChild(감);
    }
  }

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
      img.alt = p.제조사 + ' ' + p.코드;
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
  function 제목(p) {
    return p.코드미확인 ? (p.색상명 || p.코드) : p.코드;
  }

  /* ---------- 상세 ---------- */

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
      img.alt = p.제조사 + ' ' + p.코드;
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
    if (결과 && 결과.등급) {
      줄.push(['색 차이', 결과.등급 + ' (ΔE ' + 결과.ΔE.toFixed(2) + ')']);
    }
    표.innerHTML = 줄.map(function (r) {
      return '<tr><th>' + 이스케이프(r[0]) + '</th><td>' + 이스케이프(String(r[1])) + '</td></tr>';
    }).join('');
    el.appendChild(표);

    // 저장·공유는 제품 정보 바로 아래에 둔다. 정보를 보고 판단한 직후가 누를 때다.
    var 동작 = document.createElement('div');
    동작.className = '상세동작';

    var 저장버튼 = document.createElement('button');
    저장버튼.type = 'button';
    var 저장문구 = function () {
      저장버튼.textContent = 저장됨(p) ? '★ 저장됨' : '☆ 저장';
      저장버튼.setAttribute('aria-pressed', String(저장됨(p)));
    };
    저장문구();
    저장버튼.addEventListener('click', function () {
      저장토글(p);
      저장문구();
      알림(저장됨(p) ? '저장함에 담았습니다' : '저장함에서 뺐습니다');
      // 저장함을 보고 있는 중이면 목록도 바로 갱신한다.
      if (보기 === '저장함') 검색();
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
    document.body.style.overflow = 'hidden';
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
    $('덮개').hidden = true;
    document.body.style.overflow = '';
  }

  function 이스케이프(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
