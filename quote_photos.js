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

  // 사진 위에 그린 네모를 0~1 비율로 바꾼다.
  // 화면 크기가 폰마다 다르므로 픽셀로 저장하면 다른 기기에서 엉뚱한 데 찍힌다.
  //
  // 최소크기: 손가락으로 톡 누르면 0 크기가 되어 화면에 아무것도 안 보인다.
  // 그럴 때 보이는 만큼은 잡아준다. 다만 사진 밖으로 삐져나가면 안 되므로
  // 오른쪽/아래 끝에서는 시작점을 당겨서 넣는다.
  const 최소 = 0.04;

  function 정규화사각(x1, y1, x2, y2, 폭, 높이) {
    const 가둠 = function (v, 최대) { return Math.max(0, Math.min(최대, v)); };
    let x = 가둠(Math.min(x1, x2) / 폭, 1);
    let y = 가둠(Math.min(y1, y2) / 높이, 1);
    let w = 가둠(Math.abs(x2 - x1) / 폭, 1 - x);
    let h = 가둠(Math.abs(y2 - y1) / 높이, 1 - y);
    if (w < 최소) { w = 최소; if (x + w > 1) x = 1 - w; }
    if (h < 최소) { h = 최소; if (y + h > 1) y = 1 - h; }
    return { x: x, y: y, w: w, h: h };
  }

  /* 사진 한 장에 한 품목의 네모가 여러 개일 수 있다(방문이 두 짝, 문틀과 문짝).
     예전 데이터는 네모 하나를 객체로 담았고, 지금은 배열이다. 둘 다 배열로 돌려준다. */
  function 사각목록(값) {
    if (!값) return [];
    if (Array.isArray(값)) return 값.filter(Boolean);
    return [값];
  }

  /* 발행 뒤 올릴 사진 목록. 품목에 태그한 사진은 네모가 없어도 올린다 -
     "이 문입니다" 를 네모 없이 사진만으로 보여주고 싶은 경우가 있다.
     (예전엔 네모 친 것만 올렸더니 그냥 올린 사진이 견적서에 안 나와 물어왔다)

     같은 품목에 사진이 여럿이면 첫 장은 체크_ID.jpg (예전 견적서와 같은 이름),
     그 다음부터 체크_ID__2.jpg, __3.jpg 다. 견적서는 이 둘을 다 찾는다. */
  function 올릴사진목록(사진들) {
    const out = [];
    const 번호 = {};
    (사진들 || []).slice().sort(function (a, b) { return a.id - b.id; }).forEach(function (p) {
      // 태그한 품목 + 네모만 남은 품목(태그를 풀었는데 네모가 남은 예전 데이터)
      const ids = [];
      (p.태그 || []).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
      Object.keys(p.표시 || {}).forEach(function (id) {
        if (ids.indexOf(id) < 0 && 사각목록(p.표시[id]).length) ids.push(id);
      });
      ids.forEach(function (id) {
        번호[id] = (번호[id] || 0) + 1;
        out.push({
          사진: p,
          체크_ID: id,
          사각들: 사각목록(p.표시 && p.표시[id]),
          파일명: id + (번호[id] === 1 ? '' : '__' + 번호[id]) + '.jpg',
        });
      });
    });
    return out;
  }

  /* 업자가 평면도에 빨간 펜으로 동그라미를 쳐서 보낸다. 그 위에 우리 네모(빨강)를
     또 치면 뭐가 뭔지 모른다. 그래서 사진의 빨간 표시를 지울 수 있게 한다.

     빨간 픽셀 판정. 펜 선은 순빨강에 가깝고, 가장자리는 배경과 섞여 분홍이 된다.
     분홍까지 잡아야 선 테두리가 안 남는다. 베이지 바닥(220,185,140)은 R 이 높지만
     G 도 높아서 R-G 차이로 갈라낸다. */
  function 빨간가(r, g, b) {
    return r >= 120 && (r - g) >= 60 && (r - b) >= 50 && g < 170 && b < 170;
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

  /* 사진에서 빨간 표시를 지운다. 빨간 픽셀을 주변의 안 빨간 픽셀 평균으로
     바깥에서 안쪽으로 메워 나간다(굵은 선은 여러 번 돌아야 가운데까지 찬다).
     하양으로 덮으면 바닥 위 동그라미가 하얀 얼룩으로 남는다. */
  async function 빨강지우기(blob) {
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    try {
      const W = bmp.width, H = bmp.height;
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      ctx.drawImage(bmp, 0, 0);
      const img = ctx.getImageData(0, 0, W, H);
      const d = img.data;
      const 마스크 = new Uint8Array(W * H);
      let 남은 = 0;
      for (let i = 0, p = 0; i < 마스크.length; i++, p += 4) {
        if (빨간가(d[p], d[p + 1], d[p + 2])) { 마스크[i] = 1; 남은++; }
      }
      if (!남은) return null;   // 지울 게 없다

      // 선 가장자리는 JPEG 로 번져 연한 분홍이 된다. 판정에는 안 걸리지만 남으면
      // 잔상이 보인다. 빨간 픽셀 둘레 2픽셀을 같이 메운다. 어차피 주변 색으로
      // 채우므로 멀쩡한 부분을 조금 더 메워도 티가 안 난다.
      for (let 번 = 0; 번 < 2; 번++) {
        const 원본 = 마스크.slice();
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = y * W + x;
            if (원본[i]) continue;
            let 옆 = false;
            for (let dy = -1; dy <= 1 && !옆; dy++) {
              const yy = y + dy; if (yy < 0 || yy >= H) continue;
              for (let dx = -1; dx <= 1; dx++) {
                const xx = x + dx; if (xx < 0 || xx >= W) continue;
                if (원본[yy * W + xx]) { 옆 = true; break; }
              }
            }
            if (옆) { 마스크[i] = 1; 남은++; }
          }
        }
      }

      // 바깥 고리부터 채운다. 한 바퀴에 한 픽셀씩 안으로 들어간다.
      // 한 바퀴 안에서는 원본 마스크만 보고 판단해야 한쪽으로 쏠리지 않는다.
      const 최대바퀴 = 40;
      for (let 바퀴 = 0; 바퀴 < 최대바퀴 && 남은 > 0; 바퀴++) {
        const 채울 = [];
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = y * W + x;
            if (!마스크[i]) continue;
            let r = 0, g = 0, b = 0, n = 0;
            for (let dy = -1; dy <= 1; dy++) {
              const yy = y + dy; if (yy < 0 || yy >= H) continue;
              for (let dx = -1; dx <= 1; dx++) {
                const xx = x + dx; if (xx < 0 || xx >= W) continue;
                const j = yy * W + xx;
                if (마스크[j]) continue;
                const q = j * 4;
                r += d[q]; g += d[q + 1]; b += d[q + 2]; n++;
              }
            }
            if (n) 채울.push(i, Math.round(r / n), Math.round(g / n), Math.round(b / n));
          }
        }
        if (!채울.length) break;
        for (let k = 0; k < 채울.length; k += 4) {
          const i = 채울[k], q = i * 4;
          d[q] = 채울[k + 1]; d[q + 1] = 채울[k + 2]; d[q + 2] = 채울[k + 3];
          마스크[i] = 0; 남은--;
        }
      }
      ctx.putImageData(img, 0, 0);
      return new Promise(function (resolve) {
        cv.toBlob(function (b) { resolve(b); }, 'image/jpeg', 원본품질);
      });
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

  // 사진 내용만 갈아끼운다(빨간 표시 지운 뒤). 태그·네모는 그대로 둔다.
  async function 사진바꾸기(id, file) {
    const 이미지 = await 변환(file);
    const st = await 트랜잭션('readwrite');
    const p = await 요청(st.get(id));
    if (!p) return null;
    p.blob = 이미지.blob;
    p.thumb = 이미지.thumb;
    await 요청(st.put(p));
    return p;
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

  /* 사진의 네모 표시. { 체크_ID: {x,y,w,h} } 로 품목마다 하나씩 둔다.
     한 장에 방문·붙박이장이 같이 태그될 수 있어 품목별로 나눠 담아야 한다. */
  async function 표시저장(id, 체크_ID, 사각) {
    const st = await 트랜잭션('readwrite');
    const p = await 요청(st.get(id));
    if (!p) return;
    p.표시 = p.표시 || {};
    if (사각) p.표시[체크_ID] = 사각;
    else delete p.표시[체크_ID];
    await 요청(st.put(p));
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

  /* 네모를 이미지에 구워서 견적서용 사진을 만든다.
     받는 사람 브라우저에서 겹쳐 그리지 않는 이유: 이미지 한 장으로 끝나야
     확실하다. 겹쳐 그리면 화면 크기·회전에 따라 자리가 밀릴 수 있다.

     견적서용은 1000px 로 더 줄인다(장당 약 150KB). 어느 문인지 알아보는
     용도라 원본 화질이 필요 없고, 받는 사람 데이터도 아껴야 한다. */
  const 견적사진최대 = 1000;

  async function 표시박은사진(blob, 사각) {
    const 사각들 = 사각목록(사각);
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    try {
      const c = 맞춤크기(bmp.width, bmp.height, 견적사진최대);
      const cv = document.createElement('canvas');
      cv.width = c.폭;
      cv.height = c.높이;
      const ctx = cv.getContext('2d');
      ctx.drawImage(bmp, 0, 0, c.폭, c.높이);

      // 굵기를 사진 크기에 맞춘다. 고정 px 로 두면 작은 사진에서 네모가 다 덮는다.
      const 굵기 = Math.max(3, Math.round(c.폭 / 200));
      ctx.lineJoin = 'round';
      사각들.forEach(function (사각) {
        const x = 사각.x * c.폭, y = 사각.y * c.높이;
        const w = 사각.w * c.폭, h = 사각.h * c.높이;
        // 흰 테두리를 밑에 깔아야 어두운 사진에서도 선이 보인다.
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 굵기 * 2;
        ctx.strokeRect(x, y, w, h);
        // 업자가 빨간 펜으로 표시해 보낸 평면도에는 파랑으로 친다. 안 그러면 섞인다.
        ctx.strokeStyle = 네모색(사각.색);
        ctx.lineWidth = 굵기;
        ctx.strokeRect(x, y, w, h);
      });
      return new Promise(function (resolve) {
        cv.toBlob(function (b) { resolve(b); }, 'image/jpeg', 0.82);
      });
    } finally {
      bmp.close();
    }
  }

  // 네모 색. 저장된 값은 '빨강' | '파랑'. 없으면 빨강(예전 데이터).
  function 네모색(이름) {
    return 이름 === '파랑' ? '#1e6fff' : '#ff3b30';
  }

  // Blob -> base64 (에어테이블 업로드용). 접두어 없이 순수 base64 만 돌려준다.
  function base64로(blob) {
    return new Promise(function (resolve, reject) {
      const fr = new FileReader();
      fr.onload = function () {
        const s = String(fr.result || '');
        resolve(s.slice(s.indexOf(',') + 1));
      };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsDataURL(blob);
    });
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
    정규화사각: 정규화사각,
    사각목록: 사각목록,
    올릴사진목록: 올릴사진목록,
    빨간가: 빨간가,
    빨강지우기: 빨강지우기,
    네모색: 네모색,
    표시박은사진: 표시박은사진,
    base64로: base64로,
    PhotoDB: {
      열기: 열기, 추가: 추가, 구역사진: 구역사진, 현장사진: 현장사진,
      구역장수: 구역장수, 태그저장: 태그저장, 표시저장: 표시저장, 삭제: 삭제,
      사진바꾸기: 사진바꾸기,
      현장삭제: 현장삭제, 모든현장ID: 모든현장ID, 영구요청: 영구요청,
    },
  };
});
