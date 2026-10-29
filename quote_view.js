/* 견적서 화면. 발행 시점 스냅샷을 그대로 보여준다.
   금액을 다시 계산하지 않는다 — 단가가 바뀌어도 이미 보낸 견적서는 변하면 안 된다. */

const VIEW = {
  quoteUrl:   'https://primary-production-a6fa.up.railway.app/webhook/pro-quote',
  inquiryUrl: 'https://primary-production-a6fa.up.railway.app/webhook/pro-inquiry',
  // [＋ 추가 견적 받기] (2026-10-21, n8n 현장견적_추가견적)
  addonUrl:   'https://primary-production-a6fa.up.railway.app/webhook/pro-addon',
  priceUrl:   'https://primary-production-a6fa.up.railway.app/webhook/pro-addon-price',
};

// /q/CODE 또는 /quote_view.html?id=CODE (개발용) 둘 다 받는다
const params = new URLSearchParams(location.search);
const 코드 = (location.pathname.match(/\/q\/([A-Za-z0-9]+)/) || [])[1] || params.get('id') || '';
const 설명포함 = params.get('d') === '1';
/* w=1 : 자재는 업자가 대고 인건비만 받는 견적서.
   금액을 다시 계산하지 않는다 - 발행할 때 줄마다 인건비 몫을 같이 저장해 둔다.
   이 기능 이전에 발행한 견적서에는 그 값이 없다. 그때는 조용히 합산 견적서로
   보여준다 - 인건비를 모르는 채로 금액을 깎아 보여주면 사고다. */
const 인건비요청 = params.get('w') === '1';
let 인건비만 = false;   // 실제로 인건비 견적서로 그릴지. render() 에서 정한다.

/* 그 줄에 보여줄 금액. 인건비 견적서에서 나뉘어 있지 않은 줄은
   전액(자재비 포함)을 그대로 쓴다. */
/* 견적요청 제목 '부평 삼산동 미래타운 3단지 가견적 10월29일 오후8시(김정헌)' 은 (사장님 2026-10-29)
   첫 줄: [가견적] 표시 + 위치,  둘째 줄: 날짜 시 (업체).  이 모양이 아니면 예전처럼 한 줄로 쓴다.
   보여 줄 때만 나누므로 이미 발행한 견적서도 다시 발행하지 않고 바로 바뀐다. */
function 현장명그리기(이름) {
  const m = /^(.*?)\s*(가견적|실제견적)\s+(\d{1,2}월\s?\d{1,2}일\s*(?:오전|오후)\s?\d{1,2}시)\s*\((.+)\)\s*$/.exec(String(이름));
  if (!m) return '<div class="v-site">' + esc(이름) + '</div>';
  return '<div class="v-site"><span class="v-badge">' + esc(m[2]) + '</span>' + esc(m[1]) + '</div>' +
    '<div class="v-site2">' + esc(m[3]) + ' (' + esc(m[4]) + ')</div>';
}

function 줄금액(l) {
  return (인건비만 && l.인건비표시금액 != null) ? l.인건비표시금액 : l.표시금액;
}
function 자재섞임(l) {
  return 인건비만 && l.인건비표시금액 == null;
}

let DATA = null;
/* 실제견적서가 비교하는 가견적 (2026-10-21, 시안 C). DATA.비교견적코드 가 있으면 받아 둔다.
   못 받으면 null - 비교 표만 안 나오고 견적서는 그대로 보인다. 비교 = QuoteDiff.비교 결과 */
let BASE = null;
let 비교 = null;
const 해제 = new Set();   // 소비자가 체크 해제한 품목 (?d=1 에서만 쓴다)
/* 고객이 바꾼 종류 { 줄 순번: 종류 순번 } (2026-10-20). 발행할 때 종류가 여럿인 줄(샤시 단창/2중창/시스템)에는
   종류들: [{ 품목명, 표시금액, 인건비표시금액, 품목설명 }] 과 고른 순번(종류)이 같이 실려 온다.
   그 전에 발행한 견적서에는 없다 - 그때는 종류 고르기 칸을 안 띄운다. */
const 종류선택 = {};

// 고객이 종류를 바꿨으면 그 종류의 이름·금액·설명을 덮어쓴 줄
function 실제줄(i) {
  const l = DATA.라인들[i];
  const k = 종류선택[i];
  if (k == null || !Array.isArray(l.종류들) || !l.종류들[k]) return l;
  return Object.assign({}, l, l.종류들[k]);
}

