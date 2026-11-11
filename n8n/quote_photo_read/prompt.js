// 견적사진_읽기 › 프롬프트 (2026-11-11 사장님: 업자가 카톡으로 보낸 사진 20장 → 견적). 앱 방문견적 › 📷 사진으로 견적 이 보낸다 (사장님 열쇠)
// 받는 것: { items: [{ id, 구역, 이름 }] (지금 방문견적 품목), photos: [{ mime, data(base64) }] (몇 장씩 나눠서), start: 이 묶음 첫 사진 번호 }
// 사진에는 업자가 위치·필름번호·메모를 글씨로 적어 보낸다 (예 '현관 방화문 px451 화이트스톤 / 도어락 교체 예정, 그외 기구들 재사용').
const b = $input.first().json.body || {};
const items = (Array.isArray(b.items) ? b.items : []).slice(0, 400);
const photos = (Array.isArray(b.photos) ? b.photos : []).filter((p) => p && typeof p.data === 'string' && p.data.length > 100).slice(0, 12);
if (!items.length || !photos.length) throw new Error('items 와 photos 가 필요합니다');
const 목록 = items.map((it) => '- ' + String(it.id).slice(0, 40) + ' : ' + String(it.구역 || '').slice(0, 20) + ' ' + String(it.이름 || '').slice(0, 60)).join('\n');
const 글 = [
  '인테리어 필름 시공 견적을 내려고 업자가 카톡으로 보낸 현장 사진들이다. 사진마다 업자가 위치·필름 번호·메모를 글씨로 적어 둔 경우가 많다.',
  '사진마다 (1) 적힌 글씨를 그대로 읽고 (2) 아래 견적 품목 중 무엇인지 고른다.',
  '',
  '견적 품목 (id : 구역 품목명):',
  목록,
  '',
  '고르는 법:',
  '- 글씨의 위치(현관·거실·주방·안방·작은방·방1·드레스룸·베란다 등)와 물건(방화문·중문·방문·화장실문·샤시·문선·붙박이장·싱크대·몰딩·걸레받이 등)을 먼저 본다. 글씨가 없으면 사진 모습으로 판단한다.',
  '  · 현관 방화문 = 현관문. 안방 = 방1, 작은방은 방2·방3 중 비어 있는 쪽 (모르면 방2). 문+틀·문, 문틀 = 문과 문틀을 같이 하는 품목.',
  '  · 같은 물건을 여러 각도로 찍은 사진은 같은 id 로 둔다.',
  '- 목록에 딱 맞는 품목이 없거나 확실하지 않으면 id 는 null (지어내지 마라).',
  '- qty: 그 품목 수량. 글씨에 "3짝", "2세트", "4m" 처럼 수가 있으면 그 수, 없으면 1.',
  '- film: 필름 번호와 이름 (예 "px451 화이트스톤", "ps170"). 없으면 "".',
  '- memo: 위치·필름을 뺀 나머지 메모 (예 "도어락 교체 예정, 그외 기구들 재사용"). 없으면 "".',
  '- text: 사진에 적힌 글씨 전부를 그대로 (줄바꿈은 공백). 글씨가 없으면 "".',
  '',
  '답은 JSON 하나만: {"photos":[{"n":사진번호,"id":"품목id 또는 null","qty":1,"film":"","memo":"","text":""}]}  — 사진 수만큼, 사진 순서대로.',
].join('\n');
const start = Number(b.start) || 0;
const parts = [{ text: 글 }];
photos.forEach((p, i) => {
  parts.push({ text: '사진' + (start + i) + ':' });
  parts.push({ inline_data: { mime_type: /^image\//.test(p.mime || '') ? p.mime : 'image/jpeg', data: p.data } });
});
return [{ json: {
  ids: items.map((it) => String(it.id)), start, count: photos.length,
  gemini: { contents: [{ role: 'user', parts }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } },
} }];
