/* [Updated: 2026-05-29 18:10 KST] Start -------------------------------------- */
/* 수정사항:
   1. [오류해결] AI가 'index(순번)'를 빼먹고 줄 경우 무조건 실패처리되던 문제 해결.
      -> 순번이 없으면 자동으로 1번부터 순차적으로 부여하도록 개선. (견적 누락 방지)
   2. [기존유지] 가맹점 코드, item 키 추가 등 기존 로직 100% 유지.
   3. [버그수정] 텍스트 폴백 시 "문짝", "문틀" 인식 누락 해결 및 단위를 '개'로 고정.
   4. [옵션유도-NEW] 사진만 올렸을 때 AI가 싱크대/샤시 길이를 제멋대로 추측하는 것 차단.
   5. [다중수량-NEW] "2m 3개", "수량: 3개" 등 길이와 수량이 함께 있을 때 곱해서 계산하도록 개선.
   6. [품목추가-NEW] "갈바" 키워드를 "상가샤시(한쪽시공)"으로 자동 인식하도록 추가.
   7. [샤시개선-NEW] 2중창(이중창) 분류 및 3m 2세트 세부 표시 유지 대응.
*/

const items = $input.all();

// ============================================================
// 1. 공통 설정 및 ID, 파트너코드 확보
// ============================================================
const VALID_ITEMS = [
    "시스템샤시", "상가샤시", "샤시", "샷시", "창호",
    "수납장", "신발장", "붙박이장", "장농", "냉장고장", "키친핏", "화장대", "싱크대", "상부장", "하부장",
    "신발장틀", "신발장문짝", "붙박이장틀", "붙박이장문짝", "수납장틀", "수납장문짝", "냉장고장틀", "냉장고장문짝", "중문틀", "중문문짝",
    "현관문", "화장실문", "터닝도어", "중문", "방문", "문짝", "문틀", "방화문",
    "도배", "마루", "몰딩", "걸레받이", "등박스", "우물천장", "가벽", "알판", "파티션", "웨인스코팅", "아트월", "아치", "갈바"
];

// 평형별 패키지 품목 정규화 함수
function normalizePyeongItem(text) {
    if (!text) return null;
    const clean = text.toString().replace(/\s+/g, "");
    const match = clean.match(/(\d+)평/);
    if (!match) return null;
    const p = parseInt(match[1]);
    
    const getClosestPyeong = (py) => {
        if (py < 25) return 20;
        if (py < 35) return 30;
        if (py < 45) return 40;
        return 50;
    };
    const pyeong = getClosestPyeong(p);
    
    if (clean.includes("크라운몰딩") || clean.includes("갈매기몰딩")) {
        return { item: `${pyeong}평 크라운몰딩`, count: 1, displayLabel: "1세트" };
    }
    if (clean.includes("몰딩")) {
        return { item: `${pyeong}평 몰딩`, count: 1, displayLabel: "1세트" };
    }
    if (clean.includes("걸레받이") || clean.includes("걸래받이")) {
        return { item: `${pyeong}평 걸레받이`, count: 1, displayLabel: "1세트" };
    }
    if (clean.includes("싱크대상부장") || clean.includes("씽크대상부장")) {
        return { item: `${pyeong}평 싱크대 상부장`, count: 1, displayLabel: "1세트" };
    }
    if (clean.includes("싱크대하부장") || clean.includes("씽크대하부장")) {
        return { item: `${pyeong}평 싱크대 하부장`, count: 1, displayLabel: "1세트" };
    }
    if (clean.includes("싱크대전체") || clean.includes("씽크대전체") || clean.includes("싱크대") || clean.includes("씽크대")) {
        return { item: `${pyeong}평 싱크대 전체`, count: 1, displayLabel: "1세트" };
    }
    return null;
}

// 가맹점 코드 확보 (Webhook 데이터 감지)
let partnerCode = null;
try {
    const webhookNode = $node["받은_견적요청1"] || $node["받은_견적요청"];
    if (webhookNode && webhookNode.json) {
        partnerCode = webhookNode.json.partner_code || webhookNode.json.body?.partner_code;
    }
} catch(e) {}
// URL 파라미터나 이전 노드에서 왔을 경우 대비
if (!partnerCode) {
    try { partnerCode = items[0].json.partner_code; } catch(e) {}
}

