# 간편견적 진입 UX 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 첫 방문 시 강제로 펼쳐지던 평형별/품목별/사진견적 3탭 패널을 화면 왼쪽 벽에 붙은 작은 탭(손잡이)으로 축소하고, 탭을 누르면 왼쪽에서 서랍(드로어)처럼 슬라이드 인/아웃 되도록 바꾼다. 동시에 이미 정상 작동하는 채팅 텍스트 견적 입력("화장실문2개, 샤시2개")을 사용자가 알아채도록 웰컴 카드와 입력창 placeholder에 안내 문구를 추가한다.

**Architecture:** 순수 프론트엔드(HTML/CSS/vanilla JS) 변경. `index_app.js`의 `renderQuickQuoteModal()`이 갖고 있던 "첫 방문 시 인라인 강제 노출 / 이후엔 하단 배너 버튼" 이원화 분기(`isInline`)를 제거하고 항상 "왼쪽 벽 탭 → 클릭 시 드로어 오픈" 단일 경로로 통일한다. 기존 모달 DOM 구조(`.quick-quote-modal`, `.quick-quote-modal-content`, `#modalBody`)와 내부 렌더링 함수(`renderModalBody`)는 그대로 재사용하고, CSS 트랜스폼과 진입 버튼 스타일만 바꾼다. 백엔드(n8n)·`sendRequest()` 전송 로직·로딩/결과 화면·사진견적 경로는 전혀 건드리지 않는다.

**Tech Stack:** Vanilla JS (ES6), 순수 CSS (프레임워크 없음), 정적 HTML. 빌드 도구/테스트 프레임워크 없음 — 로컬 `python -m http.server`로 구동 후 브라우저로 수동 검증한다.

## Global Constraints

- 대상 파일은 모두 `D:\n8n_1분견적(필름)\1. 웹_배포파일 (GitHub)\` 안에 있다: `index.html`, `index_app.js`, `index_style.css`.
- n8n 워크플로우, Airtable, `CONFIG.estimateUrl`, `sendRequest()`의 전송/파싱 로직은 절대 수정하지 않는다.
- 30초 카운트다운 로딩 화면과 견적 결과 화면 렌더링 코드는 절대 수정하지 않는다.
- 채팅 입력창 하단 사진 첨부 버튼(`.camera-btn`, `#imageInput`)과 그 전송 경로는 절대 수정하지 않는다.
- 모든 작업은 `main`이 아니라 `feature/simple-quote-button` 브랜치에서 진행하고, 완료 후 수동 확인을 거쳐 사용자 승인이 있을 때만 `main`에 병합·push한다 (자동 병합/push 금지).
- 설계 문서: `docs/superpowers/specs/2026-08-26-simple-quote-button-redesign-design.md` (이 문서와 상충하면 설계 문서가 우선).

---

### Task 1: Git 백업 태그 + 작업 브랜치 생성

**Files:**
- 없음 (git 메타데이터만 변경)

**Interfaces:**
- Consumes: 없음
- Produces: `backup-live-20260826` 태그(원격에 push됨), `feature/simple-quote-button` 브랜치(로컬, 이후 작업의 기반)

- [ ] **Step 1: 현재 main HEAD에 백업 태그 생성**

```bash
cd "/d/n8n_1분견적(필름)/1. 웹_배포파일 (GitHub)"
git checkout main
git tag backup-live-20260826
git push origin backup-live-20260826
```
Expected: `* [new tag] backup-live-20260826 -> backup-live-20260826`

- [ ] **Step 2: 작업 브랜치 생성 및 전환**

```bash
git checkout -b feature/simple-quote-button
git branch --show-current
```
Expected: `feature/simple-quote-button`

- [ ] **Step 3: 로컬 미리보기 서버 기동 확인 (이후 모든 Task의 수동 검증에 사용)**

```bash
cd "/d/n8n_1분견적(필름)/1. 웹_배포파일 (GitHub)"
python -m http.server 9000
```
Expected: `Serving HTTP on 0.0.0.0 port 9000` — 이후 Task들은 `http://localhost:9000/index.html?code=p_001` 로 접속해 확인한다. (백그라운드로 계속 띄워둔다.)

---

### Task 2: CSS — 드로어 슬라이드 애니메이션 + 왼쪽 벽 탭 스타일