// '샤시1 (샤시(2중창))' → '샤시(2중창)'. 문의 알림에 쓴다
function 종류이름(품목명) {
  const t = String(품목명 || '');
  const i = t.indexOf(' (');
  return i >= 0 && /\)$/.test(t) ? t.slice(i + 2, -1) : t;
}
// 종류 탭이 있는 줄은 이름에 종류를 또 붙이지 않는다 ('샤시1 (샤시(2중창))' → '샤시1') - 탭이 보여준다
function 줄이름(l) {
  return Array.isArray(l.종류들) && l.종류들.length > 1 ? String(l.품목명 || '').split(' (')[0] : l.품목명;
}
// 종류 탭에 쓰는 더 짧은 이름: '샤시(2중창)' → '2중창', '시스템샤시' → '시스템'
function 탭이름(품목명) {
  const t = 종류이름(품목명);
  const m = t.match(/^[^(]*\((.+)\)$/);
  if (m) return m[1];
  const 뺀 = t.replace(/샤시$/, '');
  return 뺀 || t;
}

const $v = (s) => document.querySelector(s);
const won = (n) => Math.round(n).toLocaleString('ko-KR') + '원';
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function status(msg, isErr) {
  const el = $v('#vStatus');
  el.textContent = msg || '';
  el.hidden = !msg;
  el.className = isErr ? 'err' : '';
}

// 견적서를 받아 DATA 에 둔다. 고객이 추가한 품목(고객추가)은 맨 위로 - 방금 넣은 게 바로 보이게
async function 받기() {
  const res = await fetch(VIEW.quoteUrl + '?id=' + encodeURIComponent(코드));
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || j.error) return false;
  const 줄들 = j.라인들 || [];
  j.라인들 = 줄들.filter((l) => l.고객추가).concat(줄들.filter((l) => !l.고객추가));
  DATA = j;
  // 줄 순번이 바뀌므로 고객이 빼거나 바꾼 표시는 새로 시작한다
  해제.clear();
  Object.keys(종류선택).forEach((k) => delete 종류선택[k]);
  return true;
}

// 실제견적이면 비교할 가견적을 받는다. 실패해도 견적서는 보여준다
async function 가견적받기() {
  BASE = null;
  if (!DATA.비교견적코드 || DATA.비교견적코드 === DATA.견적코드) return;
  try {
    const res = await fetch(VIEW.quoteUrl + '?id=' + encodeURIComponent(DATA.비교견적코드));
    const j = await res.json().catch(() => null);
    if (res.ok && j && !j.error && Array.isArray(j.라인들)) BASE = j;
  } catch (e) { /* 비교 없이 */ }
}

// 견적서 합계 (인건비 견적서면 인건비 몫의 합을 절삭) - 가견적·실제견적 비교 표에 쓴다
function 견적총액(d) {
  if (!인건비만) return Number(d.총액) || 0;
  const n = (d.라인들 || []).reduce((s, l) => s + 줄금액(l), 0);
  return Number(d.총액) % 10000 === 0 ? 절삭(n) : n;
}
const 부호 = (n) => (n > 0 ? '+' : n < 0 ? '-' : '') + Math.abs(Math.round(n)).toLocaleString('ko-KR');

// 다른 견적서 주소. 품목설명(d=1)·인건비(w=1) 표시는 그대로 넘긴다
function 견적주소(code) {
  const p = new URLSearchParams(location.search);
  p.delete('id');
  const q = p.toString();
  return '/q/' + encodeURIComponent(code) + (q ? '?' + q : '');
}

async function load() {
  if (!코드) {
    status('견적서 주소가 올바르지 않습니다.', true);
    return;
  }
  try {
    if (!(await 받기())) {
      // 빈 화면이나 JS 에러를 그대로 두면 받은 사람이 사장님한테 전화한다
      status('견적서를 찾을 수 없습니다. 링크를 다시 확인해 주세요.', true);
      return;
    }
    await 가견적받기();
    render();
    status('');
    $v('#vDoc').hidden = false;
  } catch (e) {
    status('견적서를 불러오지 못했습니다. 통신 상태를 확인해 주세요.', true);
  }
}

/* 0.05 -> '+5%'. 소수점 한 자리까지만 보여준다. */
function 퍼센트(v) {
  return (v > 0 ? '+' : '') + Math.round(v * 1000) / 10 + '%';
}

