# 견적요청 작성하기 · 견적요청 내역 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **실행자: 같은 세션 인라인 실행 (계약 모드).** 파일 맵·인터페이스·테스트 케이스·검증 명령만 적는다. 서브에이전트에 넘길 때는 해당 태스크를 완전 코드 모드로 다시 풀어 쓴다.

**Goal:** 카톡 견적요청(사진·글)을 방문견적에서 일괄로 품목화해 발행하고, 현장관리 앱 거래처 화면에서 요청·발행 내역을 본다.

**Architecture:** 요청 입력 화면은 방문견적(`D:/songil`, quote_pro)에 시트로 붙인다. 글 해석·합치기·단어장은 DOM 없는 순수 모듈(node 테스트)로 떼고, 화면은 기존 사진 저장(QuotePhotos)·저장함(QuoteBox)·발행 경로를 그대로 쓴다. 현장관리 앱(`D:/n8n_거래처별_현장관리`)은 같은 백업키로 `pro-box-restore` 를 읽어 내역만 보여준다.

**Tech Stack:** 바닐라 JS(UMD 모듈 패턴), `node:test`, n8n webhook(Railway), Airtable, Netlify(songil), GitHub Pages(현장관리 앱).

**Spec:** `docs/superpowers/specs/2026-10-17-quote-request-design.md`

## Global Constraints

- 금액 계산은 `quote_calc.js` 만 쓴다. 새 계산식 금지
- 고객 견적서 화면(`quote_view.js`)은 고치지 않는다 — 시공사진은 폰 사진으로 복사해 기존 발행 경로로 싣는다
- 현장관리 앱은 견적요청을 **읽기만** 한다
- 상태는 저장하지 않고 계산: 품목 0 → 답장 전 / 품목 있음·현장코드 없음 → 작성 중 / 현장코드 있음 → 발행
- 저장함 30건 제한·현장ID 덮어쓰기 규칙은 그대로
- 범위 밖: 푸시 알림, 미수주 상태, AI 해석, 정산견적 연동
- 커밋은 저장소별로 로컬에만. push(=배포)는 마지막 태스크에서 사용자 확인 뒤
- 코드 주석·이름은 기존 코드처럼 한글

## 파일 맵

| 저장소 | 파일 | 역할 |
|---|---|---|
| songil | `request_wordbook.js` (새) | 기본 단어장 + 배우기 |
| songil | `request_parse.js` (새) | 카톡 글 → 줄[] (MASTER 기준 체크_ID 까지) |
| songil | `request_merge.js` (새) | 글 줄 + 사진 라벨 → 견적 항목[] |
| songil | `test/request_*.test.js` (새) | 위 세 모듈 테스트 |
| songil | `quote_request.js` (새) | 요청 입력 시트 화면 (탭 3개). quote_pro.js 전역(state, MASTER, PDB, 저장함…)을 쓴다 |
| songil | `quote_request.css` (새) | 시트 스타일 |
| songil | `quote_pro.html` | 스크립트·시트 마크업·[견적요청] 진입 버튼 |
| songil | `quote_pro.js` | `?req=1&client=` 진입, 저장함 항목에 `요청` 칸 보존, CONFIG 주소 추가 |
| 현장관리 | `quote_requests.js` (새) | 순수: `요청내역(박스항목[], 발행[], 거래처ID)` |
| 현장관리 | `test/quote_requests.test.js` (새) | |
| 현장관리 | `app.js`, `index.html`, `style.css` | 거래처 화면 '견적요청 내역' 칸 + 버튼 |
| n8n | `pro-wordbook`(새), `work-photos-by-item`(새), (필요시) `work-photo-proxy`(새), `pro-box-restore`(수정) | |

## 공통 데이터 계약

```
MASTER.zones = [{ 구역: '거실', items: [{ 체크_ID, 품목명, 표시_품목명, 단위, 최대수량, 옵션들?: [{품목명,...}] }] }]
단어장 = { [별칭: string]: 정식: string }      // 정식 = 구역명 | 표시_품목명 | 옵션 품목명 | 숫자 문자열
글줄 = { 원문, 구역: string|null, 체크_ID: string|null, 품목명: string|null, 옵션: number|null, 수량: number, 확인필요: bool, 건너뜀: bool }
사진라벨 = { 사진id, 구역: string|null, 체크_ID: string|null }
항목 = { 키, 구역, 체크_ID, 품목명, 옵션, 수량, 출처: '사진+글'|'글만'|'사진만', 사진ids: [], 확인필요: bool }
저장함항목.요청 = { 접수일시: ISO, 원문: string, 거래처ID: string, 거래처명: string }
```

