/* 견적서 화면. 발행 시점 스냅샷을 그대로 보여준다.
   금액을 다시 계산하지 않는다 — 단가가 바뀌어도 이미 보낸 견적서는 변하면 안 된다. */

const VIEW = {
  quoteUrl:   'https://primary-production-a6fa.up.railway.app/webhook/pro-quote',
  inquiryUrl: 'https://primary-production-a6fa.up.railway.app/webhook/pro-inquiry',
};

// /q/CODE 또는 /quote_view.html?id=CODE (개발용) 둘 다 받는다
const params = new URLSearchParams(location.search);
const 코드 = (location.pathname.match(/\/q\/([A-Za-z0-9]+)/) || [])[1] || params.get('id') || '';
const 설명포함 = params.get('d') === '1';

let DATA = null;
const 해제 = new Set();   // 소비자가 체크 해제한 품목 (?d=1 에서만 쓴다)

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

async function load() {
  if (!코드) {
    status('견적서 주소가 올바르지 않습니다.', true);
    return;
  }
  try {
    const res = await fetch(VIEW.quoteUrl + '?id=' + encodeURIComponent(코드));
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error) {
      // 빈 화면이나 JS 에러를 그대로 두면 받은 사람이 사장님한테 전화한다
      status('견적서를 찾을 수 없습니다. 링크를 다시 확인해 주세요.', true);
      return;
    }
    DATA = j;
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

  H.push('<div class="v-head">' +
    '<div class="v-shop">' + esc(d.업체명) + '</div>' +
    (연락.length ? '<div class="v-contact">' + 연락.join('') + '</div>' : '') +
    '<div class="v-headfoot">' +
      (d.현장명 ? '<div class="v-site">' + esc(d.현장명) + '</div>' : '') +
      '<div class="v-meta">인테리어필름 시공 견적서 · ' + 날짜(d.발행일시) +
        (d.평형 ? ' · ' + esc(d.평형) : '') + '</div>' +
    '</div>' +
    '</div>');

  // 구역별로 묶어서 표로 그린다. 고정폭 정렬을 쓰지 않으므로 폰마다 안 깨진다.
  let 현재구역 = null;
  d.라인들.forEach((l, i) => {
    if (l.구역 !== 현재구역) {
      if (현재구역 !== null) H.push('</div>');
      H.push('<div class="v-zone"><h3>' + esc(l.구역) + '</h3>');
      현재구역 = l.구역;
    }
    H.push('<div class="v-line" data-i="' + i + '">' +
      (설명포함 ? '<input type="checkbox" class="v-chk" checked data-i="' + i + '">' : '') +
      '<span class="v-nm">' + esc(l.품목명) + '</span>' +
      '<span class="v-qty">' + esc(l.수량) + esc(l.단위) + '</span>' +
      '<span class="v-amt">' + won(l.표시금액) + '</span>' +
      '</div>');
    if (설명포함 && l.품목설명) {
      H.push('<div class="v-desc">' + esc(l.품목설명) + '</div>');
    }
  });
  if (현재구역 !== null) H.push('</div>');

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

  if (설명포함) {
    document.querySelectorAll('.v-chk').forEach((cb) => {
      cb.addEventListener('change', () => {
        const i = +cb.dataset.i;
        if (cb.checked) 해제.delete(i); else 해제.add(i);
        document.querySelector('.v-line[data-i="' + i + '"]').classList.toggle('off', !cb.checked);
        renderSum();
      });
    });
  }
}

/* 조정 후 총액은 남은 표시금액의 합이다.
   QuoteCalc 로 다시 계산하지 않는다 — 스냅샷 금액을 그대로 써야
   발행 시점 금액과 어긋나지 않는다. */
function 현재총액() {
  return DATA.라인들.reduce((s, l, i) => 해제.has(i) ? s : s + l.표시금액, 0);
}

function renderSum() {
  const d = DATA;
  const 총 = 현재총액();
  const 조정됨 = 해제.size > 0;
  const R = [];

  if (d.조정내역_표시 && d.조정_합계율 !== 0 && !조정됨) {
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
  R.push('<div class="v-row total"><span>합계</span><span>' + won(총) +
    (d.부가세_별도표기 ? ' <small>부가세 별도</small>' : '') + '</span></div>');

  $v('#vSum').innerHTML = R.join('');
  renderInquiry(조정됨);
}

/* 소비자용(?d=1)에서 품목을 빼면 문의 버튼이 나타난다.
   업자에게 보낸 견적서에서 품목이 빠지면 곤란하므로 여기서만 동작한다. */
function renderInquiry(조정됨) {
  let box = $v('#vAdj');
  if (!조정됨) { if (box) box.remove(); return; }
  if (box) return;

  box = document.createElement('div');
  box.className = 'v-adjbox';
  box.id = 'vAdj';
  box.innerHTML =
    '<p>선택하신 품목만으로 <b>' + won(현재총액()) + '</b> 입니다.<br>' +
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
        남은품목: DATA.라인들.filter((l, i) => !해제.has(i))
          .map((l) => ({ 구역: l.구역, 품목명: l.품목명, 수량: l.수량, 단위: l.단위, 금액: l.표시금액 })),
        원래_총액: DATA.총액,
        조정후_총액: 현재총액(),
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

load();
