# 현장 정산견적 (품수 기반 사후 견적) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**실행자:** 같은 세션이 곧바로 인라인 실행 (writing-plans-extras "인라인 모드": 파일 맵 + 인터페이스 + 테스트 케이스 + 검증 명령. 코드는 파일에 바로 쓴다).

**Goal:** 관리자 앱 현장 카드에서 시작해, 그 현장의 작업목록을 바탕으로 품수×품단가 + 자재별 소모량×단가 + 부가항목으로 정산 견적을 만들고 `/s/<코드>` 공유 링크로 발행한다.

**Architecture:** 작성/보기/설정 페이지는 songil(netlify) 정적 사이트에 `settle_*` 파일로 추가하고, 계산은 DOM 없는 `settle_calc.js`로 분리해 node 테스트한다. 백엔드는 기존 `현장견적_*`와 같은 소형 n8n 워크플로우 1개(`정산견적_백엔드`, 웹훅 4개)이며 데이터는 블로그자동화 Airtable 베이스에 둔다. 관리자 앱은 버튼 1개만 추가한다.

**Tech Stack:** 순수 HTML/CSS/JS(빌드 없음), node:test, n8n(Airtable 노드 + HTTP Request 배칭), Airtable REST, Netlify `_redirects` + Edge Function.

**Spec:** `docs/superpowers/specs/2026-09-20-settle-quote-design.md`

## Global Constraints

- Airtable 베이스: 블로그자동화 `appV2Qy61YVhyRkZV`. 테이블 ID: 현장목록 `tblJfAIVyaOUdhBio`, 작업목록 `tblj2GWegEvPHICsb`, 시공품목 `tblMtHcdFKtyWOhn3`, 회사정보 `tblLVFq8PQvQfEebJ`.
- n8n Airtable 자격증명: `airtableTokenApi` id `J5wefJCMalpjjm3Q` ("Airtable Personal Access Token account 2"). 모든 Respond 노드에 `Access-Control-Allow-Origin: *`.
- n8n 베이스 URL: `https://primary-production-a6fa.up.railway.app/webhook/`.
- 견적코드: 알파벳 `23456789ABCDEFGHJKMNPQRSTUVWXYZ` 8자 랜덤 (기존 `현장견적_발행`과 동일).
- songil 페이지는 `/s/CODE`로 열리므로 **정적 자원은 절대경로**(`/settle_view.js`)로 참조 (`quote_view.html` 주석 참조).
- 디자인: `quote_style.css`의 토큰(`--bg #f4f5f7`, `--card #fff`, `--line #e3e5e9`, `--accent #2563eb`, `--accent-soft #eff4ff`, `--ok #059669`, `--tap 44px`, `--bar-h 64px`)과 구조(sticky header / 카드 섹션 / 하단 고정 `#totalBar` / `#pubSheet`)를 그대로 따른다.
- PIN 잠금: admin.js의 `ADMIN_PIN_HASH = '7e25b45addda2b4082938558981200dfe5a3cfb20ee4a81092510d26715c2049'` 재사용, localStorage 키 `settleUnlocked`.
- 관리자 앱 push 시 `admin.html`의 `admin.js?v=` 를 `20260920`으로 갱신 (CLAUDE.md 캐시 버스팅 규칙).
- push는 매번 사용자 확인 후. 설계 문서/계획 문서는 로컬 커밋만.

---

## 파일 맵

| 파일 | 책임 |
|---|---|
| `D:\songil\settle_calc.js` | 계산 순수 모듈 (브라우저 전역 `SettleCalc` + CommonJS export) |
| `D:\songil\test\settle_calc.test.js` | node:test 계산 검증 |
| `D:\songil\settle.html` | 작성 화면 마크업 (헤더/①인건비/②자재비/③부가/합계바/발행시트/설정모달/PIN오버레이) |
| `D:\songil\settle.js` | 작성 화면 상태·렌더·저장·발행·설정 |
| `D:\songil\settle_style.css` | 정산 전용 스타일 (`quote_style.css` 위에 얹음) |
| `D:\songil\settle_view.html` / `settle_view.js` / `settle_view.css` | 견적서 보기 (`/s/CODE`) |
| `D:\songil\_redirects` | `/s/*` 규칙 추가 |
| `D:\songil\netlify\edge-functions\partner-og.js` | `/s/` 카톡 카드 제목 |
| n8n 워크플로우 `정산견적_백엔드` (신규) | `settle-master`, `settle-publish`, `settle-quote`, `settle-settings` |
| Airtable `시공품목` 필드 2개, `정산단가표`·`정산견적` 테이블 | 데이터 |
| `H:\n8n_품질관리_블로그자동화\admin.js`, `admin.html` | 카드 버튼 + `?v=` |

