/* 긴급구인 화면 미리보기용 가짜 응답 (?demo). 이름·번호는 지어낸 것. n8n 은 부르지 않는다. */
(function () {
  var now = { date: '2026-11-23', hhmm: '06:41', min: 401 };
  var me = { name: '박기사', grade: '준기공', regions: ['인천', '부천시', '서울'], semi: false, avail: true, canAvail: true, likes: 23 };
  var offers = [
    { id: 'j1', open: true, grade: '준기공', pay: 20, place: '경기 부천시', type: '주택', start: '08:00 시작', arrive: '1시간 안에 오실 분', memos: ['주차 가능'], memo: '', rep: { name: '○○인테리어', hires: 18, likes: 16 }, ago: 3 },
    { id: 'j2', open: true, grade: '준기공', pay: 18, place: '인천', type: '상가', start: '09:00 시작', arrive: '30분 안에 오실 분', memos: [], memo: '', rep: { name: '△△필름', hires: 6, likes: 1 }, ago: 8 }
  ];
  var confirmed = null, reviews = [{ match: 'm0', company: '□□디자인', date: '2026-11-22' }];
  var job = null, post = { can: true, when: '바로 발송' };
  var wv = function () { return { ok: true, kind: 'w', now: now, me: me, offers: offers, confirmed: confirmed, reviews: reviews, other: 'bdemo' }; };
  var bv = function () { return { ok: true, kind: 'b', now: now, me: { name: '○○인테리어', hires: 18, likes: 16 }, job: job, post: post,
    waiting: [{ place: '인천', n: 12 }, { place: '부천시', n: 7 }, { place: '서울', n: 18 }], reviews: [{ match: 'm0', name: '김기사', date: '2026-11-22' }], other: 'wdemo' }; };
  window.EJ_DEMO = function (b) {
    var k = b.key || '';
    if (b.action === 'join') return { ok: true };
    if (k[0] === 'b' || /\/e\/b\//.test(location.pathname)) {
      if (b.action === 'post') {
        job = { id: 'j9', status: '발송중', date: now.date, line: b.grade + ' ' + b.pay + '만 · ' + (b.sido === '경기' ? '경기 ' + b.sigun : b.sido) + ' ' + b.type, place: b.sido === '경기' ? '경기 ' + b.sigun : b.sido,
          type: b.type, at: now.hhmm, sentAt: now.hhmm, round: 1, sent: 9, worker: null };
        post = { can: false, why: '진행 중인 구인이 있어요' };
        setTimeout(function () { job.status = '확정'; job.worker = { match: 'm1', name: '박○○', grade: b.grade, likes: 23, noshows: 0, phone: '010-0000-0000', at: '06:44' }; }, 4000);
        return Object.assign(bv(), { posted: { status: '발송중', sent: 9, date: now.date } });
      }
      if (b.action === 'rematch') { job.status = '발송중'; job.worker = null; job.round = 2; return Object.assign(bv(), { reopened: 11 }); }
      if (b.action === 'stop') { job.status = '취소'; post = { can: true, when: '바로 발송' }; return bv(); }
      return bv();
    }
    if (b.action === 'avail') { me.avail = !!b.on; return wv(); }
    if (b.action === 'accept') {
      offers = offers.filter(function (o) { return o.id !== b.job; }).map(function (o) { return Object.assign({}, o, { open: false }); });
      confirmed = { match: 'm1', company: '○○인테리어', phone: '010-0000-0000', addr: '부천시 ○○아파트 101동', line: '준기공 20만 · 경기 부천시 주택 · 08:00 시작' };
      return { ok: true, confirmed: confirmed };
    }
    if (b.action === 'cancel') { confirmed = null; return wv(); }
    if (b.action === 'review') { reviews = []; return wv(); }
    return wv();
  };
})();