let globalChatID = "ID_MISSING";
try {
    if (items[0]?.json?.채팅_ID) globalChatID = items[0].json.채팅_ID;
    else {
        const webhookNode = $node["받은_견적요청1"] || $node["받은_견적요청"];
        if (webhookNode && webhookNode.json) {
            globalChatID = webhookNode.json.채팅_ID || webhookNode.json.body?.채팅_ID;
        }
    }
} catch(e) {}

if (globalChatID === "ID_MISSING") {
    try { if ($('채팅ID_생성').first()) globalChatID = $('채팅ID_생성').first().json.채팅_ID; } catch(e) {}
}
if (globalChatID === "ID_MISSING") {
    try { if ($('Airtable_견적요청_저장노드').first()) globalChatID = $('Airtable_견적요청_저장노드').first().json.채팅_ID; } catch(e) {}
}
if (globalChatID === "ID_MISSING") {
    const randomNum = Math.floor(Math.random() * 10000);
    globalChatID = `AUTO_${randomNum}`; 
}

let runIndex = 0;
try {
    if (typeof $runIndex !== 'undefined') {
        runIndex = $runIndex;
    }
} catch (e) { runIndex = 0; }

// ⭐ 중복 제거를 위한 맵 (Key: 배지번호)
let uniqueItemsMap = new Map();
let isImageMode = false;
let autoBadgeCounter = 1; // [NEW] 자동 번호 부여를 위한 카운터

// ============================================================
// 2. [섹션 A] 이미지 견적 분석 로직
// ============================================================

// [중요] 우선순위 점수 계산
function getItemScore(name) {
    // 3점: 특수 창호, 중문, 현관문 fail-safe
    if (name.includes("시스템") || name.includes("상가") || name.includes("중문") || name.includes("현관") || name.includes("방화")) return 3; 
    
    // 2점: 가구류 및 터닝도어
    if (name.includes("싱크대") || name.includes("붙박이") || name.includes("수납") || name.includes("터닝")) return 2; 
    
    // 1점: 일반적인 기본 항목
    if (name.includes("샤시") || name.includes("창호") || name.includes("방문")) return 1; 
    
    return 0;
}