---

### Task 1: Airtable 스키마 + 초기 데이터

**Files:** Airtable MCP (`create_field`, `create_table`, `create_records_for_table`)

**Interfaces:**
- Produces:
  - `시공품목.자재소모량` (number, precision 1), `시공품목.길이입력` (checkbox)
  - 테이블 `정산단가표`: `항목명`(primary text), `구분`(singleSelect: 자재단가/품단가/부가항목), `단가`(number 정수), `순서`(number), `사용여부`(checkbox)
  - 테이블 `정산견적`: `견적코드`(primary text), `현장`(link→현장목록), `현장명`(text), `발행일시`(dateTime), `스냅샷`(multilineText), `총액`(number), `부가세_별도표기`(checkbox), `메모`(multilineText)
  - 초기 레코드: 품단가 `기본 품단가`(0, 순서1, 사용) · 자재단가 `기본 필름`(9000, 순서1, 사용) · 부가항목 `부자재비`/`식대`/`퀵비·택배비`(0, 순서 1~3, 사용)

- [ ] 필드 2개 생성 → `list_tables_for_base`로 확인
- [ ] 테이블 2개 생성 (정산견적의 `현장` 링크는 현장목록 `tblJfAIVyaOUdhBio`) → 필드 ID 기록 (다음 태스크의 n8n URL에 필요)
- [ ] 초기 레코드 5건 생성 → `list_records_for_table`로 확인
- [ ] 시공품목 소모량 초기 채움: 98개 품목을 `카테고리2`(걸레받이는 품목명 포함 여부) 기준으로 스펙 4-1 표대로 `update_records_for_table` (10건씩 배치). 매핑 안 된 품목 목록을 사용자에게 보고.

**검증:** `list_records_for_table(시공품목, fields=[품목명,자재소모량,길이입력])` — 값 있는 품목 수 ≥ 85, 없는 품목 목록 출력.

---

### Task 2: n8n 워크플로우 `정산견적_백엔드`

**Files:** n8n MCP `n8n_create_workflow` → `n8n_validate_workflow` → 활성화. 로컬 백업 `D:\songil\docs\superpowers\plans\settle_backend_workflow.json` 아님 — n8n 인스턴스가 원본, 필요 시 `n8n_get_workflow`로 내려받음.

**Interfaces (Produces — 프론트가 의존하는 계약):**

```
GET  settle-master?site=rec…
→ { 현장:{id,현장명,시공일자}, 작업목록:[{id,시공품목,밑작업완료,시공완료}],
    시공품목:[{id,품목명,구역,우선순위,자재소모량,길이입력}],
    단가표:[{id,항목명,구분,단가,순서,사용여부}],
    회사정보:{업체명,대표전화,홈페이지주소} }
   site 형식 오류 → HTTP 200 { error:'현장 코드가 올바르지 않습니다' }

POST settle-publish  { 현장ID, 현장명, 스냅샷(object), 총액, 부가세_별도표기, 메모 }
→ { success:true, 견적코드 }

GET  settle-quote?id=CODE
→ { 견적코드, 현장명, 발행일시, 스냅샷(object), 총액, 부가세_별도표기, 메모,
    회사정보:{업체명,대표전화,홈페이지주소} }   없으면 { error:'not found' }

POST settle-settings { 단가표:{ create:[{항목명,구분,단가,순서,사용여부}], update:[{id,항목명,구분,단가,순서,사용여부}], delete:[id] },
                       품목소모량:[{id,자재소모량,길이입력}] }
→ { success:true }
```