---

### Task 0: 사전 확인 (코드 없음, 결과를 이 문서 끝 '확인 결과'에 적는다)

- [ ] n8n-mcp 로 `pro-box-restore` 워크플로를 열어 `published` 각 줄에 `현장관리_거래처ID` 가 실리는지 확인
- [ ] 필름현장관리자 작업목록 테이블 이름·필드(`시공품목`, `시공후사진`, `시공전사진`, 현장 링크, 날짜) 확인 — `film-quality-get-v2` 워크플로에서
- [ ] Airtable 첨부 URL 을 songil 도메인에서 `fetch()` → blob 이 되는지(CORS) 브라우저 콘솔로 확인. 안 되면 Task 5 에 proxy 포함
- [ ] 실제 pro-master 캐시(`localStorage.quote_pro_master_v1`)에서 구역명·샤시 옵션 품목명 목록을 뽑아 `test/fixtures/master_sample.json` 로 저장 (테스트 기대값 원천 — tdd-extras 규칙)

### Task 1: 단어장 모듈

**Files:** Create `request_wordbook.js`, `test/request_wordbook.test.js`

**Interfaces:**
- Produces: `RequestWordbook.기본()` → 단어장 / `RequestWordbook.합치기(기본, 사용자)` → 단어장(사용자 우선) / `RequestWordbook.배우기(단어장, 별칭, 정식)` → 새 단어장(원본 불변, 별칭 trim·공백 제거, 빈 값·별칭==정식이면 그대로)

**테스트 케이스:** 기본에 하나→1·둘→2·셋→3·한→1·이중창→2중창·이중→2중창·안방→(fixture 의 안방 대응 구역)·작은방→방2 / 합치기 사용자 우선 / 배우기 불변성·공백 정규화·무시 조건

- [ ] 실패 테스트 → `node --test test/request_wordbook.test.js` FAIL → 구현 → PASS → commit

### Task 2: 글 해석 모듈

**Files:** Create `request_parse.js`, `test/request_parse.test.js`

**Interfaces:**
- Consumes: 단어장(Task 1 형식), MASTER.zones
- Produces: `RequestParse.해석(글: string, 사전: { zones, 단어장 }) → 글줄[]`

**규칙:** 줄바꿈으로 나눔 → 단어장 치환(긴 별칭 먼저) → '이랑/하고/랑/,/및' 로 품목 나눔(구역은 앞 것 이어받음) → 구역명 찾기 → 그 구역 items 에서 표시_품목명/품목명 포함 매칭(구역 없으면 전 구역에서 품목명 유일하면 그 구역, 여럿이면 구역 null·확인필요) → 옵션 단어면 옵션 index → 숫자(아라비아/치환된 수사) 없으면 1, 최대수량으로 자름 → 품목·구역 다 없으면 건너뜀

**테스트 케이스 (fixture 기반):** "안방 분합창 1" / "거실 샤시 2 이중창" → 옵션=2중창 index / "냉장고장 하나요" → 수량1, 구역 유일하면 채움 아니면 확인필요 / "현관문이랑 신발장도요" → 2줄, 둘 다 현관 / "실장님 견적 부탁드려요" → 건너뜀 / "거실 뭐시기 3" → 확인필요 / 빈 줄 무시 / 단어장 사용자 항목이 매칭을 바꿈

- [ ] 실패 테스트 → FAIL → 구현 → PASS → commit

### Task 3: 합치기 모듈

**Files:** Create `request_merge.js`, `test/request_merge.test.js`

**Interfaces:**
- Consumes: 글줄[] (Task 2), 사진라벨[]
- Produces: `RequestMerge.합치기(글줄[], 사진라벨[]) → { 항목: 항목[], 미지정사진: 사진id[] }` / `RequestMerge.경고(결과) → string[]` (확인필요 항목·미지정 사진 문구)

