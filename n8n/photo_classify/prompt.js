// 견적사진_판단 › 프롬프트: 카톡으로 받은 사진이 견적의 어느 품목인지 Gemini 에게 묻는 요청을 만든다.
// 받는 것: { items: [{ id, 이름 }], photos: [{ name, mime, data(base64) }] }
// 모르면 null - 억지로 고르면 엉뚱한 품목에 붙는다 (그때 프로그램이 첫 품목에 붙인다).
const b = $input.first().json.body || {};
const items = Array.isArray(b.items) ? b.items : [];
const photos = Array.isArray(b.photos) ? b.photos : [];
if (!items.length || !photos.length) throw new Error('items 와 photos 가 필요합니다');

const 목록 = items.map((it) => '- ' + it.id + ' : ' + it.이름).join('\n');
const 글 = [
  '인테리어 필름 시공 견적 문의로 받은 사진들이다. 각 사진이 아래 품목 중 무엇을 찍은 것인지 고른다.',
  '',
  '품목 (id : 구역 품목명):',
  목록,
  '',
  '구분 요령:',
  '- 현관문: 집 밖으로 나가는 철제 문. 도어락·번호키·도어스코프가 있고 보통 두껍고 어둡다.',
  '- 방문·화장실문: 집 안의 나무/필름 문. 손잡이(레버)가 있고 문틀이 나무다. 화장실문은 안쪽에 타일·변기·세면대가 보이기도 한다.',
  '- 샤시: 유리창·베란다 창·창틀. 거실 큰 창이면 거실 샤시.',
  '- 싱크대·붙박이장·몰딩·아트월은 그 가구/벽이 주인공인 사진.',
  '- 같은 품목명이 여러 개면(방1 방문, 방2 방문) 아무거나 같은 이름 중 하나를 골라도 된다.',
  '- 확실하지 않으면 null.',
  '',
  '답은 JSON 하나만: {"사진0": "품목id 또는 null", "사진1": ...}',
].join('\n');

const parts = [{ text: 글 }];
photos.forEach((p, i) => {
  parts.push({ text: '사진' + i + ':' });
  parts.push({ inline_data: { mime_type: p.mime || 'image/jpeg', data: p.data } });
});
return [{ json: {
  ids: items.map((it) => it.id),
  count: photos.length,
  gemini: { contents: [{ role: 'user', parts }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } },
} }];
