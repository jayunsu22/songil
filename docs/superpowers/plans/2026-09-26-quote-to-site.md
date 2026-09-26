# 견적 저장함 → 현장관리자 품목 체크 보내기 Implementation Plan

> 실행자: **같은 세션이 곧바로 인라인 실행** (writing-plans-extras 경량 모드 — 코드는 파일에 바로 쓴다)

**Goal:** 견적 앱 저장함의 견적을 골라 현장관리자의 기존 현장에 품목 체크(toggle_item_create)를 한 번에 보낸다.

**Architecture:** 짝짓기는 순수 모듈 `quote_to_site.js`(UMD, node 테스트). 화면·호출은 `quote_pro.js`에 저장함 옆 시트 하나로 추가. n8n·admin 수정 없음.

**Tech Stack:** 바닐라 JS, node:test, Netlify 정적 배포.

Spec: `docs/superpowers/specs/2026-09-26-quote-to-site-design.md`

## Global Constraints
- n8n base: `https://primary-production-a6fa.up.railway.app/webhook/`
- 현장 목록 `GET film-admin-get-v2` → `projects[]` (`p.fields || p` 에 현장명·시공일자·보관함)
- 현장 상세 `GET film-quality-get-v2?code=<id>` → `activeItems[]`, `masterItems[]{품목명,구역}`
- 체크 `POST film-quality-save {type:'toggle_item_create', projectCode:<id>, itemName}`
- 체크 해제 요청은 절대 보내지 않는다.
- 체크_ID 형식 `zNN_구역_표시품목명_적용평형` (마스터 전 품목 4조각 확인됨 2026-09-26)

---

### Task 1: 짝짓기 모듈 + 테스트

**Files:** Create `quote_to_site.js`, `test/quote_to_site.test.js`

**Interfaces (Produces, 전역 `QuoteToSite` / module.exports):**
- `견적품목들(상태) → [{구역, 품목명}]` — `상태.선택` 키(체크_ID 파싱) + `상태.직접품목`
- `짝짓기(견적품목, 방수, 현장품목명들) → { 짝: [{구역, 견적품목, 현장품목}], 짝없음: [{구역, 견적품목}] }` — 현장품목 중복 제거, 짝없음도 (구역,품목) 중복 제거
- `현장정렬(현장들, 견적이름) → 현장들` — `{id, 현장명, 시공일자}`; 이름 2글자 조각이 겹치는 수 내림차순, 같으면 시공일자 내림차순. 반환 원소에 `비슷함: boolean`

**Test cases (fixture = 2026-09-26 실측 masterItems 품목명 102개):**
- 방1/방문 → 안방문+틀 · 방2/샤시1 → 방2샤시 · 거실/샤시1 → 거실샤시1 · 주방/샤시2 → 주방샤시
- 방3/붙박이장문짝 → 방3수납장 · 방1드레스룸/붙박이장 → 안방드레스룸수납장 · 방1베란다/샤시1 → 안방베란다샤시
- 거실/화장실문 → 거실화장실문 · 방1/화장실 문짝 → 안방화장실문+틀 · 거실/아치 → 거실아치문틀
- 주방/싱크대 하부장 (30평) → 싱크대 · 주방/냉장고장틀 → 냉장고장 · 세탁실/세탁실문 → 거실세탁실문 · 실외기실/문짝 → 거실실외기실문
- 현관/중문짝 → 현관중문 · 현관/신발장2 → 신발장2 · 거실/가벽 → 가벽 · 주방/가벽 → 짝없음
- 전체공통/몰딩 (30평), 방수 3 → 거실·주방·현관·안방·방2·방3 몰딩 (방4몰딩 없음)
- 전체공통/크라운몰딩 (실측) → 몰딩과 동일 · 전체공통/걸레받이 (40평) → 각 구역 걸레받이
- 방2/몰딩 (30평) (파생) → 방2몰딩
- 방1/웨인스코팅, 주방/알판 → 짝없음 · 같은 현장품목 두 번 → 한 번
- 견적품목들: 체크_ID 파싱 + 직접품목 포함
- 현장정렬: 겹치는 이름 먼저, 나머지 날짜 최신순

Verify: `node --test test/` 전체 통과. Commit.

### Task 2: 저장함 "🏗 현장으로" 시트

**Files:** Modify `quote_pro.html` (스크립트 + `#siteBack/#siteSheet` 마크업), `quote_pro.js` (저장함 줄 버튼·핸들러, 시트 로직), `quote_style.css` (시트 스타일 — `#boxSheet` 규칙 재사용)

**Interfaces (Consumes Task 1):** `QuoteToSite.견적품목들`, `짝짓기`, `현장정렬`

**동작:**
1. 저장함 줄 `.box-site` 버튼 → `현장보내기열기(항목)`: 저장함 닫고 시트 열어 현장 목록 로딩 (보관함 제외, `현장정렬`)
2. 현장 탭 → 상세 조회 → `짝짓기(견적품목들(항목.상태), 항목.상태.방수||3, masterItems 품목명)` → 이미 activeItems 에 있는 것은 회색 "이미 체크됨"
3. 체크될 품목 체크박스(기본 on) · 짝없음 목록 · `[n개 보내기]`
4. 순차 POST, 버튼에 "보내는 중 k/n", 끝나면 결과 문구 + 저장함 항목에 `보낸기록 = {현장ID, 현장명, 일시, 건수}` 저장
5. 저장함 줄 정보에 `→ 현장명 (M/D 보냄)` 표시
6. 조회 실패 → 시트에 오류 + 다시 시도

Verify: 로컬 미리보기 모바일 폭에서 저장함 → 현장 목록 → 미리보기까지 (보내기는 사용자 확인 후). Commit.

### Task 3: 배포
사용자 확인 후 `git push` → Netlify 반영 확인.
