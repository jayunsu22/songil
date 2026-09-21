/* 정산 견적서 화면. 발행 시점 스냅샷을 그대로 보여준다.
   금액을 다시 계산하지 않는다 — 단가가 바뀌어도 이미 보낸 견적서는 변하면 안 된다. */

const VIEW = {
  quoteUrl: 'https://primary-production-a6fa.up.railway.app/webhook/settle-quote',
};

// /s/CODE 또는 /settle_view.html?id=CODE (개발용) 둘 다 받는다
const params = new URLSearchParams(location.search);
const 코드 = (location.pathname.match(/\/s\/([A-Za-z0-9]+)/) || [])[1] || params.get('id') || '';

const $v = (s) => document.querySelector(s);
const won = (n) => Math.round(Number(n) || 0).toLocaleString('ko-KR') + '원';
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const 짧게 = (url) => String(url || '').replace(/^https?:\/\//, '').replace(/\/$/, '');

function status(msg, isErr) {
  const el = $v('#vStatus');
  el.textContent = msg || '';
  el.hidden = !msg;
  el.className = isErr ? 'err' : '';
}
function 날짜(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
}
// 소모량 표시: 6.5 → '6.5m', 3 → '3m'
const m = (v) => (Math.round(Number(v || 0) * 10) / 10) + 'm';

async function load() {
  if (!코드) { status('견적서 주소가 올바르지 않습니다.', true); return; }
  try {
    const res = await fetch(VIEW.quoteUrl + '?id=' + encodeURIComponent(코드));
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error) {
      // 빈 화면이나 JS 에러를 그대로 두면 받은 사람이 사장님한테 전화한다
      status('견적서를 찾을 수 없습니다. 링크를 다시 확인해 주세요.', true);
      return;
    }
    render(j);
    status('');
    $v('#vDoc').hidden = false;
    $v('#vBar').hidden = false;
  } catch (e) {
    status('견적서를 불러오지 못했습니다. 통신 상태를 확인해 주세요.', true);
  }
}

function render(d) {
  const s = d.스냅샷 || {};
  const 합계 = s.합계 || {};
  const co = d.회사정보 || {};
  const H = [];

  // 머리말: 업체 명함 카드 (quote_view 와 같은 모양)
  const 연락 = [];
  if (co.대표전화) {
    연락.push('<a href="tel:' + esc(String(co.대표전화).replace(/[^0-9+]/g, '')) + '">' +
      '<span class="v-ico">전화</span><span>' + esc(co.대표전화) + '</span></a>');
  }
  if (co.홈페이지주소) {
    연락.push('<a href="' + esc(co.홈페이지주소) + '" target="_blank" rel="noopener">' +
      '<span class="v-ico">홈페이지</span><span>' + esc(짧게(co.홈페이지주소)) + '</span></a>');
  }
  H.push('<div class="v-head">' +
    '<div class="v-shop">' + esc(co.업체명 || '섬세한손길') + '</div>' +
    (연락.length ? '<div class="v-contact">' + 연락.join('') + '</div>' : '') +
    '<div class="v-headfoot">' +
      (d.현장명 ? '<div class="v-site">' + esc(d.현장명) + '</div>' : '') +
      '<div class="v-meta">인테리어필름 시공 정산 견적서 · ' + 날짜(d.발행일시) + '</div>' +
    '</div></div>');

  // 인건비
  const 인 = s.인건비 || {};
  H.push('<div class="v-tbl"><h3>인건비</h3>' +
    '<div class="v-line"><span class="v-nm">시공 인건비<small>' + esc(인.품수) + '품 × ' + won(인.품단가) + '</small></span>' +
    '<span class="v-amt">' + won(인.금액) + '</span></div></div>');

  // 자재비: 자재별 한 줄 + 품목 내역 접기
  const 자재 = s.자재소계 || [];
  const 품목 = s.품목 || [];
  H.push('<div class="v-tbl"><h3>자재비</h3>');
  if (자재.length) {
    자재.forEach((r) => {
      H.push('<div class="v-line"><span class="v-nm">' + esc(r.자재명) + '<small>' + won(r.단가) + '/m × ' + m(r.소모량합) + '</small></span>' +
        '<span class="v-amt">' + won(r.금액) + '</span></div>');
    });
  } else {
    H.push('<div class="v-empty">자재비 없음</div>');
  }
  if (품목.length) {
    H.push('<details><summary>품목 내역 보기 (' + 품목.length + ')</summary>');
    품목.forEach((p) => {
      const 수량 = p.길이 != null ? m(p.길이) : (p.수량 != null ? p.수량 + '개' : '');
      H.push('<div class="sub' + (Number(p.소모량) ? '' : ' zero') + '"><span>' +
        (p.구역 ? esc(p.구역) + ' · ' : '') + esc(p.품목명) + (수량 ? ' ' + esc(수량) : '') + '</span>' +
        '<span>' + m(p.소모량) + ' · ' + esc(p.자재명) + '</span></div>');
    });
    H.push('</details>');
  }
  H.push('</div>');

  // 부가 항목 (금액 있는 줄만 발행 시 담겨 온다)
  const 부가 = s.부가 || [];
  if (부가.length) {
    H.push('<div class="v-tbl"><h3>부가 항목</h3>');
    부가.forEach((e) => {
      // 식대 '인건비 포함' 처럼 금액 대신 글자로 나가는 줄이 있다
      H.push('<div class="v-line"><span class="v-nm">' + esc(e.항목명) + '</span><span class="v-amt">' + (e.비고 ? esc(e.비고) : won(e.금액)) + '</span></div>');
    });
    H.push('</div>');
  }

  // 합계
  H.push('<div class="v-sum">' +
    '<div class="v-row"><span>인건비</span><span>' + won(합계.인건비) + '</span></div>' +
    '<div class="v-row"><span>자재비</span><span>' + won(합계.자재비) + '</span></div>' +
    (부가.length ? '<div class="v-row"><span>부가 항목</span><span>' + won(합계.부가) + '</span></div>' : '') +
    '<div class="v-row total"><span>합계</span><span>' + won(합계.총액) +
      (d.부가세_별도표기 ? ' <small>부가세 별도</small>' : '') + '</span></div>' +
    '</div>');

  if (d.메모) H.push('<div class="v-memo"><b>메모</b>' + esc(d.메모) + '</div>');

  H.push('<div class="v-card"><img src="/quote_card.jpg" alt="' + esc(co.업체명 || '섬세한손길') + ' 명함" loading="lazy" width="1080" height="600"></div>');

  $v('#vDoc').innerHTML = H.join('');
  $v('#vBarAmt').innerHTML = won(합계.총액) + (d.부가세_별도표기 ? ' <small>부가세 별도</small>' : '');
}

load();
