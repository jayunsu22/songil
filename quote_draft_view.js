/* 견적초안 ①② 화면 (2026-10-29 사장님, 업무자동화 1단계).
   방문견적 위 '📋 요청 붙여넣기' 칸: 카톡·문자·통화로 받은 견적 요청 글을 붙여넣고 [초안 만들기] 를 누르면
   n8n 견적초안_읽기(1분견적 프롬프트 복사, 사장님 열쇠)가 품목을 읽고, request_draft.js 가 방문견적에 체크한다.
   금액은 방문견적이 평소대로 계산한다. 이미 체크한 품목은 건드리지 않는다.
   받은 글과 공통 정보(사는 집인지·위치·다른 공정·날짜·필름)는 state.요청초안 에 남는다 →
   자동저장·저장함·서버 백업을 그대로 탄다. ③ 빠진 것 질문, ④ 답 붙여넣기가 이걸 쓴다.

   quote_pro.js·request_draft.js 뒤에 로드된다. 그 파일의 전역(MASTER, state, CONFIG, $, esc, toast,
   buildAll, refresh, persist, 보이는가)을 쓴다. */

(function () {
  const 고른 = { 출처: '카톡', 보낸이: '고객' };
  const 시간초과 = 100000;   // n8n Gemini 노드가 90초까지 기다린다

  const 바 = $('#draftBar');
  if (!바) return;
  const 본문 = $('#draftBody');
  const 글칸 = $('#draftText');
  const 버튼 = $('#draftGo');
  const 결과 = $('#draftResult');

  $('#draftToggle').addEventListener('click', () => {
    본문.hidden = !본문.hidden;
    $('#draftToggle').classList.toggle('on', !본문.hidden);
    if (!본문.hidden) 글칸.focus();
  });

  바.querySelectorAll('.draft-chips').forEach((묶음) => {
    묶음.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      고른[묶음.dataset.k] = b.dataset.v;
      묶음.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    });
  });

  function 알림(html, 나쁨) {
    결과.hidden = false;
    결과.className = 나쁨 ? 'err' : '';
    결과.innerHTML = html;
  }

  const 오늘 = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  // 이번에 체크한 품목이 있는 구역은 펼쳐서 보여 준다
  function 구역펼치기(ids) {
    const 구역들 = new Set();
    MASTER.zones.forEach((z) => z.items.forEach((it) => { if (ids.indexOf(it.체크_ID) >= 0) 구역들.add(z.구역); }));
    document.querySelectorAll('#zones .zone').forEach((d) => { if (구역들.has(d._zone)) d.open = true; });
  }

  // 공통 정보는 새로 읽은 값이 있을 때만 덮는다 - 답장을 두 번째로 붙여넣으면 앞에서 알아낸 게 지워지면 안 된다
  function 공통합치기(앞, 새) {
    const out = Object.assign({}, 앞 || {});
    Object.keys(새 || {}).forEach((k) => { if (String(새[k] || '').trim()) out[k] = 새[k]; });
    return out;
  }

  버튼.addEventListener('click', async () => {
    const 글 = 글칸.value.trim();
    if (!글) { 알림('붙여넣은 글이 없어요.', true); 글칸.focus(); return; }
    if (!MASTER || !MASTER.zones) { 알림('방문견적 품목을 아직 못 받았어요. 위 상태줄이 "불러오는 중"이면 잠시 뒤 다시 눌러 주세요.', true); return; }

    버튼.disabled = true;
    버튼.textContent = '읽는 중…';
    결과.hidden = true;
    const ac = new AbortController();
    const 타이머 = setTimeout(() => ac.abort(), 시간초과);
    let j = null;
    try {
      const res = await fetch(CONFIG.draftReadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 출처: 고른.출처, 보낸이: 고른.보낸이, 글: 글, 오늘: 오늘() }),
        signal: ac.signal,
      });
      if (res.status === 401 || res.status === 403) throw new Error('열쇠');
      j = await res.json();
      if (!j || !j.ok) throw new Error('빈답');
    } catch (e) {
      알림(e.message === '열쇠'
        ? '사장님 열쇠가 없는 기기라 AI 를 부를 수 없어요.'
        : 'AI 가 답하지 않았어요. 다시 눌러 주세요.', true);
      return;
    } finally {
      clearTimeout(타이머);
      버튼.disabled = false;
      버튼.textContent = '초안 만들기';
    }

    if (!(j.items || []).length) { 알림('품목을 못 찾았어요. 아래 목록에서 직접 체크해 주세요.', true); return; }

    // 지금 화면에 보이는 품목만 (평형이 안 맞는 품목은 고를 수 없다)
    const zones = MASTER.zones.map((z) => ({ 구역: z.구역, items: z.items.filter(보이는가) }));
    const r = RequestDraft.체크하기(j.items, zones, state.선택);
    const 새것 = Object.keys(r.선택);
    Object.assign(state.선택, r.선택);

    const 앞 = state.요청초안 || { 붙여넣기: [], 공통: {} };
    state.요청초안 = {
      붙여넣기: (앞.붙여넣기 || []).concat([{ 출처: 고른.출처, 보낸이: 고른.보낸이, 글: 글, 일시: new Date().toISOString() }]),
      공통: 공통합치기(앞.공통, j.공통),
    };

    buildAll();
    refresh();
    persist();
    구역펼치기(새것);

    const 빠짐 = RequestDraft.빠진것(state.요청초안.공통);
    const 아는것 = [['거주', '사는 집'], ['위치', '위치'], ['다른공정', '다른 공정'], ['날짜', '날짜'], ['필름', '필름']]
      .filter(([k]) => String(state.요청초안.공통[k] || '').trim())
      .map(([k, 글]) => '<li><b>' + 글 + '</b> ' + esc(state.요청초안.공통[k]) + '</li>');
    알림(
      '<p class="dr-sum">' + 새것.length + '개 체크' +
        (r.건너뜀.length ? ' · 이미 체크된 ' + r.건너뜀.length + '개는 그대로' : '') + '</p>' +
      (r.확인필요.length
        ? '<ul class="dr-need">' + r.확인필요.map((x) =>
            '<li>⚠️ ' + esc(x.품목명) + ' ' + x.개수 + '개 — ' + esc(x.이유) + (x.근거 ? ' <small>「' + esc(x.근거) + '」</small>' : '') + '</li>').join('') + '</ul>'
        : '') +
      // 길이를 안 말한 싱크대는 보통 길이로 채웠다 - 실측하면 수량 칸에서 고친다
      (r.보통길이.length
        ? '<p class="dr-len">📏 길이를 몰라 보통 길이로: ' + r.보통길이.map((x) => esc(x.품목명) + ' ' + x.길이 + 'm').join(' · ') + '</p>'
        : '') +
      (아는것.length ? '<ul class="dr-know">' + 아는것.join('') + '</ul>' : '') +
      (빠짐.length ? '<p class="dr-miss">꼭 알아야 할 것 빠짐: <b>' + 빠짐.join(' · ') + '</b></p>' : '<p class="dr-ok">꼭 알아야 할 것 다 있어요</p>'));
    toast(새것.length + '개 품목을 체크했어요');
  });
})();
