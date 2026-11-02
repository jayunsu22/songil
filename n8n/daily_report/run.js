// 업무일정표 › 실행: 저녁 7시(보고서 만들기) · 오전 9시(결재한 일 하기) · 시험용 make 요청. Airtable 백업을 읽은 뒤 온다.
let which = '';
for (const n of ['저녁7시', '아침9시']) { try { if ($(n).isExecuted) which = n; } catch (e) { /* 없음 */ } }
const data = backup();
const today = todayKST();
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
      if (!text) { out.notify.push({ html: true, text: '❗ <b>필름 주문 못 보냄</b> · ' + esc(it.title) + '\n적힌 필름 번호가 없습니다' }); continue; }
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
      } else {
        out.crew.push({ action: 'start', siteId: site.id, siteName: Share.titleLine(site), queue: m.queue,
          days: m.days.map((x) => ({ date: x.iso, label: x.label, slots: x.slots, budget: x.budget ? x.left : 0, band: Share.buildRecruitText(site) })) });
        log.push({ kind: 'crew', title: Share.titleLine(site) + ' 인원 모집 시작', res: m.days.map((x) => x.label + ' ' + x.slots + '자리').join(', ') });
      }
      d.doneAt = now;
    }
  }
  return finish();
}
// 저녁 7시 (또는 make) — 내일 업무일정표
const rep = Share.dailyReport(data.sites, data.settings, data.tasks, today);
rep.done = rep.done.concat(sd.log[today] || []).filter((x, i, a) => a.findIndex((y) => y.title === x.title && y.res === x.res) === i);
// [완료표시] 한 일은 빼고, 오늘 보고서에서 [내가할께] 했는데 아직 남은 일은 '어제 내가할께 — 아직 안 됨' (사장님 11/3)
const prev = (sd.reports[today] || {}).decisions || {};
rep.next = rep.next.filter((n) => !sd.marks[n.id]).map((n) => ((prev[n.id] || {}).act === 'mine' ? Object.assign({}, n, { again: true }) : n));
const old = sd.reports[rep.date];
sd.reports[rep.date] = { rep, decisions: (old && old.decisions) || {}, at: now };
keepRecent();
const text = Share.dailyReportKakao(rep, APP_URL + '#approve/' + rep.date);
sd.outbox.push({ id: 'r' + now.toString(36), t: now, text });
out.resp = { ok: true, date: rep.date, done: rep.done.length, next: rep.next.length };
return finish();
