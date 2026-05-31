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
    let currentPriceCategory = 'door';
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
            window.location.href = 'index.html';
            return;
        }

        document.getElementById('logoutBtn').addEventListener('click', () => {
            if(confirm("기기에서 연결을 해제하시겠습니까?")) {
                localStorage.removeItem('partner_id');
                window.location.href = 'index.html';
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
                globalPriceInput.focus();
                editGlobalBtn.textContent = '저장';
                editGlobalBtn.style.background = 'var(--text-main)';
                editGlobalBtn.style.color = 'white';
            } else {
                let newPrice = Number(globalPriceInput.value);
                if (newPrice < 0) newPrice = 0;
                
                // 실제 저장 API 호출
                try {
                    await fetch(WEBHOOK_POST_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            partnerId: partnerId,
                            type: 'global',
                            globalMaterialPrice: newPrice
                        })
                    });
                } catch (error) {
                    showToast('서버 저장에 실패했습니다.', 'error');
                    return;
                }

                globalMaterialPrice = newPrice;
                globalPriceTxt.textContent = newPrice.toLocaleString() + '원';
                
                globalPriceEditWrap.style.display = 'none';
                globalPriceTxt.style.display = 'block';
                editGlobalBtn.textContent = '수정';
                editGlobalBtn.style.background = 'var(--bg-card)';
                editGlobalBtn.style.color = 'var(--text-main)';
                
                mockItems.forEach(item => calcTotal(item.id));
                
                showToast('공통 자재비 단가가 업데이트 되었습니다.');
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
            if (data.homeUrl) document.getElementById('urlHome').value = data.homeUrl;
            if (data.blogUrl) document.getElementById('urlBlog').value = data.blogUrl;
            if (data.instaUrl) document.getElementById('urlInsta').value = data.instaUrl;
            if (data.kakaoUrl) document.getElementById('urlKakao').value = data.kakaoUrl;
            
            mockItems = data.items || []; // 서버에서 받아온 아이템 리스트
            mockInquiries = data.inquiries || []; // 서버에서 받아온 견적 문의 리스트

            renderAccordionList(mockItems);
            renderInquiryList(mockInquiries);
            loading.style.display = 'none';
            content.style.display = 'block';

        } catch (error) {
            console.error("데이터 로드 실패:", error);
            loading.innerHTML = `<div style="text-align:center; padding:20px;">
                <h2 style="color:var(--danger); margin-bottom:10px;">데이터를 불러오지 못했습니다.</h2>
                <p style="color:var(--text-main); margin-bottom:20px;">서버(n8n)가 꺼져 있거나 연결에 실패했습니다.<br>오류 내용: ${error.message}</p>
                <button onclick="location.reload()" class="action-btn" style="background:var(--accent); color:white;">다시 시도</button>
            </div>`;
            loading.style.display = 'flex';
            loading.style.background = 'white';
        }
    }

    function renderAccordionList(items) {
        const container = document.getElementById('priceListContainer');
        container.innerHTML = '';
        
        // 카테고리 필터링 적용
        const filteredItems = items.filter(item => {
            const cat = (item.category || '').trim();
            if (currentPriceCategory === 'door') {
                return cat === '도어';
            } else if (currentPriceCategory === 'shassi') {
                return cat === '샤시';
            } else if (currentPriceCategory === 'molding') {
                return cat === '몰딩' || cat === '걸레받이';
            } else if (currentPriceCategory === 'furniture') {
                return cat === '가구';
            } else if (currentPriceCategory === 'sink_etc') {
                return cat === '싱크대' || cat === '기타' || (cat !== '도어' && cat !== '샤시' && cat !== '몰딩' && cat !== '걸레받이' && cat !== '가구');
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
        
        filteredItems.forEach(item => {
            const laborTotal = item.laborUnit * item.materialQty;
            const materialTotal = globalMaterialPrice * item.materialQty;
            const grandTotal = laborTotal + materialTotal;

            const el = document.createElement('div');
            el.className = 'accordion-item';
            el.innerHTML = `
                <div class="accordion-header" onclick="toggleAccordion('${item.id}')">
                    <div class="accordion-title">${item.name}</div>
                    <div class="accordion-price" id="header-total-${item.id}">${grandTotal.toLocaleString()}원</div>
                </div>
                <div class="accordion-body" id="body-${item.id}">
                    <div class="sub-tabs">
                        <button class="sub-tab-btn active" onclick="switchSubTab(event, '${item.id}', 'price')">금액 변경</button>
                        <button class="sub-tab-btn" onclick="switchSubTab(event, '${item.id}', 'desc')">설명 변경</button>
                    </div>
                    
                    <div id="sub-price-${item.id}" class="sub-tab-content active">
                        <div class="calc-row">
                            <div class="calc-label">m당 인건비 단가</div>
                            <div class="calc-input-wrap">
                                <button class="stepper-btn" onclick="stepValue('${item.id}', 'labor', -1000)">-</button>
                                <input type="number" id="labor-unit-${item.id}" value="${item.laborUnit}" oninput="calcTotal('${item.id}')">
                                <button class="stepper-btn" onclick="stepValue('${item.id}', 'labor', 1000)">+</button>
                            </div>
                        </div>
                        <div class="calc-row">
                            <div class="calc-label">자재 소모량(m)</div>
                            <div class="calc-input-wrap">
                                <button class="stepper-btn" onclick="stepValue('${item.id}', 'qty', -1)">-</button>
                                <input type="number" id="material-qty-${item.id}" value="${item.materialQty}" oninput="calcTotal('${item.id}')">
                                <button class="stepper-btn" onclick="stepValue('${item.id}', 'qty', 1)">+</button>
                            </div>
                        </div>
                        <div class="calc-row">
                            <div class="calc-label">인건비<span>(인건비 단가 x 자재 소모량)</span></div>
                            <div class="calc-val" id="labor-total-${item.id}">${laborTotal.toLocaleString()}원</div>
                        </div>
                        <div class="calc-row">
                            <div class="calc-label">자재비<span>(자재비 단가 x 자재 소모량)</span></div>
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
                        <textarea id="desc-${item.id}" style="width:100%; height:120px; padding:16px; border:1px solid var(--border-color); border-radius:12px; background:var(--accent-light); font-size:14px; font-family:inherit; outline:none; resize:none;">${item.desc}</textarea>
                        <div class="btn-group">
                            <button class="btn-close" onclick="closeAccordionPrompt('${item.id}')">닫기</button>
                            <button class="btn-cancel" onclick="resetDesc('${item.id}')">취소</button>
                            <button class="btn-save" onclick="promptSave('${item.id}')">저장하기</button>
                        </div>
                    </div>
                </div>
            `;
            container.appendChild(el);
            
            el.dataset.originalLabor = item.laborUnit;
            el.dataset.originalQty = item.materialQty;
            el.dataset.originalDesc = item.desc;
        });
    }

    function renderInquiryList(inquiries) {
        const container = document.getElementById('inquiryListContainer');
        if (!container) return;
        container.innerHTML = '';

        if (inquiries.length === 0) {
            container.innerHTML = `
                <div style="text-align:center; color:var(--text-muted); padding:40px 20px; font-weight:600; font-size:14px;">
                    접수된 견적 문의가 없습니다.
                </div>
            `;
            return;
        }

        inquiries.forEach(item => {
            const card = document.createElement('div');
            card.className = 'inquiry-card';

            card.innerHTML = `
                <div class="inquiry-card-header">
                    <span class="inquiry-id">ID: ${item.quoteId || '임시'}</span>
                    <span class="inquiry-date">${formatInquiryDate(item.requestDate)}</span>
                </div>
                <div class="inquiry-card-body">
                    <div class="inquiry-customer-info">
                        <div class="info-row">
                            <span class="info-label">견적 품목</span>
                            <span class="info-val">${item.requestItems || '품목명 없음'}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">총 견적액</span>
                            <span class="info-val price-val">${item.totalAmount || '산출 불가'}</span>
                        </div>
                    </div>
                    
                    ${item.imageUrl ? `
                        <div class="inquiry-image-box" onclick="window.open('${item.imageUrl}', '_blank')">
                            <img src="${item.imageUrl}" alt="첨부 이미지" title="클릭하시면 큰 이미지로 볼 수 있습니다.">
                        </div>
                    ` : ''}
                    
                    ${item.detailText ? `
                        <div class="inquiry-detail-box">
                            <div class="detail-title">상세 산출내역</div>
                            <div class="detail-content">${item.detailText}</div>
                        </div>
                    ` : ''}
                </div>
            `;
            container.appendChild(card);
        });
    }

    function formatInquiryDate(dateStr) {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            const yy = String(d.getFullYear()).slice(-2);
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const min = String(d.getMinutes()).padStart(2, '0');
            return `${yy}-${mm}-${dd} ${hh}:${min}`;
        } catch (e) {
            return dateStr;
        }
    }

    window.stepValue = function(id, type, delta) {
        let inputEl;
        if (type === 'labor') inputEl = document.getElementById(`labor-unit-${id}`);
        else if (type === 'qty') inputEl = document.getElementById(`material-qty-${id}`);
        
        if (inputEl) {
            let val = Number(inputEl.value) + delta;
            if (val < 0) val = 0;
            inputEl.value = val;
            calcTotal(id);
        }
    }

    window.toggleAccordion = function(id) {
        document.getElementById(`body-${id}`).classList.toggle('open');
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

        const laborUnit = Number(laborInput.value);
        const materialQty = Number(qtyInput.value);
        
        const laborTotal = laborUnit * materialQty;
        const materialTotal = globalMaterialPrice * materialQty;
        const grandTotal = laborTotal + materialTotal;
        
        document.getElementById(`labor-total-${id}`).textContent = `${laborTotal.toLocaleString()}원`;
        document.getElementById(`material-total-${id}`).textContent = `${materialTotal.toLocaleString()}원`;
        document.getElementById(`grand-total-${id}`).textContent = `${grandTotal.toLocaleString()}원`;
    }

    window.resetCalc = function(id) {
        const el = document.getElementById(`body-${id}`).parentElement;
        document.getElementById(`labor-unit-${id}`).value = el.dataset.originalLabor;
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
        const currentLabor = document.getElementById(`labor-unit-${id}`).value;
        const currentQty = document.getElementById(`material-qty-${id}`).value;
        const currentDesc = document.getElementById(`desc-${id}`).value;
        
        if (currentLabor === String(el.dataset.originalLabor) && 
            currentQty === String(el.dataset.originalQty) && 
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
            document.getElementById(`labor-unit-${closingId}`).value = el.dataset.originalLabor;
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
        const laborUnit = document.getElementById(`labor-unit-${id}`).value;
        const materialQty = document.getElementById(`material-qty-${id}`).value;
        const desc = document.getElementById(`desc-${id}`).value;
        
        // 실제 저장 API 호출
        try {
            await fetch(WEBHOOK_POST_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    partnerId: partnerId,
                    type: 'item',
                    itemId: id,
                    laborUnit: laborUnit,
                    materialQty: materialQty,
                    desc: desc
                })
            });
        } catch (error) {
            showToast('서버 저장에 실패했습니다.', 'error');
            return;
        }
        
        el.dataset.originalLabor = laborUnit;
        el.dataset.originalQty = materialQty;
        el.dataset.originalDesc = desc;
        
        const grandTotal = (Number(laborUnit) * Number(materialQty)) + (globalMaterialPrice * Number(materialQty));
        document.getElementById(`header-total-${id}`).textContent = `${grandTotal.toLocaleString()}원`;

        showToast('에어테이블에 정상적으로 적용되었습니다.', 'success');
    }
});
