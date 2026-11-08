// 업무일정표 › 실행: 오후 5시(보고서 만들기, 11/5 저녁 7시에서 당김) · 낮 12시(내일 작업자 안내 문자) · 오전 9시(결재한 일 하기) · 시험용 make 요청. Airtable 백업을 읽은 뒤 온다.
let which = '';
for (const n of ['오후5시', '낮12시', '아침9시']) { try { if ($(n).isExecuted) which = n; } catch (e) { /* 없음 */ } }
const data = backup();
const today = todayKST();
let req = {};
try { req = $('보고서요청').first().json.body || {}; } catch (e) { req = {}; }
const sendNow = !which && req.action === 'decide';   // 오늘 ❓ 카드를 9시 뒤에 [진행해] (api.js askNow)
if (which === '낮12시') {
  // 내일 일하는 작업자에게 현장 안내 (사장님 11/5: 전날 낮 12시, 결재 없이). 같은 현장을 이어서 하는 날은 안 보낸다 (Share.workerNotices)
  sd.workerSent = sd.workerSent || {};
  Object.keys(sd.workerSent).forEach((k) => { if (now - sd.workerSent[k] > 14 * 864e5) delete sd.workerSent[k]; });
  const sent = [], noPhone = [], thin = {}, pickup = [];
  for (const w of Share.workerNotices(data.sites, data.settings, today)) {
    const k = w.siteId + '|' + w.date + '|' + w.name;
    if (sd.workerSent[k]) continue;
    if (w.pickup) {   // 🚗 사장님 차로 같이 가는 사람 (11/8) — 문자 대신 사장님께 전화하라고만
      sd.workerSent[k] = now;
      pickup.push(w.name + ' · ' + w.title);
      out.fills.push({ siteId: w.siteId, kind: 'log', room: '작업자 안내', title: w.name + '님은 픽업 — 전화로 만날 시간·장소 정하세요', detail: w.title });
      continue;
    }
    if (!w.phone) { noPhone.push(w.name + ' · ' + w.title); continue; }
    sd.workerSent[k] = now;
    out.sms.push({ phone: e164(w.phone), text: w.text });
    out.watch.push({ phone: w.phone, name: w.name, siteId: w.siteId, siteName: w.title, fill: false, keys: [] });
    out.fills.push({ siteId: w.siteId, kind: 'log', room: '작업자 안내', title: w.name + '님께 내일 현장 안내 문자', detail: w.title });
    sent.push(w.name + ' · ' + w.title);
    if (w.missing.length) thin[w.title] = w.missing;
  }
  if (sent.length || noPhone.length || pickup.length) {
    const lines = ['📨 <b>내일 작업자 안내 문자</b>'].concat(sent.map((x) => '✅ ' + esc(x)), noPhone.map((x) => '❗ 연락처 없어 못 보냄: ' + esc(x)),
      pickup.map((x) => '🚗 ' + esc(x) + ' — 픽업이라 문자 안 보냄. 전화로 만날 시간·장소 정하세요'),
      Object.keys(thin).map((t) => '❓ ' + esc(t) + ' — 빈 칸: ' + esc(thin[t].join(' · '))));
    out.notify.push({ html: true, text: lines.join('\n') });
  }
  return finish();
}
if (which === '아침9시' || sendNow) {
  // 오늘 날짜 보고서의 결재 — [진행해] 필름은 고른 담당자에게 주문 문자, 인원 모집은 여러 날 모집 시작, [내가할께]는 앱 할 일로
  const box = sd.reports[sendNow ? req.date : today];
  if (!box) return finish();
  const log = sd.log[today] = sd.log[today] || [];
  box.decisions = box.decisions || {};
  for (const it of box.rep.next) {
    if (sendNow && it.id !== req.id) continue;
    // ❓ 출입정보 질문은 결재 없이 9시에 자동 (사장님 11/6). 연기·내가·완료를 눌러 두면 안 나간다
    if (which === '아침9시' && it.kind === 'ask' && !box.decisions[it.id]) {
      const auto = data.sites.find((s) => s.id === it.siteId);
      if (auto && !auto.hide) box.decisions[it.id] = { act: 'go', at: now, to: null, auto: true };
    }
    const d = box.decisions[it.id];
    if (!d || d.doneAt) continue;
    const site = data.sites.find((s) => s.id === it.siteId);
    // 결재 뒤에 앱에서 이미 끝낸 일은 다시 하지 않는다 (11/5, 결재함에 CLEAR 로 보이는 일)
    if (d.act === 'go' && site && ((it.act === 'film' && Share.filmStageOf(site) >= 2) || (it.act === 'crew' && Share.recruitShort(site) <= 0))) { d.doneAt = now; continue; }
    if (d.act === 'go' && it.act === 'film' && site && d.to && d.to.phone) {
      const text = Share.filmOrderSms(site, !!data.settings.smsSiteName);
      if (!text) {
        out.notify.push({ html: true, text: '❗ <b>필름 주문 못 보냄</b> · ' + esc(it.title) + '\n적힌 필름 번호가 없습니다' });
        out.fills.push({ siteId: site.id, kind: 'log', room: '결재함', title: '필름 주문 못 보냄', detail: '적힌 필름 번호가 없음', state: 'need' });
        continue;
      }
      const items = Share.filmOrderText(site).split('\n').join(' · ');
      out.sms.push({ phone: e164(d.to.phone), text });
      out.fills.push({ siteId: site.id, kind: 'filmOrdered', value: items, room: d.to.label, at: today });
      out.notify.push({ html: true, text: '📨 <b>필름 주문 문자 보냄</b> (결재함)\n' + esc(Share.titleLine(site)) + '\n→ ' + esc(d.to.label) + '\n' + esc(items) });
      log.push({ kind: 'film', title: Share.titleLine(site) + ' 필름 발주 완료', res: d.to.label + ' — ' + items });
      d.doneAt = now;
    } else if (d.act === 'go' && it.act === 'crew' && site) {
      const isos = (site.days || []).map((x) => String(x.date || '')).filter(Share.isIsoDate).filter((x) => x >= today);
      const m = Share.recruitMulti(site, isos, data.sites, data.settings);
      if (!m.first.length) {
        out.notify.push({ html: true, text: '❗ <b>인원 모집 못 함</b> · ' + esc(Share.titleLine(site)) + '\n문자 보낼 사람을 아직 안 골랐거나 자리가 다 찼습니다 — 설정 › 팀원에서 고르거나 직접 구해 주세요' });
        out.fills.push({ siteId: site.id, kind: 'log', room: '결재함', title: '인원 모집 못 함', detail: '문자 보낼 사람이 없거나 자리가 다 참', state: 'need' });
      } else {
        out.crew.push({ action: 'start', siteId: site.id, siteName: Share.titleLine(site), queue: m.queue,
          days: m.days.map((x) => ({ date: x.iso, label: x.label, slots: x.slots, budget: 0, band: Share.buildRecruitText(site) })) });
        out.fills.push({ siteId: site.id, kind: 'log', room: '결재함', title: '인원 모집 시작', detail: m.days.map((x) => x.label + ' ' + x.slots + '자리').join(', ') });
        log.push({ kind: 'crew', title: Share.titleLine(site) + ' 인원 모집 시작', res: m.days.map((x) => x.label + ' ' + x.slots + '자리').join(', ') });
      }
      d.doneAt = now;
    } else if (d.act === 'go' && it.kind === 'ask' && site) {
      // ❓ 출입정보 질문 (사장님 11/5): 결재함에서 고른 사람에게 카톡/문자로 번호 질문 (빈칸 + 업체 확인 질문)
      d.doneAt = now;
      const q = Share.askQuestion(site, data.settings);
      // 고른 사람, 없으면 정해 둔 질문 담당 (거래처 담당자·현장 발주처 담당자)
      const to = d.to || Share.askTarget(site, data.clients.find((c) => c.id === site.clientId)) || {};
      const was = sd.asked[site.id];
      if (was && now - was.at < ASK_FRESH && was.by !== '결재함') {   // 그 사이 노트북이 이미 물음 (텔레그램 [시작해]·비서) — 두 번 안 묻는다
        out.fills.push({ siteId: site.id, kind: 'log', room: '결재함', title: '출입정보 질문 안 함 — 노트북이 이미 물음', detail: Share.titleLine(site) + (was.who ? ' · ' + was.who : '') });
        continue;
      }
      if (!q) {   // 그 사이 앱에서 다 받음
        out.fills.push({ siteId: site.id, kind: 'log', room: '결재함', title: '출입정보 질문 안 함 — 이미 다 받음', detail: Share.titleLine(site) });
        continue;
      }
      if (!to.via) {   // 물어볼 담당자가 없음
        out.notify.push({ html: true, text: '❗ <b>출입정보 질문 못 보냄</b> · ' + esc(it.title) + '\n물어볼 담당자가 없습니다 — 거래처 담당자를 적어 주세요' });
        out.fills.push({ siteId: site.id, kind: 'log', room: '결재함', title: '출입정보 질문 못 보냄', detail: '담당자 없음', state: 'need' });
        continue;
      }
      const items = Share.siteAskItems(site, data.settings);
      if (to.via === 'sms') {
        const phone = Share.phoneDigits(to.phone);
        if (phone.length < 9) {
          out.notify.push({ html: true, text: '❗ <b>출입정보 질문 못 보냄</b> · ' + esc(it.title) + '\n' + esc(to.name || '담당자') + ' 번호가 없습니다' });
          out.fills.push({ siteId: site.id, kind: 'log', room: '결재함', title: '출입정보 질문 못 보냄', detail: (to.name || '담당자') + ' 번호 없음', state: 'need' });
          continue;
        }
        out.sms.push({ phone: e164(phone), text: q });
        // 답 문자가 오면 AI 가 읽어 비번·화장실·필름 칸에 (문자_답장, fill)
        out.watch.push({ phone, name: to.name || '담당자', siteId: site.id, siteName: Share.titleLine(site), client: to.client || '', fill: true, keys: items.missing,
          ask: { q, date: site.date, checks: items.checks.map((c) => ({ id: c.id, text: Share.checkText(c, site), ok: !!c.ok })) } });
      } else {
        // 카톡: 노트북(카톡 읽기)이 그 방에 보내고 답을 7일 기다린다 (gaps.run_ask 와 같은 길). 방 = 담당자 카톡방 → 노트북의 거래처 방
        out.kakao.push({ action: 'add', id: 'ask' + site.id.replace(/[^A-Za-z0-9]/g, '') + today.replace(/-/g, ''), room: to.kakaoRoom || '', client: to.client || '', text: q, ttl: 600,
          ask: { id: site.id, name: Share.titleLine(site), client: to.client || '', date: site.date, missing: items.missing, checks: items.checks.map((c) => ({ id: c.id, text: c.text, ok: !!c.ok })) } });
      }
      sd.asked[site.id] = { at: now, by: '결재함', via: to.via === 'sms' ? 'sms' : 'kakao', who: to.name || '' };   // 노트북이 [시작해] 를 또 안 띄우게
      out.fills.push({ siteId: site.id, kind: 'log', room: '결재함', title: '출입정보 질문 ' + (to.via === 'sms' ? '문자 보냄' : '카톡 맡김'), detail: Share.titleLine(site) + ' → ' + (to.name || '담당자') });
      log.push({ kind: 'ask', title: Share.titleLine(site) + ' 출입정보 질문', res: (to.name || '담당자') + ' · ' + (to.via === 'sms' ? '문자' : '카톡') });
    } else if (d.act === 'go' && it.act === 'review' && site) {
      // 👤 개인고객 시공 후 안부·후기 문자 (사장님 11/5, 결재함에서 [진행해] 한 것만)
      const cust = Share.privateCustomer(site), phone = Share.phoneDigits(cust.phone);
      d.doneAt = now;
      if (phone.length < 9) {
        out.notify.push({ html: true, text: '❗ <b>후기 문자 못 보냄</b> · ' + esc(it.title) + '\n고객 연락처가 없습니다' });
        continue;
      }
      out.sms.push({ phone: e164(phone), text: Share.reviewSms(site, data.settings) });
      out.watch.push({ phone, name: cust.name || '고객', siteId: site.id, siteName: Share.titleLine(site), fill: false, keys: [] });
      out.fills.push({ siteId: site.id, kind: 'log', room: '결재함', title: '고객 후기 문자 보냄', detail: Share.titleLine(site) });
      log.push({ kind: 'review', title: Share.titleLine(site) + ' 고객 후기 문자', res: cust.name || '고객' });
    }
  }
  if (sendNow) {
    out.resp = { ok: true, date: req.date, rep: box.rep, decisions: box.decisions, reports: Object.keys(sd.reports).sort().reverse(),
      inbox: (sd.inbox || []).map((x) => ({ id: x.id, kind: x.kind, room: x.room, title: x.title, quote: x.quote, cands: x.cands || [], siteId: x.siteId || '', name: x.name || '' })), asked: sd.asked };
  }
  return finish();
}
// 오후 5시 (또는 make) — 내일 업무일정표. make { base: 'YYYY-MM-DD' } 면 그날 결과 + 다음 날 예정 (샘플 '어제 결과·오늘 할 일', 11/3)
const base = /^\d{4}-\d{2}-\d{2}$/.test(req.base || '') ? req.base : today;
const rep = Share.dailyReport(data.sites, data.settings, data.tasks, base);
rep.done = rep.done.concat(sd.log[base] || []).filter((x, i, a) => a.findIndex((y) => y.title === x.title && y.res === x.res) === i);
// [완료표시] 한 일은 빼고, 오늘 보고서에서 [내가할께] 했는데 아직 남은 일은 '어제 내가할께 — 아직 안 됨' (사장님 11/3)
const prev = (sd.reports[base] || {}).decisions || {};
rep.next = rep.next.filter((n) => !sd.marks[n.id]).map((n) => ((prev[n.id] || {}).act === 'mine' ? Object.assign({}, n, { again: true }) : n));
const old = sd.reports[rep.date];
// ⏸ 멈춘 ❓ 출입정보 카드 (사장님 11/6): 다 받거나 완료·진행해 할 때까지 날마다 다시 올린다. 멈춘 채로 올라와 9시에 나가지 않는다
const carried = {}, lastAsk = {};
Object.keys(sd.reports).filter((k) => k < rep.date).sort().forEach((k) => {
  const x = sd.reports[k];
  (x.rep.next || []).forEach((n) => { if (n.kind === 'ask' && n.siteId) lastAsk[n.siteId] = (x.decisions || {})[n.id] || null; });
});
const ASK_SHORT = { pwLobby: '공동현관', pwUnit: '세대 비번', toilet: '화장실', films: '필름 번호' };
Object.keys(lastAsk).forEach((siteId) => {
  const was = lastAsk[siteId], id = 'ask:' + siteId;
  if (!was || was.act !== 'later' || sd.marks[id]) return;
  const site = data.sites.find((s) => s.id === siteId);
  if (!site || site.hide || !site.date || site.date < rep.date) return;
  const items = Share.siteAskItems(site, data.settings);
  if (!items.missing.length && !items.checks.length) return;
  carried[id] = { act: 'later', at: was.at, to: null, carried: true };
  if (!rep.next.some((n) => n.id === id)) rep.next.push({ id, kind: 'ask', title: Share.titleLine(site) + ' 출입정보 질문', siteId, act: 'ask',
    res: items.missing.map((k) => ASK_SHORT[k]).concat(items.checks.length ? ['확인 질문 ' + items.checks.length + '개'] : []).join('·') });
});
sd.reports[rep.date] = { rep, decisions: Object.assign(carried, (old && old.decisions) || {}), at: now };
keepRecent();
const text = Share.dailyReportKakao(rep, APP_URL + '#approve/' + rep.date);
sd.outbox.push({ id: 'r' + now.toString(36), t: now, text });
out.resp = { ok: true, date: rep.date, done: rep.done.length, next: rep.next.length };
return finish();
