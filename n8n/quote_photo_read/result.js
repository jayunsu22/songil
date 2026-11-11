// 견적사진_읽기 › 결과정리: Gemini 답 → { ok, photos: [{ n, id|null, qty, film, memo, text }] } (보낸 사진 순서대로, 빠진 사진도 칸은 있다)
// 목록에 없는 id 는 null — 모델이 지어낸 id 로 품목이 생기면 안 된다.
const 앞 = $('프롬프트').first().json;
const r = $input.first().json || {};
let 답 = {};
try {
  const t = (((r.candidates || [])[0] || {}).content || {}).parts || [];
  답 = JSON.parse(String(t.map((x) => x.text || '').join('')).replace(/^```(?:json)?\s*|\s*```$/g, '') || '{}');
} catch (e) { 답 = {}; }
const ok = new Set(앞.ids);
const s = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const got = (Array.isArray(답.photos) ? 답.photos : Array.isArray(답) ? 답 : []);
const photos = [];
for (let i = 0; i < 앞.count; i++) {
  const n = 앞.start + i;
  const x = got.find((g) => g && Number(g.n) === n) || got[i] || {};
  const q = Number(x.qty);
  photos.push({ n, id: typeof x.id === 'string' && ok.has(x.id) ? x.id : null, qty: Number.isFinite(q) && q > 0 ? Math.min(q, 99) : 1,
    film: s(x.film, 60), memo: s(x.memo, 200), text: s(x.text, 300) });
}
return [{ json: { ok: !!got.length, photos, error: r.error ? String(r.error.message || r.error) : '' } }];
