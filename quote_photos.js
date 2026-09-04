// 현장 사진 저장. 사진은 폰 브라우저(IndexedDB) 안에만 있고 서버로 안 나간다.
//
// 화면을 건드리지 않는다. quote_pro.js 가 이걸 불러 쓴다.
// 이렇게 떼어놔야 판단 로직(크기 계산, 태그 해제 규칙)을 node 로 테스트할 수 있고,
// 나중에 저장 방식을 바꿔도 화면 코드를 안 고친다.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QuotePhotos = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const DB이름     = 'quote_photos_v1';
  const 스토어     = 'photos';
  const 원본최대   = 1600;   // 장당 약 300KB
  const 썸네일최대 = 240;    // 격자 화면용. 원본 20장을 디코딩하면 폰에서 버벅인다
  const 원본품질   = 0.8;
  const 썸네일품질 = 0.7;

  /* ---------- 순수함수 (테스트 대상) ---------- */

  // 비율을 지키면서 긴 변을 최대에 맞춘다. 이미 작으면 그대로 둔다.
  function 맞춤크기(폭, 높이, 최대) {
    const 긴변 = Math.max(폭, 높이);
    if (긴변 <= 최대) return { 폭: 폭, 높이: 높이 };
    const 비 = 최대 / 긴변;
    // 0 을 canvas 크기로 주면 예외가 난다. 아주 납작한 이미지도 최소 1은 보장한다.
    return {
      폭: Math.max(1, Math.round(폭 * 비)),
      높이: Math.max(1, Math.round(높이 * 비)),
    };
  }

  // 사진에서 태그를 지운 "뒤"의 목록을 받아, 견적 체크까지 뺄지 판단한다.
  // 같은 품목을 다른 사진이 아직 태그하고 있으면 빼면 안 된다.
  function 태그해제후_체크뺄까(체크_ID, 사진들) {
    return !(사진들 || []).some(function (p) {
      return (p.태그 || []).indexOf(체크_ID) >= 0;
    });
  }

  // 저장함에 "사진 18장 (5.4MB)" 로 띄우기 위한 합계. 썸네일도 공간을 먹는다.
  function 사진용량합(사진들) {
    return (사진들 || []).reduce(function (s, p) {
      return s + ((p.blob && p.blob.size) || 0) + ((p.thumb && p.thumb.size) || 0);
    }, 0);
  }

  // 현장 하나를 가리키는 키. 사진이 이 밑에 묶인다.
  function 새현장ID() {
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* ---------- IndexedDB ---------- */

  let _db = null;

  function 열기() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function (resolve, reject) {
      const req = indexedDB.open(DB이름, 1);
      req.onupgradeneeded = function () {
        const db = req.result;
        const st = db.createObjectStore(스토어, { keyPath: 'id', autoIncrement: true });
        st.createIndex('현장ID', '현장ID', { unique: false });
        st.createIndex('현장구역', ['현장ID', '구역'], { unique: false });
      };
      req.onsuccess = function () { _db = req.result; resolve(_db); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function 트랜잭션(모드) {
    return 열기().then(function (db) {
      return db.transaction(스토어, 모드).objectStore(스토어);
    });
  }

  function 요청(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  /* ---------- 이미지 축소 ---------- */

  function 줄이기(bitmap, 최대, 품질) {
    const c = 맞춤크기(bitmap.width, bitmap.height, 최대);
    const cv = document.createElement('canvas');
    cv.width = c.폭;
    cv.height = c.높이;
    cv.getContext('2d').drawImage(bitmap, 0, 0, c.폭, c.높이);
    return new Promise(function (resolve) {
      cv.toBlob(function (b) { resolve(b); }, 'image/jpeg', 품질);
    });
  }

  // File/Blob -> { blob, thumb }
  async function 변환(file) {
    // imageOrientation 을 빼면 안 된다. 폰으로 세로로 찍은 사진의 EXIF 회전이
    // 무시되어 화면에 옆으로 누워서 들어간다.
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      const blob  = await 줄이기(bmp, 원본최대, 원본품질);
      const thumb = await 줄이기(bmp, 썸네일최대, 썸네일품질);
      return { blob: blob, thumb: thumb };
    } finally {
      bmp.close();
    }
  }

  /* ---------- 공개 API ---------- */

  async function 추가(현장ID, 구역, file) {
    const 이미지 = await 변환(file);
    const 사진 = {
      현장ID: 현장ID,
      구역: 구역,
      blob: 이미지.blob,
      thumb: 이미지.thumb,
      태그: [],
      촬영일시: new Date().toISOString(),
    };
    const st = await 트랜잭션('readwrite');
    사진.id = await 요청(st.add(사진));
    return 사진;
  }

  async function 구역사진(현장ID, 구역) {
    const st = await 트랜잭션('readonly');
    const list = await 요청(st.index('현장구역').getAll([현장ID, 구역]));
    return list.sort(function (a, b) { return a.id - b.id; });
  }

  async function 현장사진(현장ID) {
    const st = await 트랜잭션('readonly');
    const list = await 요청(st.index('현장ID').getAll(현장ID));
    return list.sort(function (a, b) { return a.id - b.id; });
  }

  // { 방1: 3, 거실: 5 } — 구역 줄의 배지에 쓴다
  async function 구역장수(현장ID) {
    const list = await 현장사진(현장ID);
    const out = {};
    list.forEach(function (p) { out[p.구역] = (out[p.구역] || 0) + 1; });
    return out;
  }

  async function 태그저장(id, 태그) {
    const st = await 트랜잭션('readwrite');
    const p = await 요청(st.get(id));
    if (!p) return;
    p.태그 = 태그.slice();
    await 요청(st.put(p));
  }

  async function 삭제(id) {
    const st = await 트랜잭션('readwrite');
    await 요청(st.delete(id));
  }

  async function 현장삭제(현장ID) {
    const list = await 현장사진(현장ID);
    const st = await 트랜잭션('readwrite');
    for (const p of list) await 요청(st.delete(p.id));
    return list.length;
  }

  // 저장함에 없는 사진(소속 없는 사진)을 찾아내기 위한 목록
  async function 모든현장ID() {
    const st = await 트랜잭션('readonly');
    const all = await 요청(st.getAll());
    return [...new Set(all.map(function (p) { return p.현장ID; }))];
  }

  // 폰 저장공간이 부족할 때 크롬이 IndexedDB 를 임의로 비우는 것을 막는다.
  // 견적을 내고 2~3달 뒤 시공하는 경우가 있어 그동안 사진이 살아 있어야 한다.
  function 영구요청() {
    if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.persist) {
      return Promise.resolve(false);
    }
    return navigator.storage.persist().catch(function () { return false; });
  }

  return {
    맞춤크기: 맞춤크기,
    태그해제후_체크뺄까: 태그해제후_체크뺄까,
    사진용량합: 사진용량합,
    새현장ID: 새현장ID,
    PhotoDB: {
      열기: 열기, 추가: 추가, 구역사진: 구역사진, 현장사진: 현장사진,
      구역장수: 구역장수, 태그저장: 태그저장, 삭제: 삭제,
      현장삭제: 현장삭제, 모든현장ID: 모든현장ID, 영구요청: 영구요청,
    },
  };
});
