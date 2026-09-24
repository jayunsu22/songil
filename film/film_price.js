// 필름 단가. 필름 하나를 받아 "이 필름은 단가표의 어느 줄인가"를 답한다.
//
// 단가표는 제품 하나하나가 아니라 계열(코드 앞 글자) 단위로 값이 매겨져 있다.
// LX 'RS 계열 11,550원' 처럼. 그래서 필름 코드에서 숫자 앞 글자를 떼어 계열로 찾는다.
//
// 값은 두 파일로 나뉜다. 저장소가 공개라서다.
//   film_price.json        — 계열·코드와 소비자가. 누구나 받아가도 되는 값.
//   film_price_owner.json  — 시공가·업체가·대리점. 암호로 잠가 둔다(AES-GCM).
// 사장님 폰에서 한 번 ?key=암호 로 들어오면 그 기기에서만 풀린다.
// 두 파일은 filmdb/가격표만들기.js 가 만든다. 손으로 고치지 않는다.
//
// 화면 코드와 나눈 이유: 브랜드마다 코드 짜는 규칙이 달라서(삼성 SG/SF, 현대 S↔GS,
// 영림 PS↔FPS) 이 부분이 가장 틀리기 쉽다. node 로 2,118건을 전부 돌려볼 수 있어야 한다.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FilmPrice = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // 필름 DB 의 제조사 이름 → 단가표의 제조사 이름
  var 단가표이름 = {
    'LX': 'LX Z:IN', '현대': '현대 L&C (보닥)', '한솔': '한솔 스토리필름',
    '영림': '영림', '삼성': '삼성', '예림': '예림',
  };

  // LX 필름 DB 에 있는 코드는 거의 전부 방염 계열(RS·CW…)이다. 같은 무늬의 비방염판은
  // 코드가 따로 있고, 단가표 비고에 '비방염호환 ES' 처럼 적혀 있다. 그걸 옮겨 둔 것이다.
  var LX호환 = {
    RS: 'ES', RSM: 'ESM', RSP: 'ESP', RGM: 'EGM', ST: 'STE',
    CW: 'EW', DW: 'EW', NW: 'NE', SM: 'SE', ML: 'ME', MLS: 'MES', BM: 'BE',
    RP: 'RPE', MS: 'MSE', SN: 'SNE',
  };

  function 씻기(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function 앞글자(코드) { var m = 씻기(코드).match(/^[A-Z]+/); return m ? m[0] : ''; }
  function 이름씻기(v) { return String(v || '').replace(/\s*SM$/i, '').replace(/\s+/g, ''); }

  // 코드 하나(계열)로 그 브랜드 단가표 줄을 찾는다. 같은 계열이 두 줄에 있으면 먼저 적힌 줄.
  // 구분('방염'/'비방염')을 주면 그쪽 줄만 본다. 현대 SMT 처럼 비방염·방염 코드가 같은 계열이 있다.
  function 줄찾기(줄들, 계열, 구분) {
    for (var i = 0; i < 줄들.length; i++) {
      if (구분 && 줄들[i].구분 !== 구분) continue;
      if (줄들[i].코드.indexOf(계열) >= 0) return 줄들[i];
    }
    return null;
  }

  // 필름 p 가 해당하는 단가표 줄들. 비방염·방염이 둘 다 있으면 둘 다 준다.
  //   [{ 줄, 호환: 'ES' 처럼 필름 코드와 다른 계열이면 그 계열 }]
  function 찾기(표, p) {
    if (!표 || !p) return [];
    var 이름 = 단가표이름[p.제조사];
    if (!이름) return [];
    var 줄들 = 표.filter(function (r) { return r.제조사 === 이름; });
    var 코드 = String(p.코드 || '');
    var 앞 = 앞글자(코드);
    var 후보 = [];      // [계열, 호환이냐, 구분]

    if (p.제조사 === '한솔') return 한솔찾기(줄들, p);

    if (p.제조사 === '삼성') {
      // 'SG/SF 315' 는 같은 무늬가 SG(비방염)와 SF(방염) 두 가지로 나온다는 뜻이다.
      String(코드.split(/\s+/)[0] || '').split('/').forEach(function (c) { if (앞글자(c)) 후보.push([앞글자(c), false]); });
    } else if (p.제조사 === '현대') {
      // 보닥은 방염 코드(S188)에 G 를 붙이면 비방염(GS188)이다.
      후보.push([앞, false, '방염'], ['G' + 앞, false, '비방염'], [앞, false, '비방염']);
    } else if (p.제조사 === '영림') {
      // 영림은 반대로 비방염 코드(PS104)에 F 를 붙이면 방염(FPS104)이다.
      후보.push([앞, false, '비방염'], ['F' + 앞, false, '방염']);
    } else if (p.제조사 === '예림') {
      // 'HE(펄) 407' 은 번호 하나만 값이 따로 매겨져 있다.
      if (씻기(코드) === 'HE407') 후보.push(['HE407', false]);
      후보.push([앞, false]);
    } else if (p.제조사 === 'LX') {
      // RSCK1·CWAC1 같은 특수 코드는 뒤 글자를 하나씩 떼어 RS·CW 로 찾는다.
      var 계열 = 앞;
      while (계열.length > 1 && !줄찾기(줄들, 계열)) 계열 = 계열.slice(0, -1);
      if (!줄찾기(줄들, 계열)) 계열 = 앞;
      후보.push([계열, false]);
      if (LX호환[계열]) 후보.push([LX호환[계열], true]);
    }

    var 결과 = [];
    후보.forEach(function (h) {
      var r = 줄찾기(줄들, h[0], h[2]);
      if (!r || 결과.some(function (x) { return x.줄 === r; })) return;
      결과.push({ 줄: r, 계열: h[0], 호환: h[1] });
    });
    // 예림 HE407 처럼 번호 한 줄이 잡혔으면 계열 줄은 뺀다
    if (결과.length > 1 && 결과[0].계열 === 'HE407') 결과 = 결과.slice(0, 1);
    return 정렬(결과);
  }

  // 한솔은 코드 대신 색상명으로 값이 갈린다(같은 '솔리드' 여도 클레이크림은 페인트 값).
  function 한솔찾기(줄들, p) {
    var 이름 = 이름씻기(p.색상명 || p.코드);
    var 방염인가 = p.방염 || p.세부분류 === '방염';
    var 결과 = [];
    줄들.forEach(function (r) {
      if ((r.구분 === '방염') !== !!방염인가) return;
      if ((r.이름들 || []).some(function (n) { return 이름씻기(n) === 이름; })) 결과.push({ 줄: r, 계열: r.묶음, 호환: false });
    });
    if (결과.length) return 결과.slice(0, 1);
    // 이름표에 없는 제품은 종류로 짐작한다
    var 종류 = { '솔리드': '솔리드', '우드': '우드', '스톤마블': '스톤', '패브릭': '패브릭' }[p.카테고리];
    var r = 줄들.filter(function (x) { return x.묶음 === 종류 && (x.구분 === '방염') === !!방염인가; })[0];
    return r ? [{ 줄: r, 계열: r.묶음, 호환: false }] : [];
  }

  function 정렬(결과) {
    return 결과.sort(function (a, b) { return (a.줄.구분 === '방염') - (b.줄.구분 === '방염'); });
  }

  /* ---------- 잠긴 값 풀기 ----------
     암호 → PBKDF2(SHA-256) → AES-GCM 키. 브라우저의 crypto.subtle 과 node 의 webcrypto 가
     같은 API 라 만드는 쪽(filmdb/가격표만들기.js)과 푸는 쪽이 이 함수 하나를 같이 쓴다. */

  function b64에서(s) {
    if (typeof atob === 'function') {
      var t = atob(s), u = new Uint8Array(t.length);
      for (var i = 0; i < t.length; i++) u[i] = t.charCodeAt(i);
      return u;
    }
    return new Uint8Array(Buffer.from(s, 'base64'));
  }

  function 키만들기(subtle, 암호, 소금, 횟수) {
    return subtle.importKey('raw', new TextEncoder().encode(암호), 'PBKDF2', false, ['deriveKey'])
      .then(function (기본) {
        return subtle.deriveKey({ name: 'PBKDF2', salt: 소금, iterations: 횟수, hash: 'SHA-256' },
          기본, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      });
  }

  // 틀린 암호면 reject 된다(GCM 태그가 안 맞음).
  function 풀기(잠긴, 암호, subtle) {
    subtle = subtle || (typeof crypto !== 'undefined' && crypto.subtle);
    return 키만들기(subtle, 암호, b64에서(잠긴.소금), 잠긴.횟수)
      .then(function (키) { return subtle.decrypt({ name: 'AES-GCM', iv: b64에서(잠긴.iv) }, 키, b64에서(잠긴.값)); })
      .then(function (평) { return JSON.parse(new TextDecoder().decode(평)); });
  }

  return { 찾기: 찾기, 풀기: 풀기, 키만들기: 키만들기, 단가표이름: 단가표이름 };
});