/* 링크에 보여줄 짧은 주소. 실제 이동은 원본 주소로 한다. */
function 짧게(url) {
  return String(url || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function 날짜(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0')
    + '.' + String(d.getDate()).padStart(2, '0');
}

function render() {
  const d = DATA;
  const H = [];

  // 한 줄이라도 인건비 몫이 저장돼 있어야 인건비 견적서로 그린다.
  인건비만 = 인건비요청 &&
    (d.라인들 || []).some(function (l) { return l.인건비표시금액 != null; });

  // 머리말은 명함처럼 한 장의 카드로 묶는다. 업체명/연락처/블로그/1분견적 주소를
  // 한 덩어리로 보여주고, 그 아래 구분선 뒤에 이 견적서 자체의 정보를 둔다.
  const 연락 = [];
  if (d.연락처) {
    연락.push('<a href="tel:' + esc(d.연락처.replace(/[^0-9+]/g, '')) + '">' +
      '<span class="v-ico">전화</span><span>' + esc(d.연락처) + '</span></a>');
  }
  // 주소는 https:// 를 떼고 보여준다. 폰 화면이 좁아 줄이 넘어가면 카드가 흐트러진다.
  if (d.블로그주소) {
    연락.push('<a href="' + esc(d.블로그주소) + '" target="_blank" rel="noopener">' +
      '<span class="v-ico">블로그</span><span>' + esc(짧게(d.블로그주소)) + '</span></a>');
  }
  if (d.홍보주소) {
    연락.push('<a href="' + esc(d.홍보주소) + '" target="_blank" rel="noopener">' +
      '<span class="v-ico">1분견적</span><span>' + esc(짧게(d.홍보주소)) + '</span></a>');
  }

  // 이 가견적을 대신하는 실제견적이 나왔으면 맨 위에 알린다 - 옛 금액을 믿지 않게
  if (d.다음견적코드) {
    H.push('<div class="v-next"><div><b>현장 확인 후 실제견적으로 바뀌었어요</b>' +
      '<small>이 견적서 금액은 더 이상 유효하지 않습니다</small></div>' +
      '<a href="' + esc(견적주소(d.다음견적코드)) + '">실제견적 보기 ›</a></div>');
  }
  const 실제 = d.견적종류 === '실제견적';
  H.push('<div class="v-head' + (d.다음견적코드 ? ' stale' : '') + '">' +
    '<div class="v-shop">' + esc(d.업체명) + '</div>' +
    (연락.length ? '<div class="v-contact">' + 연락.join('') + '</div>' : '') +
    '<div class="v-headfoot">' +
      (실제 ? '<span class="v-kind">실제 견적서</span>' : '') +
      (d.현장명 ? 현장명그리기(d.현장명) : '') +
      '<div class="v-meta">인테리어필름 시공 견적서 · ' + 날짜(d.발행일시) +
        (d.평형 ? ' · ' + esc(d.평형) : '') + '</div>' +
      (실제 && d.비교견적코드 ? '<a class="v-from" href="' + esc(견적주소(d.비교견적코드)) + '">📋 ' +
        (BASE ? 날짜(BASE.발행일시).slice(5).replace('.', '/') + ' ' : '') + '가견적(/q/' + esc(d.비교견적코드) +
        ')을 현장 확인 후 고친 견적입니다</a>' : '') +
    '</div>' +
    '</div>');

  // 가견적과 달라진 품목 표 (실제견적서, 2026-10-21 시안 C)
  비교 = BASE ? QuoteDiff.비교(BASE.라인들, d.라인들, 줄금액) : null;
  if (비교) {
    const 바뀐 = 비교.바뀐;
    const 가총 = 견적총액(BASE), 실총 = 견적총액(d);
    const 줄 = (r) => '<tr><td class="n">' + esc(r.이름) + '<small>' + esc(r.이유.join(' · ')) + '</small></td>' +
      '<td class="r">' + (r.종류 !== '신규' ? '<s>' + won(r.전).replace('원', '') + '</s>' : '') + won(r.후).replace('원', '') + '</td>' +
      '<td class="r ' + (r.차이 > 0 ? 'up' : 'down') + '">' + 부호(r.차이) + '</td></tr>';
    H.push('<div class="v-cmp"><h3>' + (바뀐.length ? '가견적과 달라진 품목 ' + 바뀐.length + '개' : '가견적과 달라진 품목이 없습니다') +
      '<small>현장 확인 후 바뀐 내용입니다</small></h3>' +
      '<table>' + 바뀐.map(줄).join('') +
      '<tr class="tot"><td>합계</td><td class="r"><s>' + won(가총).replace('원', '') + '</s>' + won(실총).replace('원', '') + '</td>' +
      '<td class="r ' + (실총 - 가총 > 0 ? 'up' : 'down') + '">' + 부호(실총 - 가총) + '</td></tr></table></div>');
  }

  // [＋ 추가 견적 받기] 상담 카드 (추가화면그리기 가 채운다). 실제견적으로 바뀐 옛 견적서에는 안 띄운다
  if (!d.다음견적코드) H.push('<div id="vAddon"></div>');

  // 구역별로 묶어서 표로 그린다. 고정폭 정렬을 쓰지 않으므로 폰마다 안 깨진다.
  let 현재구역 = null;
  d.라인들.forEach((l, i) => {
    if (l.구역 !== 현재구역) {
      if (현재구역 !== null) H.push('</div>');
      H.push('<div class="v-zone' + (l.고객추가 ? ' added' : '') + '"><h3>' + esc(l.구역) + '</h3>');
      if (l.고객추가) {
        H.push('<div class="v-addnote">⚠️ <span>고객님이 직접 추가한 품목입니다. ' +
          '실제 품목 상태에 따라 견적이 달라질 수 있습니다.</span></div>');
      }
      현재구역 = l.구역;
    }
    // 체크박스는 업자용·소비자용 모두 나온다. 업자도 견적을 낼 때
    // 품목을 빼고 넣어가며 금액을 맞춰봐야 하기 때문이다.
    // (품목설명 표시 여부와는 별개다 - 예전에는 둘이 묶여 있었다)
    // 품목 하나 = 카드 하나 (줄 + 종류 탭 + 설명 + 사진). 품목끼리 확실히 갈라 보이게 (2026-10-20 시안 A)
    H.push('<div class="v-item' + (l.고객추가 ? ' added' : '') + '" data-i="' + i + '">');
    H.push('<div class="v-line" data-i="' + i + '">' +
      '<input type="checkbox" class="v-chk" checked data-i="' + i + '">' +
      '<span class="v-nm">' + esc(줄이름(l)) + (l.고객추가 ? '<span class="v-addbadge">추가</span>' : '') +
        (비교 && 비교.키별[QuoteDiff.키(l)] ? '<span class="v-chgtag' + (비교.키별[QuoteDiff.키(l)].종류 === '신규' ? ' new' : '') + '">' +
          비교.키별[QuoteDiff.키(l)].종류 + '</span>' : '') + '</span>' +
      '<span class="v-qty">' + esc(l.수량) + esc(l.단위) + '</span>' +
      '<span class="v-amt">' + won(줄금액(l)) +
        (자재섞임(l) ? '<small class="v-mixed">자재 포함</small>' : '') + '</span>' +
      '</div>');
    // 종류를 고를 수 있는 줄(샤시 단창/2중창/시스템). 탭을 누르면 금액·설명·합계가 바로 바뀐다
    if (Array.isArray(l.종류들) && l.종류들.length > 1) {
      H.push('<div class="v-seg" data-i="' + i + '">' +
        l.종류들.map((k, ki) => '<button type="button" class="v-segb' + (ki === (l.종류 || 0) ? ' on' : '') +
          '" data-i="' + i + '" data-k="' + ki + '">' + esc(탭이름(k.품목명)) +
          '<small>' + won(줄금액(Object.assign({}, l, k))) + '</small></button>').join('') +
        '</div>');
    }
    if (설명포함 && (l.품목설명 || l.종류들)) {
      H.push('<div class="v-desc" data-i="' + i + '"' + (l.품목설명 ? '' : ' hidden') + '>' + esc(l.품목설명) + '</div>');
    }
    // 이 품목을 짚어주는 사진. 네모를 쳤으면 이미 사진에 박혀 있다.
    // 파일명이 체크_ID.jpg 라서 라인과 이어진다. 같은 품목 사진이 여럿이면
    // 체크_ID__2.jpg, __3.jpg 로 온다 - 전부 보여준다.
    const 사진들 = (d.사진들 || []).filter((p) =>
      p.url && (p.파일명 === l.체크_ID + '.jpg' || String(p.파일명 || '').indexOf(l.체크_ID + '__') === 0));
    사진들.forEach((사진) => {
      H.push('<div class="v-shot"><img src="' + esc(사진.url) +
        '" alt="' + esc(l.품목명) + ' 위치" loading="lazy"></div>');
    });
    // 고객이 추가한 품목은 고객이 직접 뺄 수 있다
    if (l.고객추가) {
      H.push('<button type="button" class="v-adddel" data-id="' + esc(l.체크_ID) + '" data-nm="' + esc(l.품목명) + '">이 추가 품목 빼기</button>');
    }
    H.push('</div>');   // .v-item
  });
  if (현재구역 !== null) H.push('</div>');

  // 가견적에는 있었는데 실제견적에서 빠진 품목
  const 빠진 = 비교 ? 비교.바뀐.filter((r) => r.종류 === '빠짐') : [];
  if (빠진.length) {
    H.push('<div class="v-zone v-gone"><h3>가견적에서 빠진 품목</h3>' + 빠진.map((r) =>
      '<div class="v-item"><div class="v-line"><span class="v-nm"><s>' + esc((r.구역 ? r.구역 + ' ' : '') + r.이름) +
      (r.수량 ? ' ' + esc(r.수량) : '') + '</s></span><span class="v-amt"><s>' + won(r.전) + '</s> <b class="down">' + 부호(r.차이) +
      '</b></span></div></div>').join('') + '</div>');
  }

  H.push('<div class="v-sum" id="vSum"></div>');

  // 메모는 ?d=1 여부와 무관하게 항상 보여준다. '안방-앞방 연결문 포함' 같은
  // 내용은 업자도 알아야 하므로 설명 토글로 감추면 안 된다.
  if (d.메모) {
    H.push('<div class="v-memo"><b>메모</b>' + esc(d.메모) + '</div>');
  }

  // 소비자 전달사항도 ?d=1 여부와 무관하게 항상 보여준다.
  // 업자에게 보내는 견적서(품목설명 끔)에서야말로 꼭 보여야 하는 내용이다 —
  // 업자가 이걸 읽고 자기 고객에게 옮겨 적어야 나중에 시공범위 분쟁이 안 난다.
  if (d.소비자_전달사항) {
    H.push('<div class="v-relay"><b>소비자 전달사항</b>' + esc(d.소비자_전달사항) + '</div>');
  }

  // 이 견적서에만 쓰는 안내문구를 적어 보냈으면 그것만 보여준다.
  // 품목 공통설명과 가맹점 공통 안내문구를 둘 다 대신한다.
  if (d.안내문구_수정) {
    H.push('<div class="v-note"><b>시공 안내</b>' + esc(d.안내문구_수정) + '</div>');
  } else {
    if (설명포함) {
      // 공통설명은 품목마다 반복하면 도배되므로 맨 아래 한 번만 모은다
      const 공통 = [...new Set(d.라인들.map((l) => l.공통설명).filter(Boolean))];
      if (공통.length) {
        H.push('<div class="v-note"><b>시공 안내</b>' + esc(공통.join('\n')) + '</div>');
      }
    }
    if (d.안내문구) {
      H.push('<div class="v-note">' + esc(d.안내문구.replace(/<[^>]*>/g, '').trim()) + '</div>');
    }
  }

  // 견적서 맨 끝에 명함. 이미지는 2160px 원본을 1080px JPEG(42KB)로 줄여 넣었다 -
  // 원본 2.8MB 를 그대로 쓰면 현장에서 데이터로 열 때 한참 걸린다.
  H.push('<div class="v-card">' +
    '<img src="/quote_card.jpg" alt="' + esc(d.업체명) + ' 명함" loading="lazy" ' +
    'width="1080" height="600"></div>');

  $v('#vDoc').innerHTML = H.join('');
  renderSum();
  추가화면그리기();
  document.querySelectorAll('.v-adddel').forEach((b) => b.addEventListener('click', () => 추가빼기(b.dataset.id, b.dataset.nm)));

  // 체크박스를 그리는 곳과 이벤트를 다는 곳이 따로 있다. 한쪽만 풀면
  // 네모는 보이는데 눌러도 금액이 안 바뀐다.
  document.querySelectorAll('.v-segb').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = +btn.dataset.i;
      const k = +btn.dataset.k;
      if (k === (DATA.라인들[i].종류 || 0)) delete 종류선택[i]; else 종류선택[i] = k;
      document.querySelectorAll('.v-segb[data-i="' + i + '"]').forEach((b) => b.classList.toggle('on', b === btn));
      const l = 실제줄(i);
      const 줄 = document.querySelector('.v-line[data-i="' + i + '"]');
      줄.querySelector('.v-nm').textContent = 줄이름(l);
      줄.querySelector('.v-amt').innerHTML = won(줄금액(l)) + (자재섞임(l) ? '<small class="v-mixed">자재 포함</small>' : '');
      줄.classList.toggle('kind-changed', 종류선택[i] != null);
      const 설명 = document.querySelector('.v-desc[data-i="' + i + '"]');
      if (설명) { 설명.textContent = l.품목설명 || ''; 설명.hidden = !l.품목설명; }
      renderSum();
    });
  });
  document.querySelectorAll('.v-chk').forEach((cb) => {
    cb.addEventListener('change', () => {
      const i = +cb.dataset.i;
      if (cb.checked) 해제.delete(i); else 해제.add(i);
      document.querySelector('.v-item[data-i="' + i + '"]').classList.toggle('off', !cb.checked);
      renderSum();
    });
  });
}