**Files:**
- Modify: `index_style.css:315-341` (`.quick-quote-modal`, `.quick-quote-modal-content`)
- Modify: `index_style.css` (새 규칙 `.edge-quote-tab` 추가, `.quick-quote-modal-content` 블록 바로 뒤)

**Interfaces:**
- Consumes: 없음 (순수 CSS)
- Produces: `.quick-quote-modal.open` 클래스 토글로 여닫히는 슬라이드 트랜지션, `.edge-quote-tab` 클래스(Task 3에서 JS가 버튼에 부여)

- [ ] **Step 1: `.quick-quote-modal` / `.quick-quote-modal-content` 를 하단시트에서 좌측 드로어로 변경**

`index_style.css:315-341`의 기존 블록을 다음으로 교체:

```css
        /* [New] 간편견적 좌측 슬라이드 드로어 */
        .quick-quote-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100dvh;
            background: rgba(0, 0, 0, 0);
            backdrop-filter: blur(0px);
            -webkit-backdrop-filter: blur(0px);
            z-index: 9999;
            display: flex;
            align-items: stretch;
            justify-content: flex-start;
            transition: background 0.28s ease-out, backdrop-filter 0.28s ease-out;
            pointer-events: none;
        }

        .quick-quote-modal.open {
            background: rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(5px);
            -webkit-backdrop-filter: blur(5px);
            pointer-events: auto;
        }

        .quick-quote-modal-content {
            width: 82%;
            max-width: 340px;
            height: 100%;
            background: white;
            border-radius: 0 20px 20px 0;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 4px 0 20px rgba(0, 0, 0, 0.15);
            position: relative;
            transform: translateX(-100%);
            transition: transform 0.28s ease-out;
        }

        .quick-quote-modal.open .quick-quote-modal-content {
            transform: translateX(0);
        }
```

- [ ] **Step 2: 왼쪽 벽 탭(`.edge-quote-tab`) 스타일 추가**

바로 위 블록 뒤에 이어서 추가:

```css
        /* [New] 좌측 벽 간편견적 진입 탭 */
        .edge-quote-tab {
            position: fixed;
            left: 0;
            top: 50%;
            transform: translateY(-50%);
            z-index: 500;
            background: #4A90E2;
            color: white;
            border: none;
            padding: 14px 6px;
            border-radius: 0 12px 12px 0;
            box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.12);
            cursor: pointer;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            font-size: 0.8em;
            font-weight: 700;
            font-family: 'Noto Sans KR', sans-serif;
            writing-mode: vertical-rl;
            letter-spacing: 1px;
        }

        .edge-quote-tab .tab-icon {
            writing-mode: horizontal-tb;
            font-size: 1.1em;
        }
```

- [ ] **Step 3: 브라우저에서 CSS만으로는 아직 확인 불가 — Task 3~4 완료 후 통합 검증 (Task 6)으로 미룸. 문법 오류만 우선 확인**

```bash
node -e "require('fs').readFileSync('index_style.css','utf8')" 2>&1 || echo "파일 읽기 실패 확인용"
```
Expected: 에러 없이 조용히 종료 (파일이 존재하고 읽히는지만 확인하는 용도 — CSS 문법 자체는 브라우저 렌더링으로 Task 6에서 최종 확인).

- [ ] **Step 4: Commit**

```bash
git add index_style.css
git commit -m "style: convert quick-quote panel from bottom sheet to left-edge slide drawer"
```

---

### Task 3: JS — 왼쪽 벽 탭 버튼으로 진입점 교체 (`addOpenQuickQuoteButton`)

**Files:**
- Modify: `index_app.js:1292-1318` (`addOpenQuickQuoteButton` 함수 전체)

**Interfaces:**
- Consumes: 없음
- Produces: `addOpenQuickQuoteButton()` — 호출 시 `.open-quick-quote-btn.edge-quote-tab` 버튼을 `document.body`에 fixed로 추가. 클릭 시 자기 자신을 제거하고 `renderQuickQuoteModal()`을 호출. (다른 코드가 `.open-quick-quote-btn` 셀렉터로 이 버튼을 찾아 제거하는 부분은 변경 없이 계속 동작함 — 클래스명 `open-quick-quote-btn`은 유지)

- [ ] **Step 1: 기존 함수 교체**

`index_app.js:1292-1318`의 기존 `addOpenQuickQuoteButton` 함수 전체를:

```javascript
        // 간편견적 열기 버튼 생성 함수 (닫기 버그 해결: 스크롤 하단 파묻힘을 예방하기 위해 chat-input-area 위에 고정 삽입)
        function addOpenQuickQuoteButton() {
            const existingMenu = document.querySelector('.quick-reply-container');
            if (existingMenu) existingMenu.remove();
            const existingBtn = document.querySelector('.open-quick-quote-btn');
            if (existingBtn) existingBtn.remove();

            const btn = document.createElement('button');
            btn.className = 'quick-reply-btn open-quick-quote-btn';
            btn.innerHTML = '🛠️ 간편견적 열기';
            btn.style.cssText = "display: block; width: 90%; margin: 10px auto; padding: 14px; background: #2c3e50; color: white; border-radius: 8px; font-weight: bold; font-size: 1.05em; cursor: pointer; border: none; box-shadow: 0 4px 6px rgba(0,0,0,0.1);";

            btn.onclick = () => {
                btn.classList.add('click-effect');
                setTimeout(() => {
                    btn.remove();
                    renderQuickQuoteModal();
                }, 150);
            };

            const inputArea = document.querySelector('.chat-input-area');
            if (inputArea) {
                inputArea.parentNode.insertBefore(btn, inputArea);
            } else {
                chatContainer.appendChild(btn);
            }
        }
```

다음으로 교체:

```javascript
        // 간편견적 진입 탭 생성 함수 (화면 왼쪽 벽에 고정된 작은 손잡이 — 채팅 입력창을 가리지 않음)
        function addOpenQuickQuoteButton() {
            const existingMenu = document.querySelector('.quick-reply-container');
            if (existingMenu) existingMenu.remove();
            const existingBtn = document.querySelector('.open-quick-quote-btn');
            if (existingBtn) existingBtn.remove();

            const btn = document.createElement('button');
            btn.className = 'open-quick-quote-btn edge-quote-tab';
            btn.innerHTML = '<span class="tab-icon">🛠️</span>간편견적';

            btn.onclick = () => {
                btn.remove();
                renderQuickQuoteModal();
            };

            document.body.appendChild(btn);
        }
```

- [ ] **Step 2: 브라우저로 확인 (Task 1에서 띄운 로컬 서버 사용)**

Claude Browser 도구로 `http://localhost:9000/index.html?code=p_001` 접속 후, 화면 로드 후 왼쪽 벽에 작은 파란색 탭이 보이는지 `read_page` 또는 스크린샷으로 확인.
Expected: 화면 왼쪽 가운데 높이에 "🛠️ 간편견적" 세로 텍스트 탭이 보임 (아직 Task 4를 안 했으므로 첫 방문 시엔 여전히 예전처럼 인라인 패널도 같이 보일 수 있음 — 정상, Task 4에서 해결).

- [ ] **Step 3: Commit**

```bash
git add index_app.js
git commit -m "feat: replace bottom banner button with left-edge quick-quote tab"
```

---

### Task 4: JS — 인라인 강제 노출 분기 제거 + 슬라이드 오픈/클로즈 애니메이션 연결

**Files:**
- Modify: `index_app.js:1933-2040` (`renderQuickQuoteModal` 함수 전체)

**Interfaces:**
- Consumes: `addOpenQuickQuoteButton()` (Task 3에서 정의)
- Produces: `renderQuickQuoteModal()` — 호출될 때마다 항상 `.quick-quote-modal` 드로어를 생성해 슬라이드 인 시키고, 닫힐 때 슬라이드 아웃 후 DOM에서 제거 + `addOpenQuickQuoteButton()` 재호출. `chatHistory.length` 값과 무관하게 항상 동일하게 동작 (더 이상 인라인 모드 없음).

- [ ] **Step 1: 함수 전체 교체**

`index_app.js:1933-2040`의 기존 `renderQuickQuoteModal` 함수 전체(아래는 그 구조 요약, 실제로는 파일에 있는 전체 내용을 아래 새 버전으로 통째로 교체한다)를 다음으로 교체:

```javascript
        // 퀵 메뉴(장바구니) 표시 함수 — 항상 좌측 슬라이드 드로어로 통일 (인라인 모드 없음)
        function renderQuickQuoteModal() {
            const inlineContainer = document.querySelector('.quick-quote-inline-container');
            if (inlineContainer) inlineContainer.remove();

            let modal = document.querySelector('.quick-quote-modal');
            let isFirstRender = false;

            if (!modal) {
                modal = document.createElement('div');
                modal.className = 'quick-quote-modal';
                modal.innerHTML = `
                    <div class="quick-quote-modal-content">
                        <!-- 모달 헤더 -->
                        <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center; padding:15px 20px; border-bottom:1px solid #edf2f7; background:#ffffff;">
                            <span style="font-weight:bold; font-size:1.15em; color:#1a202c; display:flex; align-items:center; gap:6px;">
                                🛠️ 1분 간편견적 선택
                            </span>
                            <button class="modal-close-btn" style="background:none; border:none; font-size:1.7em; font-weight:bold; cursor:pointer; color:#a0aec0; padding:5px; line-height:1; transition:color 0.2s;">&times;</button>
                        </div>
                        <!-- 모달 스크롤 바디 -->
                        <div class="quick-quote-modal-body" id="modalBody"></div>
                    </div>
                `;
                document.body.appendChild(modal);
                isFirstRender = true;

                // 슬라이드 인 애니메이션 트리거 (다음 프레임에 open 클래스 부여)
                requestAnimationFrame(() => {
                    modal.classList.add('open');
                });

                // 슬라이드 아웃 후 DOM에서 제거하고 탭을 복원하는 닫기 헬퍼
                const closeDrawer = () => {
                    modal.classList.remove('open');
                    setTimeout(() => {
                        modal.remove();
                        addOpenQuickQuoteButton();
                    }, 280);
                };

                // 닫기 버튼 이벤트 연결
                const closeBtn = modal.querySelector('.modal-close-btn');
                closeBtn.onmouseover = () => { closeBtn.style.color = '#e53e3e'; };
                closeBtn.onmouseout = () => { closeBtn.style.color = '#a0aec0'; };
                bindClickEffect(closeBtn, () => {
                    closeDrawer();
                });

                modal.onclick = (e) => {
                    if (e.target === modal) {
                        closeDrawer();
                    }
                };

                const modalBody = modal.querySelector('#modalBody');
                if (modalBody) {
                    modalBody.onscroll = () => {
                        const badge = modal.querySelector('.floating-cart-badge');
                        if (badge) {
                            const threshold = 80;
                            if (modalBody.scrollHeight - modalBody.scrollTop - modalBody.clientHeight < threshold) {
                                badge.style.opacity = '0';
                                badge.style.pointerEvents = 'none';
                            } else {
                                badge.style.opacity = '1';
                                badge.style.pointerEvents = 'auto';
                            }
                        }
                    };
                }
            }

            const bodyContainer = modal.querySelector('#modalBody');
            renderModalBody(bodyContainer, modal);

            // 최초 렌더링 시 모달 바디 스크롤 영역을 맨 위로 초기화
            if (isFirstRender && bodyContainer) {
                bodyContainer.scrollTop = 0;
            }
        }
```

- [ ] **Step 2: `renderWelcomeIfNeeded()` 호출부를 항상 `addOpenQuickQuoteButton()` 쓰도록 정리**

`index_app.js`에서 (Task 3 교체로 줄 번호가 조금 밀렸을 수 있으니 `renderQuickQuoteModal();` 을 검색해서 찾는다) 다음 블록을:

```javascript
                setTimeout(() => {
                    renderQuickQuoteModal();
                }, 300);
            } else {
                setTimeout(() => {
                    addOpenQuickQuoteButton();
                }, 500);
            }
```

다음으로 교체:

```javascript
                setTimeout(() => {
                    addOpenQuickQuoteButton();
                }, 300);
            } else {
                setTimeout(() => {
                    addOpenQuickQuoteButton();
                }, 500);
            }
```

- [ ] **Step 3: 브라우저로 첫 방문 시나리오 확인**

Claude Browser 도구:
1. `http://localhost:9000/index.html?code=p_001` 접속 (첫 방문 시뮬레이션을 위해 사이트 데이터/로컬스토리지를 비우거나 시크릿 컨텍스트 사용)
2. 웰컴 카드만 보이고, 3탭 패널이 화면에 강제로 펼쳐지지 않는지 확인
3. 왼쪽 벽 탭 클릭 → 드로어가 왼쪽에서 슬라이드로 열리는지 확인 (`read_console_messages`로 JS 에러 없는지 함께 확인)
4. 드로어 안 X 버튼 클릭 → 슬라이드 아웃되며 닫히고, 탭이 다시 나타나는지 확인
5. 드로어를 다시 열고, 배경(backdrop) 클릭 → 동일하게 닫히는지 확인