**테스트 케이스:** 같은 체크_ID 글+사진 → 1항목 '사진+글', 수량=글 / 글 같은 체크_ID 두 줄 → 수량 합 / 글만 → 사진ids [] / 사진만 → 수량1 '사진만' / 라벨 없는 사진 → 미지정 / 건너뜀 줄 제외 / 확인필요 줄은 항목에 남되 확인필요 true / 순서: 글 순서 → 사진만 항목

- [ ] 실패 테스트 → FAIL → 구현 → PASS → commit

### Task 4: n8n `pro-wordbook`

**Interfaces:** `GET ?key=` → `{ 단어장: {} }` (키 틀리면 401) / `POST { key, 단어장 }` → `{ ok: true }`. 키 검증은 `pro-box-restore` 와 같은 방식. 저장은 n8n Data Table(키 1행)

- [ ] 워크플로 작성 → `n8n-deploy` 스킬로 배포 → curl 로 put/get/401 확인

### Task 5: n8n `work-photos-by-item` (+ proxy)

**Interfaces:** `GET ?item=<품목명>&limit=30` → `{ 사진: [{ url, 현장명, 날짜, 전후: '전'|'후', id }] }` 최근 순, 1x1 placeholder 제외. (Task 0 에서 CORS 막히면) `GET work-photo-proxy?id=` → 이미지 바이트

- [ ] 워크플로 작성 → 배포 → curl 로 '샤시'·'분합창'·없는 품목 확인

### Task 6: 요청 입력 시트 — 진입 + ② 글 탭

**Files:** Create `quote_request.js`, `quote_request.css`; Modify `quote_pro.html`, `quote_pro.js`(CONFIG 에 `wordbookUrl`, `workPhotosUrl`; boot 뒤 `?req=1&client=` 이면 업체 고르고 `요청시트열기()`)

**Interfaces:**
- Consumes: Task 1·2, 전역 `MASTER`, `state`, `업체현장들`, `업체키()`
- Produces: `요청시트열기()`, `요청상태 = { 원문, 글줄[], 사진라벨[] }`(localStorage `quote_req_draft_v1` 에 자동 저장), `단어장받기()/단어장올리기()`

**동작:** 새 현장 상태로 시작(현장명 입력칸) → 붙여넣기 → 해석 → 줄 목록(빨간 줄=확인필요, 회색=건너뜀) → 줄 누르면 구역·품목(종류)·수량 고르는 작은 창 → 고친 원문 토막을 `배우기` 후 서버로

- [ ] 브라우저 확인: 목업 ② 예문 5줄이 목업대로 나오는지, 빨간 줄 고친 뒤 새로고침해도 단어장이 남는지 → commit

### Task 7: ① 사진 일괄 지정

**Files:** Modify `quote_request.js`, `quote_request.css`

**Interfaces:**
- Consumes: `QuotePhotos`(사진 추가는 quote_pro 의 `사진추가(file)` 재사용), `PDB.필드저장(id, {구역, 태그})`
- Produces: `요청상태.사진라벨[]` — 사진 레코드의 구역·태그에서 매번 다시 계산(따로 저장 안 함)

**동작:** 여러 장 추가 → 격자 다중 선택 → 구역 칩 + 품목 칩(MASTER 그 구역 items, 🔍 검색) → 적용: 고른 사진마다 구역 설정 + 태그=[체크_ID]. 라벨 표시, 미지정 빨강

- [ ] 브라우저 확인: 7장 중 2장 일괄 지정 → 기존 사진 트레이에서 그 품목 사진으로 보이는지 → commit

### Task 8: ③ 견적 항목 + 시공사진 고르기 + 방문견적으로

**Files:** Modify `quote_request.js`, `quote_request.css`, `quote_pro.js`(`저장함에담기` 가 `state.요청` 을 항목.요청 으로 옮김)

**Interfaces:**
- Consumes: Task 3 `합치기/경고`, Task 5 webhook
- Produces: `요청적용(항목[])` — `state.선택[체크_ID] = { 수량, 난이도: 1, 옵션 }`, `state.요청 = {접수일시, 원문, 거래처ID, 거래처명}` → `buildAll(); refresh(); persist();` 후 시트 닫기