function addConfirmedItem(json) {
    if (!json || typeof json !== 'object') return;
    
    let mapName = "방문";
    if (json.item) mapName = json.item;
    else if (json.품목명) mapName = json.품목명;
    
    // 품목명 정규화
    let cleanName = (mapName || "").toString().trim();
    
    // 평형별 패키지 품목 정규화 적용
    const pyeongNorm = normalizePyeongItem(cleanName);
    if (pyeongNorm) {
        mapName = pyeongNorm.item;
        json.count = pyeongNorm.count;
        json.displayLabel = pyeongNorm.displayLabel;
        json.표시수량 = pyeongNorm.displayLabel;
    }
    
    if (cleanName === "도어" || cleanName.includes("방문/")) {
        mapName = "방문";
    }

    const cat = json.category || "";
    const reason = ((json.reason || "") + " " + (json.raw_text || "")).toLowerCase();
    
    // 품목명이 명시되지 않은 경우 추론
    if (!json.item && !json.품목명) {
        if (cat === "GLASS_TYPE" || reason.includes("window") || reason.includes("glass")) {
            mapName = "샤시(단창)";
            if (reason.includes("system")) mapName = "시스템샤시";
            else if (reason.includes("middle")) mapName = "중문";
            else if (reason.includes("commercial")) mapName = "상가샤시(한쪽시공)";
        } 
        else if (cat === "SOLID_TYPE" || reason.includes("door") || reason.includes("furniture")) {
            mapName = "수납장";
            if (reason.includes("fire")) mapName = "방화문";
            else if (reason.includes("entrance")) mapName = "현관문";
            else if (reason.includes("room")) mapName = "방문";
            else if (reason.includes("sink")) mapName = "싱크대";
        }
    }

    let finalRatio = 1.0;
    if (json.ratio !== undefined) finalRatio = parseFloat(json.ratio);
    else if (json.난이도 !== undefined) finalRatio = parseFloat(json.난이도);
    
    // ⭐ [수정] 배지 번호가 없으면 자동 부여! (버리지 않음)
    let foundBadge = json.index || json.badge || json.순번;
    if (foundBadge === undefined || foundBadge === null || foundBadge === "") {
        foundBadge = autoBadgeCounter++;
    }
    
    const badgeKey = foundBadge.toString();

    // ⭐ [핵심 보정] 수량 강제 보정 로직 (One Badge = One Door Rule)
    let safeCount = json.count || json.수량 || 1;
    if (typeof safeCount === 'string') safeCount = parseFloat(safeCount);

    const singleDoorKeywords = ["중문", "터닝", "현관", "방문", "화장실", "방화"];
    if (singleDoorKeywords.some(k => mapName.includes(k))) {
        safeCount = 1; 
    }

    // ⭐ [옵션유도-NEW] 사진 인식 시, 싱크대와 샤시는 무조건 1세트/기본명칭으로 강제 초기화
    // (AI가 제멋대로 3m 등으로 상상하는 것을 차단하여 에어테이블의 📌 안내 문구가 나오게 유도)
    const optionKeywords = ["싱크대", "샤시", "창호", "샷시"];
    if (optionKeywords.some(k => mapName.includes(k))) {
        safeCount = 1;
        json.displayLabel = "1세트";
        json.표시수량 = "1세트";
        if (mapName.includes("싱크대")) mapName = "싱크대";
        if (mapName.includes("샤시") || mapName.includes("창호") || mapName.includes("샷시")) mapName = "샤시(단창)";
    }

    // ⭐ [핵심 우선순위 경쟁 로직]
    let existing = uniqueItemsMap.get(badgeKey);
    let shouldUpdate = !existing;

    if (existing) {
        const oldScore = getItemScore(existing.item);
        const newScore = getItemScore(mapName);
        
        // [예외 1] 방문 vs 터닝도어 -> 방문 승리 (기존 방식 유지)
        if (existing.item.includes("방문") && mapName.includes("터닝")) { shouldUpdate = false; } 
        else if (existing.item.includes("터닝") && mapName.includes("방문")) { shouldUpdate = true; }
        
        // [예외 2 - NEW] 중문(3점) vs 터닝도어(2점) -> 점수 무시하고 터닝도어 승리 (터닝도어 오인식 방어)
        else if (existing.item.includes("중문") && mapName.includes("터닝")) { shouldUpdate = true; }
        else if (existing.item.includes("터닝") && mapName.includes("중문")) { shouldUpdate = false; }
        
        // [일반 규칙] 점수 비교 (그 외에는 점수 높은 것이 승리)
        else if (newScore > oldScore) { shouldUpdate = true; }
        else if (newScore === oldScore) {
             if (!existing.item.includes("시스템") && mapName.includes("시스템")) shouldUpdate = true;
        }
    }

    if (shouldUpdate) {
        uniqueItemsMap.set(badgeKey, {
            item: mapName,
            count: safeCount, 
            ratio: finalRatio, 
            badge: foundBadge, 
            displayLabel: json.displayLabel || json.표시수량 || "1세트"
        });
    }
}