Expected: 에러 없이 4~5 시나리오 모두 정상 동작.

- [ ] **Step 4: Commit**

```bash
git add index_app.js
git commit -m "feat: unify quick-quote entry to left-edge drawer for all visits, add slide animation"
```

---

### Task 5: 채팅 텍스트 견적 발견성 — 웰컴 카드 안내 문구 + 입력창 placeholder

**Files:**
- Modify: `index_app.js` (`renderWelcomeIfNeeded()` 내부 `welcomeMsg` 템플릿, `1분이내 견적 OK!` 문단 바로 다음)
- Modify: `index.html:54` (`#userInput` placeholder)

**Interfaces:**
- Consumes: 없음
- Produces: 없음 (표시 문구만 변경, 동작 로직 변경 없음)

- [ ] **Step 1: 웰컴 카드에 채팅 입력 안내 문구 추가**

`index_app.js`에서 `welcomeMsg` 템플릿 안의 이 부분을 찾는다:

```html
    <p style="font-size: 0.95em; color: #4a5568; line-height: 1.5; margin: 0 0 15px;">
        <strong style="color: #4A90E2; font-weight: 800;">1분이내 견적 OK!</strong>
    </p>
    
    <div style="display: flex; justify-content: center; gap: 15px; margin-bottom: 20px;">
```

다음으로 교체 (문단과 아이콘 줄 사이에 안내 박스 한 줄 삽입):

```html
    <p style="font-size: 0.95em; color: #4a5568; line-height: 1.5; margin: 0 0 15px;">
        <strong style="color: #4A90E2; font-weight: 800;">1분이내 견적 OK!</strong>
    </p>

    <div style="background: #ebf8ff; border: 1px dashed #90cdf4; border-radius: 10px; padding: 8px 12px; margin: 0 0 15px; font-size: 0.82em; color: #2b6cb0; line-height: 1.4;">
        💬 채팅창에 바로 <strong>"화장실문2개, 샤시2개"</strong>처럼 입력해도 견적이 나와요!
    </div>

    <div style="display: flex; justify-content: center; gap: 15px; margin-bottom: 20px;">
```

- [ ] **Step 2: 입력창 placeholder를 예시 문구로 변경**

`index.html:54`:

```html
                    <input type="text" id="userInput" placeholder="사진 첨부 또는 견적 내용 입력...">
```

다음으로 교체:

```html
                    <input type="text" id="userInput" placeholder="예: 화장실문2개, 샤시2개">
```

- [ ] **Step 3: 브라우저로 확인**

Claude Browser 도구로 첫 방문 시나리오 재접속 → 웰컴 카드에 안내 박스가 보이는지, 입력창 placeholder가 "예: 화장실문2개, 샤시2개"로 보이는지 확인.
Expected: 두 문구 모두 정상 표시, 레이아웃 깨짐 없음.

- [ ] **Step 4: Commit**

```bash
git add index_app.js index.html
git commit -m "content: add chat-text-quote hint to welcome card and input placeholder"
```

---

### Task 6: 전체 회귀 검증 (설계 문서 체크리스트 기반)

**Files:**
- 없음 (검증만 수행, 코드 변경 없음 — 문제 발견 시에만 Task 2~5로 돌아가 수정)

**Interfaces:**
- Consumes: Task 1~5의 모든 산출물
- Produces: 검증 결과 (통과/실패 목록)

- [ ] **Step 1: 모바일 뷰포트(375px)로 전환 후 왼쪽 탭이 입력창과 안 겹치는지 확인**

Claude Browser `resize_window`로 375x812(mobile 프리셋) 설정 후 `http://localhost:9000/index.html?code=p_001` 재접속. 화면 하단 채팅 입력창과 왼쪽 벽 탭이 겹치지 않는지 스크린샷으로 확인.
Expected: 탭은 화면 세로 중앙(입력창보다 훨씬 위)에 위치, 입력창 영역 침범 없음.

- [ ] **Step 2: 채팅 텍스트만으로 견적 요청 (회귀 확인)**

`#userInput`에 "화장실문2개, 샤시2개" 입력 후 전송 버튼 클릭. 30초 카운트다운 로딩이 기존과 동일하게 뜨고, 이후 견적 결과가 정상 산출되는지 확인.
Expected: 기존과 동일하게 정상 작동 (백엔드/전송 로직을 안 건드렸으므로 이전 대화에서 이미 확인된 동작 그대로).