**동작:** 항목 카드(출처 배지). 글만 → [시공사진에서 고르기] 시트(품목명으로 webhook, 격자 전/후 배지, 다중 선택) → 고른 것 blob 받아 `사진추가` 경로로 폰 사진 생성 + 구역·태그 지정. [방문견적으로] 누를 때 `경고()` 있으면 confirm

- [ ] 브라우저 확인: 목업 ③ 시나리오 → 계산 화면에 분합창1·샤시2(2중창)·현관문·신발장 체크, 사진 탭 장수 맞음 → 발행 → `/q/` 견적서에 시공사진이 품목 아래 보임 → 저장함 항목에 `요청` 있음 → commit

### Task 9: n8n `pro-box-restore` 거래처ID

- [ ] Task 0 결과 실려 오면 건너뜀. 아니면 `published` 매핑에 `현장관리_거래처ID` 추가 → 배포 → curl 확인

### Task 10: 현장관리 앱 '견적요청 내역'

**Files:** Create `D:/n8n_거래처별_현장관리/quote_requests.js`, `test/quote_requests.test.js`; Modify `index.html`, `app.js`(거래처 화면 메모 내역 아래), `style.css`, `sw.js` 캐시 버전

**Interfaces:**
- Produces: `QuoteRequests.요청내역(박스항목[], 발행[], 거래처ID) → [{ 상태: '답장 전'|'작성 중'|'발행', 이름, 요약, 날짜, 금액?, 견적코드? }]` 최근 순, 같은 견적코드는 발행 한 줄로 / `QuoteRequests.답장전수(목록)`
- Consumes: `Store` 백업키, `GET pro-box-restore?key=`

**테스트 케이스:** 상태 3가지 계산 / 다른 거래처 제외 / 저장함에도 있고 발행목록에도 있는 같은 코드 → 1줄 / 발행만 남은 것(저장함서 지움) → 발행 줄 / 정렬

**동작:** 접힌 칸 제목에 답장 전 배지 → 펼치면 서버 읽기(실패 시 '다시' 줄) → 발행 줄 누르면 `/q/<코드>` / [견적요청 작성하기] → `https://songil.netlify.app/quote_pro.html?req=1&client=<id>`

- [ ] `node --test test/quote_requests.test.js` PASS → 브라우저 확인 → commit

### Task 11: 끝맺음

- [ ] songil `node --test test/*.test.js` 전체 PASS (Windows 에서 `test/` 폴더 형태는 실패), 현장관리도 같은 방식
- [ ] 폰 폭(375px)에서 시트 3탭·내역 칸 확인
- [ ] **사용자 확인 뒤** 두 저장소 push(배포). 배포 후 실제 폰에서 한 건 끝까지

## 확인 결과 (Task 0 에서 채움)

- `pro-box-restore`(워크플로 `현장견적_저장함_백업` Sd4yefwVM3JcFwxq, 노드 `복원 합치기`): published 에 `현장관리_거래처ID` **없음** → Task 9 필요. 발행 워크플로(`현장견적_발행` fJEsn9CAylqGwt66)는 Airtable tblD4My1lpMjK1p6w 에 `현장관리_거래처ID` 를 이미 저장함
- 작업목록: base `appV2Qy61YVhyRkZV` 표 `tblj2GWegEvPHICsb`, 필드 `현장명`·`시공품목`·`시공후사진`·`시공전사진`. 181노드 메인 워크플로는 건드리지 않고 Task 5 는 새 워크플로로
- `pro-master` 는 사장님 열쇠(헤더) 필요 → fixture 는 마지막 성공 실행(33158) 응답에서 추출: `test/fixtures/master_sample.json`
- CORS 확인은 Task 5 에서 실제 첨부 URL 로
- **품목 단위 문제:** 샤시1/샤시2·신발장1/2·냉장고장·수납장·붙박이장은 단위가 `m`. 카톡의 "샤시 2" 는 개수(창 2개)라 수량으로 바로 못 넣는다. 샤시1·샤시2 는 "창 1·창 2" 슬롯
- 마스터에 **분합창 없음** → 단어장 기본값에 넣지 않고 빨간 줄 → 사용자가 고르면 학습
- 안방 → `방1`(화장대·드레스룸·화장실이 방1 에만 있음)
