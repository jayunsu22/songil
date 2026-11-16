// 기사앱_필름번호 › 정리: GET worker-films?code=<현장업무 id> (기사 앱이 부른다 — 기사 앱 주소처럼 현장업무 id 를 아는 사람만, 열쇠 없음).
// 현장관리 앱 백업(현장 표 data 의 adminId) 에서 그 현장 필름 줄(위치·번호만), 정산견적 표에서 그 현장의 가장 최근 발행 견적서의
// 품목별 자재 이름을 준다. 짝짓기는 기사 앱 worker/item_film.js 가 한다 (사장님 11/16). 비번 같은 다른 칸은 돌려주지 않는다
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const q = $('필름요청').first().json.query || {};
const code = s(q.code, 40);
if (!/^rec[A-Za-z0-9]{14}$/.test(code)) return [{ json: { ok: false, films: [], quote: [] } }];
const films = [];
for (const it of $('현장읽기').all()) for (const r of (it.json.records || [])) {
  let d = {};
  try { d = JSON.parse((r.fields || {}).data || '{}'); } catch (e) { continue; }
  if (!d || d.adminId !== code || d.hide || !Array.isArray(d.films)) continue;
  d.films.forEach((f) => { if (f && s(f.code, 30)) films.push({ place: s(f.place, 60), code: s(f.code, 30) }); });
}
// 그 현장 견적서 중 가장 최근 것 (링크 칸 현장 = [현장업무 id])
let best = null;
for (const it of $('견적읽기').all()) for (const r of (it.json.records || [])) {
  const f = r.fields || {};
  if (!(Array.isArray(f.현장) && f.현장.includes(code))) continue;
  if (!best || s(f.발행일시, 40) > s(best.발행일시, 40)) best = f;
}
let quote = [];
if (best) {
  try {
    const snap = JSON.parse(best.스냅샷 || '{}');
    quote = [].concat(snap.시공품목 || [], snap.품목 || []).filter((l) => l && l.품목명 && l.자재명)
      .map((l) => ({ 품목명: s(l.품목명, 60), 자재명: s(l.자재명, 40) })).slice(0, 200);
  } catch (e) { quote = []; }
}
return [{ json: { ok: true, films: films.slice(0, 60), quote } }];