- [ ] **Step 3: 사진 첨부로 견적 요청 (회귀 확인)**

`.camera-btn` 또는 `#imageInput`으로 이미지 업로드 후 전송. 기존과 동일하게 견적이 산출되는지 확인.
Expected: 기존과 동일하게 정상 작동.

- [ ] **Step 4: 드로어 내부 기능 회귀 확인**

왼쪽 탭 클릭 → 드로어 열림 → `평형별` / `품목별` / `사진견적` 탭 전환이 정상 동작하는지, `품목별` 탭에서 품목을 장바구니에 담으면 `floating-cart-badge`가 드로어 안에서 정상적으로(겹침 없이) 표시되는지 확인.
Expected: `시스템_구조_및_체크리스트.md`의 항목 9(중문짝 세부 품목 단가), 10(가맹점별 품목 노출여부)이 기존과 동일하게 동작.

- [ ] **Step 5: 가맹점 접속 잠금 기능 회귀 확인**

`?code=` 파라미터를 잘못된 값으로 바꿔 접속 → 접속 제한 락 스크린이 정상 노출되는지 확인 (이번 변경과 무관한 영역이지만 `시스템_구조_및_체크리스트.md` 1번 항목 기준 회귀 여부만 빠르게 확인).
Expected: 기존과 동일하게 락 스크린 노출.

- [ ] **Step 6: 콘솔 에러 최종 확인**

`read_console_messages`(onlyErrors: true)로 Task 1~5 전체 시나리오 진행 중 발생한 JS 에러가 없는지 확인.
Expected: 에러 0건.

- [ ] **Step 7: 모든 항목 통과 시 로컬 서버 종료**

```bash
# 로컬 서버(Task 1 Step 3에서 백그라운드로 띄운 python http.server) 종료
```

---

### Task 7: main 병합 및 배포 (사용자 승인 후에만 진행)

**Files:**
- 없음 (git 병합/push만)

**Interfaces:**
- Consumes: Task 6에서 모두 통과한 `feature/simple-quote-button` 브랜치
- Produces: `main` 브랜치에 반영되고 GitHub(`origin/main`)에 push된 최종 상태 (Netlify 등 배포 파이프라인이 `main`을 보고 있다면 이 시점에 라이브 반영됨)

**중요: 이 Task는 Task 6의 모든 검증이 통과했다는 것을 사용자에게 직접 보여주고, 명시적으로 "main으로 옮겨줘" 또는 "배포해줘" 같은 승인을 받은 뒤에만 실행한다. 자동으로 실행하지 않는다.**

- [ ] **Step 1: main으로 병합**

```bash
cd "/d/n8n_1분견적(필름)/1. 웹_배포파일 (GitHub)"
git checkout main
git merge feature/simple-quote-button --no-ff -m "Merge feature/simple-quote-button: left-edge drawer + chat-text-quote discoverability"
```
Expected: 충돌 없이 병합됨 (같은 파일을 다른 브랜치에서 동시에 안 건드렸으므로 충돌 가능성 낮음).

- [ ] **Step 2: push (사용자가 "푸쉬해줘" 등으로 명시적으로 요청했을 때만)**

```bash
git push origin main
```
Expected: `main -> main` push 성공.

- [ ] **Step 3: 작업 브랜치 정리 (선택)**

```bash
git branch -d feature/simple-quote-button
```

---

## Self-Review 메모

- **스펙 커버리지**: 설계 문서의 1(좌측 드로어), 2(채팅 안내 문구), 3(git 브랜치 전략), 비목표(백엔드/로딩화면/결과화면/사진견적 불변) 모두 Task 1~6에 대응됨.
- **플레이스홀더 스캔**: "TBD"/"추후" 등 미정 항목 없음 — 모든 Step에 실제 코드/명령 포함.
- **타입/이름 일관성**: `addOpenQuickQuoteButton()`, `renderQuickQuoteModal()`, `.open-quick-quote-btn`, `.edge-quote-tab`, `.quick-quote-modal`, `.quick-quote-modal-content`, `.quick-quote-modal.open` 이름이 Task 2~4 전체에서 동일하게 사용됨.
- **배포 안전장치**: Task 7(main 병합/push)은 사용자 명시적 승인 없이는 실행하지 않도록 별도 Task로 분리함.
