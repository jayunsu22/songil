// n8n 견적초안_읽기 › 결과정리 (Code, runOnceForAllItems) — 2026-10-29
// Gemini 답에서 JSON 을 꺼내고, 1분견적(견적모드_V1 › 품목명_정규화_검증1)과 같은 정규화를 한다:
//   동의어 → 시공_품목명, 샤시는 원문 조각으로 종류·길이를 다시 계산 (2중창 숫자 혼동·'3m 2세트' 곱하기).
// 앱이 받는 모양: { ok, items: [{품목명, 수량, 표시수량, 구역, 근거}], 공통: {거주, 위치, 다른공정, 날짜, 필름, 평형} }
const pre = $('프롬프트').first().json;
const r = $input.first().json || {};
let text = '';
try { text = r.candidates[0].content.parts.map(p => p.text || '').join(''); } catch (e) { text = ''; }
let out = {};
try { out = JSON.parse(String(text).replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (e) { out = {}; }
if (Array.isArray(out)) out = { items: out };

// --- 1분견적 품목명_정규화_검증1 와 같은 정규화 ---
let synonymRows = [];
try { synonymRows = $('동의어_조회').all(); } catch (e) {}
const synonymMap = {};
const canonicalNames = new Set();
for (const row of synonymRows) {
  const fields = (row.json && (row.json.fields || row.json)) || {};
  const canonical = (fields['시공_품목명'] || '').toString().trim();
  if (!canonical) continue;
  canonicalNames.add(canonical);
  const synText = (fields['동의어'] || '').toString();
  if (synText) synText.split(',').map(s => s.trim()).filter(Boolean).forEach(alt => { synonymMap[alt] = canonical; });
}
function normalizeItemName(name) {
  if (!name) return name;
  const trimmed = name.toString().trim();
  if (canonicalNames.has(trimmed)) return trimmed;
  if (synonymMap[trimmed]) return synonymMap[trimmed];
  for (const alt of Object.keys(synonymMap)) {
    if (alt && trimmed.includes(alt)) return synonymMap[alt];
  }
  return trimmed;
}
const SASHI_FAMILY = ['샤시(단창)', '샤시(2중창)', '시스템샤시', '상가샤시(한쪽시공)', '상가샤시(양쪽시공)'];
const userInputText = pre.user_request || '';
const rawSegments = userInputText ? userInputText.split(/,|\n|\+|\//).map(s => s.trim()).filter(Boolean) : [];
const usedSegmentIdx = new Set();
const SASHI_KEYWORDS = ['샤시', '샷시', '창호', '시스템', '상가', '갈바', '전면', '통유리'];
function claimSashiSegment() {
  for (let i = 0; i < rawSegments.length; i++) {
    if (usedSegmentIdx.has(i)) continue;
    if (SASHI_KEYWORDS.some(k => rawSegments[i].includes(k))) { usedSegmentIdx.add(i); return rawSegments[i]; }
  }
  return null;
}
function recalcSashiFromSegment(segmentText) {
  let itemName = '';
  if (segmentText.includes('시스템')) itemName = '시스템샤시';
  else if (segmentText.includes('상가') || segmentText.includes('갈바') || segmentText.includes('전면') || segmentText.includes('통유리')) {
    itemName = (segmentText.includes('양쪽') || segmentText.includes('양면') || segmentText.includes('양쪽시공')) ? '상가샤시(양쪽시공)' : '상가샤시(한쪽시공)';
  }
  else if (segmentText.includes('2중창') || segmentText.includes('이중창')) itemName = '샤시(2중창)';
  else if (segmentText.includes('샤시') || segmentText.includes('샷시') || segmentText.includes('창호')) itemName = '샤시(단창)';
  else return null;
  const cleanForMatch = segmentText.replace(/2중창/g, '').replace(/이중창/g, '');
  let mValue = 0, qtyValue = 0;
  const mMatch = cleanForMatch.match(/(\d+(\.\d+)?)\s*(m|미터)/i);
  if (mMatch) mValue = parseFloat(mMatch[1]);
  const qtyMatch = cleanForMatch.match(/(\d+(\.\d+)?)\s*(개|틀|조|세트|짝|벌)/);
  if (qtyMatch) qtyValue = parseFloat(qtyMatch[1]);
  let count, displayLabel;
  if (mValue > 0 && qtyValue > 0) { count = mValue * qtyValue; displayLabel = `${mValue}m ${qtyValue}세트`; }
  else if (mValue > 0) { count = mValue; displayLabel = `${mValue}m`; }
  else if (qtyValue > 0) { count = qtyValue * 3; displayLabel = `${qtyValue}세트`; }
  else {
    const numMatch = cleanForMatch.match(/(\d+(\.\d+)?)/);
    const num = numMatch ? parseFloat(numMatch[0]) : 1;
    count = num * 3; displayLabel = `${num}세트`;
  }
  return { item: itemName, count, displayLabel };
}

// --- 값 거르기 ---
const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const 구역들 = ['거실', '주방', '현관', '방1', '방2', '방3', '방4', '방5'];
const items = (Array.isArray(out.items) ? out.items : []).map(it => {
  if (!it || typeof it !== 'object') return null;
  let 품목명 = normalizeItemName(s(it.품목명 || it.item, 40));
  if (!품목명) return null;
  let 수량 = Number(it.수량);
  let 표시수량 = s(it.표시수량, 20);
  if (SASHI_FAMILY.includes(품목명)) {
    const seg = claimSashiSegment();
    const re = seg ? recalcSashiFromSegment(seg) : null;
    if (re) { 품목명 = re.item; 수량 = re.count; 표시수량 = re.displayLabel; }
  }
  if (!(수량 > 0)) 수량 = 1;
  return { 품목명, 수량, 표시수량, 구역: 구역들.includes(s(it.구역, 10)) ? s(it.구역, 10) : '', 근거: s(it.근거, 60) };
}).filter(Boolean).slice(0, 60);

const g = (out.공통 && typeof out.공통 === 'object') ? out.공통 : {};
const 공통 = {
  // AI 가 '살고있음' 처럼 붙여 써도 받는다
  거주: { 살고있음: '살고 있음', 빈집: '빈집' }[s(g.거주, 10).replace(/\s+/g, '')] || '',
  위치: s(g.위치, 120), 다른공정: s(g.다른공정, 200), 날짜: s(g.날짜, 60), 필름: s(g.필름, 120), 평형: s(g.평형, 20),
};
return [{ json: { ok: !!text, items, 공통 } }];
