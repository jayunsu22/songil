// 카톡_받은글 › 정리: 카톡 읽기 프로그램(kakao_reader)이 보낸 multipart 를 정리한다.
// body.payload = JSON 글, binary photo0.. = 사진. 사진은 그대로 다음 노드로 넘긴다.
const out = [];
for (const item of $input.all()) {
  const body = item.json.body || {};
  let p = body.payload;
  if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { p = null; } }
  if (!p || !Array.isArray(p.messages)) throw new Error('payload 없음 — kakao_reader 가 보낸 요청이 아님');
  const photoKeys = Object.keys(item.binary || {}).sort();
  out.push({
    json: {
      room: p.room,
      reader: p.reader,
      sentAt: p.sentAt,
      count: p.messages.length,
      messages: p.messages,
      photoFiles: p.photoFiles || [],
      photoKeys,
      photos: photoKeys.length,
    },
    binary: item.binary,
  });
}
return out;