/* 조정 후 총액은 남은 표시금액의 합이다.
   QuoteCalc 로 다시 계산하지 않는다 — 스냅샷 금액을 그대로 써야
   발행 시점 금액과 어긋나지 않는다. */
function 현재총액() {
  return DATA.라인들.reduce((s, l, i) => 해제.has(i) ? s : s + 줄금액(실제줄(i)), 0);
}

/* 합계 절삭 (2026-10-20, quote_calc.js 의 절삭과 같은 규칙): 만원 아래를 버린다.
   그 전에 발행한 견적서는 저장된 총액이 품목 합과 같다 - 그런 견적서는 절삭하지 않는다
   (이미 보낸 견적서 금액이 바뀌면 안 된다). 절삭해서 발행한 견적서는 저장된 총액이
   만원 단위이고 품목 합보다 만원 미만으로 작다. 발행 때 절삭단위를 같이 보내지만
   서버가 안 남길 수도 있어서 금액으로도 알아본다. */
function 절삭견적() {
  if (Number(DATA.절삭단위) > 0) return true;
  const 전체 = DATA.라인들.reduce((s, l) => s + l.표시금액, 0);
  const 총 = Number(DATA.총액);
  return 총 % 10000 === 0 && 전체 - 총 > 0 && 전체 - 총 < 10000;
}
function 절삭(n) {
  return n >= 0 ? Math.floor(n / 10000) * 10000 : -Math.floor(-n / 10000) * 10000;
}
// 화면에 보일 합계 (절삭 반영)
function 표시총액() {
  const n = 현재총액();
  return 절삭견적() ? 절삭(n) : n;
}

