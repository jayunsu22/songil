const CONFIG = {
            estimateUrl: "https://primary-production-a6fa.up.railway.app/webhook/image-test", // 견적 요청용
            partnerUrl: "https://primary-production-a6fa.up.railway.app/webhook/partner-info", // 가맹점 정보 조회용
            secretToken: "songil_secret_2025",
            managerName: "김정헌 실장" // 기본값
        };

        let currentPartner = null; // 가맹점 정보 저장용
        let currentPartnerCode = ''; // 가맹점 코드 저장용 (200 Rewrite 대응)
        let chatHistory = []; // 채팅 기록 메모리 저장

        // [New] URL에서 code 파라미터 읽어서 가맹점 정보 가져오기
        async function loadPartnerInfo() {
            const urlParams = new URLSearchParams(window.location.search);
            let code = urlParams.get('code');

            // [New] URL 경로(Pathname)를 기반으로 가맹점 코드 매핑 (200 Rewrite 대응)
            if (!code) {
                const path = window.location.pathname.replace(/^\/|\/$/g, '').toLowerCase();
                // 외부 partners.js 파일에 정의된 PARTNER_MAPPING 객체를 참조합니다.
                if (typeof PARTNER_MAPPING !== 'undefined' && PARTNER_MAPPING[path]) {
                    code = PARTNER_MAPPING[path];
                }
            }

            if (!code) {
                return;
            }

            currentPartnerCode = code; // 가맹점 코드 전역 변수에 저장

            try {
                const res = await fetch(`${CONFIG.partnerUrl}?code=${code}`);
                const data = await res.json();

                if (data.success === "true") {
                    currentPartner = data; // 데이터 저장

                    // 1. 헤더 텍스트 변경
                    const pName = data.partner_name || '';
                    const titleText = pName ? `${pName} 1분견적` : '인테리어필름 1분견적';
                    document.getElementById('header-title').textContent = titleText;
                    document.title = titleText; // 브라우저 타이틀 태그도 동기화

                    // 상단 링크 영역은 의도적으로 비움
                    document.getElementById('partner-links').innerHTML = '';

                    // 웰컴 카드가 이미 렌더링되어 있다면 실시간 가맹점 정보 업데이트
                    updateWelcomeCardWithPartner(data);
                } else {
                    // 💡 만약 가맹점 정보 조회가 실패(만료/비활성화)했다면 접속 완전 차단!
                    document.body.innerHTML = `
                        <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; text-align:center; padding:20px; font-family:sans-serif; background:#f7fafc; box-sizing:border-box;">
                            <h2 style="color:#e53e3e; margin:0 0 12px 0; font-weight:700; font-size:1.6rem; line-height:1.4;">접속이 제한되었습니다</h2>
                            <p style="color:#4a5568; font-size:1.1rem; line-height:1.8; margin:0 0 12px 0; font-weight:500;">
                                접속 권한이 없습니다!<br>
                                또는 이용 기간이 만료되었습니다.<br>
                                관리자에게 문의해 주세요.
                            </p>
                            <a href="tel:010-6657-1222" style="color:#e53e3e; font-size:1.6rem; font-weight:700; text-decoration:none; display:inline-block; margin:0; line-height:1.4;">
                                연락처 : 010-6657-1222
                            </a>
                        </div>
                    `;
                    return;
                }
            } catch (e) {
                console.error("가맹점 정보 로딩 실패:", e);
            }
        }

        // 페이지 로드 시 실행 (변수 초기화 완료 후 하단에서 실행됨)

        // [New] 채팅 기록 불러오기 (v2_chat_history)
        function loadChatHistory() {
            const saved = localStorage.getItem('v2_chat_history');
            if (saved) {
                try {
                    chatHistory = JSON.parse(saved);
                    // 간혹 배열이 아닌 경우 (null 등) 예외처리
                    if (!Array.isArray(chatHistory)) chatHistory = [];

                    chatHistory.forEach(item => {
                        addBubble(item.message, item.sender, item.isQuote, false); // false = 저장 안 함 (이미 했으니)
                    });
                    // 마지막으로 스크롤 이동
                    setTimeout(() => { chatContainer.scrollTop = chatContainer.scrollHeight; }, 100);
                } catch (e) {
                    console.error("History parse error", e);
                }
            }
        }

        // [New] 채팅 초기화 버튼 기능
        function resetChat() {
            if (!confirm("모든 대화 내용을 삭제하고 새로 시작하시겠습니까?")) return;
            localStorage.removeItem('v2_chat_history');
            location.reload();
        }

        function getUUID() {
            let uuid = localStorage.getItem('user_id');
            if (!uuid) {
                uuid = 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
                localStorage.setItem('user_id', uuid);
            }
            return uuid;
        }
        const currentUserId = getUUID();
        console.log("Current User ID:", currentUserId);

        const chatContainer = document.getElementById('chatContainer');
        const userInput = document.getElementById('userInput');
        const sendButton = document.getElementById('sendButton');
        const previewContainer = document.getElementById('preview-container');

        let selectedImages = []; // { file, previewUrl }

        function scrollToBottom() { setTimeout(() => { chatContainer.scrollTop = chatContainer.scrollHeight; }, 50); }

        function handleImageSelect(event, isCamera = false) {
            const files = Array.from(event.target.files);
            if (!files.length) return;

            // [New] 다중 견적 보류 (1장만 업로드 가능하도록 강제)
            // 기존에 선택된 이미지가 있다면 지우고 새로 선택한 1장만 덮어씀
            selectedImages = [];

            const file = files[0];
            const reader = new FileReader();
            reader.onload = async function (e) {
                selectedImages.push({
                    file: file,
                    previewUrl: e.target.result
                });
                renderPreviews(); // UI 갱신

                // 모달 닫기
                const modal = document.querySelector('.quick-quote-modal');
                if (modal) {
                    modal.remove();
                    addOpenQuickQuoteButton();
                }

                if (isCamera) {
                    // 카메라인 경우 즉시 전송
                    await sendRequest(false);
                } else {
                    // 갤러리인 경우 컨펌 후 전송
                    if (confirm("지금 선택한 사진의 견적을 진행할까요?")) {
                        await sendRequest(false);
                    }
                }
            };
            reader.readAsDataURL(file);
            event.target.value = '';
        }

        function removeImage(index) {
            selectedImages.splice(index, 1);
            renderPreviews();
        }

        function renderPreviews() {
            previewContainer.innerHTML = '';
            if (selectedImages.length === 0) {
                previewContainer.style.display = 'none';
                return;
            }
            previewContainer.style.display = 'block';

            selectedImages.forEach((item, index) => {
                const div = document.createElement('div');
                div.className = 'preview-item';
                div.innerHTML = `
                   <div class="preview-number">${index + 1}</div>
                   <img src="${item.previewUrl}" class="preview-img">
                   <button class="preview-close" onclick="removeImage(${index})">×</button>
               `;
                previewContainer.appendChild(div);
            });
        }

        // [핵심 로직] 이미지를 세로(1열)로 병합하고 워터마크 표시
        async function mergeImages(imageItems) {
            if (imageItems.length === 0) return null;

            return new Promise((resolve) => {
                const images = [];
                let loadedCount = 0;

                imageItems.forEach((item, idx) => {
                    const img = new Image();
                    img.crossOrigin = "Anonymous";
                    img.onload = () => {
                        images[idx] = img;
                        loadedCount++;
                        if (loadedCount === imageItems.length) {
                            processMerge(images);
                        }
                    };
                    img.src = item.previewUrl;
                });

                function processMerge(imgs) {
                    // 고정 너비 (모바일 최적화) - 전송 안정성을 위해 600px로 조정
                    const cellW = 600;

                    // 각 이미지의 비율 유지 높이 계산
                    let totalHeight = 0;
                    const scaledHeights = imgs.map(img => {
                        const scale = cellW / img.width;
                        const h = img.height * scale;
                        totalHeight += h;
                        return h;
                    });

                    const canvas = document.createElement('canvas');
                    canvas.width = cellW;
                    canvas.height = totalHeight;
                    const ctx = canvas.getContext('2d');

                    // 배경 흰색
                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    let currentY = 0;
                    imgs.forEach((img, i) => {
                        const h = scaledHeights[i];

                        // 이미지 그리기 (꽉 채우기)
                        ctx.drawImage(img, 0, currentY, cellW, h);

                        // [수정] 번호표 그리기: 이미지 왼쪽 상단 내부에 크고 진하게
                        drawWatermark(ctx, i + 1, 0, currentY);

                        // 구분선 (마지막 이미지 제외)
                        if (i < imgs.length - 1) {
                            ctx.beginPath();
                            ctx.moveTo(0, currentY + h);
                            ctx.lineTo(cellW, currentY + h);
                            ctx.strokeStyle = "#ffffff";
                            ctx.lineWidth = 4;
                            ctx.stroke();
                        }

                        currentY += h;
                    });

                    // [수정] 용량 초과 방지를 위해 품질 조정 (크기 줄였으니 품질 0.6)
                    resolve(canvas.toDataURL('image/jpeg', 0.6));
                }

                function drawWatermark(ctx, num, x, y) {
                    // 번호표 크기 (지름 80px)
                    const size = 80;
                    const padding = 20; // 여백
                    const circleX = x + padding + (size / 2);
                    const circleY = y + padding + (size / 2);

                    // 그림자 효과로 선명도 UP
                    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
                    ctx.shadowBlur = 10;
                    ctx.shadowOffsetX = 2;
                    ctx.shadowOffsetY = 2;

                    ctx.beginPath();
                    ctx.arc(circleX, circleY, size / 2, 0, 2 * Math.PI);
                    ctx.fillStyle = "#e53e3e"; // 강렬한 빨간색
                    ctx.fill();

                    // 흰색 테두리
                    ctx.lineWidth = 4;
                    ctx.strokeStyle = "white";
                    ctx.stroke();

                    // 그림자 끄기 (텍스트는 깔끔하게)
                    ctx.shadowColor = "transparent";

                    // 숫자
                    ctx.fillStyle = "white";
                    ctx.font = "bold 50px Arial";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(num, circleX, circleY + 4);
                }
            });
        }

        // [New] 동적 옵션 버튼 및 안내 문구 주입 로직
        function processDynamicOptions(bubble) {
            // 이미지 분석 결과일 때만(버블 내부에 이미지가 존재할 때만) 동적 옵션 및 확인 단계를 진행합니다.
            const hasImage = !!bubble.querySelector('img');
            if (!hasImage) return;

            const itemTitles = bubble.querySelectorAll('.item-title');
            if (!itemTitles || itemTitles.length === 0) return;

            let confirmedItems = [];
            let needsOptions = [];

            itemTitles.forEach(titleDiv => {
                const text = titleDiv.innerText || titleDiv.textContent;
                let itemName = text.replace('🔹', '').trim();

                // 앞에 붙은 뱃지 기호(❶, 1. 등) 제거
                let cleanName = itemName.replace(/^[^가-힣a-zA-Z]+/, '').trim();

                // 싱크대나 샤시가 1세트로 임의 고정되어 넘어온 경우 (단, 평형별 패키지 품목은 제외)
                const isUnmeasuredSink = cleanName.includes('싱크대') && cleanName.includes('1세트') && !cleanName.includes('평');
                const isUnmeasuredSash = cleanName.includes('샤시') && cleanName.includes('1세트') && !cleanName.includes('평');

                if (isUnmeasuredSink || isUnmeasuredSash) {
                    needsOptions.push(cleanName); // 통째로 넣어서 나중에 some()에서 정확히 매칭되도록 함

                    // [New] 어차피 전체 말풍선을 숨길 것이므로 개별 숨김 로직 제거
                } else {
                    // 옵션 선택이 필요 없는 확정 품목들 (예: 방문)
                    confirmedItems.push(cleanName);
                }
            });

            if (needsOptions.length === 0) return;

            // [Fix] 옵션 선택 중에는 '간편견적 열기' 버튼이 불필요하므로 제거
            const existingBtn = document.querySelector('.open-quick-quote-btn');
            if (existingBtn) existingBtn.remove();

            // [New] 견적서 안에 이미지가 있다면 에어테이블 이미지 링크를 몰래 저장합니다. (B방법 핵심)
            const imgTag = bubble.querySelector('img');
            if (imgTag && imgTag.src) {
                lastAirtableImageUrl = imgTag.src;
            }

            // [핵심] 옵션 선택이 필요하다면, 1단계에서 임시로 생성된 전체 견적 말풍선을 아예 숨겨버립니다!
            bubble.style.display = 'none';

            // 동적 버튼 컨테이너 생성
            const btnContainer = document.createElement('div');
            btnContainer.className = "dynamic-options-container";
            btnContainer.style.cssText = "margin-top: 10px; margin-bottom: 15px; text-align: center; background: #f8f9fa; padding: 12px; border-radius: 12px; border: 1px dashed #ced4da;";

            const titleDivUI = document.createElement('div');
            titleDivUI.style.cssText = "font-size:0.9em; color:#e17055; font-weight:bold; margin-bottom:12px;";
            btnContainer.appendChild(titleDivUI);

            const buttonsWrapper = document.createElement('div');
            btnContainer.appendChild(buttonsWrapper);

            let step = 1;
            let currentSashBase = "";
            let currentSinkBase = "";
            let activeCategory = "";

            const sinkItem = needsOptions.find(i => i.includes('싱크대'));
            const sashItem = needsOptions.find(i => i.includes('샤시'));

            if (sinkItem) {
                activeCategory = "sink";
                currentSinkBase = sinkItem.replace('1세트', '').trim();
            } else if (sashItem) {
                activeCategory = "sash";
                currentSashBase = sashItem.replace('1세트', '').trim();
            }

            function renderButtons() {
                buttonsWrapper.innerHTML = '';
                let currentOptions = [];

                if (activeCategory === "sink") {
                    if (step === 0) {
                        let displayName = "싱크대 상하부장 전체";
                        if (currentSinkBase.includes("상부장")) displayName = "싱크대 상부장만";
                        else if (currentSinkBase.includes("하부장")) displayName = "싱크대 하부장만";
                        
                        titleDivUI.innerText = `💡 AI가 [${displayName}] 시공으로 진단했습니다. 맞습니까?`;
                        currentOptions.push({ text: "네, 맞습니다", value: "confirm_yes" });
                        currentOptions.push({ text: "아닙니다 (다른 범위 선택)", value: "confirm_no" });
                    } else if (step === 1) {
                        titleDivUI.innerText = "💡 시공 범위를 먼저 선택해 주세요";
                        currentOptions.push({ text: "싱크대 상하부장 전체시공", value: "싱크대" });
                        currentOptions.push({ text: "싱크대 상부장만 시공", value: "싱크대상부장" });
                        currentOptions.push({ text: "싱크대 하부장만 시공", value: "싱크대하부장" });
                    } else if (step === 2) {
                        titleDivUI.innerText = `💡 길이를 선택해 견적을 완성하세요`;
                        currentOptions.push({ text: "3~4m", value: `${currentSinkBase} 4m` });
                        currentOptions.push({ text: "5~6m", value: `${currentSinkBase} 6m` });
                        currentOptions.push({ text: "7~8m", value: `${currentSinkBase} 8m` });
                        currentOptions.push({ text: "9~10m", value: `${currentSinkBase} 10m` });
                        currentOptions.push({ text: "11~12m", value: `${currentSinkBase} 12m` });
                    }
                } else if (activeCategory === "sash") {
                    if (step === 0) {
                        let displayName = "일반샤시";
                        if (currentSashBase.includes("시스템")) displayName = "시스템샤시";
                        else if (currentSashBase.includes("상가")) displayName = "상가샤시";
                        else if (currentSashBase.includes("2중창") || currentSashBase.includes("이중창")) displayName = "이중창 샤시";

                        titleDivUI.innerText = `💡 AI가 [${displayName}]로 진단했습니다. 맞습니까?`;
                        currentOptions.push({ text: "네, 맞습니다", value: "confirm_yes" });
                        currentOptions.push({ text: "아닙니다 (다른 종류 선택)", value: "confirm_no" });
                    } else if (step === 1) {
                        titleDivUI.innerText = "💡 샤시 종류를 먼저 선택해 주세요";
                        currentOptions.push({ text: "일반샤시", value: "샤시(단창)" });
                        currentOptions.push({ text: "시스템샤시", value: "시스템샤시" });
                        currentOptions.push({ text: "상가샤시", value: "상가샤시" });
                    } else if (step === 2) {
                        titleDivUI.innerText = `💡 길이를 선택해 견적을 완성하세요`;
                        currentOptions.push({ text: "1~2m", value: `${currentSashBase} 2m` });
                        currentOptions.push({ text: "3~4m", value: `${currentSashBase} 4m` });
                        currentOptions.push({ text: "5~6m", value: `${currentSashBase} 6m` });
                        currentOptions.push({ text: "7~8m", value: `${currentSashBase} 8m` });
                        currentOptions.push({ text: "9~10m", value: `${currentSashBase} 10m` });
                    }
                }

                currentOptions.forEach(opt => {
                    const btn = document.createElement('button');
                    btn.className = 'quick-reply-btn dynamic-btn';
                    btn.innerText = opt.text;
                    btn.style.cssText = "display: block; width: 100%; margin-bottom: 8px; padding: 12px; background: #4A90E2; color: white; border: none; border-radius: 8px; font-size: 1.05em; font-weight: bold; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1); box-sizing: border-box;";

                    btn.onclick = () => {
                        if (step === 0) {
                            if (opt.value === "confirm_yes") {
                                step = 2;
                                renderButtons();
                            } else {
                                step = 1;
                                renderButtons();
                            }
                        } else if (step === 1) {
                            if (activeCategory === "sink") currentSinkBase = opt.value;
                            if (activeCategory === "sash") currentSashBase = opt.value;
                            step = 2;
                            renderButtons();
                        } else {
                            let finalInput = "";
                            if (confirmedItems.length > 0) {
                                finalInput = confirmedItems.join(", ") + ", ";
                            }
                            finalInput += opt.value;

                            const userInput = document.getElementById('userInput');
                            userInput.value = finalInput;
                            btnContainer.style.display = 'none';
                            sendRequest(true); // 즉시 전송 (동적 버튼 플래그)
                        }
                    };
                    buttonsWrapper.appendChild(btn);
                });
            }

            renderButtons();

            // 챗봇 말풍선 바로 아래에 버튼 그룹 추가
            bubble.parentNode.insertBefore(btnContainer, bubble.nextSibling);
        }

        // [New] save=true 파라미터 추가하여 기록 저장 제어
        function addBubble(message, sender, isQuote = false, save = true) {
            const bubble = document.createElement('div');
            bubble.classList.add('chat-bubble', sender);

            let content = message;

            // [추가] 중복 서명 제거 및 업데이트 태그 제거 로직
            if (sender === 'bot') {
                // [New] [XX:XX KST 업데이트] 문구 제거
                content = content.replace(/\s*\[[^\]]*KST\s*업데이트\]/gi, '');

                if (isQuote || content.includes('견적') || content.includes('금액')) {
                    // [중요] 사용자가 요청한대로 "문의 :" 뒷부분은 n8n이 보내는 가짜 서명이므로 제거
                    // (단, n8n이 '담당 :' (투명문자 포함)으로 보낼 때는 이게 작동 안 할 수 있지만, 안전장치로 유지)
                    const safeSplit = content.split('문의 :')[0];
                    if (safeSplit && safeSplit.length < content.length) {
                        content = safeSplit;
                    }
                }
            }

            // 견적서 내 이미지 스타일 보정
            if (isQuote) {
                content = content.replace(/max-width:100%/g, 'width:100%; max-width:100%; border-radius:12px;');
            }

            // [핵심] 가맹점 명함(Footer) 추가 로직
            // n8n 메시지 내에 '📞'나 '담당' 같은 키워드가 이미 있다면 프론트에서 명함을 붙이지 않음.
            // (n8n 코드가 명함을 포함하도록 수정되었으므로, 여기서는 그게 실패했을 때의 백업 역할만 함)
            const hasSignature = content.includes('문의\u200B :') || content.includes('문의 :') || content.includes('담당\u200B :') || content.includes('담당 :') || content.includes('📞');
            if (!hasSignature && sender === 'bot' && (isQuote || content.includes('견적') || content.includes('금액'))) {

                // 가맹점 정보 없으면 기본값 (김정헌 실장)
                const partnerData = currentPartner || {};
                const ceo = partnerData.ceo_name || '김정헌';
                const pos = partnerData.position || '실장';
                const phone = partnerData.phone || '010-6657-1222';

                const blog = partnerData.blog_url || '';
                const insta = partnerData.insta_url || '';
                const kakao = partnerData.kakao_url || '';

                const footerHtml = `
                    <div style="margin-top: 20px; padding-top: 15px; border-top: 2px dashed #eee; text-align: center;">
                        <div style="display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
                            <span style="font-weight: bold; font-size: 1.0em; color: #333; margin-right: 5px;">
                                문의 : ${ceo} ${pos}
                            </span>
                            ${blog ? `<a href="${blog}" target="_blank" style="display:inline-block; padding:2px 6px; background:#03C75A; color:white; text-decoration:none; border-radius:4px; font-size:0.85em; font-weight:bold;">블</a>` : ''}
                            ${insta ? `<a href="${insta}" target="_blank" style="display:inline-block; padding:2px 6px; background:linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888); color:white; text-decoration:none; border-radius:4px; font-size:0.85em; font-weight:bold;">인</a>` : ''}
                            ${kakao ? `<a href="${kakao}" target="_blank" style="display:inline-block; padding:2px 6px; background:#FEE500; color:#3c1e1e; text-decoration:none; border-radius:4px; font-size:0.85em; font-weight:bold;">카</a>` : ''}
                        </div>
                        <a href="tel:${phone}" style="display: block; width: 100%; box-sizing: border-box; background: white; border: 2px solid #4A90E2; color: #4A90E2; text-decoration: none; font-weight: 800; font-size: 1.3em; padding: 12px; border-radius: 12px; margin-bottom: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                            📞 ${phone}
                        </a>
                        ${(false && !content.includes('견적 제공이 되지 않는') && !content.includes('견적을 산출할 수 없습니다')) ?
                        `<button onclick="shareQuote(this)" style="display: inline-block; background: #f1f3f5; color: #495057; border: none; padding: 8px 16px; border-radius: 20px; font-size: 0.9em; cursor: pointer;">
                            🔗 견적내용 공유하기
                        </button>` : ''}
                    </div>
                `;
                content += footerHtml;
            }

            bubble.innerHTML = isQuote ? `<div class="quote-content">${content}</div>` : content;
            chatContainer.appendChild(bubble);

            // [저장] 새로운 메시지면 로컬스토리지에 저장 (save가 true일 때만)
            if (save) {
                // 이미지 base64 데이터가 로컬스토리지 용량을 초과하여 에러(멈춤 현상)를 발생시키는 것 방지
                let saveContent = content;
                if (saveContent.includes('data:image')) {
                    saveContent = saveContent.replace(/src="data:image[^"]+"/g, 'src="" alt="[이미지 만료]"');
                }
                chatHistory.push({ message: saveContent, sender: sender, isQuote: isQuote });

                try {
                    localStorage.setItem('v2_chat_history', JSON.stringify(chatHistory));
                } catch (e) {
                    console.warn("로컬스토리지 용량 초과:", e);
                }
            }

            // [New] 챗봇의 견적서 출력 시 동적 버튼 처리
            if (sender === 'bot' && isQuote) {
                // DOM 렌더링 후 처리되도록 약간 지연
                setTimeout(() => {
                    processDynamicOptions(bubble); // 예전 동적 질문(샤시/싱크대 선택) 방식 복구
                    if (!save) {
                        scrollToBottom();
                    }
                }, 50);
            }

            return bubble;
        }

        function showFullscreenLoading() {
            const existing = document.querySelector('.estimate-loading-overlay');
            if (existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.className = 'estimate-loading-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100dvh;
                background: rgba(255, 255, 255, 0.85);
                backdrop-filter: blur(15px);
                -webkit-backdrop-filter: blur(15px);
                z-index: 999999;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                font-family: 'Noto Sans KR', sans-serif;
                transition: opacity 0.3s ease;
            `;

            overlay.innerHTML = `
                <div style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 15px; padding: 20px; box-sizing: border-box; width: 100%;">
                    <div style="font-size: 2.2em; font-weight: 800; color: #1a202c; letter-spacing: -1px; margin-bottom: 5px;">견적 산출</div>
                    
                    <div class="loading-timer-circle" style="
                        width: 210px;
                        height: 210px;
                        border-radius: 50%;
                        background-color: #dbeafe;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 2.3em;
                        font-weight: 800;
                        color: #1a202c;
                        box-shadow: 0 15px 35px rgba(0,0,0,0.08);
                        border: 3px solid rgba(255,255,255,0.6);
                        transition: background-color 0.4s ease, color 0.4s ease, transform 0.3s ease;
                    ">
                        <span class="timer-seconds-text">30초 전</span>
                    </div>
                    
                    <div style="margin-top: 15px; font-size: 1.05em; font-weight: 700; color: #4A90E2; display: flex; align-items: center; gap: 6px;">
                        <span class="loading-dots-pulse">⚡</span> AI 이미지/도면 분석 중...
                    </div>
                    
                    <p style="font-size: 0.88em; color: #718096; margin: 5px 0 0; line-height: 1.6; font-weight: 500;">
                        꼼꼼하게 견적서를 작성하고 있습니다.<br>
                        잠시만 기다려주시면 바로 전송됩니다!
                    </p>
                </div>
            `;

            document.body.appendChild(overlay);
            return overlay;
        }

        function updateLoadingTimer(overlay, sec) {
            const circle = overlay.querySelector('.loading-timer-circle');
            const textEl = overlay.querySelector('.timer-seconds-text');
            if (!circle || !textEl) return;

            if (sec > 0) {
                textEl.innerText = `${sec}초 전`;
                
                const colors = [
                    '#dbeafe', // light blue
                    '#fef08a', // light yellow
                    '#a5f3fc', // cyan
                    '#bbf7d0', // light green
                    '#fbcfe8', // light pink
                    '#e9d5ff'  // light purple
                ];
                const colorIndex = sec % colors.length;
                circle.style.backgroundColor = colors[colorIndex];
                circle.style.color = '#1a202c';
                circle.classList.remove('blinking-red');
            } else {
                textEl.innerText = `0초`;
                circle.classList.add('blinking-red');
            }
        }

        // 견적서 HTML을 카톡 공유용 깔끔한 텍스트로 변환하는 함수
        function getQuoteText(quoteContainer) {
            let lines = [];
            
            // [New] 웰컴 소개 카드(인트로 카드) 복사 대응
            if (quoteContainer.classList.contains('welcome-card-bubble') || quoteContainer.querySelector('.open-quick-quote-btn')) {
                lines.push(`📋 [대박난손길 1분 간편견적 서비스]`);
                lines.push(`━━━━━━━━━━━━━━━━━━━━`);
                lines.push(`⚡ 어떤 견적이든 1분내 OK!`);
                lines.push(`👉 평형별, 품목별, 사진견적으로 빠르고 간편하게 견적을 산출해 드립니다.`);
                lines.push(`━━━━━━━━━━━━━━━━━━━━`);
                lines.push(`👤 문의 : 김정헌 실장`);
                lines.push(`📞 연락처 : 010-6657-1222`);
                lines.push(`━━━━━━━━━━━━━━━━━━━━`);
                lines.push(`🔗 URL: https://songil.netlify.app/image_dev.html?code=p_001`);
                return lines.join('\n');
            }
            
            // 1. 타이틀 & 견적 ID
            const titleEl = quoteContainer.querySelector('.quote-title');
            if (titleEl) {
                const text = titleEl.textContent.trim().replace(/\s+/g, ' ');
                lines.push(`📋 ${text}`);
            } else {
                lines.push(`📋 [대박난손길 1분 간편 견적서]`);
            }
            lines.push(`━━━━━━━━━━━━━━━━━━━━`);
            
            // 2. 품목별 상세 내용
            const childNodes = quoteContainer.querySelectorAll('.item-title, .item-detail, .item-notification');
            let hasItems = false;
            childNodes.forEach(el => {
                const text = el.textContent.trim().replace(/\s+/g, ' ');
                if (el.classList.contains('item-title')) {
                    if (hasItems) lines.push('');
                    lines.push(`${text}`);
                    hasItems = true;
                } else if (el.classList.contains('item-detail')) {
                    lines.push(`   ${text}`);
                } else if (el.classList.contains('item-notification')) {
                    lines.push(`   ${text}`);
                }
            });
            
            lines.push(`━━━━━━━━━━━━━━━━━━━━`);
            
            // 3. 합계 금액
            const totalEl = quoteContainer.querySelector('.total-line');
            if (totalEl) {
                lines.push(`${totalEl.textContent.trim()}`);
                lines.push(`━━━━━━━━━━━━━━━━━━━━`);
            }
            
            // 4. 공통 공지사항
            const commonTitleEl = quoteContainer.querySelector('.common-title');
            const commonDetailEl = quoteContainer.querySelector('.common-detail');
            if (commonTitleEl && commonDetailEl) {
                lines.push(`📢 ${commonTitleEl.textContent.replace('!', '').trim()}`);
                // <br>태그를 줄바꿈으로 변환하고 HTML 태그 제거
                const detailText = commonDetailEl.innerHTML
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/<[^>]+>/g, '')
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0)
                    .join('\n');
                lines.push(detailText);
                lines.push(`━━━━━━━━━━━━━━━━━━━━`);
            }
            
            // 5. 담당자 연락처
            let contactInfo = "";
            const spans = quoteContainer.querySelectorAll('span');
            spans.forEach(span => {
                if (span.textContent.includes('문의 :')) {
                    contactInfo = span.textContent.trim().replace(/\s+/g, ' ');
                }
            });
            
            const telEl = quoteContainer.querySelector('a[href^="tel:"]');
            if (telEl) {
                const telNumber = telEl.textContent.trim().replace(/\s+/g, ' ');
                if (contactInfo) {
                    lines.push(`👤 ${contactInfo}`);
                    lines.push(`📞 연락처: ${telNumber.replace('📞', '').trim()}`);
                } else {
                    lines.push(`📞 연락처: ${telNumber}`);
                }
            } else if (contactInfo) {
                lines.push(`👤 ${contactInfo}`);
            }
            
            lines.push(`━━━━━━━━━━━━━━━━━━━━`);
            lines.push(`⚡ 대박난손길 1분 간편견적 서비스`);
            
            return lines.join('\n');
        }

        // 공유하기 기능 함수 (클립보드 복사 우회법 적용)
        function shareQuote(buttonEl) {
            const target = buttonEl || (window.event ? window.event.target : null);
            let quoteContainer = null;
            if (target) {
                quoteContainer = target.closest('.quote-content') || target.closest('.welcome-card-bubble') || target.closest('.chat-bubble');
            }
            if (!quoteContainer) {
                quoteContainer = document.querySelector('.quote-content') || document.querySelector('.welcome-card-bubble');
            }
            if (!quoteContainer) {
                alert('견적서 내용을 찾을 수 없습니다.');
                return;
            }
            
            const formattedText = getQuoteText(quoteContainer);
            
            // 안전한 복사 함수 (HTTP 환경 및 모바일 인앱 브라우저 호환)
            function copyToClipboard(text) {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    return navigator.clipboard.writeText(text);
                } else {
                    const textArea = document.createElement("textarea");
                    textArea.value = text;
                    textArea.style.position = "fixed";
                    textArea.style.opacity = "0";
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    try {
                        const successful = document.execCommand('copy');
                        document.body.removeChild(textArea);
                        return successful ? Promise.resolve() : Promise.reject();
                    } catch (err) {
                        document.body.removeChild(textArea);
                        return Promise.reject(err);
                    }
                }
            }

            // 모바일이고 navigator.share를 지원하는 경우 공유하기 창을 띄움
            if (navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                navigator.share({
                    title: '대박난손길 견적 결과',
                    text: formattedText
                }).catch(() => {
                    // 공유하기 창을 닫거나 에러 시 클립보드로 복사 진행
                    copyToClipboard(formattedText).then(() => {
                        alert('견적서 텍스트가 클립보드에 복사되었습니다!\n원하는 곳(카톡 등)에 붙여넣기(Ctrl+V) 하세요.');
                    });
                });
            } else {
                copyToClipboard(formattedText).then(() => {
                    alert('견적서 텍스트가 클립보드에 복사되었습니다!\n원하는 곳(카톡 등)에 붙여넣기(Ctrl+V) 하세요.');
                }).catch(() => {
                    alert('복사에 실패했습니다. 견적 내용을 직접 마우스 드래그로 복사해 주세요.');
                });
            }
        }

        // [New] 첫 번째 견적에서 에어테이블이 만들어준 이미지 URL을 보관하는 변수 (B방법 핵심)
        let lastAirtableImageUrl = "";

        async function sendRequest(isFromDynamicBtn = false) {
            const isDynamic = (isFromDynamicBtn === true);
            let msg = userInput.value.trim();

            // [New] 만약 장바구니에 품목이 있고, 텍스트 입력 없이 '전송'을 누르거나 장바구니 품목을 보낼 때 자동 연동
            if (b2bCart.length > 0 && !isDynamic) {
                const requestTexts = [];
                b2bCart.forEach(item => {
                    let text = "";
                    if (item.option) {
                        const rangeItems = ["싱크대", "신발장", "붙박이장", "수납장", "냉장고장", "가벽", "알판", "등박스", "웨인스코팅", "중간알판", "룸박스"];
                        const isRangeItem = rangeItems.some(k => item.name.includes(k) || k.includes(item.name));

                        if (isRangeItem && item.option.includes("~")) {
                            let mVal = item.option.split("~")[1] || item.option;
                            mVal = mVal.trim();
                            if (!mVal.toLowerCase().includes("m") && !mVal.includes("미터")) {
                                mVal += "m";
                            }
                            text = `${item.name} ${mVal}`;
                        } else {
                            text = `${item.name} ${item.option}`;
                        }
                    } else {
                        text = item.label;
                    }
                    if (text) requestTexts.push(text);
                });

                const cartItemsText = requestTexts.join(", ");
                if (msg) {
                    msg = `${cartItemsText} (요청사항: ${msg})`;
                } else {
                    msg = cartItemsText;
                }
                b2bCart = [];
            }

            if (!msg && selectedImages.length === 0 && !isDynamic) return;

            // [Fix] 견적 계산이 시작되면 기존에 떠있던 간편견적 버튼과 컨테이너들을 숨김 처리
            const existingBtn = document.querySelector('.open-quick-quote-btn');
            if (existingBtn) existingBtn.remove();
            const existingMenu = document.querySelector('.quick-reply-container');
            if (existingMenu) existingMenu.remove();
            const inlineContainer = document.querySelector('.quick-quote-inline-container');
            if (inlineContainer) inlineContainer.remove();
            const badge = document.querySelector('.floating-cart-badge');
            if (badge) badge.remove();

            // [New] 일일 무료 견적 3회 제한 (이미지 포함 시)
            // 단, URL 파라미터에 'admin=true'가 있거나, 해시값에 #admin이 있으면 제한 무시
            const isManager = window.location.href.includes('admin=true') || window.location.hash.includes('#admin');

            if (!isManager && selectedImages.length > 0) {
                const today = new Date().toISOString().split('T')[0];
                const key = 'daily_quote_v1';
                const stored = JSON.parse(localStorage.getItem(key)) || { date: today, count: 0 };
                const curCount = (stored.date === today) ? stored.count : 0;

                if (curCount >= 100) {
                    addBubble("🚫 <b>일일 무료 견적 횟수(100회) 초과</b><br><br>과도한 AI 비용 발생 방지를 위해 이미지 견적은 하루 3회로 제한됩니다.<br>내일 다시 이용해 주시거나, 텍스트로 문의해 주세요! 🙏", 'bot');
                    return;
                }
            }

            let displayMsg = msg;

            // 사용자가 보는 화면엔 첫장만 크게 띄우고 뒤에 +N장 표시
            if (selectedImages.length > 0) {
                const firstImg = selectedImages[0].previewUrl;
                let countBadge = selectedImages.length > 1 ? `<span style="background:rgba(0,0,0,0.6); color:white; position:absolute; bottom:5px; right:5px; padding:2px 8px; border-radius:10px; font-size:0.8em; font-weight:bold;">+${selectedImages.length - 1}</span>` : "";

                displayMsg = `<div style="position:relative; display:inline-block;">
                               <img src="${firstImg}" style="max-width:200px; max-height:200px; border-radius:8px; display:block; border:1px solid #ddd;">
                               ${countBadge}
                             </div>`;
                if (msg) displayMsg += `<div style="margin-top:8px;">${msg}</div>`;
            }

            // [중요] 사용자가 보낸 말풍선 생성 및 '위치 저장'
            const userBubble = addBubble(displayMsg, 'user');

            // 사용자가 보낸 직후에는 일단 맨 아래로 스크롤 (내가 쓴 건 봐야 하니까)
            scrollToBottom();

            userInput.value = "";
            const imagesToProcess = [...selectedImages];
            selectedImages = [];
            renderPreviews();
            sendButton.disabled = true;

            let sec = 30;
            const loading = showFullscreenLoading();
            const timer = setInterval(() => {
                sec--;
                if (sec < 0) sec = 0;
                updateLoadingTimer(loading, sec);
            }, 1000);

            try {
                let finalImage = null;
                if (imagesToProcess.length > 0) {
                    finalImage = await mergeImages(imagesToProcess);
                    lastAirtableImageUrl = ""; // 새 이미지를 올리면 기존 URL 초기화

                    // [New] 카운트 차감 (이미지 변환 성공 후) - 관리자는 차감 안 함
                    if (!isManager) {
                        const today = new Date().toISOString().split('T')[0];
                        const key = 'daily_quote_v1';
                        let stored = JSON.parse(localStorage.getItem(key)) || { date: today, count: 0 };
                        if (stored.date !== today) stored = { date: today, count: 0 };
                        stored.count++;
                        localStorage.setItem(key, JSON.stringify(stored));
                    }
                }

                // [수정] 현재 접속한 가맹점 코드(code)를 함께 전송
                const pCode = currentPartnerCode || '';

                const payload = {
                    message: msg,
                    partner_code: pCode // n8n에서 이 코드로 업체를 식별합니다
                };

                // 원본 사진이 있으면 payload.image 에 넣고, 
                // 길이 선택 버튼을 누른 거라면 사진 대신 payload.imageUrl 에 링크만 넣습니다.
                if (finalImage) {
                    payload.image = finalImage;
                } else if (isDynamic && lastAirtableImageUrl) {
                    payload.imageUrl = lastAirtableImageUrl;
                }

                const res = await fetch(CONFIG.estimateUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-secret-token': CONFIG.secretToken,
                        'x-user-id': currentUserId
                    },
                    body: JSON.stringify(payload)
                });

                clearInterval(timer);
                if (loading.parentNode) loading.parentNode.removeChild(loading);

                if (!res.ok) throw new Error('Server Error');
                const data = await res.json();

                let responseText = "";
                if (Array.isArray(data) && data.length > 0 && data[0].output) {
                    responseText = data[0].output;
                } else if (data.output) {
                    responseText = data.output;
                } else if (Array.isArray(data) && data.length > 0 && data[0].message) {
                    responseText = data[0].message;
                } else if (data.message) {
                    responseText = data.message;
                }

                // [New] 예상견적이 0원이거나, 등록되지 않은 항목 경고가 있는 경우 견적 불가 예외 발생시킴
                let totalEst = -1;
                if (Array.isArray(data) && data.length > 0) {
                    totalEst = data[0].totalEstimate !== undefined ? Number(data[0].totalEstimate) : -1;
                } else if (data.totalEstimate !== undefined) {
                    totalEst = Number(data.totalEstimate);
                }

                let isZeroEstimate = (totalEst === 0);
                if (responseText.includes('예상견적: 0원') || responseText.includes('예상견적: 0 원') || responseText.includes('등록되지 않은 항목') || responseText.includes('견적 산출 불가')) {
                    isZeroEstimate = true;
                }

                if (isZeroEstimate || !responseText.trim()) {
                    throw new Error('Zero Estimate');
                }

                let botBubble = null;
                if (Array.isArray(data) && data.length > 0 && data[0].output) {
                    botBubble = addBubble(data[0].output, 'bot', true);
                } else if (data.output) {
                    botBubble = addBubble(data.output, 'bot', true);
                } else if (Array.isArray(data) && data.length > 0 && data[0].message) {
                    botBubble = addBubble(data[0].message, 'bot', true);
                } else if (data.message) {
                    botBubble = addBubble(data.message, 'bot', true);
                } else {
                    botBubble = addBubble("✅ 계산 완료! (내용을 확인해주세요)", 'bot');
                }

                // AI 이미지 테두리(Bounding Box) 생성 반영
                if (botBubble) {
                    const boxes = (Array.isArray(data) && data.length > 0) ? data[0].boxes : data.boxes;
                    if (boxes && Array.isArray(boxes) && boxes.length > 0) {
                        const imgContainer = botBubble.querySelector('.ai-image-container');
                        if (imgContainer) {
                            boxes.forEach(boxObj => {
                                if (boxObj.box && Array.isArray(boxObj.box) && boxObj.box.length === 4) {
                                    const [ymin, xmin, ymax, xmax] = boxObj.box;
                                    
                                    const boxDiv = document.createElement('div');
                                    boxDiv.className = 'ai-detected-box';
                                    boxDiv.style.top = `${ymin / 10}%`;
                                    boxDiv.style.left = `${xmin / 10}%`;
                                    boxDiv.style.width = `${(xmax - xmin) / 10}%`;
                                    boxDiv.style.height = `${(ymax - ymin) / 10}%`;
                                    
                                    // 배지 라벨 생성
                                    const labelSpan = document.createElement('span');
                                    labelSpan.className = 'ai-detected-label';
                                    
                                    const badgeNumStr = boxObj.badge ? ` [${boxObj.badge}]` : '';
                                    labelSpan.innerHTML = `🤖 AI 인식: ${boxObj.item}${badgeNumStr}`;
                                    
                                    boxDiv.appendChild(labelSpan);
                                    imgContainer.appendChild(boxDiv);
                                }
                            });
                        }
                    }
                }

                // [New] 1) 견적이 산출되고 나면 그다음에 버튼으로[간편견적 열기] 버튼 생성
                addOpenQuickQuoteButton();

                // [핵심] 봇 응답이 온 후, 스크롤을 맨 아래가 아닌 견적 산출 내역의 윗부분(botBubble)으로 부드럽게 이동
                // 약간의 딜레이 후 이동 (DOM 렌더링 시간 고려)
                setTimeout(() => {
                    const targetBubble = botBubble || userBubble;
                    if (targetBubble) {
                        targetBubble.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }, 100);

            } catch (e) {
                clearInterval(timer);
                if (loading.parentNode) loading.parentNode.removeChild(loading);
                console.error(e);

                const partnerData = currentPartner || {};
                const ceo = partnerData.ceo_name || '김정헌';
                const pos = partnerData.position || '실장';
                const phone = partnerData.phone || '010-6657-1222';
                const blog = partnerData.blog_url || '';
                const insta = partnerData.insta_url || '';
                const kakao = partnerData.kakao_url || '';

                const socialHtml = (blog || insta || kakao) ? `
                    <div class="error-partner-socials" style="display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 5px; margin-bottom: 10px;">
                        ${blog ? `<a href="${blog}" target="_blank" style="display:inline-block; padding:2px 6px; background:#03C75A; color:white; text-decoration:none; border-radius:4px; font-size:0.85em; font-weight:bold;">블</a>` : ''}
                        ${insta ? `<a href="${insta}" target="_blank" style="display:inline-block; padding:2px 6px; background:linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888); color:white; text-decoration:none; border-radius:4px; font-size:0.85em; font-weight:bold;">인</a>` : ''}
                        ${kakao ? `<a href="${kakao}" target="_blank" style="display:inline-block; padding:2px 6px; background:#FEE500; color:#3c1e1e; text-decoration:none; border-radius:4px; font-size:0.85em; font-weight:bold;">카</a>` : ''}
                    </div>
                ` : '';

                let errorTitle = "⚠️ 견적 불가 또는 없는 항목 안내";
                let errorBody = `인식된 시공 품목이 없거나 견적 산출이 어려운 대상(예: 쇼파 등 필름 시공 불가 항목)입니다.<br>
                인테리어 필름 시공 대상(샤시, 문틀/문짝, 싱크대, 신발장 등)이 맞는지 확인해 주세요.<br><br>
                상세한 개별 견적 및 문의사항은 아래 담당자에게 직접 연락 주시면 친절히 안내해 드리겠습니다. 😊`;

                if (e.message !== 'Zero Estimate') {
                    errorTitle = "⚠️ 서버 연결 실패 또는 견적 불가";
                    errorBody = `서버와의 연결이 일시적으로 원활하지 않거나, 인식된 시공 대상이 없습니다.<br>
                    입력하신 내용이나 사진을 확인해 주시고, 상세한 견적 문의는 아래 담당자에게 직접 연락 주시면 친절히 상담해 드리겠습니다. 😊`;
                }

                const errorMsg = `
<div class="error-card" style="font-family: sans-serif; padding: 5px 0; width: 100%; box-sizing: border-box;">
    <div style="font-size: 1.1em; font-weight: bold; color: #e53e3e; margin-bottom: 8px; text-align: left;">
        ${errorTitle}
    </div>
    <div style="font-size: 0.95em; color: #4a5568; line-height: 1.6; margin-bottom: 15px; text-align: left;">
        ${errorBody}
    </div>
    <div style="padding-top: 15px; border-top: 1px dashed #e2e8f0; text-align: center;">
        <div style="display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
            <span style="font-weight: bold; font-size: 1.0em; color: #333;">문의 : ${ceo} ${pos}</span>
            ${socialHtml}
        </div>
        <a href="tel:${phone}" style="display: block; width: 100%; box-sizing: border-box; background: white; border: 2px solid #e53e3e; color: #e53e3e; text-decoration: none; font-weight: 800; font-size: 1.25em; padding: 12px; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); outline: none;">
            📞 ${phone}
        </a>
    </div>
</div>
`;
                addBubble(errorMsg, 'bot');
                addOpenQuickQuoteButton();
                scrollToBottom();
            } finally {
                sendButton.disabled = false;
            }
        }

        sendButton.addEventListener('click', () => sendRequest());
        userInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendRequest(); });

        // ----------------------------------------------------
        // [New] B2B 간편견적 시스템 고도화 데이터 구조 정의
        // ----------------------------------------------------

        // 1. 평형별 탭 데이터
        const APARTMENT_SIZES = ["20평 아파트", "30평 아파트", "40평 아파트", "50평 아파트"];
        const SIZE_ITEMS = [
            { label: "20평 몰딩", name: "몰딩 20평" },
            { label: "20평 크라운몰딩", name: "크라운몰딩 20평" },
            { label: "20평 걸레받이", name: "걸레받이 20평" },
            { label: "20평 싱크대 전체", name: "싱크대 20평" },
            { label: "20평 싱크대 상부장", name: "싱크대 상부장 20평" },
            { label: "20평 싱크대 하부장", name: "싱크대 하부장 20평" },

            { label: "30평 몰딩", name: "몰딩 30평" },
            { label: "30평 크라운몰딩", name: "크라운몰딩 30평" },
            { label: "30평 걸레받이", name: "걸레받이 30평" },
            { label: "30평 싱크대 전체", name: "싱크대 30평" },
            { label: "30평 싱크대 상부장", name: "싱크대 상부장 30평" },
            { label: "30평 싱크대 하부장", name: "싱크대 하부장 30평" },

            { label: "40평 몰딩", name: "몰딩 40평" },
            { label: "40평 크라운몰딩", name: "크라운몰딩 40평" },
            { label: "40평 걸레받이", name: "걸레받이 40평" },
            { label: "40평 싱크대 전체", name: "싱크대 40평" },
            { label: "40평 싱크대 상부장", name: "싱크대 상부장 40평" },
            { label: "40평 싱크대 하부장", name: "싱크대 하부장 40평" },

            { label: "50평 몰딩", name: "몰딩 50평" },
            { label: "50평 크라운몰딩", name: "크라운몰딩 50평" },
            { label: "50평 걸레받이", name: "걸레받이 50평" },
            { label: "50평 싱크대 전체", name: "싱크대 50평" },
            { label: "50평 싱크대 상부장", name: "싱크대 상부장 50평" },
            { label: "50평 싱크대 하부장", name: "싱크대 하부장 50평" }
        ];

        // 2. 품목별 탭 데이터
        const ITEM_CATEGORIES = [
            {
                name: "도어",
                groups: [
                    {
                        title: "🚪 문/도어류",
                        accent: "accent-blue",
                        items: [
                            { label: "방문 시공", name: "방문", type: "door-dropdown", sub: "방문/화장실문/문틀" },
                            { label: "화장실문 시공", name: "화장실문", type: "door-dropdown", sub: "방문/화장실문/문틀" },
                            { label: "문짝만 시공", name: "문짝", type: "door-dropdown", sub: "방문/화장실문/문틀" },
                            { label: "문틀만 시공", name: "문틀", type: "door-dropdown", sub: "방문/화장실문/문틀" },

                            { label: "현관문 시공", name: "현관문", type: "click", sub: "현관/방화문/기타도어" },
                            { label: "방화문 시공", name: "방화문", type: "door-dropdown", sub: "현관/방화문/기타도어" },
                            { label: "터닝도어 시공", name: "터닝도어", type: "door-dropdown", sub: "현관/방화문/기타도어" },
                            { label: "실외기실문 시공", name: "실외기실문", type: "click", sub: "현관/방화문/기타도어" },
                            { label: "세탁실문 시공", name: "세탁실문", type: "click", sub: "현관/방화문/기타도어" },

                            { label: "중문 전체시공", name: "중문", type: "click", sub: "중문 시공" },
                            { label: "중문틀만 시공", name: "중문틀", type: "click", sub: "중문 시공" },
                            { label: "중문짝만 시공", name: "중문짝", type: "door-dropdown", sub: "중문 시공" },

                            { label: "아치문틀 너비 1m", name: "아치 1m", type: "click", sub: "아치문틀" },
                            { label: "아치문틀 너비 2~3m", name: "아치 3m", type: "click", sub: "아치문틀" },
                            { label: "아치문틀 너비 4~5m", name: "아치 5m", type: "click", sub: "아치문틀" }
                        ]
                    }
                ]
            },
            {
                name: "샤시",
                groups: [
                    {
                        title: "🪟 샤시류",
                        accent: "accent-teal",
                        items: [
                            { label: "일반샤시 1m 단창", name: "샤시(단창) 1m", type: "sash-dropdown", sub: "일반샤시 (단창)" },
                            { label: "일반샤시 2~3m 단창", name: "샤시(단창) 3m", type: "sash-dropdown", sub: "일반샤시 (단창)" },
                            { label: "일반샤시 4~5m 단창", name: "샤시(단창) 5m", type: "sash-dropdown", sub: "일반샤시 (단창)" },

                            { label: "일반샤시 1m 2중창", name: "샤시(2중창) 1m", type: "sash-dropdown", sub: "일반샤시 (2중창)" },
                            { label: "일반샤시 2~3m 2중창", name: "샤시(2중창) 3m", type: "sash-dropdown", sub: "일반샤시 (2중창)" },
                            { label: "일반샤시 4~5m 2중창", name: "샤시(2중창) 5m", type: "sash-dropdown", sub: "일반샤시 (2중창)" },

                            { label: "시스템샤시 1m", name: "시스템샤시 1m", type: "sash-dropdown", sub: "시스템샤시" },
                            { label: "시스템샤시 2~3m", name: "시스템샤시 3m", type: "sash-dropdown", sub: "시스템샤시" },
                            { label: "시스템샤시 4~5m", name: "시스템샤시 5m", type: "sash-dropdown", sub: "시스템샤시" },

                            { label: "상가샤시 1m 한쪽면", name: "상가샤시(한쪽시공) 1m", type: "click", sub: "상가샤시 (한쪽면)" },
                            { label: "상가샤시 2~3m 한쪽면", name: "상가샤시(한쪽시공) 3m", type: "click", sub: "상가샤시 (한쪽면)" },
                            { label: "상가샤시 4~5m 한쪽면", name: "상가샤시(한쪽시공) 5m", type: "click", sub: "상가샤시 (한쪽면)" },
                            { label: "상가샤시 6~7m 한쪽면", name: "상가샤시(한쪽시공) 7m", type: "click", sub: "상가샤시 (한쪽면)" },
                            { label: "상가샤시 8~9m 한쪽면", name: "상가샤시(한쪽시공) 9m", type: "click", sub: "상가샤시 (한쪽면)" },

                            { label: "상가샤시 1m 양쪽면", name: "상가샤시(양쪽시공) 1m", type: "click", sub: "상가샤시 (양쪽면)" },
                            { label: "상가샤시 2~3m 양쪽면", name: "상가샤시(양쪽시공) 3m", type: "click", sub: "상가샤시 (양쪽면)" },
                            { label: "상가샤시 4~5m 양쪽면", name: "상가샤시(양쪽시공) 5m", type: "click", sub: "상가샤시 (양쪽면)" },
                            { label: "상가샤시 6~7m 양쪽면", name: "상가샤시(양쪽시공) 7m", type: "click", sub: "상가샤시 (양쪽면)" },
                            { label: "상가샤시 8~9m 양쪽면", name: "상가샤시(양쪽시공) 9m", type: "click", sub: "상가샤시 (양쪽면)" }
                        ]
                    }
                ]
            },
            {
                name: "싱크/가구/기타",
                groups: [
                    {
                        title: "🍳 싱크대/가구류",
                        accent: "accent-purple",
                        items: [
                            { label: "싱크대 전체시공", name: "싱크대", type: "sink-dropdown", sub: "싱크대" },
                            { label: "싱크대 상부장만", name: "싱크대 상부장", type: "sink-dropdown", sub: "싱크대" },
                            { label: "싱크대 하부장만", name: "싱크대 하부장", type: "sink-dropdown", sub: "싱크대" },

                            { label: "신발장 전체시공", name: "신발장", type: "furniture-dropdown", sub: "신발장" },
                            { label: "신발장 문틀만", name: "신발장틀", type: "furniture-dropdown", sub: "신발장" },
                            { label: "신발장 문짝만", name: "신발장문짝", type: "furniture-dropdown", sub: "신발장" },

                            { label: "붙박이장 전체시공", name: "붙박이장", type: "furniture-dropdown", sub: "붙박이장" },
                            { label: "붙박이장 문틀만", name: "붙박이장틀", type: "furniture-dropdown", sub: "붙박이장" },
                            { label: "붙박이장 문짝만", name: "붙박이장문짝", type: "furniture-dropdown", sub: "붙박이장" },

                            { label: "수납장 전체시공", name: "수납장", type: "furniture-dropdown", sub: "수납장" },
                            { label: "수납장 문틀만", name: "수납장틀", type: "furniture-dropdown", sub: "수납장" },
                            { label: "수납장 문짝만", name: "수납장문짝", type: "furniture-dropdown", sub: "수납장" },

                            { label: "냉장고장 전체시공", name: "냉장고장", type: "furniture-dropdown", sub: "냉장고장" },
                            { label: "냉장고장 문틀만", name: "냉장고장틀", type: "furniture-dropdown", sub: "냉장고장" },
                            { label: "냉장고장 문짝만", name: "냉장고장문짝", type: "furniture-dropdown", sub: "냉장고장" },

                            { label: "화장대 시공", name: "화장대", type: "click", sub: "기타 가구" }
                        ]
                    },
                    {
                        title: "🪵 목공/기타류",
                        accent: "accent-indigo",
                        items: [
                            { label: "가벽 시공", name: "가벽", type: "wood-dropdown", sub: "목공 인테리어" },
                            { label: "알판 시공", name: "알판", type: "wood-dropdown", sub: "목공 인테리어" },
                            { label: "등박스 시공", name: "등박스", type: "wood-dropdown", sub: "목공 인테리어" },
                            { label: "웨인스코팅 시공", name: "웨인스코팅", type: "wood-dropdown", sub: "목공 인테리어" },

                            { label: "아트월 시공", name: "아트월", type: "click", sub: "기타 목공" },
                            { label: "중간알판 시공", name: "중간알판", type: "wood-dropdown", sub: "기타 목공" }
                        ]
                    }
                ]
            }
        ];

        let mainTab = 1; // 0: 평형별, 1: 품목별, 2: 사진견적
        let b2bCart = []; // 장바구니 배열: [{ id, name, label, option, count }]
        let currentB2BTab = 0; // 품목별 탭 내부 서브 탭 (0: 도어, 1: 샤시, 2: 싱크/가구/기타)

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

        // 클릭 효과 바인딩 헬퍼 함수
        function bindClickEffect(element, callback) {
            element.addEventListener('click', (e) => {
                element.classList.add('click-effect');
                element.addEventListener('animationend', function handler() {
                    element.classList.remove('click-effect');
                    element.removeEventListener('animationend', handler);
                });
                if (callback) callback(e);
            });
        }

        // 장바구니 아이템 추가 함수 (수량 1개 한정 고정 및 토스트 메시지 알림)
        function addCartItem(name, label, option = "", count = 1, cartIndex = 1) {
            // 다중 추가가 허용되는 품목(계속 쌓임) 정의
            const isMultiAllow = (name === "신발장" || name === "붙박이장" || name === "수납장");

            const existingIndex = b2bCart.findIndex(item => item.name === name && item.cartIndex === cartIndex);

            // 이미 동일 슬롯이 존재하면 옵션을 갱신 (수량은 1개 고정)
            if (existingIndex !== -1) {
                b2bCart[existingIndex].option = option;
                showToast(`🛒 ${label} 옵션이 갱신되었습니다.`);
                renderQuickQuoteModal();
                return true;
            }

            // 종류 제한 체크 (고유한 품목 종류가 7종류 이상인 경우 제한)
            const uniqueNames = new Set(b2bCart.map(item => item.name));
            if (!uniqueNames.has(name) && uniqueNames.size >= 7) {
                alert("⚠️ 종류 제한: AI의 정확한 견적을 위해 한 번에 최대 7가지 품목까지만 담을 수 있습니다.\n7가지를 먼저 견적 내시고 추가로 진행해 주세요!");
                return false;
            }

            b2bCart.push({
                id: 'cart_' + name + '_' + cartIndex + '_' + Date.now(),
                name: name,
                label: label,
                option: option,
                count: 1, // 무조건 1개 고정
                cartIndex: cartIndex
            });

            showToast(`🛒 ${label} 품목을 장바구니에 담았습니다.<br><span style="font-size: 0.85em; font-weight: normal; opacity: 0.9; display: block; margin-top: 4px;">총 7개까지 한번에 견적 가능합니다.</span>`);

            setTimeout(() => {
                const cartContainerUI = document.querySelector('.floating-cart-list');
                if (cartContainerUI) {
                    cartContainerUI.classList.add('pulse-effect');
                    cartContainerUI.addEventListener('animationend', function handler() {
                        cartContainerUI.classList.remove('pulse-effect');
                        cartContainerUI.addEventListener('animationend', handler); // 기존 락 방지용 리스너는 일괄 등록되어 있으므로 정상 작동함
                    });
                }
            }, 50);

            renderQuickQuoteModal();
            return true;
        }

        // 장바구니 아이템 삭제 함수 (삭제 후 뒤쪽 슬롯을 앞으로 한 칸씩 당김)
        function removeCartItem(id) {
            const targetItem = b2bCart.find(item => item.id === id);
            if (targetItem) {
                const name = targetItem.name;
                const cartIndex = targetItem.cartIndex;
                
                b2bCart = b2bCart.filter(item => item.id !== id);
                
                const isMultiAllow = (name === "신발장" || name === "붙박이장" || name === "수납장");
                if (isMultiAllow && cartIndex) {
                    b2bCart.forEach(item => {
                        if (item.name === name && item.cartIndex > cartIndex) {
                            item.cartIndex -= 1;
                            const baseLabel = name === "신발장" ? "신발장 전체시공" : (name === "붙박이장" ? "붙박이장 전체시공" : "수납장 전체시공");
                            item.label = (item.cartIndex === 1) ? baseLabel : `${baseLabel}(${item.cartIndex})`;
                        }
                    });
                }
            }
            renderQuickQuoteModal();
        }
        // [New] 세련된 토스트 알림 표시 함수
        function showToast(message) {
            let toast = document.querySelector('.toast-notification');
            if (toast) toast.remove();

            toast = document.createElement('div');
            toast.className = 'toast-notification';
            toast.innerHTML = message;
            toast.style.cssText = "position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%); background: rgba(0, 0, 0, 0.85); color: white; padding: 12px 24px; border-radius: 20px; font-size: 0.92em; font-weight: bold; z-index: 100000; opacity: 0; transition: opacity 0.3s, bottom 0.3s; pointer-events: none; box-shadow: 0 4px 12px rgba(0,0,0,0.25); text-align: center; white-space: nowrap;";

            document.body.appendChild(toast);

            setTimeout(() => {
                toast.style.opacity = '1';
                toast.style.bottom = '110px';
            }, 50);

            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.bottom = '100px';
                setTimeout(() => {
                    if (toast.parentNode) toast.parentNode.removeChild(toast);
                }, 300);
            }, 2500); // 2.5초 노출 (텍스트가 두 줄인 경우 대비 여유 시간 확보)
        }

        // [New] 특정 품목(name)의 수량 1 감소 함수 (1개 제한이므로 삭제와 동일하게 필터링)
        function decreaseCartItemQuantity(name) {
            b2bCart = b2bCart.filter(item => item.name !== name);
            renderQuickQuoteModal();
        }

        function increaseCartItemQuantity(name, label) {}

        function clearCartItemsByName(name) {
            b2bCart = b2bCart.filter(item => item.name !== name);
            renderQuickQuoteModal();
        }

        function clearCartItemBySlot(name, cartIndex) {
            b2bCart = b2bCart.filter(item => !(item.name === name && item.cartIndex === cartIndex));
            b2bCart.forEach(item => {
                if (item.name === name && item.cartIndex > cartIndex) {
                    item.cartIndex -= 1;
                    const baseLabel = name === "신발장" ? "신발장 전체시공" : (name === "붙박이장" ? "붙박이장 전체시공" : "수납장 전체시공");
                    item.label = (item.cartIndex === 1) ? baseLabel : `${baseLabel}(${item.cartIndex})`;
                }
            });
            renderQuickQuoteModal();
        }

        function openDropdownForm(item, rowWrapper, cartIndex = 1, currentLabel = "") {
            const oldForm = document.querySelector('.dropdown-select-form');
            if (oldForm) oldForm.remove();
            const selectForm = document.createElement('div');
            selectForm.className = 'dropdown-select-form';
            selectForm.style.cssText = "margin: 8px; padding: 12px; background: #f8f9fa; border: 1px solid #4A90E2; border-radius: 8px; text-align: left; display: flex; flex-direction: column; gap: 8px; box-sizing: border-box; position: relative;";
            const titleSpan = document.createElement('span');
            titleSpan.style.cssText = "font-size: 0.85em; font-weight: bold; color: #4A90E2; padding-right: 25px;";
            let optionList = [];
            let titleText = "";
            if (!currentLabel) currentLabel = item.label;
            titleText = `⚙️ ${currentLabel} 옵션 선택:`;
            if (item.name === "방문") {
                titleText = `⚙️ 방문 시공 수량 선택:`;
                for (let i = 1; i <= 9; i++) optionList.push({ value: `문+틀 ${i}세트`, text: `문+틀 ${i}세트` });
            } else if (item.name === "화장실문") {
                titleText = `⚙️ 화장실문 시공 수량 선택:`;
                for (let i = 1; i <= 9; i++) optionList.push({ value: `문+틀 ${i}세트`, text: `문+틀 ${i}세트` });
            } else if (item.name === "문짝") {
                titleText = `⚙️ 문짝만 시공 수량 선택:`;
                for (let i = 1; i <= 9; i++) optionList.push({ value: `문 ${i}개`, text: `문 ${i}개` });
            } else if (item.name === "문틀") {
                titleText = `⚙️ 문틀만 시공 수량 선택:`;
                for (let i = 1; i <= 9; i++) optionList.push({ value: `틀 ${i}개`, text: `틀 ${i}개` });
            } else if (item.name === "방화문" || item.name === "터닝도어") {
                titleText = `⚙️ ${item.label} 수량 선택:`;
                for (let i = 1; i <= 2; i++) optionList.push({ value: `문+틀 ${i}세트`, text: `문+틀 ${i}세트` });
            } else if (item.name === "중문짝") {
                titleText = `⚙️ 중문짝만 시공 수량 선택:`;
                for (let i = 1; i <= 3; i++) optionList.push({ value: `문 ${i}개`, text: `문 ${i}개` });
            } else if (item.name === "샤시(단창) 1m" || item.name === "샤시(2중창) 1m" || item.name === "시스템샤시 1m") {
                titleText = `⚙️ ${item.label} 수량 선택:`;
                for (let i = 1; i <= 9; i++) optionList.push({ value: `샤시 ${i}세트`, text: `샤시 ${i}세트` });
            } else if (item.name === "샤시(단창) 3m" || item.name === "샤시(단창) 5m" || 
                       item.name === "샤시(2중창) 3m" || item.name === "샤시(2중창) 5m" || 
                       item.name === "시스템샤시 3m" || item.name === "시스템샤시 5m") {
                titleText = `⚙️ ${item.label} 수량 선택:`;
                for (let i = 1; i <= 9; i++) optionList.push({ value: `샤시 ${i}세트`, text: `샤시 ${i}세트` });
            } else if (item.name === "싱크대" || item.name === "싱크대 상부장" || item.name === "싱크대 하부장") {
                titleText = `⚙️ ${item.label} 길이 선택:`;
                const ranges = ["1~2m", "3~4m", "5~6m", "7~8m", "9~10m", "11~12m"];
                ranges.forEach(r => optionList.push({ value: `길이 ${r}`, text: `길이 ${r}` }));
            } else if (item.name === "신발장" || item.name === "붙박이장" || item.name === "수납장" || item.name === "냉장고장") {
                titleText = `⚙️ ${item.label} 길이 선택:`;
                const ranges = ["1~2m", "3~4m", "5~6m"];
                ranges.forEach(r => optionList.push({ value: `길이 ${r}`, text: `길이 ${r}` }));
            } else if (item.name === "신발장틀" || item.name === "냉장고장틀") {
                titleText = `⚙️ ${item.label} 수량 선택:`;
                for (let i = 1; i <= 2; i++) optionList.push({ value: `문틀 ${i}개`, text: `문틀 ${i}개` });
            } else if (item.name === "신발장문짝") {
                titleText = `⚙️ 신발장 문짝만 수량 선택:`;
                for (let i = 1; i <= 6; i++) optionList.push({ value: `문짝 ${i}개`, text: `문짝 ${i}개` });
            } else if (item.name === "붙박이장틀" || item.name === "수납장틀") {
                titleText = `⚙️ ${item.label} 수량 선택:`;
                for (let i = 1; i <= 4; i++) optionList.push({ value: `문틀 ${i}개`, text: `문틀 ${i}개` });
            } else if (item.name === "붙박이장문짝" || item.name === "수납장문짝") {
                titleText = `⚙️ ${item.label} 수량 선택:`;
                for (let i = 1; i <= 10; i++) optionList.push({ value: `문짝 ${i}개`, text: `문짝 ${i}개` });
            } else if (item.name === "냉장고장문짝") {
                titleText = `⚙️ 냉장고장 문짝만 수량 선택:`;
                for (let i = 1; i <= 8; i++) optionList.push({ value: `문짝 ${i}개`, text: `문짝 ${i}개` });
            } else if (item.name === "가벽" || item.name === "알판" || item.name === "등박스" || item.name === "웨인스코팅" || item.name === "중간알판") {
                titleText = `⚙️ ${item.label} 길이 선택:`;
                const ranges = ["1~2m", "3~4m", "5~6m", "7~8m", "9~10m"];
                ranges.forEach(r => optionList.push({ value: `길이 ${r}`, text: `길이 ${r}` }));
            }
            titleSpan.innerText = titleText;
            selectForm.appendChild(titleSpan);
            const closeBtn = document.createElement('button');
            closeBtn.className = 'dropdown-close-btn';
            closeBtn.innerHTML = '✕';
            closeBtn.style.cssText = "position: absolute; right: 12px; top: 10px; background: none; border: none; font-size: 1.15em; font-weight: bold; cursor: pointer; color: #a0aec0; padding: 4px; line-height: 1; transition: color 0.2s; font-family: sans-serif;";
            closeBtn.onmouseover = () => { closeBtn.style.color = '#e53e3e'; };
            closeBtn.onmouseout = () => { closeBtn.style.color = '#a0aec0'; };
            bindClickEffect(closeBtn, (e) => {
                e.stopPropagation();
                selectForm.remove();
            });
            selectForm.appendChild(closeBtn);
            const optionsListDiv = document.createElement('div');
            optionsListDiv.className = 'custom-dropdown-options';
            optionsListDiv.style.cssText = "display: block; position: static; box-shadow: none; border: 1px solid #cbd5e1; border-radius: 8px; max-height: 250px; overflow-y: auto; background: white; margin-top: 4px; box-sizing: border-box;";
            optionList.forEach(opt => {
                const optDiv = document.createElement('div');
                optDiv.className = 'custom-dropdown-option';
                optDiv.innerText = opt.text;
                optDiv.onclick = (e) => {
                    e.stopPropagation();
                    addCartItem(item.name, currentLabel, opt.value, 1, cartIndex);
                    selectForm.remove();
                };
                optionsListDiv.appendChild(optDiv);
            });
            selectForm.appendChild(optionsListDiv);
            rowWrapper.appendChild(selectForm);
        }

        // 공통 UI 렌더링 헬퍼 함수
        function renderModalBody(bodyContainer, parentContainer) {
            bodyContainer.innerHTML = ''; 

            const mainTabsDiv = document.createElement('div');
            mainTabsDiv.style.cssText = "display: flex; margin-bottom: 15px; background: #f0f2f5; border-radius: 8px; padding: 4px;";
            const mainTabsConfig = [
                { label: "🏠 평형별", index: 0 },
                { label: "🛒 품목별", index: 1 },
                { label: "📸 사진견적", index: 2 }
            ];
            mainTabsConfig.forEach(t => {
                const tab = document.createElement('div');
                tab.innerText = t.label;
                tab.style.cssText = `flex: 1; padding: 10px; font-weight: bold; font-size: 0.9em; border-radius: 6px; cursor: pointer; transition: 0.2s; text-align: center; ${mainTab === t.index ? 'background: white; color: #4A90E2; box-shadow: 0 2px 4px rgba(0,0,0,0.05);' : 'color: #888;'}`;
                tab.onclick = () => {
                    tab.classList.add('click-effect');
                    setTimeout(() => {
                        mainTab = t.index;
                        renderQuickQuoteModal();
                    }, 100);
                };
                mainTabsDiv.appendChild(tab);
            });
            mainTabsDiv.className = 'main-tabs-container';
            bodyContainer.appendChild(mainTabsDiv);

            if (mainTab === 0) {
                const table1 = document.createElement('table');
                table1.className = 'excel-table';
                const tr1 = document.createElement('tr');
                const tdLabel1 = document.createElement('td');
                tdLabel1.className = 'excel-label orange';
                tdLabel1.innerHTML = '아파트/빌라<br>전체견적';
                const tdValue1 = document.createElement('td');
                tdValue1.className = 'excel-value-container';
                APARTMENT_SIZES.forEach(size => {
                    const row = document.createElement('div');
                    row.className = 'excel-item-row';
                    row.innerText = `${size.replace(" 아파트", "")} 전체견적`;
                    bindClickEffect(row, () => {
                        userInput.value = `${size} 전체 견적 내주세요.`;
                        const modal = document.querySelector('.quick-quote-modal');
                        if (modal) modal.remove();
                        const inline = document.querySelector('.quick-quote-inline-container');
                        if (inline) inline.remove();
                        sendRequest();
                    });
                    tdValue1.appendChild(row);
                });
                tr1.appendChild(tdLabel1);
                tr1.appendChild(tdValue1);
                table1.appendChild(tr1);
                bodyContainer.appendChild(table1);
                const sizeRanges = [
                    { label: "20평형 세부품목", sizeText: "20평", key: "20", colorClass: "blue" },
                    { label: "30평형 세부품목", sizeText: "30평", key: "30", colorClass: "teal" },
                    { label: "40평형 세부품목", sizeText: "40평", key: "40", colorClass: "purple" },
                    { label: "50평형 세부품목", sizeText: "50평", key: "50", colorClass: "indigo" }
                ];
                sizeRanges.forEach(range => {
                    const table = document.createElement('table');
                    table.className = 'excel-table';
                    const tr = document.createElement('tr');
                    const tdLabel = document.createElement('td');
                    tdLabel.className = `excel-label ${range.colorClass}`;
                    tdLabel.innerHTML = range.label.replace(" 세부품목", "<br>세부품목");
                    const tdValue = document.createElement('td');
                    tdValue.className = 'excel-value-container';
                    const filteredItems = SIZE_ITEMS.filter(item => item.label.startsWith(range.sizeText));
                    filteredItems.forEach(item => {
                        const row = document.createElement('div');
                        row.className = 'excel-item-row';
                        const matchItems = b2bCart.filter(c => c.name === item.name);
                        const count = matchItems.reduce((acc, cur) => acc + cur.count, 0);
                        if (count > 0) {
                            row.classList.add('active');
                            row.innerHTML = `<span>${item.label}</span><div class="excel-qty-control"><span class="excel-check-badge">✓</span><button class="qty-btn remove">&times;</button></div>`;
                            const removeBtn = row.querySelector('.qty-btn.remove');
                            bindClickEffect(removeBtn, (e) => { e.stopPropagation(); clearCartItemsByName(item.name); });
                        } else {
                            row.innerText = item.label;
                            bindClickEffect(row, () => { addCartItem(item.name, item.label, "", 1); });
                        }
                        tdValue.appendChild(row);
                    });
                    tr.appendChild(tdLabel);
                    tr.appendChild(tdValue);
                    table.appendChild(tr);
                    bodyContainer.appendChild(table);
                });
            } else if (mainTab === 1) {
                const subTabsDiv = document.createElement('div');
                subTabsDiv.style.cssText = "display: flex; justify-content: space-around; margin-bottom: 12px; border-bottom: 2px solid #eee;";
                ITEM_CATEGORIES.forEach((cat, index) => {
                    const subTab = document.createElement('div');
                    subTab.innerText = cat.name;
                    subTab.style.cssText = `padding: 8px; font-weight: bold; font-size: 0.9em; cursor: pointer; border-bottom: 3px solid ${index === currentB2BTab ? '#4A90E2' : 'transparent'}; color: ${index === currentB2BTab ? '#4A90E2' : '#888'}; flex: 1; transition: all 0.2s; text-align: center;`;
                    subTab.onclick = () => { subTab.classList.add('click-effect'); setTimeout(() => { currentB2BTab = index; renderQuickQuoteModal(); }, 100); };
                    subTabsDiv.appendChild(subTab);
                });
                bodyContainer.appendChild(subTabsDiv);
                const activeCat = ITEM_CATEGORIES[currentB2BTab];
                activeCat.groups.forEach(group => {
                    const table = document.createElement('table');
                    table.className = 'excel-table';
                    const tr = document.createElement('tr');
                    let colorClass = group.accent === "accent-teal" ? "teal" : (group.accent === "accent-purple" ? "purple" : (group.accent === "accent-indigo" ? "indigo" : "blue"));
                    const tdLabel = document.createElement('td');
                    tdLabel.className = `excel-label ${colorClass}`;
                    tdLabel.innerHTML = group.title.replace(" ", "<br>");
                    const tdValue = document.createElement('td');
                    tdValue.className = 'excel-value-container';
                    let lastSubHeader = "";
                    group.items.forEach(item => {
                        if (item.sub && item.sub !== lastSubHeader) {
                            if (lastSubHeader !== "") { const divider = document.createElement('div'); divider.style.cssText = "border-top: 1px solid #edf2f7; margin: 8px 16px; clear: both;"; tdValue.appendChild(divider); }
                            const subHeaderDiv = document.createElement('div');
                            subHeaderDiv.style.cssText = "font-size: 0.82em; font-weight: bold; color: #4A90E2; margin: 10px 16px 4px; display: flex; align-items: center; gap: 6px; clear: both; text-align: left;";
                            subHeaderDiv.innerHTML = `<span style="display:inline-block; width:5px; height:5px; background:#4A90E2; border-radius:50%;"></span> ${item.sub}`;
                            tdValue.appendChild(subHeaderDiv);
                            lastSubHeader = item.sub;
                        }
                        const isMultiAllow = (item.name === "신발장" || item.name === "붙박이장" || item.name === "수납장");
                        const limit = (item.name === "신발장") ? 2 : (isMultiAllow ? 5 : 1);
                        for (let slotIndex = 1; slotIndex <= limit; slotIndex++) {
                            if (slotIndex > 1) { const prevSlotExists = b2bCart.some(c => c.name === item.name && c.cartIndex === (slotIndex - 1)); if (!prevSlotExists) break; }
                            const rowWrapper = document.createElement('div');
                            rowWrapper.style.cssText = "position: relative; width: 100%; margin-bottom: 4px;";
                            const row = document.createElement('div');
                            row.className = 'excel-item-row';
                            const currentLabel = (slotIndex === 1) ? item.label : `${item.label}(${slotIndex})`;
                            const slotItem = b2bCart.find(c => c.name === item.name && c.cartIndex === slotIndex);
                            if (slotItem) {
                                row.classList.add('active');
                                row.innerHTML = `<span class="qty-item-name-btn" style="cursor: pointer; flex: 1; text-align: left; display: flex; flex-direction: column; justify-content: center; padding: 2px 0;"><span style="display: block; line-height: 1.3;">${currentLabel}</span>${slotItem.option ? `<span style="font-size: 0.82em; color: #4A90E2; display: block; font-weight: normal; margin-top: 2px; line-height: 1.2;">↳ 선택: ${slotItem.option}</span>` : ""}</span><div class="excel-qty-control" style="display: flex; align-items: center; align-self: center;"><span class="excel-check-badge">✓</span><button class="qty-btn remove">&times;</button></div>`;
                                bindClickEffect(row.querySelector('.qty-item-name-btn'), (e) => { e.stopPropagation(); if (item.type.includes('-dropdown')) openDropdownForm(item, rowWrapper, slotIndex, currentLabel); else addCartItem(item.name, currentLabel, "", 1, slotIndex); });
                                bindClickEffect(row.querySelector('.qty-btn.remove'), (e) => { e.stopPropagation(); clearCartItemBySlot(item.name, slotIndex); });
                            } else {
                                row.innerText = currentLabel;
                                bindClickEffect(row, () => { if (item.type.includes('-dropdown')) openDropdownForm(item, rowWrapper, slotIndex, currentLabel); else addCartItem(item.name, currentLabel, "", 1, slotIndex); });
                            }
                            rowWrapper.appendChild(row);
                            tdValue.appendChild(rowWrapper);
                        }
                    });
                    tr.appendChild(tdLabel);
                    tr.appendChild(tdValue);
                    table.appendChild(tr);
                    bodyContainer.appendChild(table);
                });
            } else {
                const photoCard = document.createElement('div');
                photoCard.style.cssText = "padding: 25px 20px; border-radius: 12px; border: 2px dashed #cbd5e1; background: #f8fafc; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 15px; margin-top: 10px;";
                photoCard.innerHTML = `<div style="font-weight: bold; font-size: 1.15em; color: #1a202c;">📸 사진 찍어서 빠른 견적 받기</div><div style="font-size: 0.88em; color: #64748b; white-space: pre-line; line-height: 1.5; margin-bottom: 5px;">시공할 현장 사진을 촬영하여 올려주시면<br>AI가 사진을 실시간 분석해 1분안에 견적을 계산해 드립니다.</div>`;
                const uploadBtn = document.createElement('button');
                uploadBtn.style.cssText = "display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; max-width: 260px; padding: 12px 24px; background: #4A90E2; color: white; border: none; border-radius: 30px; font-weight: bold; font-size: 1.0em; cursor: pointer; box-shadow: 0 4px 6px rgba(74, 144, 226, 0.2);";
                uploadBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>보관된 사진 선택`;
                bindClickEffect(uploadBtn, () => { document.getElementById('imageInput').click(); });
                const cameraBtn = document.createElement('button');
                cameraBtn.style.cssText = "display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; max-width: 260px; padding: 12px 24px; background: #2ecc71; color: white; border: none; border-radius: 30px; font-weight: bold; font-size: 1.0em; cursor: pointer; box-shadow: 0 4px 6px rgba(46, 204, 113, 0.2);";
                cameraBtn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                        <circle cx="12" cy="13" r="4"></circle>
                    </svg>
                    실시간 촬영하기
                `;
                bindClickEffect(cameraBtn, () => {
                    document.getElementById('cameraInput').click();
                });
                photoCard.appendChild(uploadBtn);
                photoCard.appendChild(cameraBtn);
                bodyContainer.appendChild(photoCard);
            }

            // 3. 실시간 장바구니 리스트 영역 렌더링 (평형별, 품목별 탭에서만 장바구니 노출)
            if (mainTab !== 2 && b2bCart.length > 0) {
                const cartListContainer = document.createElement('div');
                cartListContainer.className = "floating-cart-list";
                cartListContainer.style.cssText = "margin-top: 20px; border-top: 2px dashed #e2e8f0; padding-top: 15px; text-align: left; transition: all 0.2s; border-radius: 12px; padding: 12px; background: #f8fafc; border: 1px solid #edf2f7;";

                const cartHeader = document.createElement('div');
                cartHeader.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 0.88em; font-weight: bold; color: #4A90E2;";
                cartHeader.innerHTML = `<span>🛒 담긴 견적 품목 목록</span> <span>총 ${b2bCart.length}종류</span>`;
                cartListContainer.appendChild(cartHeader);

                const listWrapper = document.createElement('div');
                listWrapper.style.cssText = "display: flex; flex-direction: column; gap: 8px; max-height: 150px; overflow-y: auto; margin-bottom: 15px; padding-right: 5px;";

                b2bCart.forEach(item => {
                    const row = document.createElement('div');
                    row.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: white; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 8px; font-size: 0.9em; box-shadow: 0 1px 2px rgba(0,0,0,0.02);";

                    const optText = item.option ? ` (${item.option})` : "";

                    const infoSpan = document.createElement('span');
                    infoSpan.style.cssText = "font-weight: 500; color: #334155; display: inline-flex; align-items: center;";
                    infoSpan.innerHTML = `<span style="color:#4A90E2; font-weight:bold; margin-right:5px;">•</span> ${item.label}${optText}`;

                    const deleteBtn = document.createElement('button');
                    deleteBtn.innerHTML = "×";
                    deleteBtn.style.cssText = "background: #f1f5f9; color: #64748b; border: none; border-radius: 50%; width: 22px; height: 22px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px; transition: all 0.2s;";
                    deleteBtn.onmouseover = () => { deleteBtn.style.background = '#fee2e2'; deleteBtn.style.color = '#ef4444'; };
                    deleteBtn.onmouseout = () => { deleteBtn.style.background = '#f1f5f9'; deleteBtn.style.color = '#64748b'; };

                    bindClickEffect(deleteBtn, () => {
                        removeCartItem(item.id);
                    });

                    row.appendChild(infoSpan);
                    row.appendChild(deleteBtn);
                    listWrapper.appendChild(row);
                });
                cartListContainer.appendChild(listWrapper);

                // 4. 하단 액션 버튼부 수평 배치 (🔄 전체 초기화 vs 🛒 견적내기)
                const actionDiv = document.createElement('div');
                actionDiv.style.cssText = "display: flex; gap: 10px; width: 100%; box-sizing: border-box;";

                const resetBtn = document.createElement('button');
                resetBtn.innerHTML = "🔄 전체 초기화";
                resetBtn.style.cssText = "flex: 1; padding: 14px; background: #e2e8f0; color: #475569; border: none; border-radius: 8px; font-weight: bold; font-size: 0.98em; cursor: pointer; transition: 0.2s;";
                resetBtn.onmouseover = () => { resetBtn.style.background = '#cbd5e1'; };
                resetBtn.onmouseout = () => { resetBtn.style.background = '#e2e8f0'; };

                bindClickEffect(resetBtn, () => {
                    b2bCart = [];
                    renderQuickQuoteModal();
                });

                const submitBtn = document.createElement('button');
                submitBtn.innerHTML = `🛒 ${b2bCart.length}개 견적내기`;
                submitBtn.style.cssText = "flex: 1.6; padding: 14px; background: linear-gradient(135deg, #4A90E2, #357ABD); color: white; border: none; border-radius: 8px; font-weight: bold; font-size: 0.98em; cursor: pointer; box-shadow: 0 4px 10px rgba(74, 144, 226, 0.3);";

                bindClickEffect(submitBtn, () => {
                    const requestTexts = [];

                    b2bCart.forEach(item => {
                        let text = "";
                        if (item.option) {
                            // 범위형 옵션 최댓값(뒷숫자) 추출 대상 품목 정의
                            const rangeItems = ["싱크대", "신발장", "붙박이장", "수납장", "냉장고장", "가벽", "알판", "등박스", "웨인스코팅", "중간알판", "룸박스"];
                            const isRangeItem = rangeItems.some(k => item.name.includes(k) || k.includes(item.name));

                            if (isRangeItem && item.option.includes("~")) {
                                // 예: "길이 3~4m" -> split('~')[1] -> "4m" 추출
                                let mVal = item.option.split("~")[1] || item.option;
                                mVal = mVal.trim();
                                // 혹시 "m" 단위가 누락된 경우 붙여서 보냄
                                if (!mVal.toLowerCase().includes("m") && !mVal.includes("미터")) {
                                    mVal += "m";
                                }
                                text = `${item.name} ${mVal}`;
                            } else {
                                text = `${item.name} ${item.option}`;
                            }
                        } else {
                            text = item.label;
                        }
                        if (text) requestTexts.push(text);
                    });

                    const finalRequest = requestTexts.join(", ");
                    userInput.value = finalRequest;

                    b2bCart = [];
                    const existingModal = document.querySelector('.quick-quote-modal');
                    if (existingModal) existingModal.remove();
                    const inlineContainer = document.querySelector('.quick-quote-inline-container');
                    if (inlineContainer) inlineContainer.remove();
                    sendRequest();
                });

                actionDiv.appendChild(resetBtn);
                actionDiv.appendChild(submitBtn);
                cartListContainer.appendChild(actionDiv);
                bodyContainer.appendChild(cartListContainer);
            }

            // 장바구니 플로팅 배지/버튼 생성 및 제어 (B2B 품목별/평형별 탭 전용)
            const isInline = !parentContainer.classList.contains('quick-quote-modal') && !parentContainer.classList.contains('quick-quote-modal-content');
            
            // inline 모드에서는 body에 직접 붙여서 뷰포트에 띄우고, 모달 모드에서는 모달 콘텐츠 내부에 붙입니다.
            const badgeContainer = isInline ? document.body : parentContainer.querySelector('.quick-quote-modal-content');
            
            if (badgeContainer) {
                const existingBadge = document.querySelector('.floating-cart-badge');
                if (existingBadge) existingBadge.remove();

                if (mainTab !== 2 && b2bCart.length > 0) {
                    const badge = document.createElement('div');
                    badge.className = 'floating-cart-badge';
                    badge.innerHTML = `🛒 장바구니 ${b2bCart.length}개`;
                    
                    if (isInline) {
                        badge.style.cssText = `
                            position: fixed;
                            right: 20px;
                            bottom: 85px;
                            background: #ff4757;
                            color: white;
                            padding: 12px 20px;
                            border-radius: 30px;
                            font-weight: bold;
                            font-size: 0.95em;
                            box-shadow: 0 4px 16px rgba(255, 71, 87, 0.5);
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            z-index: 99999;
                            transition: opacity 0.25s ease, transform 0.2s ease, background-color 0.2s ease;
                            border: 2px solid white;
                        `;
                    } else {
                        badge.style.cssText = `
                            position: absolute;
                            right: 20px;
                            bottom: 20px;
                            background: #ff4757;
                            color: white;
                            padding: 10px 16px;
                            border-radius: 30px;
                            font-weight: bold;
                            font-size: 0.9em;
                            box-shadow: 0 4px 12px rgba(255, 71, 87, 0.4);
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            z-index: 10000;
                            transition: opacity 0.25s ease, transform 0.2s ease, background-color 0.2s ease;
                            border: 2px solid white;
                        `;
                    }
                    
                    badge.onmouseover = () => {
                        badge.style.background = '#ff6b81';
                        badge.style.transform = 'scale(1.05)';
                    };
                    badge.onmouseout = () => {
                        badge.style.background = '#ff4757';
                        badge.style.transform = 'scale(1)';
                    };
                    
                    bindClickEffect(badge, () => {
                        if (isInline) {
                            const cartEl = parentContainer.querySelector('.floating-cart-list') || parentContainer;
                            if (cartEl) {
                                cartEl.scrollIntoView({ behavior: 'smooth', block: 'end' });
                            }
                        } else {
                            const modalBody = parentContainer.querySelector('#modalBody');
                            if (modalBody) {
                                modalBody.scrollTo({ top: modalBody.scrollHeight, behavior: 'smooth' });
                            }
                        }
                    });
                    
                    badgeContainer.appendChild(badge);

                    // 스크롤 포지션 즉시 수동 체크 (모달 모드만 해당)
                    if (!isInline) {
                        const modalBody = parentContainer.querySelector('#modalBody');
                        if (modalBody && modalBody.onscroll) {
                            modalBody.onscroll();
                        }
                    }
                }
            }
        }

        // 퀵 메뉴(장바구니) 표시 함수 (전체화면 모달화 및 이중스크롤 제거)
        function renderQuickQuoteModal() {
            const isInline = (chatHistory.length === 0);

            if (isInline) {
                // 1. 인라인 모드: 대화 시작 전에 웰컴 카드 아래에 상시 노출
                // 기존 모달 오버레이가 열려 있다면 닫는다.
                const existingModal = document.querySelector('.quick-quote-modal');
                if (existingModal) existingModal.remove();

                // 간편견적 열기 버튼도 숨긴다.
                const existingBtn = document.querySelector('.open-quick-quote-btn');
                if (existingBtn) existingBtn.remove();

                let inlineContainer = document.querySelector('.quick-quote-inline-container');
                if (!inlineContainer) {
                    inlineContainer = document.createElement('div');
                    inlineContainer.className = 'quick-quote-inline-container';
                    inlineContainer.style.cssText = "width: 100%; max-width: 100%; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-top: 15px; margin-bottom: 25px; overflow: hidden; box-sizing: border-box;";
                    
                    inlineContainer.innerHTML = `
                        <!-- 헤더 (닫기 버튼 없음) -->
                        <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center; padding:15px 20px; border-bottom:1px solid #edf2f7; background:#ffffff;">
                            <span style="font-weight:bold; font-size:1.15em; color:#1a202c; display:flex; align-items:center; gap:6px;">
                                🛠️ 1분 간편견적 선택
                            </span>
                        </div>
                        <!-- 내용 본문 영역 -->
                        <div class="quick-quote-modal-body" id="modalBody" style="padding: 15px; max-height: none; overflow-y: visible;"></div>
                    `;
                    chatContainer.appendChild(inlineContainer);
                }

                // 렌더링 대상 컨테이너를 지정
                const bodyContainer = inlineContainer.querySelector('#modalBody');
                renderModalBody(bodyContainer, inlineContainer);

            } else {
                // 2. 모달 팝업 모드: 대화 기록이 있을 때
                // 기존 인라인 컨테이너가 남아있으면 제거
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

                    // 닫기 버튼 이벤트 연결
                    const closeBtn = modal.querySelector('.modal-close-btn');
                    closeBtn.onmouseover = () => { closeBtn.style.color = '#e53e3e'; };
                    closeBtn.onmouseout = () => { closeBtn.style.color = '#a0aec0'; };
                    bindClickEffect(closeBtn, () => {
                        modal.remove();
                        addOpenQuickQuoteButton();
                    });

                    modal.onclick = (e) => {
                        if (e.target === modal) {
                            modal.remove();
                            addOpenQuickQuoteButton();
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
        }

        // 페이지 로드 시 기존 기록 복원
        loadChatHistory();

        // 첫 접속 시 환영 인사 및 간편메뉴 자동 표시 (가맹점 정보 획득 완료 후 실행)
        function renderWelcomeIfNeeded() {
            if (chatHistory.length === 0) {
                if (document.querySelector('.welcome-card-bubble')) return;

                const partnerData = currentPartner || {};
                const ceo = partnerData.ceo_name || '김정헌';
                const pos = partnerData.position || '실장';
                const phone = partnerData.phone || '010-6657-1222';

                const blog = partnerData.blog_url || '';
                const insta = partnerData.insta_url || '';
                const kakao = partnerData.kakao_url || '';

                const socialHtml = (blog || insta || kakao) ? `
                    <div class="welcome-partner-socials" style="display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 0px;">
                        ${blog ? `<a href="${blog}" target="_blank" style="display:inline-block; padding:2px 6px; background:#03C75A; color:white; text-decoration:none; border-radius:4px; font-size:0.85em; font-weight:bold;">블</a>` : ''}
                        ${insta ? `<a href="${insta}" target="_blank" style="display:inline-block; padding:2px 6px; background:linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888); color:white; text-decoration:none; border-radius:4px; font-size:0.85em; font-weight:bold;">인</a>` : ''}
                        ${kakao ? `<a href="${kakao}" target="_blank" style="display:inline-block; padding:2px 6px; background:#FEE500; color:#3c1e1e; text-decoration:none; border-radius:4px; font-size:0.85em; font-weight:bold;">카</a>` : ''}
                    </div>
                ` : '';

                const welcomeMsg = `
<div class="intro-card" style="text-align: center; font-family: sans-serif; padding: 5px 0; width: 100%; box-sizing: border-box;">
    <h2 style="font-size: 1.5em; font-weight: 800; color: #1a202c; margin: 10px 0 5px; letter-spacing: -0.5px;">필름견적 한번에 OK!</h2>
    <p style="font-size: 0.95em; color: #4a5568; line-height: 1.5; margin: 0 0 15px;">
        <strong style="color: #4A90E2; font-weight: 800;">1분이내 견적 OK!</strong>
    </p>
    
    <div style="display: flex; justify-content: center; gap: 15px; margin-bottom: 20px;">
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 75px; height: 75px; border-radius: 50%; background: #ebf8ff; border: 2.5px solid #3182ce; box-shadow: 0 4px 6px rgba(49, 130, 206, 0.15); box-sizing: border-box;">
            <span style="font-size: 1.5em; line-height: 1; margin-bottom: 3px;">🏠</span>
            <span style="font-size: 0.75em; color: #2b6cb0; font-weight: 800; letter-spacing: -0.5px;">평형별</span>
        </div>
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 75px; height: 75px; border-radius: 50%; background: #ebf8ff; border: 2.5px solid #3182ce; box-shadow: 0 4px 6px rgba(49, 130, 206, 0.15); box-sizing: border-box;">
            <span style="font-size: 1.5em; line-height: 1; margin-bottom: 3px;">🛒</span>
            <span style="font-size: 0.75em; color: #2b6cb0; font-weight: 800; letter-spacing: -0.5px;">품목별</span>
        </div>
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 75px; height: 75px; border-radius: 50%; background: #ebf8ff; border: 2.5px solid #3182ce; box-shadow: 0 4px 6px rgba(49, 130, 206, 0.15); box-sizing: border-box;">
            <span style="font-size: 1.5em; line-height: 1; margin-bottom: 3px;">📸</span>
            <span style="font-size: 0.75em; color: #2b6cb0; font-weight: 800; letter-spacing: -0.5px;">사진견적</span>
        </div>
    </div>

    <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; height: 135px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 15px; box-sizing: border-box; margin-bottom: 20px;">
        <div style="position: relative; width: 65px; height: 110px; border: 2.5px solid #2d3748; border-radius: 10px; background: #fff; box-shadow: 0 4px 8px rgba(0,0,0,0.06); overflow: hidden; flex-shrink: 0; box-sizing: border-box;">
            <div style="position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 26px; height: 4px; background: #2d3748; border-bottom-left-radius: 2.5px; border-bottom-right-radius: 2.5px; z-index: 10;"></div>
            <img src="https://images.unsplash.com/photo-1556740749-887f6717d7e4?w=400&q=80&auto=format&fit=crop" style="width: 100%; height: 100%; object-fit: cover;" alt="견적상담">
            <div style="position: absolute; inset: 5px; border: 1px dashed rgba(255,255,255,0.7); border-radius: 2.5px; pointer-events: none;"></div>
        </div>

        <div style="display: flex; flex-direction: column; justify-content: center; gap: 15px; flex: 1; height: 100%; margin: 0 8px; position: relative;">
            <div style="display: flex; align-items: center; justify-content: center; width: 100%;">
                <div style="flex: 1; border-top: 1.5px dashed #cbd5e1; height: 0;"></div>
                <div style="background: #eef2f7; border: 1.5px solid #cbd5e0; border-radius: 20px; padding: 3px 8px; font-size: 0.7em; font-weight: bold; color: #4a5568; white-space: nowrap; margin: 0 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    🕒 1min
                </div>
                <div style="flex: 1; border-top: 1.5px dashed #cbd5e1; height: 0;"></div>
            </div>
            <div style="display: flex; align-items: center; justify-content: center; width: 100%;">
                <div style="flex: 1; border-top: 1.5px dashed #cbd5e1; height: 0;"></div>
                <div style="background: #eef2f7; border: 1.5px solid #cbd5e0; border-radius: 20px; padding: 3px 8px; font-size: 0.7em; font-weight: bold; color: #4a5568; white-space: nowrap; margin: 0 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                    🕒 1min
                </div>
                <div style="flex: 1; border-top: 1.5px dashed #cbd5e1; height: 0;"></div>
            </div>
        </div>

        <div style="position: relative; width: 48px; height: 68px; background: #fff; border: 2px solid #cbd5e0; border-radius: 6px; box-shadow: 0 4px 8px rgba(0,0,0,0.04); padding: 5px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; flex-shrink: 0;">
            <div style="width: 100%; height: 4px; background: #4A90E2; border-radius: 1px;"></div>
            <div style="display: flex; flex-direction: column; gap: 3px; margin-top: 4px; flex: 1;">
                <div style="width: 85%; height: 2px; background: #edf2f7; border-radius: 1px;"></div>
                <div style="width: 60%; height: 2px; background: #edf2f7; border-radius: 1px;"></div>
                <div style="width: 90%; height: 2px; background: #edf2f7; border-radius: 1px;"></div>
            </div>
            <div style="display: flex; justify-content: flex-end; align-items: center; line-height: 1;">
                <span style="font-size: 0.7em; color: #4A90E2; font-weight: bold;">✔</span>
            </div>
        </div>
    </div>

    <div style="margin-top: 15px; padding-top: 15px; border-top: 2px dashed #eee; text-align: center; width: 100%; box-sizing: border-box;">
        <div style="display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; width: 100%;">
            <span class="welcome-partner-name" style="font-weight: bold; font-size: 1.0em; color: #333; margin-right: 5px;">문의 : ${ceo} ${pos}</span>
            <div class="welcome-partner-socials-container" style="display: inline-block;">${socialHtml}</div>
        </div>
        <a href="tel:${phone}" class="welcome-partner-phone" style="display: block; width: 100%; box-sizing: border-box; background: white; border: 2px solid #4A90E2; color: #4A90E2; text-decoration: none; font-weight: 800; font-size: 1.3em; padding: 12px; border-radius: 12px; margin-bottom: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); outline: none;">
            📞 <span class="phone-text">${phone}</span>
        </a>
    </div>
</div>
`;
                const welcomeBubble = addBubble(welcomeMsg, 'bot', false, false);
                welcomeBubble.classList.add('welcome-card-bubble');

                setTimeout(() => {
                    renderQuickQuoteModal();
                }, 300);
            } else {
                setTimeout(() => {
                    addOpenQuickQuoteButton();
                }, 500);
            }
        }

        // [New] 백그라운드 API 응답 결과를 웰컴 카드의 명함 영역에 동적으로 덮어쓰는 헬퍼 함수
        function updateWelcomeCardWithPartner(partnerData) {
            const welcomeCard = document.querySelector('.welcome-card-bubble');
            if (!welcomeCard) return;

            const ceo = partnerData.ceo_name || '김정헌';
            const pos = partnerData.position || '실장';
            const phone = partnerData.phone || '010-6657-1222';

            const blog = partnerData.blog_url || '';
            const insta = partnerData.insta_url || '';
            const kakao = partnerData.kakao_url || '';

            // 1. 문의처 담당자명 텍스트 업데이트
            const nameEl = welcomeCard.querySelector('.welcome-partner-name');
            if (nameEl) {
                nameEl.textContent = `문의 : ${ceo} ${pos}`;
            }

            // 2. 소셜 SNS 링크 영역 업데이트
            const socialsEl = welcomeCard.querySelector('.welcome-partner-socials-container');
            if (socialsEl) {
                const socialHtml = (blog || insta || kakao) ? `
                    <div class="welcome-partner-socials" style="display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 0px;">
                        ${blog ? `<a href="${blog}" target="_blank" style="display:inline-block; padding:2px 6px; background:#03C75A; color:white; text-decoration:none; border-radius:4px; font-size:0.85em; font-weight:bold;">블</a>` : ''}
                        ${insta ? `<a href="${insta}" target="_blank" style="display:inline-block; padding:2px 6px; background:linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888); color:white; text-decoration:none; border-radius:4px; font-size:0.85em; font-weight:bold;">인</a>` : ''}
                        ${kakao ? `<a href="${kakao}" target="_blank" style="display:inline-block; padding:2px 6px; background:#FEE500; color:#3c1e1e; text-decoration:none; border-radius:4px; font-size:0.85em; font-weight:bold;">카</a>` : ''}
                    </div>
                ` : '';
                socialsEl.innerHTML = socialHtml;
            }

            // 3. 전화번호 링크 및 표시 텍스트 업데이트
            const phoneLinkEl = welcomeCard.querySelector('.welcome-partner-phone');
            if (phoneLinkEl) {
                phoneLinkEl.href = `tel:${phone}`;
                const phoneTextEl = phoneLinkEl.querySelector('.phone-text');
                if (phoneTextEl) {
                    phoneTextEl.textContent = phone;
                } else {
                    phoneLinkEl.innerHTML = `📞 <span class="phone-text">${phone}</span>`;
                }
            }
        }

        // [New] 이벤트 위임을 통한 공유하기 버튼 클릭 감지 보장 (백엔드 onclick 누락 방어)
        document.getElementById('chatContainer').addEventListener('click', function(e) {
            const btn = e.target.closest('.share-quote-btn') || 
                        (e.target.textContent && e.target.textContent.includes('공유하기') && e.target.textContent.trim().length < 30 ? e.target : null);
            if (btn) {
                shareQuote(btn);
            }
        });

        // [New] 카카오톡 인앱 브라우저에서 target="_blank" 링크 클릭 시 외부 브라우저(새창)로 열기 강제화
        document.addEventListener('click', function(e) {
            const anchor = e.target.closest('a');
            if (anchor && anchor.href && anchor.target === '_blank') {
                if (anchor.href.startsWith('http')) {
                    const userAgent = navigator.userAgent.toLowerCase();
                    if (userAgent.includes('kakaotalk')) {
                        e.preventDefault();
                        window.location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(anchor.href);
                    }
                }
            }
        });

        // [New] 추천 품목 클릭 시 즉시 텍스트 견적을 요청하는 전역 함수 정의
        window.sendQuickTextRequest = async function(text) {
            userInput.value = text;
            await sendRequest(false);
        };

        // [New] 전체 품목 보기를 트리거하는 전역 매핑
        window.showQuickButtons = function() {
            const existingBtn = document.querySelector('.open-quick-quote-btn');
            if (existingBtn) existingBtn.remove();
            const existingMenu = document.querySelector('.quick-reply-container');
            if (existingMenu) existingMenu.remove();
            renderQuickQuoteModal();
        };

        // 모든 변수 및 DOM 엘리먼트 정의가 완료된 후 실행
        renderWelcomeIfNeeded();
        loadPartnerInfo();