**노드 설계:**
- `settle-master`: Webhook(GET) → Code `1단계 URL 생성` (site 검증, 4개 URL: 현장 레코드 / 시공품목 `fields[]=품목명,구역,우선순위,자재소모량,길이입력` / 정산단가표 / 회사정보) → HTTP Request(배칭 10, airtableTokenApi) → Code `2단계 URL 생성` (현장 레코드의 `작업목록` ID들로 `OR(RECORD_ID()='…')` 필터 URL, ID 없으면 빈 배열 처리) → HTTP Request → Code `응답조립` → Respond. 기존 `1b. GET 현장정보 조회 Webhook V2` 패턴 그대로.
- `settle-publish`: Webhook(POST) → Code `저장준비`(코드 생성, 스냅샷 `JSON.stringify`, 발행일시 서버, `현장:[현장ID]`) → Airtable create(정산견적, autoMap) → Code `응답` → Respond. `현장견적_발행` 복제 수준.
- `settle-quote`: Webhook(GET) → Airtable search(정산견적, `{견적코드}='…'`, limit 1, alwaysOutputData) → Airtable search(회사정보, limit 1, executeOnce) → Code(없으면 `{error}`, 있으면 스냅샷 `JSON.parse`) → Respond.
- `settle-settings`: Webhook(POST) → Code `요청 정리`(create/update/delete/품목 4종으로 아이템 분리, `op` 필드) → Switch(op) → Airtable create / update(matching id) / deleteRecord / update(시공품목, matching id) → 각각 Code `응답` → Respond. (Switch 4갈래 → 하나의 Respond로 모으면 실행 안 된 갈래 문제 없음 — 각 갈래 끝에 Respond를 두면 첫 갈래만 응답하므로, **Code에서 op별로 아이템을 만들고 갈래마다 자기 Respond**를 두지 말고, 갈래 4개를 모두 `Merge(append)` 4-input… 복잡. 단순화: 4갈래 각각 끝을 **같은 Respond 노드**에 연결. n8n은 Respond가 처음 도달했을 때 응답하므로, 요청당 op 종류가 여러 개면 첫 갈래 완료 시 응답되고 나머지는 계속 실행된다 — 응답은 `{success:true}` 뿐이라 문제없음. 단, 갈래가 하나도 실행되지 않는 빈 요청은 Code에서 `{op:'noop'}` 1건을 만들어 Respond로 바로 보낸다.)

- [ ] 워크플로우 JSON 작성 → `n8n_create_workflow` → `n8n_validate_workflow` (errors 0)
- [ ] 활성화 → curl 4종:
  - `curl "…/webhook/settle-master?site=rechKp6aqNAjCenAP"` → 작업목록 22건, 단가표 5건
  - `curl "…/webhook/settle-master?site=abc"` → `{error}`
  - `curl -X POST …/settle-publish -d '{"현장ID":"rechKp6aqNAjCenAP","현장명":"테스트","스냅샷":{"합계":{"총액":1}},"총액":1,"부가세_별도표기":true,"메모":""}'` → 견적코드 8자
  - `curl "…/settle-quote?id=<코드>"` → 스냅샷 object로 복원
  - `curl -X POST …/settle-settings -d '{"단가표":{"create":[{"항목명":"테스트자재","구분":"자재단가","단가":100,"순서":9,"사용여부":true}]}}'` → success, 이어서 delete로 정리
- [ ] 테스트로 만든 정산견적 레코드 삭제

---

### Task 3: `settle_calc.js` + 테스트 (TDD)

**Files:** Create `D:\songil\settle_calc.js`, `D:\songil\test\settle_calc.test.js`

**Interfaces (Produces):**
```js
// 줄: { 품목명, 구역, 체크:boolean, 길이입력:boolean, 마스터소모량:number,
//       수량:number, 길이:number|null, 직접소모량:number|null, 자재ID:string }
// 자재표: { [자재ID]: { 항목명, 단가 } }
SettleCalc.줄소모량(줄)                      // number, 소수 1자리 반올림
SettleCalc.자재별소계(줄들, 자재표)           // [{자재ID, 자재명, 단가, 소모량합, 금액}] (체크된 줄만, 자재표에 없는 자재ID는 제외)
SettleCalc.자재없음줄(줄들, 자재표)           // 체크됐는데 자재표에 없는 줄 배열
SettleCalc.합계({품수, 품단가, 줄들, 부가:[{항목명,금액}]}, 자재표)
//  → { 인건비, 자재비, 부가, 총액, 자재소계:[…] }
```
브라우저에서는 `window.SettleCalc`, node에서는 `module.exports` (quote_calc.js와 같은 이중 export).