function renderSum() {
  const d = DATA;
  const 품목합 = 현재총액();
  const 총 = 표시총액();
  const 조정됨 = 해제.size > 0 || Object.keys(종류선택).length > 0;
  const R = [];

  // 인건비 견적서에서는 소계·조정 줄을 안 쓴다. 그 소계는 자재비까지 든
  // 금액이라 인건비 합계와 안 맞아서, 받는 쪽이 계산기를 두드리면 어긋난다.
  if (!인건비만 && d.조정내역_표시 && d.조정_합계율 !== 0 && !조정됨) {
    R.push('<div class="v-row"><span>소계</span><span>' + won(d.소계) + '</span></div>');

    // 조정 이유를 항목명까지 같이 보여준다. '조정 +5%' 만 있으면 받는 쪽이
    // 왜 붙었는지 몰라서 전화가 온다. 항목명은 발행할 때 조정_내역에 같이 저장된다.
    // 비율 0인 항목은 뺀다 - 금액에 영향이 없는데 줄만 늘어난다.
    const 내역 = (d.조정_내역 || []).filter((a) => a && a.항목명 && a.비율);
    if (내역.length) {
      내역.forEach((a) => {
        R.push('<div class="v-row"><span>조정 <span class="v-why">(' +
          esc(a.항목명) + ')</span></span><span>' + 퍼센트(a.비율) + '</span></div>');
      });
    } else {
      // 항목명 없이 발행된 예전 견적서. 합계율만 보여준다.
      R.push('<div class="v-row"><span>조정</span><span>' +
        퍼센트(d.조정_합계율) + '</span></div>');
    }
  }
  // 품목을 더한 값과 합계가 왜 다른지 보이게 버린 금액을 적는다
  if (품목합 !== 총) {
    R.push('<div class="v-row"><span>만원 미만 절삭</span><span>-' + won(품목합 - 총) + '</span></div>');
  }
  // 실제견적서: 가견적 합계 / 실제견적 합계 / 차이
  if (BASE) R.push('<div class="v-row cmp"><span>가견적 합계</span><span>' + won(견적총액(BASE)) + '</span></div>');
  R.push('<div class="v-row total"><span>' + (BASE ? '실제견적 합계' : 인건비만 ? '인건비 합계' : '합계') +
    '</span><span>' + won(총) +
    (d.부가세_별도표기 ? ' <small>부가세 별도</small>' : '') + '</span></div>');
  if (BASE) {
    const 차 = 총 - 견적총액(BASE);
    R.push('<div class="v-row cmp diff"><span>차이</span><span class="' + (차 > 0 ? 'up' : 'down') + '">' + 부호(차) + '원</span></div>');
  }
  if (인건비만) {
    R.push('<div class="v-wagenote">자재는 시공주가 지급하는 조건입니다. ' +
      '자재비가 빠진 인건비만의 금액입니다.</div>');
  }

  $v('#vSum').innerHTML = R.join('');
  renderBar(총, 조정됨);
  renderInquiry(조정됨);
}

