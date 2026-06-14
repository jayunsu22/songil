document.addEventListener('DOMContentLoaded', async () => {
    const toast = document.getElementById('toast');
    
    // n8n 웹훅 URL 세팅 (사장님이 만들어주신 Production URL)
    // 참고: 스샷 확인 결과 GET/POST 모두 'dashboard-save' 경로로 만드셔서 그대로 적용했습니다!
    const WEBHOOK_GET_URL = "https://primary-production-a6fa.up.railway.app/webhook/dashboard-save"; 
    const WEBHOOK_POST_URL = "https://primary-production-a6fa.up.railway.app/webhook/dashboard-save";

    // 글로벌 단가
    let globalMaterialPrice = 9000; 
    let mockItems = []; // 서버에서 받아올 빈 배열
    let partnerRecordId = '';
    let currentPriceCategory = 'pyeong';
    let mockInquiries = [];

    function showToast(message, type = 'success') {
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        setTimeout(() => { toast.className = 'toast'; }, 3000);
    }

    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('id');
    let partnerId = localStorage.getItem('partner_id');
    
    if (urlToken) {
        localStorage.setItem('partner_id', urlToken);
        partnerId = urlToken;
    } else if (partnerId) {
        // 주소창에 id가 없지만 기존 로그인이 있으면 주소창에 표시되도록 강제로 붙여줍니다.
        try {
            const newUrl = window.location.pathname + '?id=' + partnerId + window.location.hash;
            window.history.replaceState({}, document.title, newUrl);
        } catch (e) {
            console.warn('replaceState blocked on file:// protocol', e);
        }
    }

    if (document.getElementById('dashboardContent')) {
        if (!partnerId) {
            window.location.href = 'dashboard_index.html';
            return;
        }

        document.getElementById('logoutBtn').addEventListener('click', () => {
            if(confirm("기기에서 연결을 해제하시겠습니까?")) {
                localStorage.removeItem('partner_id');
                window.location.href = 'dashboard_index.html';
            }
        });

        document.querySelectorAll('.main-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.main-tabs .tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                e.target.classList.add('active');
                document.getElementById(e.target.dataset.target).classList.add('active');
            });
        });

        // 가격 카테고리 탭 클릭 이벤트 추가
        document.querySelectorAll('#priceCategoryTabs .category-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#priceCategoryTabs .category-tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                currentPriceCategory = e.target.dataset.category;
                renderAccordionList(mockItems);
            });
        });

        const globalPriceTxt = document.getElementById('globalMaterialPriceTxt');
        const globalPriceEditWrap = document.getElementById('globalMaterialPriceEditWrap');
        const globalPriceInput = document.getElementById('globalMaterialPriceInput');
        const editGlobalBtn = document.getElementById('editGlobalPriceBtn');
        
        editGlobalBtn.addEventListener('click', async () => {
            if (globalPriceEditWrap.style.display === 'none') {
                globalPriceTxt.style.display = 'none';
                globalPriceEditWrap.style.display = 'flex';
                globalPriceInput.value = globalMaterialPrice; // Populate input with current price
                globalPriceInput.focus();
                editGlobalBtn.textContent = '저장';
                editGlobalBtn.style.background = 'var(--text-main)';
                editGlobalBtn.style.color = 'white';
            } else {
                let newPrice = Number(globalPriceInput.value);
                if (newPrice < 0) newPrice = 0;
                
                // Optimistic UI Update: update values immediately
                const originalPrice = globalMaterialPrice;
                globalMaterialPrice = newPrice;
                globalPriceTxt.textContent = newPrice.toLocaleString() + '원';
                
                globalPriceEditWrap.style.display = 'none';
                globalPriceTxt.style.display = 'block';
                editGlobalBtn.textContent = '수정';
                editGlobalBtn.style.background = 'var(--bg-card)';
                editGlobalBtn.style.color = 'var(--text-main)';
                
                mockItems.forEach(item => calcTotal(item.id));
                
                // Async API Call to save
                try {
                    const response = await fetch(WEBHOOK_POST_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            partnerId: partnerId,
                            type: 'global',
                            globalMaterialPrice: newPrice
                        })
                    });
                    if (!response.ok) throw new Error('서버 응답 오류');
                    showToast('공통 자재비 단가가 업데이트 되었습니다.');
                } catch (error) {
                    // Rollback to original price on failure
                    globalMaterialPrice = originalPrice;
                    globalPriceTxt.textContent = originalPrice.toLocaleString() + '원';
                    mockItems.forEach(item => calcTotal(item.id));
                    showToast('서버 저장에 실패했습니다. 기존 단가로 롤백됩니다.', 'error');
                }
            }
        });

        const editPartnerNameBtn = document.getElementById('editPartnerNameBtn');
        const partnerNameInput = document.getElementById('partnerNameInput');
        
        editPartnerNameBtn.addEventListener('click', async () => {
            const newName = partnerNameInput.value.trim();
            if (!newName) {
                showToast('업체명을 입력해주세요.', 'error');
                return;
            }
            
            try {
                const response = await fetch(WEBHOOK_POST_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        partnerId: partnerId,
                        type: 'partner',
                        partnerRecordId: partnerRecordId,
                        partnerName: newName
                    })
                });
                if (!response.ok) {
                    throw new Error('네트워크 응답 오류');
                }
            } catch (error) {
                showToast('서버 저장에 실패했습니다.', 'error');
                return;
            }

            document.getElementById('companyName').textContent = newName;
            showToast('업체명이 업데이트 되었습니다.');
        });

        async function savePartnerField(payload, successMessage) {
            try {
                const response = await fetch(WEBHOOK_POST_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        partnerId: partnerId,
                        type: 'partner',
                        partnerRecordId: partnerRecordId,
                        ...payload
                    })
                });
                if (!response.ok) {
                    throw new Error('네트워크 응답 오류');
                }
                showToast(successMessage, 'success');
            } catch (error) {
                showToast('서버 저장에 실패했습니다.', 'error');
            }
        }

        document.getElementById('editMgrNameBtn').addEventListener('click', () => {
            const val = document.getElementById('mgrName').value.trim();
            savePartnerField({ ceoName: val }, '담당자 이름이 업데이트 되었습니다.');
        });

        document.getElementById('editMgrTitleBtn').addEventListener('click', () => {
            const val = document.getElementById('mgrTitle').value.trim();
            savePartnerField({ position: val }, '담당자 직책이 업데이트 되었습니다.');
        });

        document.getElementById('editMgrPhoneBtn').addEventListener('click', () => {
            const val = document.getElementById('mgrPhone').value.trim();
            savePartnerField({ phone: val }, '전화번호가 업데이트 되었습니다.');
        });

        document.getElementById('editQuoteNoticeBtn').addEventListener('click', () => {
            const val = document.getElementById('quoteNotice').value.trim();
            savePartnerField({ notice: val }, '견적서 공통 안내문구가 업데이트 되었습니다.');
        });

        document.getElementById('editPageTitleBtn').addEventListener('click', () => {
            const val = document.getElementById('pageTitle').value.trim();
            localStorage.setItem('saved_page_title_' + partnerId, val);
            showToast('페이지 제목이 업데이트 되었습니다.', 'success');
        });

        // SNS 주소 수정 버튼 공통 핸들러
        function handleSnsEdit(typeSuffix, bodyKey, storageKeyPrefix, displayName) {
            const inputEl = document.getElementById(`url${typeSuffix}`);
            const toggleBtn = document.getElementById(`toggle${typeSuffix}Btn`);
            const val = inputEl.value.trim();
            const fullStorageKey = storageKeyPrefix + partnerId;

            localStorage.setItem(fullStorageKey, val);

            if (toggleBtn.classList.contains('active')) {
                savePartnerField({ [bodyKey]: val }, `${displayName} 주소가 업데이트 되었습니다.`);
            } else {
                showToast(`${displayName} 주소가 로컬에 저장되었습니다.\n(감추기 상태에서는 고객 견적서에 노출되지 않습니다.)`, 'success');
            }
        }

        document.getElementById('editUrlHomeBtn').addEventListener('click', () => {
            handleSnsEdit('Home', 'homeUrl', 'saved_url_home_', '홈페이지');
        });
        document.getElementById('editUrlBlogBtn').addEventListener('click', () => {
            handleSnsEdit('Blog', 'blogUrl', 'saved_url_blog_', '블로그');
        });
        document.getElementById('editUrlInstaBtn').addEventListener('click', () => {
            handleSnsEdit('Insta', 'instaUrl', 'saved_url_insta_', '인스타그램');
        });
        document.getElementById('editUrlKakaoBtn').addEventListener('click', () => {
            handleSnsEdit('Kakao', 'kakaoUrl', 'saved_url_kakao_', '오픈채팅');
        });

        // SNS 토글 버튼 공통 핸들러
        async function handleSnsToggle(typeSuffix, bodyKey, storageKeyPrefix, displayName) {
            const inputEl = document.getElementById(`url${typeSuffix}`);
            const toggleBtn = document.getElementById(`toggle${typeSuffix}Btn`);
            const val = inputEl.value.trim();
            const fullStorageKey = storageKeyPrefix + partnerId;

            if (toggleBtn.classList.contains('active')) {
                toggleBtn.classList.remove('active');
                toggleBtn.textContent = '감추기';
                await savePartnerField({ [bodyKey]: '' }, `${displayName} 링크를 감추기 처리했습니다.`);
            } else {
                if (!val) {
                    showToast('주소를 먼저 입력한 뒤 표시해 주세요.', 'error');
                    return;
                }
                toggleBtn.classList.add('active');
                toggleBtn.textContent = '표시중';
                localStorage.setItem(fullStorageKey, val);
                await savePartnerField({ [bodyKey]: val }, `${displayName} 링크를 표시중으로 변경했습니다.`);
            }
        }

        document.getElementById('toggleHomeBtn').addEventListener('click', () => {
            handleSnsToggle('Home', 'homeUrl', 'saved_url_home_', '홈페이지');
        });
        document.getElementById('toggleBlogBtn').addEventListener('click', () => {
            handleSnsToggle('Blog', 'blogUrl', 'saved_url_blog_', '블로그');
        });
        document.getElementById('toggleInstaBtn').addEventListener('click', () => {
            handleSnsToggle('Insta', 'instaUrl', 'saved_url_insta_', '인스타그램');
        });
        document.getElementById('toggleKakaoBtn').addEventListener('click', () => {
            handleSnsToggle('Kakao', 'kakaoUrl', 'saved_url_kakao_', '오픈채팅');
        });

        window.stepGlobalValue = function(delta) {
            let val = Number(globalPriceInput.value) + delta;
            if (val < 0) val = 0;
            globalPriceInput.value = val;
        }

        await loadPricingData(partnerId);
    }

    window.copyToClipboard = function(elementId) {
        const copyText = document.getElementById(elementId);
        copyText.select();
        copyText.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(copyText.value);
        showToast('주소가 복사되었습니다.');
    }

    async function loadPricingData(id) {
        const loading = document.getElementById('loadingOverlay');
        const content = document.getElementById('dashboardContent');
        loading.style.display = 'flex';
        
        try {
            // 실제 n8n 연동
            const response = await fetch(`${WEBHOOK_GET_URL}?id=${id}`);
            if (!response.ok) {
                throw new Error(`서버 응답 오류 (상태 코드: ${response.status})`);
            }
            const data = await response.json();
            
            // 💡 계정 만료 및 비활성화 체크
            if (data.error === "BLOCKED" || data.success === false || data.success === "false") {
                throw new Error(data.message || "서비스 이용 기간이 만료되어 접속이 차단되었습니다.");
            }
            
            // 데이터 매핑
            globalMaterialPrice = data.globalMaterialPrice || 9000;
            document.getElementById('globalMaterialPriceTxt').textContent = `${globalMaterialPrice.toLocaleString()}원`;
            document.getElementById('globalMaterialPriceInput').value = globalMaterialPrice;
            
            // 가맹점 기본정보 매핑
            if (data.partnerRecordId) partnerRecordId = data.partnerRecordId;
            if (data.partnerName) {
                document.getElementById('companyName').textContent = data.partnerName;
                document.getElementById('partnerNameInput').value = data.partnerName;
            }
            if (data.contractPeriod) document.getElementById('servicePeriod').textContent = data.contractPeriod;
            if (data.quoteUrl) document.getElementById('quoteUrl').value = data.quoteUrl;
            if (data.ceoName) document.getElementById('mgrName').value = data.ceoName;
            if (data.position) document.getElementById('mgrTitle').value = data.position;
            if (data.phone) document.getElementById('mgrPhone').value = data.phone;
            if (data.notice) document.getElementById('quoteNotice').value = data.notice;

            // 페이지 제목 로컬스토리지 매핑
            document.getElementById('pageTitle').value = localStorage.getItem('saved_page_title_' + partnerId) || '섬세한 손길의 1분 견적';

            function setupSnsField(typeSuffix, serverUrl, storageKeyPrefix) {
                const inputEl = document.getElementById(`url${typeSuffix}`);
                const toggleBtn = document.getElementById(`toggle${typeSuffix}Btn`);
                const fullStorageKey = storageKeyPrefix + partnerId;

                if (serverUrl) {
                    localStorage.setItem(fullStorageKey, serverUrl);
                    inputEl.value = serverUrl;
                    toggleBtn.classList.add('active');
                    toggleBtn.textContent = '표시중';
                } else {
                    const savedUrl = localStorage.getItem(fullStorageKey) || '';
                    inputEl.value = savedUrl;
                    toggleBtn.classList.remove('active');
                    toggleBtn.textContent = '감추기';
                }
            }

            setupSnsField('Home', data.homeUrl, 'saved_url_home_');
            setupSnsField('Blog', data.blogUrl, 'saved_url_blog_');
            setupSnsField('Insta', data.instaUrl, 'saved_url_insta_');
            setupSnsField('Kakao', data.kakaoUrl, 'saved_url_kakao_');
            mockItems = data.items || []; // 서버에서 받아온 아이템 리스트

            renderAccordionList(mockItems);
            loading.style.display = 'none';
            content.style.display = 'block';

        } catch (error) {
            console.error("데이터 로드 실패:", error);
            const isBlocked = error.message.includes("만료") || error.message.includes("차단") || error.message.includes("제한") || error.message.includes("BLOCKED") || error.message.includes("권한");
            if (isBlocked) {
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
            } else {
                loading.innerHTML = `<div style="text-align:center; padding:20px;">
                    <h2 style="color:var(--danger); margin-bottom:10px;">데이터를 불러오지 못했습니다.</h2>
                    <p style="color:var(--text-main); margin-bottom:20px;">서버(n8n)가 꺼져 있거나 연결에 실패했습니다.<br>오류 내용: ${error.message}</p>
                    <button onclick="location.reload()" class="action-btn" style="background:var(--accent); color:white;">다시 시도</button>
                </div>`;
                loading.style.display = 'flex';
                loading.style.background = 'white';
            }
        }
    }

    function renderAccordionList(items) {
        const container = document.getElementById('priceListContainer');
        container.innerHTML = '';
        
        // 카테고리 필터링 적용
        const filteredItems = items.filter(item => {
            const cat = (item.category || '').trim();
            if (currentPriceCategory === 'pyeong') {
                return cat === '평형별';
            } else if (currentPriceCategory === 'door') {
                return cat === '도어';
            } else if (currentPriceCategory === 'shassi') {
                return cat === '샤시';
            } else if (currentPriceCategory === 'furniture') {
                return cat === '가구';
            } else if (currentPriceCategory === 'sink_etc') {
                return cat === '싱크대' || cat === '기타' || cat === '몰딩' || cat === '걸레받이' || (cat !== '도어' && cat !== '샤시' && cat !== '가구' && cat !== '평형별');
            }
            return false;
        });

        if (filteredItems.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; color:var(--text-muted); padding:40px 20px; font-weight:600; font-size:14px;">
                    해당 분류의 품목이 없습니다.
                </div>
            `;
            return;
        }
        
        function renderItem(item) {
            const isPyeong = (item.category || '').trim() === '평형별';
            
            let qtyVal = item.materialQty;
            if (isPyeong) {
                qtyVal = item.packageLength;
                if (!qtyVal || qtyVal === 0) {
                    // Fallback: extract number from calcBasis, e.g. "걸레받이길이 70m 기준입니다" -> 70
                    const match = (item.calcBasis || '').match(/(\d+)\s*m/i);
                    if (match) {
                        qtyVal = Number(match[1]);
                    } else {
                        // Fallback by name
                        if (item.name.includes('20평')) qtyVal = item.name.includes('싱크대') ? 6 : 70;
                        else if (item.name.includes('30평')) qtyVal = item.name.includes('싱크대') ? 10 : 100;
                        else if (item.name.includes('40평')) qtyVal = item.name.includes('싱크대') ? 12 : 130;
                        else if (item.name.includes('50평')) qtyVal = item.name.includes('싱크대') ? 14 : 160;
                        else qtyVal = 70;
                    }
                }
            }

            const qtyMultiplier = isPyeong ? (qtyVal * item.materialQty) : item.materialQty;

            const laborTotal = item.laborUnit * qtyMultiplier;
            const materialTotal = globalMaterialPrice * qtyMultiplier;
            const grandTotal = laborTotal + materialTotal;

            const el = document.createElement('div');
            el.className = 'accordion-item';
            el.dataset.category = item.category;
            el.dataset.staticFactor = item.materialQty;
            el.dataset.originalLabor = item.laborUnit;
            el.dataset.originalQty = qtyVal;
            el.dataset.originalDesc = item.desc;

            el.innerHTML = `
                <div class="accordion-header" onclick="toggleAccordion('${item.id}')">
                    <div class="accordion-title">${item.name}</div>
                    <div class="accordion-price" id="header-total-${item.id}">${grandTotal.toLocaleString()}원</div>
                </div>
                <div class="accordion-body" id="body-${item.id}">
                    <div style="color:var(--danger); font-size:14px; font-weight:700; margin-bottom:14px;">
                        견적산출기준: ${item.calcBasis || `1${item.unit || '개'} 시공시 견적입니다.`}
                    </div>
                    <div class="sub-tabs">
                        <button class="sub-tab-btn active" onclick="switchSubTab(event, '${item.id}', 'price')">금액 변경</button>
                        <button class="sub-tab-btn" onclick="switchSubTab(event, '${item.id}', 'desc')">설명 변경</button>
                    </div>
                    
                    <div id="sub-price-${item.id}" class="sub-tab-content active">
                        <div class="calc-row">
                            <div class="calc-label">m당 인건비 단가</div>
                            <div class="calc-input-wrap">
                                <button class="stepper-btn" onclick="stepValue('${item.id}', 'labor', -1000)">-</button>
                                <input type="text" id="labor-unit-${item.id}" value="${Number(item.laborUnit).toLocaleString()}" oninput="formatLaborInput(this); calcTotal('${item.id}')">
                                <button class="stepper-btn" onclick="stepValue('${item.id}', 'labor', 1000)">+</button>
                            </div>
                        </div>
                        <div class="calc-row">
                            <div class="calc-label">${isPyeong ? '설정 길이(m)' : '자재 소모량(m)'}</div>
                            <div class="calc-input-wrap">
                                <button class="stepper-btn" onclick="stepValue('${item.id}', '${isPyeong ? 'length' : 'qty'}', ${isPyeong ? -1 : -0.5})">-</button>
                                <input type="number" id="material-qty-${item.id}" value="${qtyVal}" readonly>
                                <button class="stepper-btn" onclick="stepValue('${item.id}', '${isPyeong ? 'length' : 'qty'}', ${isPyeong ? 1 : 0.5})">+</button>
                            </div>
                        </div>
                        <div class="calc-row">
                            <div class="calc-label">인건비<span>(${isPyeong ? '인건비 단가 x (설정 길이 x 자재소모량)' : '인건비 단가 x 자재 소모량'})</span></div>
                            <div class="calc-val" id="labor-total-${item.id}">${laborTotal.toLocaleString()}원</div>
                        </div>
                        <div class="calc-row">
                            <div class="calc-label">자재비<span>(${isPyeong ? '공통 자재비 단가 x (설정 길이 x 자재소모량)' : '자재비 단가 x 자재 소모량'})</span></div>
                            <div class="calc-val" id="material-total-${item.id}">${materialTotal.toLocaleString()}원</div>
                        </div>
                        <div class="calc-row total-row">
                            <div class="calc-label">최종 합계</div>
                            <div class="calc-val" id="grand-total-${item.id}">${grandTotal.toLocaleString()}원</div>
                        </div>
                        
                        <div class="btn-group">
                            <button class="btn-close" onclick="closeAccordionPrompt('${item.id}')">닫기</button>
                            <button class="btn-cancel" onclick="resetCalc('${item.id}')">취소</button>
                            <button class="btn-save" onclick="promptSave('${item.id}')">저장하기</button>
                        </div>
                    </div>

                    <div id="sub-desc-${item.id}" class="sub-tab-content">
                        <textarea id="desc-${item.id}" style="width:100%; height:240px; padding:16px; border:1px solid var(--border-color); border-radius:12px; background:var(--accent-light); font-size:16px; font-family:inherit; outline:none; resize:none;">${item.desc}</textarea>
                        <div class="btn-group">
                            <button class="btn-close" onclick="closeAccordionPrompt('${item.id}')">닫기</button>
                            <button class="btn-cancel" onclick="resetDesc('${item.id}')">취소</button>
                            <button class="btn-save" onclick="promptSave('${item.id}')">저장하기</button>
                        </div>
                    </div>
                </div>
            `;
            container.appendChild(el);
        }

        if (currentPriceCategory === 'pyeong') {
            const groups = {};
            filteredItems.forEach(item => {
                const match = item.name.match(/(\d+평)/);
                const groupName = match ? match[1] : '기타';
                if (!groups[groupName]) groups[groupName] = [];
                groups[groupName].push(item);
            });

            const sortedKeys = Object.keys(groups).sort((a, b) => {
                const numA = parseInt(a) || 999;
                const numB = parseInt(b) || 999;
                return numA - numB;
            });

            const getSortWeight = (name) => {
                if (name.includes('크라운몰딩')) return 2;
                if (name.includes('몰딩')) return 1;
                if (name.includes('걸레받이')) return 3;
                if (name.includes('싱크대 전체') || name.includes('싱크대전체')) return 4;
                if (name.includes('싱크대 상부장') || name.includes('싱크대상부장')) return 5;
                if (name.includes('싱크대 하부장') || name.includes('싱크대하부장')) return 6;
                return 999;
            };

            sortedKeys.forEach(groupKey => {
                const headerEl = document.createElement('div');
                headerEl.className = 'category-group-title';
                headerEl.innerHTML = `<span class="group-badge">${groupKey}</span><span class="group-name">평형 패키지 품목</span>`;
                container.appendChild(headerEl);

                // Sort items in this group
                const sortedGroupItems = groups[groupKey].sort((a, b) => {
                    return getSortWeight(a.name) - getSortWeight(b.name);
                });

                sortedGroupItems.forEach(item => {
                    renderItem(item);
                });
            });
        } else {
            filteredItems.forEach(item => {
                renderItem(item);
            });
        }
    }

    window.formatLaborInput = function(el) {
        let cleanVal = el.value.replace(/\D/g, '');
        if (cleanVal === '') {
            el.value = '';
            return;
        }
        el.value = Number(cleanVal).toLocaleString();
    }

    window.stepValue = function(id, type, delta) {
        let inputEl;
        if (type === 'labor') inputEl = document.getElementById(`labor-unit-${id}`);
        else if (type === 'qty' || type === 'length') inputEl = document.getElementById(`material-qty-${id}`);
        
        if (inputEl) {
            let val;
            if (type === 'labor') {
                let currentVal = Number(inputEl.value.replace(/,/g, ''));
                val = currentVal + delta;
                if (val < 0) val = 0;
                inputEl.value = Number(val).toLocaleString();
            } else if (type === 'qty') {
                let currentVal = Number(inputEl.value);
                val = currentVal + delta;
                if (val < 1.0) val = 1.0;
                if (val > 10.0) val = 10.0;
                inputEl.value = Number(val.toFixed(1));
            } else if (type === 'length') {
                let currentVal = Number(inputEl.value);
                val = currentVal + delta;
                if (val < 1) val = 1;
                if (val > 999) val = 999;
                inputEl.value = Number(val.toFixed(0));
            }
            calcTotal(id);
        }
    }

    window.toggleAccordion = function(id) {
        const body = document.getElementById(`body-${id}`);
        body.classList.toggle('open');
        const parent = body.parentElement;
        if (parent) {
            parent.classList.toggle('active');
        }
    }

    window.switchSubTab = function(event, id, type) {
        const body = document.getElementById(`body-${id}`);
        body.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
        body.querySelectorAll('.sub-tab-content').forEach(c => c.classList.remove('active'));
        
        event.target.classList.add('active');
        document.getElementById(`sub-${type}-${id}`).classList.add('active');
    }

    window.calcTotal = function(id) {
        const laborInput = document.getElementById(`labor-unit-${id}`);
        const qtyInput = document.getElementById(`material-qty-${id}`);
        if (!laborInput || !qtyInput) return;

        const el = document.getElementById(`body-${id}`).parentElement;
        const isPyeong = (el.dataset.category || '').trim() === '평형별';
        const staticFactor = Number(el.dataset.staticFactor || 0);

        const laborUnit = Number(laborInput.value.replace(/,/g, ''));
        const inputVal = Number(qtyInput.value);
        
        const qtyMultiplier = isPyeong ? (inputVal * staticFactor) : inputVal;
        
        const laborTotal = laborUnit * qtyMultiplier;
        const materialTotal = globalMaterialPrice * qtyMultiplier;
        const grandTotal = laborTotal + materialTotal;
        
        document.getElementById(`labor-total-${id}`).textContent = `${laborTotal.toLocaleString()}원`;
        document.getElementById(`material-total-${id}`).textContent = `${materialTotal.toLocaleString()}원`;
        document.getElementById(`grand-total-${id}`).textContent = `${grandTotal.toLocaleString()}원`;

        const headerTotal = document.getElementById(`header-total-${id}`);
        if (headerTotal) {
            headerTotal.textContent = `${grandTotal.toLocaleString()}원`;
        }
    }

    window.resetCalc = function(id) {
        const el = document.getElementById(`body-${id}`).parentElement;
        document.getElementById(`labor-unit-${id}`).value = Number(el.dataset.originalLabor).toLocaleString();
        document.getElementById(`material-qty-${id}`).value = el.dataset.originalQty;
        calcTotal(id);
        showToast('변경 내용이 취소되었습니다.');
    }
    
    window.resetDesc = function(id) {
        const el = document.getElementById(`body-${id}`).parentElement;
        document.getElementById(`desc-${id}`).value = el.dataset.originalDesc;
        showToast('설명 변경이 취소되었습니다.');
    }

    let closingId = null;
    window.closeAccordionPrompt = function(id) {
        const el = document.getElementById(`body-${id}`).parentElement;
        const currentLabor = document.getElementById(`labor-unit-${id}`).value.replace(/,/g, '');
        const currentQty = document.getElementById(`material-qty-${id}`).value;
        const currentDesc = document.getElementById(`desc-${id}`).value;
        
        if (Number(currentLabor) === Number(el.dataset.originalLabor) && 
            Number(currentQty) === Number(el.dataset.originalQty) && 
            currentDesc === el.dataset.originalDesc) {
            toggleAccordion(id);
            return;
        }
        closingId = id;
        document.getElementById('closeModal').style.display = 'flex';
    }

    window.handleCloseModal = async function(action) {
        document.getElementById('closeModal').style.display = 'none';
        if (!closingId) return;
        
        if (action === 'save') {
            await executeSave(closingId);
            toggleAccordion(closingId);
        } else if (action === 'discard') {
            const el = document.getElementById(`body-${closingId}`).parentElement;
            document.getElementById(`labor-unit-${closingId}`).value = Number(el.dataset.originalLabor).toLocaleString();
            document.getElementById(`material-qty-${closingId}`).value = el.dataset.originalQty;
            document.getElementById(`desc-${closingId}`).value = el.dataset.originalDesc;
            calcTotal(closingId);
            toggleAccordion(closingId);
        }
        closingId = null;
    }

    let currentSaveId = null;
    window.promptSave = function(id) {
        currentSaveId = id;
        document.getElementById('saveModal').style.display = 'flex';
    }

    window.closeSaveModal = async function(isConfirm) {
        document.getElementById('saveModal').style.display = 'none';
        if (isConfirm && currentSaveId) {
            await executeSave(currentSaveId);
        }
        currentSaveId = null;
    }

    async function executeSave(id) {
        const el = document.getElementById(`body-${id}`).parentElement;
        const laborUnit = Number(document.getElementById(`labor-unit-${id}`).value.replace(/,/g, ''));
        const inputVal = document.getElementById(`material-qty-${id}`).value;
        const desc = document.getElementById(`desc-${id}`).value;
        
        const isPyeong = (el.dataset.category || '').trim() === '평형별';
        
        const payload = {
            partnerId: partnerId,
            type: 'item',
            itemId: id,
            laborUnit: laborUnit,
            desc: desc
        };
        
        if (isPyeong) {
            payload.packageLength = Number(inputVal);
        } else {
            payload.materialQty = Number(inputVal);
        }
        
        // 실제 저장 API 호출
        try {
            await fetch(WEBHOOK_POST_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (error) {
            showToast('서버 저장에 실패했습니다.', 'error');
            return;
        }
        
        el.dataset.originalLabor = laborUnit;
        el.dataset.originalQty = inputVal;
        el.dataset.originalDesc = desc;
        
        const staticFactor = Number(el.dataset.staticFactor || 0);
        const qtyMultiplier = isPyeong ? (Number(inputVal) * staticFactor) : Number(inputVal);
        
        const grandTotal = (Number(laborUnit) * qtyMultiplier) + (globalMaterialPrice * qtyMultiplier);
        document.getElementById(`header-total-${id}`).textContent = `${grandTotal.toLocaleString()}원`;

        showToast('에어테이블에 정상적으로 적용되었습니다.', 'success');
    }
});