**테스트 케이스 (`node --test test/settle_calc.test.js`):**
1. 세트 품목: 마스터 6.5 × 수량 2 → 13.0
2. 길이 품목: 마스터 1 × 길이 3.2 → 3.2 / 길이 null → 0
3. 몰딩: 0.1 × 12.3m → 1.2 (소수 1자리 반올림)
4. 직접소모량 5 가 마스터 계산을 덮는다
5. 체크 해제 줄은 소계에서 빠진다
6. 자재 2종 묶음: A(12000) 6.5+3.2 = 9.7m → 116,400 / B(8000) 2.0m → 16,000
7. 금액 반올림: 0.1×3 = 0.3m × 9000 = 2,700 (부동소수점 0.30000000000000004 방지)
8. 자재표에 없는 자재ID → 소계 제외 + `자재없음줄`에 잡힘
9. 합계: 품수 8 × 250,000 + 자재 132,400 + 부가(식대 40,000 + 0원 줄 무시) = 2,172,400

- [ ] 테스트 작성 → 실행해 `SettleCalc is not defined`류로 실패 확인
- [ ] 구현 → 9개 통과
- [ ] 커밋 `feat: 정산견적 계산 모듈`

---

### Task 4: 작성 화면 `settle.html` / `settle.js` / `settle_style.css`

**Files:** Create 3개. Modify 없음.

**Interfaces:**
- Consumes: Task 2 `settle-master`/`settle-publish`/`settle-settings`, Task 3 `SettleCalc`.
- Produces: 발행 링크 `https://songil.netlify.app/s/<코드>?n=<base64url(현장명)>` (Task 5가 읽음). base64url 인코딩은 `quote_pro.js`의 발행 링크 함수(893행 부근)와 같은 방식.
- localStorage: `settle_state_<현장ID>` = `{ 품수, 품단가ID, 품단가직접, 전체자재ID, 줄들:[…Task3 줄 + {출처:'작업목록'|'추가'}], 부가:[{항목명,금액,출처}], 메모, 부가세별도 }`, `settleUnlocked`.

**settle.js 구조 (함수 단위):**
- `boot()` — PIN 확인 → `?site=` 검증 → `loadMaster()` → 저장 상태 있으면 `mergeSaved()` (마스터의 작업목록에 새 품목이 생겼으면 줄 추가, 사라진 건 유지) → `renderAll()`
- `buildLines(master)` — 작업목록 × 시공품목 마스터로 줄 생성, 구역→우선순위 정렬. 마스터에 없는 시공품목명은 구역 `기타`, 마스터소모량 0
- `renderLabor()`, `renderMaterials()`(구역 제목 + 줄, 자재별 소계), `renderExtras()`, `renderTotal()` — 입력 이벤트마다 `SettleCalc.합계` 재계산 + `save()`
- `openPublish()` → 소모량 0 체크된 줄 N개면 confirm → `publish()` → 링크 표시(복사/공유/열기)
- 설정 모달: `openSettings(tab)` / `renderSettingsTab()` / `saveSettings()` — 변경분만 create/update/delete로 모아 전송, 성공 후 `loadMaster()` 재호출
- `+ 품목 추가`, `+ 직접 추가` 는 prompt 대신 인라인 줄 생성

**마크업 (quote_pro.html 구조 답습):** `<header>` 현장명·시공일자·⚙·새로 시작 / `#status` / `<main>` 섹션 3개(`section.card > h2`) / `<footer id="totalBar">` / `#pubBack #pubSheet` / `#setBack #setSheet`(탭 3개) / `#pinLockOverlay`.

**검증 (브라우저, `preview_start` url `https://songil.netlify.app/settle.html?site=rechKp6aqNAjCenAP` 는 push 전이라 불가 → 로컬: `.claude/launch.json`에 songil 정적 서버 등록 후 `http://localhost:8080/settle.html?site=rechKp6aqNAjCenAP`):**
- 콘솔 에러 0, 작업목록 22줄 모두 체크 상태, 자재 select 기본값 = 단가표 첫 자재
- 품수 8 입력 → 인건비 즉시 갱신, 길이 입력 → 소계 갱신, 체크 해제 → 소계 감소
- 새로고침 후 입력값 유지
- 375px 폭에서 줄 안 깨짐 (스크린샷)
- 발행 → 링크 생성(실 레코드 생김; 검증 후 삭제)