for (let i = 0; i < items.length; i++) {
    let itemNode = items[i];
    let json = itemNode.json;

    // AI 응답 텍스트 추출
    let aiText = json.output?.[0]?.content?.[0]?.text || json.message?.content || json.text || "";

    try {
        const candidates = [aiText, json.output, json.text];
        
        for (let val of candidates) {
            if (typeof val === 'string' && (val.includes('[') || val.includes('{'))) {
                // 1. Array 파싱
                const arrayMatch = val.match(/\[\s*\{[\s\S]*?\}\s*\]/); 
                if (arrayMatch) {
                    try {
                        const parsed = JSON.parse(arrayMatch[0]);
                        if (Array.isArray(parsed)) {
                            parsed.forEach(p => addConfirmedItem(p));
                            isImageMode = true;
                        }
                    } catch(e) {}
                }

                // 2. Object 파싱
                const objectMatches = val.matchAll(/\{[^{}]*\"index\"[^{}]*\}/g); 
                for (const match of objectMatches) {
                    try {
                        const parsedObj = JSON.parse(match[0]);
                        addConfirmedItem(parsedObj);
                        isImageMode = true;
                    } catch(e) {}
                }
            }
        }
    } catch(e) {}

    // JSON 본문 처리
    if (!isImageMode && (json.item || json.품목명 || json.index)) {
        addConfirmedItem(json);
        isImageMode = true;
    }
}

let confirmedItems = isImageMode ? Array.from(uniqueItemsMap.values()) : [];

// ============================================================
// 3. [섹션 B] 텍스트 견적 분석 로직
// ============================================================
if (!isImageMode) {
    let userInputText = "";
    try {
        const webhookNode = $node["받은_견적요청1"] || $node["받은_견적요청"];
        userInputText = webhookNode.json.body?.user_request || webhookNode.json.body?.message || webhookNode.json.user_request || "";
    } catch (e) {
        if (items[0]?.json?.user_request) userInputText = items[0].json.user_request;
    }

    let rawText = "";
    try {
        const json = items[0]?.json;
        if (json?.output && json.output[0]?.content?.[0]?.text) rawText = json.output[0].content[0].text; 
        else if (json?.content && json.content[0]?.text) rawText = json.content[0].text;
        else if (json?.message?.content) rawText = json.message.content;
        else if (json?.text) rawText = json.text;
        else if (json?.output && typeof json.output === 'string') rawText = json.output;
        if (!rawText && userInputText) rawText = userInputText;
    } catch (e) { rawText = userInputText; }

    let extractedItems = [];
    try {
        let cleanText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        if (cleanText.startsWith('{') && cleanText.endsWith('}')) cleanText = `[${cleanText}]`;
        const jsonMatch = cleanText.match(/\[[\s\S]*\]/); 
        if (jsonMatch) extractedItems = JSON.parse(jsonMatch[0]);
        else if (cleanText.startsWith('[')) extractedItems = JSON.parse(cleanText);
    } catch (e) { extractedItems = []; }

    if (!Array.isArray(extractedItems)) extractedItems = [extractedItems];
    
    if (extractedItems.length > 0 && (extractedItems[0].item || extractedItems[0].품목명)) {
        for (let it of extractedItems) {
            let name = (it.item || it.품목명 || "").trim();
            if (name === "도어") name = "방문"; 
            
            // 평형별 패키지 품목 정규화 적용
            const pyeongNorm = normalizePyeongItem(name);
            if (pyeongNorm) {
                confirmedItems.push({
                    item: pyeongNorm.item,
                    count: pyeongNorm.count,
                    displayLabel: pyeongNorm.displayLabel,
                    ratio: it.ratio || 1.0
                });
            } else {
                let display = it.displayLabel || it.표시수량 || ""; 
                if (VALID_ITEMS.some(v => name.includes(v) || v.includes(name))) {
                    confirmedItems.push({
                        item: name,
                        count: it.count || it.수량 || 1,
                        displayLabel: display,
                        ratio: it.ratio || 1.0
                    });
                }
            }
        }
    }

    if (confirmedItems.length === 0) {
        const pyeongMatch = (userInputText || rawText).match(/(\d+)평/);
        const hasSpecificItems = VALID_ITEMS.some(v => (userInputText || rawText).includes(v));
        if (pyeongMatch && !hasSpecificItems) {
            const p = parseInt(pyeongMatch[1]);
            let roomDoor = 3, bathDoor = 2, frontDoor = 1, sash = 10;
            if (p < 25) { roomDoor = 3; bathDoor = 1; sash = 24; }
            else if (p < 35) { roomDoor = 3; bathDoor = 2; sash = 30; }
            else if (p < 45) { roomDoor = 4; bathDoor = 2; sash = 36; }
            else { roomDoor = 5; bathDoor = 3; sash = 42; }
            
            const getClosestPyeong = (py) => {
                if (py < 25) return 20;
                if (py < 35) return 30;
                if (py < 45) return 40;
                return 50;
            };
            const packageP = getClosestPyeong(p);
            
            confirmedItems.push({ item: "방문", count: roomDoor, displayLabel: `${roomDoor}세트` });
            confirmedItems.push({ item: "화장실문", count: bathDoor, displayLabel: `${bathDoor}세트` });
            confirmedItems.push({ item: "현관문", count: frontDoor, displayLabel: `${frontDoor}세트` });
            confirmedItems.push({ item: "샤시(단창)", count: sash, displayLabel: `${sash/3}세트` });
            confirmedItems.push({ item: `${packageP}평 몰딩`, count: 1, displayLabel: "1세트" });
            confirmedItems.push({ item: `${packageP}평 걸레받이`, count: 1, displayLabel: "1세트" });
            confirmedItems.push({ item: `${packageP}평 싱크대 전체`, count: 1, displayLabel: "1세트" });
            
            if (p >= 25) {
                confirmedItems.push({ item: "신발장", count: 2, displayLabel: `1세트` });
                confirmedItems.push({ item: "붙박이장", count: 2, displayLabel: `1세트` });
            }
        } else {
            let normalizedText = (userInputText || rawText) || "";
            // 문+틀, 문/틀, 문짝+문틀, 문짝/문틀의 +나 /가 구분자로 작동하여 split되는 것 방지
            normalizedText = normalizedText.replace(/문짝\s*[\+\/]\s*문틀/gi, "문짝문틀");
            normalizedText = normalizedText.replace(/문\s*[\+\/]\s*틀/gi, "문틀");
            
            const segments = normalizedText.split(/,|\n|\+|\//);
            for (let segment of segments) {
                let targetText = segment.trim();
                
                // 평형별 패키지 품목 정규화 우선 감지
                const pyeongNorm = normalizePyeongItem(targetText);
                if (pyeongNorm) {
                    confirmedItems.push({
                        item: pyeongNorm.item,
                        count: pyeongNorm.count,
                        displayLabel: pyeongNorm.displayLabel,
                        ratio: 1.0
                    });
                    continue;
                }
                
                let itemName = ""; 
                if (targetText.includes("시스템")) itemName = "시스템샤시";
                else if (targetText.includes("상가") || targetText.includes("갈바") || targetText.includes("전면") || targetText.includes("통유리")) {
                    if (targetText.includes("양쪽") || targetText.includes("양면") || targetText.includes("양쪽면") || targetText.includes("양쪽시공")) {
                        itemName = "상가샤시(양쪽시공)";
                    } else {
                        itemName = "상가샤시(한쪽시공)";
                    }
                }
                else if (targetText.includes("2중창") || targetText.includes("이중창")) itemName = "샤시(2중창)";
                else if (targetText.includes("2중창") || targetText.includes("이중창")) itemName = "샤시(2중창)";
                else if (targetText.includes("2중창") || targetText.includes("이중창")) itemName = "샤시(2중창)";
                else if (targetText.includes("샤시(단창)")) itemName = "샤시(단창)";
                else if (targetText.includes("샤시") || targetText.includes("샷시") || targetText.includes("창호")) itemName = "샤시(단창)";
                else if (targetText.includes("상부장")) itemName = "싱크대 상부장";
                else if (targetText.includes("하부장")) itemName = "싱크대 하부장";
                
                // 가구 상세 부품 (틀, 문짝) 우선 감지
                else if (targetText.includes("신발장틀") || targetText.includes("신발장 문틀") || targetText.includes("문틀수납장")) itemName = "신발장틀";
                else if (targetText.includes("신발장문짝") || targetText.includes("신발장 문짝") || targetText.includes("문짝수납장")) itemName = "신발장문짝";
                else if (targetText.includes("붙박이장틀") || targetText.includes("붙박이장 문틀")) itemName = "붙박이장틀";
                else if (targetText.includes("붙박이장문짝") || targetText.includes("붙박이장 문짝")) itemName = "붙박이장문짝";
                else if (targetText.includes("수납장틀") || targetText.includes("수납장 문틀")) itemName = "수납장틀";
                else if (targetText.includes("수납장문짝") || targetText.includes("수납장 문짝")) itemName = "수납장문짝";
                else if (targetText.includes("냉장고장틀") || targetText.includes("냉장고장 문틀")) itemName = "냉장고장틀";
                else if (targetText.includes("냉장고장문짝") || targetText.includes("냉장고장 문짝")) itemName = "냉장고장문짝";
                else if (targetText.includes("중문틀") || targetText.includes("중문 문틀")) itemName = "중문틀";
                else if (targetText.includes("중문문짝") || targetText.includes("중문 문짝") || targetText.includes("중문짝")) itemName = "중문문짝";
                
                // 가구 전체시공 및 일반 품목 감지
                else if (targetText.includes("수납장")) itemName = "수납장";
                else if (targetText.includes("신발장")) itemName = "신발장";
                else if (targetText.includes("붙박이")) itemName = "붙박이장"; 
                else if (targetText.includes("냉장고")) itemName = "냉장고장";
                else if (targetText.includes("싱크대")) itemName = "싱크대";
                else if (targetText.includes("현관문")) itemName = "현관문";
                else if (targetText.includes("화장실문")) itemName = "화장실문";
                else if (targetText.includes("터닝")) itemName = "터닝도어";
                else if (targetText.includes("중문")) itemName = "중문";
                else if (targetText.includes("방문")) itemName = "방문";
                else if (targetText.includes("아치")) itemName = "아치";
                else if (targetText.includes("문짝")) itemName = "문짝"; 
                else if (targetText.includes("문틀")) itemName = "문틀"; 
                else if (targetText.includes("방화문")) itemName = "방화문";
                else if (targetText.includes("가벽")) itemName = "가벽";
                else if (targetText.includes("알판") || targetText.includes("웨인스코팅")) itemName = "알판";
                else if (targetText.includes("중간알판") || targetText.includes("허리알판")) itemName = "중간알판";
                else if (targetText.includes("아트월")) itemName = "아트월";
                else if (targetText.includes("등박스") || targetText.includes("우물천장")) itemName = "등박스";
                else if (targetText.includes("몰딩")) itemName = "몰딩";
                else if (targetText.includes("걸레받이")) itemName = "걸레받이";
                
                if (itemName) {
                    let itemCount = 1;
                    let displayLabel = "";
                    
                    // ⭐ [다중수량-NEW] 길이(m)와 개수(개,틀 등) 동시 추출 로직
                    // "2중창" 같은 텍스트의 '2'를 무시하기 위해 제거 후 추출
                    let cleanForMatch = targetText.replace(/2중창/g, "");
                    
                    let mValue = 0;
                    let qtyValue = 0;
                    
                    // 길이 매칭 (예: 2m, 5.5미터 등)
                    const mMatch = cleanForMatch.match(/(\d+(\.\d+)?)\s*(m|미터)/i);
                    if (mMatch) mValue = parseFloat(mMatch[1]);
                    
                    // 개수 매칭 (예: 3개, 2틀, 수량:3 등)
                    const qtyMatch = cleanForMatch.match(/(수량\s*:\s*|)(\d+(\.\d+)?)\s*(개|틀|조|세트|짝|벌)/);
                    if (qtyMatch) qtyValue = parseFloat(qtyMatch[2]);
                    
                    // 둘 다 매칭되었을 경우 곱하기! (예: 2m x 3개 = 6m)
                    if (mValue > 0 && qtyValue > 0) {
                        itemCount = mValue * qtyValue;
                        displayLabel = `${mValue}m ${qtyValue}세트`;
                    } 
                    // 하나만 매칭되었을 경우
                    else if (mValue > 0) {
                        itemCount = mValue;
                    }
                    else if (qtyValue > 0) {
                        itemCount = qtyValue;
                    }
                    // 둘 다 매칭 안된 경우 단순히 첫번째 숫자 사용
                    else {
                        const numMatch = cleanForMatch.match(/(\d+(\.\d+)?)/);
                        if (numMatch) itemCount = parseFloat(numMatch[0]);
                    }
                    
                    let originalCount = itemCount;
                    
                    if (itemName === "아치") {
                        let width = originalCount;
                        if (width <= 1.5) {
                            itemCount = 5;
                            displayLabel = "너비 1m";
                        } else if (width <= 3.5) {
                            itemCount = 7;
                            displayLabel = "너비 2~3m";
                        } else {
                            itemCount = 9;
                            displayLabel = "너비 4~5m";
                        }
                    } else {
                        const hasMeterUnit = targetText.toLowerCase().includes("m") || targetText.includes("미터");
                        const hasPyeongUnit = targetText.includes("평"); 
                        if(hasPyeongUnit && itemName.includes("싱크대")) {
                            if (originalCount < 30) { itemCount = 5; displayLabel = `${originalCount}평형`; }
                            else if (originalCount < 40) { itemCount = 9; displayLabel = `${originalCount}평형`; }
                            else { itemCount = 11; displayLabel = `${originalCount}평형`; }
                        }
                        else if (!hasMeterUnit && !mValue) {
                            if (["샤시", "샷시", "창호", "시스템샤시", "상가샤시"].some(k => itemName.includes(k))) {
                                itemCount = originalCount * 3; displayLabel = `${originalCount}세트`;
                            } else if (["붙박이장", "수납장", "냉장고장", "신발장"].some(k => itemName.includes(k))) {
                                itemCount = originalCount * 2; displayLabel = `${originalCount}세트`;
                            } else if (["방문", "화장실문", "현관문", "중문", "터닝도어", "방화문"].some(k => itemName.includes(k))) {
                                itemCount = originalCount; displayLabel = `${originalCount}세트`;
                            } else if (["문짝", "문틀"].some(k => itemName.includes(k))) { 
                                itemCount = originalCount; displayLabel = `${originalCount}개`; 
                            } else {
                                itemCount = originalCount; displayLabel = `${originalCount}m`;
                            }
                        } else {
                            // m 단위이거나 곱셈결과일 경우
                            if (!displayLabel) {
                                displayLabel = `${originalCount}m`;
                            }
                        }
                    }
                    confirmedItems.push({ "item": itemName, "count": itemCount, "displayLabel": displayLabel, "ratio": 1.0 });
                }
            }
        }
    }
}

// ============================================================
// 4. 최종 정렬 및 반환
// ============================================================
if (confirmedItems.length === 0) {
    return [{ json: { "채팅_ID": globalChatID, "error_type": "UNKNOWN_ITEM", "message": "견적 제공이 되지 않는 항목입니다." } }];
}

confirmedItems.sort((a, b) => {
    let aNum = parseInt(a.badge || 999);
    let bNum = parseInt(b.badge || 999);
    return aNum - bNum;
});

return confirmedItems.map((data, index) => {
    let finalItem = (data.item || data.품목명 || "방문").trim();
    
    // [수정] 상가샤시/전면/통유리 케이스가 먼저 걸러지도록 최우선 배치
    if (finalItem.includes("전면") || finalItem.includes("통유리") || finalItem.includes("상가")) {
        if (finalItem.includes("양쪽") || finalItem.includes("양면") || finalItem.includes("양쪽면") || finalItem.includes("양쪽시공")) {
            finalItem = "상가샤시(양쪽시공)";
        } else {
            finalItem = "상가샤시(한쪽시공)";
        }
    }
    else if (finalItem.includes("시스템") && finalItem.includes("샤시")) finalItem = "시스템샤시";
    else if (finalItem.includes("2중창") || finalItem.includes("이중창")) finalItem = "샤시(2중창)";
    else if (finalItem.includes("샤시") || finalItem.includes("창호")) finalItem = "샤시(단창)";

    const badgeNum = (data.badge) ? data.badge.toString() : (runIndex + index + 1).toString();
    const finalCount = (data.count !== undefined) ? parseFloat(data.count) : 1;
    const finalRatio = (data.ratio !== undefined) ? parseFloat(data.ratio) : 1.0;
    
    let finalDisplay = data.displayLabel || data.표시수량;
    let unit = "개";
    if (!finalDisplay) {
        const meterItems = ["수납장", "붙박이장", "냉장고장", "신발장", "싱크대", "몰딩", "샤시", "가벽", "알판", "등박스", "걸레받이", "아트월"];
        const setItems = ["방문", "화장실문", "현관문", "중문", "터닝도어", "방화문", "아치"];
        if (meterItems.some(k => finalItem.includes(k))) unit = "m";
        else if (setItems.some(k => finalItem.includes(k))) unit = "세트";
        else if (["문짝", "문틀"].some(k => finalItem.includes(k))) unit = "개"; 
        finalDisplay = `${finalCount}${unit}`;
    } else {
        if (finalDisplay.includes("평")) unit = "평";
        else if (finalDisplay.includes("세트")) unit = "세트";
        else if (finalDisplay.includes("개")) unit = "개"; 
        else if (finalDisplay.includes("m")) unit = "m";
    }

    return {
        json: {
            "채팅_ID": globalChatID,
            "partner_code": partnerCode, 
            "품목명": finalItem, 
            "item": finalItem, 
            "수량": finalCount, 
            "시공_난이도계수": finalRatio,
            "견적단위": unit, 
            "상세_품목명": finalItem, 
            "상세_수량": finalCount, 
            "표시수량": finalDisplay,
            "배지_내용": badgeNum, 
            "DEBUG_Badge": badgeNum
        }
    };
});
/* [Updated: 2026-05-29 18:10 KST] End ---------------------------------------- */
