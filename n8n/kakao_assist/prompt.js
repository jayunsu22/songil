// 카톡_비서 › 프롬프트: 노트북이 POST kakao-assist (사장님 열쇠) — 업체 방 새 글을 AI 가 읽고 판단 (사장님 11/4 '능동 비서').
// 물어보지 않았어도 비번·화장실·필름·잔금 얘기를 알아보고 어느 현장인지 맞추고, 사장님 말투로 답장을 쓴다.
// body: { room, client, today, messages: [{d, t, who, text}] (업체 새 글), recent: [...] (그 방 최근 글, 사장님 글 포함 — 말투·흐름), mine: ['김정헌'] }
// 설계 docs/superpowers/specs/2026-11-04-능동비서-design.md
const body = $('비서요청').first().json.body || {};
const str = (v) => String(v == null ? '' : v).trim();
const clip = (v, n) => str(v).slice(0, n);
const norm = (v) => str(v).replace(/\s+/g, '').toLowerCase();
const seoul = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today || '') ? body.today : seoul;
const dayN = (d) => Math.round((Date.parse(d + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 864e5);
const clients = {};
for (const it of $('거래처읽기').all()) for (const r of (it.json.records || [])) {
  const f = r.fields || {};
  if (f.id) clients[f.id] = str(f['이름']);
}
// 사장님 지시 (11/4): 사장님이 김정헌방에 '류춘화 미래타운 현장 세대비번 2222 변경됐다' 처럼 직접 쓴 글 (통화로 들은 것 등).
// 업체 방이 아니라 거래처를 모르니, 글에 이름이 나온 거래처의 현장만 (없으면 모든 업체) 본다. 답장은 쓰지 않는다.
const boss = body.mode === 'boss';
const said = (Array.isArray(body.messages) ? body.messages : []).map((m) => str(m.text)).join(' ');
const words = said.split(/[\s,.·:]+/).map(norm).filter((w) => w.length >= 3);
const named = (c) => { const n = norm(c); return n.length >= 2 && (norm(said).includes(n) || words.some((w) => n.startsWith(w) || w.startsWith(n))); };
const bossClients = boss ? Object.values(clients).filter(named) : [];
// 후보 현장: 그 업체의 앞 60일·뒤 45일 현장 (업체를 모르면 모든 업체) — 가까운 날짜 순 30곳 (사장님 지시는 60곳)
const want = norm(body.client);
const sites = [];
for (const it of $('현장읽기').all()) for (const r of (it.json.records || [])) {
  let s = {};
  try { s = JSON.parse((r.fields || {}).data || '{}'); } catch (e) { continue; }
  if (!s.id || s.hide) continue;
  const date = str(s.date).slice(0, 10);
  if (!date || dayN(date) < -45 || dayN(date) > 60) continue;
  const client = clients[s.clientId] || clients[(r.fields || {})['거래처id']] || '';
  if (boss && bossClients.length && !bossClients.includes(client)) continue;
  if (!boss && want && !(norm(client) && (norm(client) === want || want.startsWith(norm(client)) || norm(client).startsWith(want)))) continue;
  const squash = (v) => v.replace(/\s+/g, '');
  const extra = [str(s.unit), str(s.size)].filter((v) => v && squash(str(s.name)).indexOf(squash(v)) === -1);
  sites.push({
    id: s.id, client, date, name: [str(s.name)].concat(extra).filter(Boolean).join(' ') || '(이름없음)',
    known: { pwLobby: str(s.pwLobby), pwUnit: str(s.pwUnit), toilet: str(s.toilet),
      films: (Array.isArray(s.films) ? s.films : []).filter((x) => x && str(x.code)).map((x) => (str(x.place) + ' ' + str(x.code)).trim()) },
    payDone: !!s.payDone,
  });
}
sites.sort((a, b) => Math.abs(dayN(a.date)) - Math.abs(dayN(b.date)));
sites.splice(boss ? 60 : 30);
const mine = (Array.isArray(body.mine) && body.mine.length ? body.mine : ['김정헌']).map(norm);
const line = (m) => clip(m.d, 12) + ' ' + clip(m.t, 10) + ' ' + (mine.includes(norm(m.who)) ? '[사장님] ' : '') + clip(m.who, 30) + ': ' + clip(m.text, 500);
const recent = (Array.isArray(body.recent) ? body.recent : []).slice(-40).map(line);
const fresh = (Array.isArray(body.messages) ? body.messages : []).slice(-30).map(line);
const bossPrompt = `너는 인테리어 필름 시공업체 "섬세한손길" 김정헌 실장(사장님)의 비서다. 오늘은 ${today} 이다.
사장님이 자기 카톡 방에 메모를 남겼다. 업체와 통화하거나 직접 들은 현장 정보를 앱에 넣으라는 뜻일 수 있다.
글에 현장 정보(비번·화장실·필름·잔금)가 있으면 어느 현장인지 맞춰서 뽑아라. 견적 문의를 옮겨 붙인 글, 할 일 메모, 잡담이면 아무것도 뽑지 마라.
'바뀌었다'·'변경' 이면 이미 적힌 값과 달라도 새 값으로 뽑는다.

[현장 목록] (id · 거래처 · 현장명 · 시공날짜 · 이미 적힌 값 · 잔금받음)
${sites.map((s) => '- ' + s.id + ' · ' + (s.client || '거래처모름') + ' · ' + s.name + ' · ' + s.date + ' · ' + JSON.stringify(s.known) + ' · ' + (s.payDone ? '잔금받음' : '잔금안받음')).join('\n') || '- (없음)'}

[뽑을 것 — kind]
- "field": field 는 pwLobby(공동현관 비번), pwUnit(세대 현관 비번 — '세대비번'·'현관비번'·'도어락'), toilet(작업자가 쓸 화장실 위치) 중 하나. value 는 적힌 그대로 (* # 포함).
  어느 비번인지 분명하지 않으면 pwUnit. '공동현관'·'공현'·'1층' 이면 pwLobby.
- "films": 위치별 필름 번호 films:[{place:"거실", code:"LX 우드 EW123"}]. 품번 없이 이름만이면 code 에 이름, noCode:true.
- "pay": 그 현장 잔금이 들어왔다는 메모.
그 밖의 것(일정·AS·견적 등)은 뽑지 마라.

[현장 맞추기]
- 거래처 이름·아파트명·동호수로 현장 목록에서 고른다. 한 곳만 맞으면 siteId 에 그 id, sure:true.
- 같은 아파트가 여럿이거나 짐작이면 sure:false, cands 에 후보 id (최대 3). 맞는 게 없으면 siteId "", cands [].

JSON 으로만 답하라 (reply 는 늘 none):
{"items":[{"kind":"field","field":"pwUnit","value":"","films":[],"noCode":false,"siteId":"","sure":true,"cands":[],"quote":"근거 원문 60자 이내"}],
 "reply":{"type":"none","text":""}}

[사장님 메모]
${fresh.join('\n')}`;
const prompt = boss ? bossPrompt : `너는 인테리어 필름 시공업체 "섬세한손길" 김정헌 실장(사장님)의 카톡 비서다. 오늘은 ${today} 이다.
거래처 "${clip(body.client, 40) || '모름'}" 의 카톡 방 "${clip(body.room, 40)}" 에 업체 담당자가 새 글을 보냈다.
사장님이 물어보지 않았어도, 새 글에 현장 정보가 있으면 알아보고 어느 현장 얘기인지 맞춰라. 그리고 사장님 대신 보낼 답장을 써라.

[이 업체의 현장 목록] (id · 현장명 · 시공날짜 · 이미 적힌 값 · 잔금받음)
${sites.map((s) => '- ' + s.id + ' · ' + s.name + ' · ' + s.date + ' · ' + JSON.stringify(s.known) + ' · ' + (s.payDone ? '잔금받음' : '잔금안받음')).join('\n') || '- (없음)'}

[뽑을 것 — kind]
- "field": field 는 pwLobby(공동현관 비번), pwUnit(세대 현관 비번), toilet(작업자가 쓸 화장실 위치) 중 하나. value 는 대화에 적힌 그대로 (* # 포함).
  어느 비번인지 분명하지 않은 비번 변경은 pwUnit. '공동현관'·'공현'·'1층' 이면 pwLobby.
- "films": 위치별 필름 번호 films:[{place:"거실", code:"LX 우드 EW123"}]. 품번이 없이 이름만 오면 code 에 이름을 적고 noCode:true.
- "pay": 업체가 잔금(대금)을 보냈다·넣었다고 한 것. 끝난 현장 중 잔금안받음인 현장.
- "schedule": 시공일·시간 변경, 다른 공정 얘기. value 한 줄 요약.
- "as": AS(하자 보수) 요청. value 한 줄 요약.
- "other": 견적 요청·추가 작업 등 사장님이 알아야 할 업무. value 한 줄 요약.
이미 적힌 값과 같으면 뽑지 마라. 인사·잡담은 뽑지 마라.

[현장 맞추기]
- 대화에 아파트명·동호수·날짜·'내일 현장' 같은 말이 있으면 그것으로 현장 목록에서 고른다.
- 확실하면 siteId 에 그 id, sure:true. 후보가 둘 이상이거나 짐작이면 sure:false 로 하고 cands 에 후보 id 를 가까운 순서로 (최대 3).
- 현장 목록에 맞는 게 없으면 siteId "", cands [].

[답장 — 사장님 말투로]
- [사장님] 이 쓴 예전 글의 말투(존댓말, ~요/~께요, 물결~, 이모지 정도)를 따라 짧게 1~2줄. 지어내지 말고 받은 내용에만 답한다.
- type 은 하나:
  "ack" = 받았다·알겠다·감사 (예 "네~ 비번이랑 화장실 받았어요👍"). 이미 정해진 시공 날짜를 다시 말하는 것까지는 ack.
  "ask" = 일에 꼭 필요한데 빠진 정보를 되묻기 (예 필름 품번이 없을 때 "혹시 품번도 알 수 있을까요? 발주 넣으려구요😊", 어느 현장인지 모를 때).
  "commit" = 시간 약속·일정 변경 수락/거절·금액·견적·할인·추가 작업 수락/거절·사장님만 정할 수 있는 것. 이때도 답 초안을 써라 (사장님이 보고 보냄).
  "none" = 답할 필요 없음 (업체가 '네'·'감사합니다'로 끝냄, 잡담, 사장님이 이미 답함, 우리에게 한 말이 아님).

JSON 으로만 답하라:
{"items":[{"kind":"field","field":"pwLobby","value":"","films":[],"noCode":false,"siteId":"","sure":true,"cands":[],"quote":"근거 원문 60자 이내"}],
 "reply":{"type":"ack","text":""}}

[그 방 최근 대화 — 흐름·말투 참고]
${recent.join('\n') || '(없음)'}

[업체 새 글 — 이것에 대해 판단]
${fresh.join('\n')}`;
return [{ json: { prompt, sites, today, count: fresh.length, boss } }];