- [ ] 마크업 + 스타일 → 로컬 서버로 렌더 확인
- [ ] settle.js 로직 → 위 검증
- [ ] 커밋 `feat: 정산견적 작성 화면`

---

### Task 5: 견적서 보기 `/s/CODE` + 라우팅 + OG

**Files:** Create `settle_view.html`, `settle_view.js`, `settle_view.css`. Modify `_redirects`(`/q/*` 줄 아래에 `/s/*  /settle_view.html  200`), `netlify/edge-functions/partner-og.js:93-118`(`/s/` 분기: `qTitle = 현장명 ? \`${현장명} 정산 견적서\` : '섬세한손길 정산 견적서'`, `qDesc = '섬세한손길 시공 정산 견적서'`).

**Interfaces:** Consumes Task 2 `settle-quote`. 스냅샷을 다시 계산하지 않고 그린다.

**렌더 순서:** 업체명·대표전화 / 현장명 / 발행일(`YYYY.MM.DD`) / 인건비 표(품수 × 품단가 = 금액) / 자재비 표(자재명 · 단가/m · 소모량합 m · 금액; `<details>` "품목 내역 보기"에 품목·구역·수량/길이·소모량·자재) / 부가항목 표(금액 있는 줄만) / 합계(인건비·자재비·부가·총액, `부가세_별도표기`면 "부가세 별도" 문구) / 메모.

**검증:** 로컬 `http://localhost:8080/settle_view.html?id=<Task 2/4에서 만든 코드>` → 금액이 스냅샷과 일치, 콘솔 에러 0, 잘못된 코드 → "견적서를 찾을 수 없습니다". Edge Function은 push 후 `curl -s https://songil.netlify.app/s/<코드>?n=<b64> | grep og:title`로 확인.

- [ ] 페이지 3파일 + `_redirects` + `partner-og.js`
- [ ] 로컬 검증 → 커밋 `feat: 정산 견적서 보기 페이지(/s/)`

---

### Task 6: 관리자 앱 버튼

**Files:** Modify `H:\n8n_품질관리_블로그자동화\admin.js:596-602` (카드 footer 버튼 HTML), `admin.html:462` (`?v=20260920`), `admin_style.css` 필요 시 버튼 색만.

**Interfaces:** Produces 링크 `https://songil.netlify.app/settle.html?site=${recordId}` (Task 4 Consumes).

- [ ] `📷 사진` 옆에 `💰 현장견적` 버튼(`event.stopPropagation(); window.open(...)`) — 보관함 카드에도 표시
- [ ] 로컬 렌더 확인(admin.html은 n8n 실서버를 쓰므로 `file://`로도 열림) → 커밋

---

### Task 7: 통합 검증 · 배포

- [ ] songil push (사용자 확인) → `https://songil.netlify.app/settle.html?site=rechKp6aqNAjCenAP` 실제 열어 발행 1건 → `/s/코드` 열기 → `curl … | grep og:title`로 카톡 카드 제목 확인
- [ ] admin push (사용자 확인) → 카드 버튼 클릭으로 이동 확인
- [ ] 검증용 정산견적 레코드 삭제, 단가표에 남은 테스트 항목 없는지 확인
- [ ] 사용자에게: 채워야 할 품목 소모량 목록 + 품단가 초기값 안내

---

## Self-review

- 스펙 커버리지: §1 흐름(T4/T6), §2 화면(T4), §3 계산(T3), §4 데이터(T1), §5 백엔드(T2), §6 보기(T5), §7 설정(T4 모달), §8 admin(T6), §9 에러(T2 error 응답, T4 status/confirm, T5 not-found), §10 검증(각 태스크 + T7), §11 순서 = T1→T7. 누락 없음.
- 타입 일관성: 줄 객체 필드명(`마스터소모량`, `직접소모량`, `자재ID`)과 단가표 필드명(`항목명`, `구분`, `단가`)을 T2·T3·T4·T5가 같은 이름으로 쓴다. 스냅샷 키(`인건비/품목/자재소계/부가/합계`)는 스펙 §4-3 그대로.
- 플레이스홀더: 없음. 품단가 초기값 0은 사용자 결정 대기 항목으로 T7에서 안내.
