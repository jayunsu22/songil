// 카톡_버튼 › 주문받기: 현장관리 앱이 필름 줄마다 필요량을 다 고르면 POST film-order (사장님 열쇠, 2026-11-01 사장님).
// { siteId, name, text(주문 문자), people: [{label, phone}] } 를 이 흐름의 저장 공간(staticData)에 7일 두고,
// 텔레그램에 담당자 버튼을 띄운다 (카톡_알림 으로). 버튼 'k|번호|o0' 을 누르면 버튼정리가 사장님 폰(SMS Gateway)으로 문자를 보낸다.
// 담당자 번호는 글에 보여 준다 (사장님 11/1: 누구에게 가는지 보고 고르게). 버튼 콜백에는 번호 대신 순번만.
const b = $input.first().json.body || {};
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const siteId = s(b.siteId, 40), name = s(b.name, 80), text = s(b.text, 600);
if (!siteId || !text) throw new Error('siteId·text 가 비어 있음');
const people = (Array.isArray(b.people) ? b.people : []).map((p) => ({ label: s(p && p.label, 24), phone: s(p && p.phone, 20).replace(/[^0-9+]/g, '') }))
  .filter((p) => p.label && p.phone.length >= 9).slice(0, 3);
const sd = $getWorkflowStaticData('global');
const now = Date.now();
sd.orders = Object.fromEntries(Object.entries(sd.orders || {}).filter(([, o]) => now - o.at < 7 * 864e5));
let id = '';
while (!id || sd.orders[id]) id = (Math.random().toString(36).slice(2) + '000000').slice(0, 6);
sd.orders[id] = { siteId, name, text, people, at: now };
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const lines = ['🎞 <b>필름 주문 · ' + esc(name || siteId) + '</b>', '── 보낼 문자 ──', esc(text), ''];
const dash = (p) => p.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
if (people.length) lines.push('── 주문처 · 담당자 ──', ...people.map((p) => '💬 ' + esc(p.label) + ' ' + dash(p.phone)), '');
lines.push(people.length ? '누구에게 보낼까요? 누르면 사장님 폰에서 바로 문자가 갑니다.'
  : '❓ 현장관리 설정 › 필름 주문처에 담당자 번호가 없습니다.');
return [{ json: { text: lines.join('\n'), html: true, buttons: [people.map((p, i) => ({ text: '💬 ' + p.label, data: 'k|' + id + '|o' + i }))] } }];