/* 화면 아래에 붙어 다니는 합계. 합계 줄이 견적서 맨 아래에 있어서
   품목을 빼도 금액이 바뀌는 게 안 보인다 - 그래서 합계만 따로 고정한다.
   명함·안내문은 원래 자리에 그대로 둔다. 여기 붙이면 화면을 다 가린다. */
function renderBar(총, 조정됨) {
  let bar = $v('#vBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'vBar';
    document.body.appendChild(bar);
  }
  const 뺀수 = 해제.size;
  const 바꾼수 = Object.keys(종류선택).length;
  bar.innerHTML =
    '<span class="v-bar-label">' + (인건비만 ? '인건비 합계' : '합계') +
      (뺀수 ? ' <small>' + 뺀수 + '개 뺌</small>' : '') +
      (바꾼수 ? ' <small>종류 ' + 바꾼수 + '개 바꿈</small>' : '') + '</span>' +
    '<span class="v-bar-amt">' +
      (BASE ? '<small class="v-bar-base">가견적 ' + won(견적총액(BASE)) + ' · ' + 부호(총 - 견적총액(BASE)) + '원</small>' : '') +
      won(총) +
      (DATA.부가세_별도표기 ? ' <small>부가세 별도</small>' : '') + '</span>';
  bar.classList.toggle('changed', 조정됨);
}

/* 품목을 빼면 그 아래에 문의 버튼이 나타난다. 업자용·소비자용 모두 나온다.
   업자가 '이렇게 빼고 얼마' 를 물어오는 것도 정상적인 흐름이라 막지 않는다. */
function renderInquiry(조정됨) {
  let box = $v('#vAdj');
  if (!조정됨) { if (box) box.remove(); return; }
  if (box) return;

  box = document.createElement('div');
  box.className = 'v-adjbox';
  box.id = 'vAdj';
  box.innerHTML =
    '<p>선택하신 품목만으로 <b>' + won(표시총액()) + '</b> 입니다.<br>' +
    '이 내용으로 문의하시면 담당자가 연락드립니다.</p>' +
    '<input type="tel" id="vPhone" placeholder="연락처 (예: 010-1234-5678)" inputmode="tel">' +
    '<button type="button" id="vSend">이 내용으로 문의하기</button>';
  $v('#vSum').after(box);

  $v('#vSend').addEventListener('click', 문의보내기);
}

