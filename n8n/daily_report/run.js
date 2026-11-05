// 업무일정표 › 실행: 오후 5시(보고서 만들기, 11/5 저녁 7시에서 당김) · 낮 12시(내일 작업자 안내 문자) · 오전 9시(결재한 일 하기) · 시험용 make 요청. Airtable 백업을 읽은 뒤 온다.
let which = '';
for (const n of ['오후5시', '낮12시', '아침9시']) { try { if ($(n).isExecuted) which = n; } catch (e) { /* 없음 */ } }
const data = backup();
const today = todayKST();
if (which === '낮12시') {
  // 내일 일하는 작업자에게 현장 안내 (사장님 11/5: 전날 낮 12시, 결재 없이). 같은 현장을 이어서 하는 날은 안 보낸다 (Share.workerNotices)
  sd.workerSent = sd.workerSent || {};
  Object.keys(sd.workerSent).forEach((k) => { if (now - sd.workerSent[k] > 14 * 864e5) delete sd.workerSent[k]; });
  const sent = [], noPhone = [], thin = {};
  for (const w of Share.workerNotices(data.sites, data.settings, today)) {
    const k = w.siteId + '|' + w.date + '|' + w.name;
    if (sd.workerSent[k]) continue;
    if (!w.phone) { noPhone.push(w.name + ' · ' + w.title); continue; }
    sd.workerSent[k] = now;
    out.sms.push({ phone: e164(w.phone), text: w.text });
    out.watch.push({ phone: w.phone, name: w.name, siteId: w.siteId, siteName: w.title, fill: false, keys: [] });
    out.fills.push({ siteId: w.siteId, kind: 'log', room: '작업자 안내', title: w.name + '님께 내일 현장 안내 문자', detail: w.title });
    sent.push(w.name + ' · ' + w.title);
    if (w.missing.length) thin[w.title] = w.missing;
  }
  if (sent.length || noPhone.length) {
    const lines = ['📨 <b>내일 작업자 안내 문자</b>'].concat(sent.map((x) => '✅ ' + esc(x)), noPhone.map((x) => '❗ 연락처 없어 못 보냄: ' + esc(x)),
      Object.keys(thin).map((t) => '❓ ' + esc(t) + ' — 빈 칸: ' + esc(thin[t].join(' · '))));
    out.notify.push({ html: true, text: lines.join('\n') });
  }
  return finish();
}
if (which === '아침9시') {
  // 오늘 날짜 보고서의 결재 — [진행해] 필름은 고른 담당자에게 주문 문자, 인원 모집은 여러 날 모집 시작, [내가할께]는 앱 할 일로
  const box = sd.reports[today];
  if (!box) return finish();
  const log = sd.log[today] = sd.log[today] || [];
  for (const it of box.rep.next) {
    const d = (box.decisions || {})[it.id];
    if (!d || d.doneAt) continue;
    const site = data.sites.find((s) => s.id === it.siteId);
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
        out.notify.push({ html: true, text: '❗ <b>인원 모집 못 함</b> · ' + esc(Share.titleLine(site)) + '\n예산 안에 드는 팀원이 없거나 자리가 다 찼습니다 — 밴드에서 구해 주세요' });
        out.fills.push({ siteId: site.id, kind: 'log', room: '결재함', title: '인원 모집 못 함', detail: '예산 안에 드는 팀원이 없거나 자리가 다 참', state: 'need' });
      } else {
        out.crew.push({ action: 'start', siteId: site.id, siteName: Share.titleLine(site), queue: m.queue,
          days: m.days.map((x) => ({ date: x.iso, label: x.label, slots: x.slots, budget: x.budget ? x.left : 0, band: Share.buildRecruitText(site) })) });
        out.fills.push({ siteId: site.id, kind: 'log', room: '결재함', title: '인원 모집 시작', detail: m.days.map((x) => x.label + ' ' + x.slots + '자리').join(', ') });
        log.push({ kind: 'crew', title: Share.titleLine(site) + ' 인원 모집 시작', res: m.days.map((x) => x.label + ' ' + x.slots + '자리').join(', ') });
      }
      d.doneAt = now;
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
  return finish();
}
// 오후 5시 (또는 make) — 내일 업무일정표. make { base: 'YYYY-MM-DD' } 면 그날 결과 + 다음 날 예정 (샘플 '어제 결과·오늘 할 일', 11/3)
let req = {};
try { req = $('보고서요청').first().json.body || {}; } catch (e) { req = {}; }
const base = /^\d{4}-\d{2}-\d{2}$/.test(req.base || '') ? req.base : today;
const rep = Share.dailyReport(data.sites, data.settings, data.tasks, base);
rep.done = rep.done.concat(sd.log[base] || []).filter((x, i, a) => a.findIndex((y) => y.title === x.title && y.res === x.res) === i);
// [완료표시] 한 일은 빼고, 오늘 보고서에서 [내가할께] 했는데 아직 남은 일은 '어제 내가할께 — 아직 안 됨' (사장님 11/3)
const prev = (sd.reports[base] || {}).decisions || {};
rep.next = rep.next.filter((n) => !sd.marks[n.id]).map((n) => ((prev[n.id] || {}).act === 'mine' ? Object.assign({}, n, { again: true }) : n));
const old = sd.reports[rep.date];
sd.reports[rep.date] = { rep, decisions: (old && old.decisions) || {}, at: now };
keepRecent();
const text = Share.dailyReportKakao(rep, APP_URL + '#approve/' + rep.date);
sd.outbox.push({ id: 'r' + now.toString(36), t: now, text });
out.resp = { ok: true, date: rep.date, done: rep.done.length, next: rep.next.length };
return finish();