async function 문의보내기() {
  const tel = ($v('#vPhone').value || '').trim();
  if (tel.replace(/[^0-9]/g, '').length < 9) {
    alert('연락처를 정확히 입력해 주세요.');
    return;
  }
  const btn = $v('#vSend');
  btn.disabled = true;
  btn.textContent = '보내는 중…';

  try {
    const res = await fetch(VIEW.inquiryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        견적코드: DATA.견적코드,
        연락처: tel,
        해제품목: [...해제].map((i) => DATA.라인들[i].구역 + ' ' + DATA.라인들[i].품목명),
        // 고객이 바꾼 종류 '거실 샤시1: 샤시(단창) → 샤시(2중창)'
        종류변경: Object.keys(종류선택).filter((i) => !해제.has(+i)).map((i) => {
          const l = DATA.라인들[i];
          return l.구역 + ' ' + String(l.품목명).split(' (')[0] + ': ' +
            종류이름(l.품목명) + ' → ' + 종류이름(실제줄(+i).품목명);
        }),
        남은품목: DATA.라인들.map((l, i) => ({ l: 실제줄(i), i: i })).filter((x) => !해제.has(x.i))
          .map(({ l }) => ({ 구역: l.구역, 품목명: l.품목명, 수량: l.수량, 단위: l.단위, 금액: l.표시금액 })),
        원래_총액: DATA.총액,
        조정후_총액: 표시총액(),
      }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const box = $v('#vAdj');
    box.className = 'v-adjbox done';
    box.innerHTML = '<p><b>문의가 접수되었습니다.</b><br>담당자가 확인 후 연락드리겠습니다.</p>';
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '이 내용으로 문의하기';
    alert('전송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
  }
}

/* ---------- [＋ 추가 견적 받기] (2026-10-21) ----------
   상담원이 한 단계씩 묻고(품목 → 종류 → 한쪽/양쪽 → 길이) 금액을 보여준다. [견적서에 추가하기] 를 누르면
   서버가 같은 식으로 다시 계산해 견적서에 바로 넣는다(사장님 확인 없이 - 사장님 결정). 묻는 순서와 금액
   계산은 quote_addon.js. 단가는 처음 열 때 한 번 받는다. */
const 추가 = { 열림: false, 표: null, 받는중: false, 오류: '', 품목: null, 고른: {}, 직접: false, 보내는중: false, 완료: null };

function 추가처음() {
  추가.품목 = null; 추가.고른 = {}; 추가.직접 = false; 추가.완료 = null; 추가.오류 = '';
}

async function 단가받기() {
  if (추가.표 || 추가.받는중) return;
  추가.받는중 = true; 추가.오류 = '';
  추가화면그리기();
  try {
    const res = await fetch(VIEW.priceUrl);
    const j = await res.json();
    if (!res.ok || !j || !Array.isArray(j.품목정보) || !j.품목정보.length) throw new Error('단가 없음');
    추가.표 = QuoteAddon.표맵(j.품목정보);
  } catch (e) {
    추가.오류 = '단가를 불러오지 못했습니다. 잠시 뒤 다시 눌러 주세요.';
  }
  추가.받는중 = false;
  추가화면그리기();
}

// 고른 대로의 금액 (아직 다 안 골랐으면 양쪽·1m 로 쳐서 'm당' 으로)
function 추가금액(p, 고른) {
  const 표 = 추가.표;
  const g = Object.assign({}, 고른);
  let q = QuoteAddon.다음질문(p, g, 표);
  if (q && q.키 === '면') { g.면 = '양쪽'; q = QuoteAddon.다음질문(p, g, 표); }
  let m당 = false;
  if (q && q.키 === '길이') { g.길이 = 1; m당 = true; }
  const s = QuoteAddon.선택(p, g, 표);
  if (!s) return null;
  const l = QuoteAddon.줄만들기(표[s.표이름], s, DATA.조정_합계율 || 0, QuoteAddon.자재비찾기(DATA.라인들));
  return l ? { 금액: 줄금액(l), m당: m당, 줄: l } : null;
}
function 금액글(r) {
  if (!r) return '';
  return (r.m당 ? 'm당 약 ' : '약 ') + won(r.금액);
}

function 추가화면그리기() {
  const box = $v('#vAddon');
  if (!box) return;
  const 아바타 = '<img class="va-av" src="/addon_agent.jpg" alt="" width="40" height="40">';
  if (!추가.열림) {
    box.innerHTML = '<button type="button" class="va-open">' + 아바타 +
      '<span><b>＋ 추가 견적 받기</b><small>더 하고 싶은 품목을 고르면 바로 금액이 나와요</small></span></button>';
    box.querySelector('.va-open').onclick = () => { 추가.열림 = true; 추가처음(); 단가받기(); 추가화면그리기(); };
    return;
  }
  const H = [];
  const 머리 = (질문, 작은) => '<div class="va-head">' + 아바타 + '<div class="va-q">' + esc(질문) +
    '<small>' + esc(작은) + '</small></div><button type="button" class="va-x" aria-label="닫기">✕</button></div>';
  const 표 = 추가.표;
  const p = 추가.품목;

  if (추가.완료) {
    H.push(머리('견적서에 추가했어요 ✅', '추가 견적 상담'));
    H.push('<div class="va-result"><div class="va-rname">' + esc(추가.완료.이름) + '</div>' +
      '<div class="va-ramt">' + won(추가.완료.금액) + '</div>' +
      '<p class="va-rsub">합계가 <b>' + won(표시총액()) + '</b>으로 바뀌었어요.</p>' +
      '<div class="va-warn">⚠️ 실제 품목 상태에 따라 견적이 달라질 수 있습니다.</div></div>');
    H.push('<div class="va-acts"><button type="button" class="va-go" data-act="again">＋ 다른 품목 추가</button>' +
      '<button type="button" class="va-sub" data-act="close">닫기</button></div>');
  } else if (!표) {
    H.push(머리('잠시만요', '추가 견적 상담'));
    H.push('<p class="va-help">' + esc(추가.오류 || '단가를 불러오는 중…') + '</p>');
    if (추가.오류) H.push('<div class="va-acts"><button type="button" class="va-go" data-act="retry">다시 불러오기</button></div>');
  } else if (!p) {
    H.push(머리('어떤 품목을 추가하고 싶으세요?', '추가 견적 상담 · 1단계'));
    H.push('<div class="va-opts items">' + QuoteAddon.쓸품목(표).map((x, i) =>
      '<button type="button" class="va-o" data-p="' + i + '"><span class="va-ico">' + x.아이콘 + '</span>' + esc(x.이름) + '</button>').join('') + '</div>');
  } else {
    const q = QuoteAddon.다음질문(p, 추가.고른, 표);
    const 단계 = 2 + Object.keys(추가.고른).length;
    const 고른글 = [p.이름].concat(QuoteAddon.고른글(p, 추가.고른, 표));
    if (q) {
      H.push(머리(q.질문, '추가 견적 상담 · ' + 단계 + '단계'));
      H.push('<div class="va-crumb">' + 고른글.map((t) => '<span>' + esc(t) + ' ✓</span>').join('') + '</div>');
      if (q.도움) H.push('<p class="va-help">' + esc(q.도움) + '</p>');
      H.push('<div class="va-opts">' + q.보기.map((b, i) => {
        const g = Object.assign({}, 추가.고른); g[q.키] = b.값;
        const 힌트 = b.면표 ? '한쪽 / 양쪽' : 금액글(추가금액(p, g));
        return '<button type="button" class="va-o" data-q="' + i + '">' + esc(b.글) + (힌트 ? '<small>' + 힌트 + '</small>' : '') + '</button>';
      }).join('') + (q.키 === '길이' ? '<button type="button" class="va-o' + (추가.직접 ? ' on' : '') + '" data-act="direct">직접 입력<small>m 숫자</small></button>' : '') + '</div>');
      if (q.키 === '길이' && 추가.직접) {
        H.push('<div class="va-direct"><input type="number" id="vaLen" inputmode="decimal" step="0.1" min="0.5" max="30" placeholder="예: 3.5">' +
          '<span>m</span><button type="button" class="va-go" data-act="len">확인</button></div>');
      }
    } else {
      // 다 골랐다 - 금액 보여주고 추가할지 묻는다
      const s = QuoteAddon.선택(p, 추가.고른, 표);
      const r = 추가금액(p, 추가.고른);
      H.push(머리('이렇게 추가할까요?', '추가 견적 상담 · 마지막 단계'));
      H.push('<div class="va-crumb">' + 고른글.map((t) => '<span>' + esc(t) + ' ✓</span>').join('') + '</div>');
      H.push('<div class="va-result"><div class="va-rname">' + esc(s.이름) +
        (r && r.줄.단위 === 'm' ? ' · ' + r.줄.수량 + 'm' : '') + '</div>' +
        '<div class="va-ramt">' + (r ? won(r.금액) : '') + '</div>' +
        '<div class="va-warn">⚠️ 실제 품목 상태에 따라 견적이 달라질 수 있습니다.</div></div>');
      if (추가.오류) H.push('<p class="va-help err">' + esc(추가.오류) + '</p>');
      H.push('<div class="va-acts"><button type="button" class="va-go" data-act="add"' + (추가.보내는중 ? ' disabled' : '') + '>' +
        (추가.보내는중 ? '추가하는 중…' : '견적서에 추가하기') + '</button>' +
        '<button type="button" class="va-sub" data-act="restart">처음부터</button></div>');
    }
    H.push('<div class="va-foot"><button type="button" class="va-back" data-act="back">‹ 이전</button></div>');
  }
  box.innerHTML = '<div class="va-card">' + H.join('') + '</div>';

  box.onclick = (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.classList.contains('va-x')) { 추가.열림 = false; 추가화면그리기(); return; }
    const act = t.dataset.act;
    if (act === 'close') { 추가.열림 = false; 추가처음(); 추가화면그리기(); return; }
    if (act === 'again' || act === 'restart') { 추가처음(); 추가화면그리기(); return; }
    if (act === 'retry') { 단가받기(); return; }
    if (act === 'add') { 추가보내기(); return; }
    if (act === 'direct') { 추가.직접 = !추가.직접; 추가화면그리기(); const i = $v('#vaLen'); if (i) i.focus(); return; }
    if (act === 'len') {
      const n = QuoteAddon.길이다듬기(($v('#vaLen') || {}).value);
      if (n == null) { alert('0.5m ~ 30m 사이로 적어 주세요.'); return; }
      추가.고른.길이 = n; 추가.직접 = false; 추가화면그리기(); return;
    }
    if (act === 'back') {
      추가.오류 = '';
      const 키들 = ['길이', '면', '종류'].filter((k) => 추가.고른[k] != null);
      if (키들.length) delete 추가.고른[키들[0]]; else 추가.품목 = null;
      추가화면그리기(); return;
    }
    if (t.dataset.p != null) { 추가.품목 = QuoteAddon.쓸품목(표)[+t.dataset.p]; 추가.고른 = {}; 추가화면그리기(); return; }
    if (t.dataset.q != null) {
      const q = QuoteAddon.다음질문(추가.품목, 추가.고른, 표);
      if (q) { 추가.고른[q.키] = q.보기[+t.dataset.q].값; 추가.직접 = false; 추가화면그리기(); }
    }
  };
  // 단계가 바뀌어도 카드가 화면 안에 있게
  const card = box.querySelector('.va-card');
  if (card && card.scrollIntoView && 추가.열림) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

async function 추가보내기() {
  const s = QuoteAddon.선택(추가.품목, 추가.고른, 추가.표);
  if (!s || 추가.보내는중) return;
  const r = 추가금액(추가.품목, 추가.고른);
  추가.보내는중 = true; 추가.오류 = '';
  추가화면그리기();
  try {
    const res = await fetch(VIEW.addonUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 견적코드: DATA.견적코드, 추가: s }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || !j.ok) throw new Error((j && j.error) || 'HTTP ' + res.status);
    if (!(await 받기())) throw new Error('다시 받기 실패');
    추가.완료 = { 이름: s.이름 + (r && r.줄.단위 === 'm' ? ' ' + r.줄.수량 + 'm' : ''), 금액: r ? r.금액 : 0 };
    추가.보내는중 = false;
    render();
  } catch (e) {
    추가.보내는중 = false;
    추가.오류 = String(e.message) === 'too_many' ? '추가 품목은 20개까지 넣을 수 있습니다.' : '추가하지 못했습니다. 통신 상태를 확인하고 다시 눌러 주세요.';
    추가화면그리기();
  }
}

async function 추가빼기(id, 이름) {
  if (!confirm('‘' + 이름 + '’ 을(를) 견적서에서 뺄까요?')) return;
  try {
    const res = await fetch(VIEW.addonUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 견적코드: DATA.견적코드, 삭제: id }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || !j.ok) throw new Error('fail');
    await 받기();
    render();
  } catch (e) {
    alert('빼지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
}

load();
