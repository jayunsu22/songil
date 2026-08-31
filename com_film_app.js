document.addEventListener('DOMContentLoaded', async () => {
    const toast = document.getElementById('toast');
    
    // n8n 웹훅 URL 세팅 (개발용 격리)
    const WEBHOOK_GET_URL = "https://primary-production-a6fa.up.railway.app/webhook/dashboard-save"; 
    const WEBHOOK_POST_URL = "https://primary-production-a6fa.up.railway.app/webhook/dashboard-save";
    const WEBHOOK_INQUIRY_URL = "https://primary-production-a6fa.up.railway.app/webhook/dashboard-inquiries";
    const WEBHOOK_YEARLY_URL = "https://primary-production-a6fa.up.railway.app/webhook/yearly-membership-signup";
    const WEBHOOK_WITHDRAW_URL = "https://primary-production-a6fa.up.railway.app/webhook/withdraw-request";
    const WEBHOOK_SUGGESTION_URL = "https://primary-production-a6fa.up.railway.app/webhook/suggestion-request";
    const SECRET_TOKEN = "songil_secret_2025";

    // 글로벌 단가
    let globalMaterialPrice = 9000; 
    let mockItems = []; // 서버에서 받아올 빈 배열
    let partnerRecordId = '';
    let currentShortId = '';
    let currentPriceCategory = 'pyeong';
    let mockInquiries = [];
    let currentSubscriptionStatus = ''; // 구독상태('무료회원' 등) - 대시보드 5초 광고 조건 판단용
    let currentAdText = '';
    let currentAdLink = '';
    let currentPartnerCode = ''; // 탈퇴 신청 / 건의사항 전송 시 가맹점 식별용

    function showToast(message, type = 'success') {
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        setTimeout(() => { toast.className = 'toast'; }, 3000);
    }

    function updateQuoteUrl(url) {
        document.getElementById('quoteUrl').value = url;
        const idEl = document.getElementById('quoteUrlId');
        if (idEl && url) {
            const parts = url.split('/');
            idEl.textContent = parts[parts.length - 1] || '';
        }
    }

    // 무료회원(광고형) 가맹점에게만 노출되는 연회원 전환 배너 (관리자페이지 전용)
    // 처음 로드 시에는 가격 상세정보까지 펼쳐서 보여주고,
    // 페이지를 스크롤하면(움직이면) 한 줄짜리 축약형으로 자동 전환됨(공간 절약, 이후 다시 안 펼쳐짐).
    function renderYearlyDiscountBanner(subscriptionStatus, partnerCode) {
        const banner = document.getElementById('yearlyDiscountBanner');
        if (!banner) return;

        if (subscriptionStatus !== '무료회원' || !partnerCode) {
            banner.style.display = 'none';
            banner.innerHTML = '';
            return;
        }

        banner.className = 'yearly-discount-banner expanded';
        banner.style.display = 'block';
        banner.innerHTML = `
            <div class="yearly-banner-full">
                <div class="yearly-banner-title">🎁 지금 무료회원(광고형)이에요</div>
                <div class="yearly-banner-line">플러스 회원이 되면 <strong>광고 자리에 내 업체 광고를 넣을 수 있어요</strong></div>
                <div class="yearly-banner-line yearly-banner-price">월 3만원 (연 36만원, 부가세 별도)</div>
                <button type="button" class="yearly-banner-btn">플러스 회원 신청하기</button>
            </div>
            <div class="yearly-banner-compact">
                <span class="yearly-banner-text">🎉 플러스 회원 전환하면 <strong>내 광고를 넣을 수 있어요</strong></span>
                <button type="button" class="yearly-banner-btn">플러스 회원 신청하기</button>
            </div>
        `;

        banner.querySelectorAll('.yearly-banner-btn').forEach(btn => {
            btn.onclick = () => openYearlyMembershipConfirmDashboard(partnerCode, banner);
        });

        // 스크롤이 한 번이라도 발생하면 축약형으로 전환 (재확장 없음)
        if (!banner.dataset.scrollBound) {
            banner.dataset.scrollBound = '1';
            let collapsed = false;
            window.addEventListener('scroll', () => {
                if (collapsed || window.scrollY <= 30) return;
                collapsed = true;
                banner.classList.remove('expanded');
                banner.classList.add('collapsed');
            }, { passive: true });
        }
    }

    function openYearlyMembershipConfirmDashboard(partnerCode, bannerEl) {
        if (document.querySelector('.yearly-confirm-overlay')) return;

        const overlay = document.createElement('div');
        overlay.className = 'yearly-confirm-overlay';
        overlay.innerHTML = `
            <div class="yearly-confirm-box">
                <div class="yearly-confirm-title">🎉 플러스 회원 전환 신청</div>
                <p class="yearly-confirm-desc">월 3만원(연 36만원, 부가세 별도)으로 광고 없이, 내 광고도 넣을 수 있어요.<br>등록된 연락처로 곧 안내드릴게요.</p>
                <div class="yearly-confirm-actions">
                    <button type="button" class="yearly-cancel-btn">취소</button>
                    <button type="button" class="yearly-submit-btn">신청하기</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('.yearly-cancel-btn').onclick = () => overlay.remove();

        overlay.querySelector('.yearly-submit-btn').onclick = async () => {
            const submitBtn = overlay.querySelector('.yearly-submit-btn');
            submitBtn.disabled = true;
            submitBtn.innerText = '접수 중...';

            try {
                const res = await fetch(WEBHOOK_YEARLY_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-secret-token': SECRET_TOKEN
                    },
                    body: JSON.stringify({ partner_code: partnerCode })
                });
                const resData = await res.json();

                overlay.querySelector('.yearly-confirm-box').innerHTML = `
                    <div class="yearly-confirm-title">✅ 신청 완료!</div>
                    <p class="yearly-confirm-desc">${resData.message || '곧 안내드릴게요.'}</p>
                    <div class="yearly-confirm-actions">
                        <button type="button" class="yearly-cancel-btn">닫기</button>
                    </div>
                `;
                overlay.querySelector('.yearly-cancel-btn').onclick = () => {
                    overlay.remove();
                    if (bannerEl) bannerEl.style.display = 'none';
                };
            } catch (e) {
                alert('신청 중 오류가 발생했어요. 다시 시도해 주세요.');
                submitBtn.disabled = false;
                submitBtn.innerText = '신청하기';
            }
        };
    }

    // 탈퇴 신청 모달 (연회원 전환 모달과 동일한 구조, 사유는 선택 입력)
    function openWithdrawConfirmDashboard() {
        if (document.querySelector('.withdraw-confirm-overlay')) return;

        const overlay = document.createElement('div');
        overlay.className = 'withdraw-confirm-overlay';
        overlay.innerHTML = `
            <div class="withdraw-confirm-box">
                <div class="withdraw-confirm-title">🚪 탈퇴 신청</div>
                <p class="withdraw-confirm-desc">탈퇴하시면 관리자페이지와 견적페이지 이용이 즉시 중단됩니다.<br>계속 진행하시겠어요?</p>
                <textarea class="withdraw-reason-textarea" placeholder="탈퇴 사유를 알려주시면 서비스 개선에 참고할게요. (선택)"></textarea>
                <div class="withdraw-confirm-actions">
                    <button type="button" class="withdraw-cancel-btn">취소</button>
                    <button type="button" class="withdraw-submit-btn">탈퇴하기</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('.withdraw-cancel-btn').onclick = () => overlay.remove();

        overlay.querySelector('.withdraw-submit-btn').onclick = async () => {
            const submitBtn = overlay.querySelector('.withdraw-submit-btn');
            const reason = overlay.querySelector('.withdraw-reason-textarea').value.trim();
            submitBtn.disabled = true;
            submitBtn.innerText = '처리 중...';

            try {
                const res = await fetch(WEBHOOK_WITHDRAW_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-secret-token': SECRET_TOKEN
                    },
                    body: JSON.stringify({ id: partnerRecordId || currentPartnerCode, reason: reason })
                });
                const resData = await res.json();

                overlay.querySelector('.withdraw-confirm-box').innerHTML = `
                    <div class="withdraw-confirm-title">✅ 탈퇴 완료</div>
                    <p class="withdraw-confirm-desc">${resData.message || '그동안 이용해주셔서 감사합니다.'}</p>
                    <div class="withdraw-confirm-actions">
                        <button type="button" class="withdraw-cancel-btn" style="flex:1;">닫기</button>
                    </div>
                `;
                overlay.querySelector('.withdraw-cancel-btn').onclick = () => overlay.remove();
            } catch (e) {
                alert('처리 중 오류가 발생했어요. 다시 시도해 주세요.');
                submitBtn.disabled = false;
                submitBtn.innerText = '탈퇴하기';
            }
        };
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

                // 견적문의 탭 클릭 시 리스트 조회 실행
                if (e.target.id === 'inquiryTabBtn') {
                    loadInquiries(partnerId);
                }
            });
        });

        // 견적문의 새로고침 버튼
        document.getElementById('refreshInquiriesBtn').addEventListener('click', () => {
            loadInquiries(partnerId);
        });

        // 상담신청 알림(웹푸시) 클릭해서 들어온 경우(?tab=inquiry) 견적문의 탭이 바로 보이게
        if (urlParams.get('tab') === 'inquiry') {
            document.getElementById('inquiryTabBtn').click();
        }

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
                
                let result = {};
                try {
                    result = await response.json();
                } catch (e) {}

                if (!response.ok || result.success === false || result.success === 'false') {
                    throw new Error(result.message || '네트워크 응답 오류');
                }
                showToast(successMessage, 'success');
                return true;
            } catch (error) {
                showToast(error.message || '서버 저장에 실패했습니다.', 'error');
                return false;
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

        // 긴 텍스트(안내문구/건의사항)를 크게 펼쳐서 수정하는 공용 모달
        let textEditModalOnSave = null;
        function openTextEditModal(title, currentValue, onSave) {
            document.getElementById('textEditModalTitle').textContent = title;
            document.getElementById('textEditModalTextarea').value = currentValue || '';
            textEditModalOnSave = onSave;
            document.getElementById('textEditModal').style.display = 'flex';
            setTimeout(() => document.getElementById('textEditModalTextarea').focus(), 50);
        }
        document.getElementById('textEditModalCancelBtn').addEventListener('click', () => {
            document.getElementById('textEditModal').style.display = 'none';
            textEditModalOnSave = null;
        });
        document.getElementById('textEditModalSaveBtn').addEventListener('click', async () => {
            const val = document.getElementById('textEditModalTextarea').value;
            const cb = textEditModalOnSave;
            document.getElementById('textEditModal').style.display = 'none';
            textEditModalOnSave = null;
            if (cb) await cb(val);
        });

        function openQuoteNoticeEditor() {
            const current = document.getElementById('quoteNotice').value;
            openTextEditModal('견적서 공통 안내문구', current, async (val) => {
                document.getElementById('quoteNotice').value = val;
                await savePartnerField({ notice: val.trim() }, '견적서 공통 안내문구가 업데이트 되었습니다.');
            });
        }
        document.getElementById('quoteNotice').addEventListener('click', openQuoteNoticeEditor);
        document.getElementById('editQuoteNoticeBtn').addEventListener('click', openQuoteNoticeEditor);

        async function sendSuggestion(content) {
            const trimmed = content.trim();
            if (!trimmed) {
                showToast('건의사항 내용을 입력해 주세요.', 'error');
                return;
            }
            try {
                const res = await fetch(WEBHOOK_SUGGESTION_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-secret-token': SECRET_TOKEN
                    },
                    body: JSON.stringify({ id: partnerRecordId || currentPartnerCode, content: trimmed })
                });
                const resData = await res.json();
                if (resData.success) {
                    showToast(resData.message || '건의사항이 전달됐어요.', 'success');
                    document.getElementById('suggestionText').value = '';
                } else {
                    showToast(resData.message || '전송에 실패했습니다.', 'error');
                }
            } catch (e) {
                showToast('전송 중 오류가 발생했습니다.', 'error');
            }
        }
        function openSuggestionEditor() {
            const current = document.getElementById('suggestionText').value;
            openTextEditModal('건의사항', current, sendSuggestion);
        }
        document.getElementById('suggestionText').addEventListener('click', openSuggestionEditor);
        document.getElementById('sendSuggestionBtn').addEventListener('click', openSuggestionEditor);

        document.getElementById('openWithdrawBtn').addEventListener('click', () => {
            openWithdrawConfirmDashboard();
        });

        // 🔔 이 브라우저로 알림받기 (웹푸시) - 앱 설치 없이 새 견적/상담 문의를 이 컴퓨터에 알림으로 받음
        document.getElementById('enablePushBtn').addEventListener('click', async () => {
            const pushBtn = document.getElementById('enablePushBtn');
            const statusText = document.getElementById('pushStatusText');
            pushBtn.disabled = true;
            pushBtn.innerText = '설정 중...';
            try {
                await PushNotify.subscribeToPush(partnerRecordId || partnerId);
                pushBtn.innerText = '✅ 알림설정완료';
                statusText.innerHTML = '이 브라우저로 알림을 받도록 설정했어요.';
                showToast('브라우저 알림이 켜졌습니다.', 'success');
            } catch (e) {
                pushBtn.disabled = false;
                pushBtn.innerText = '🔔 이 브라우저 알림 켜기';
                // 아이폰(사파리, 홈화면 추가 안 함) 등 웹푸시 자체가 안 되는 기기/브라우저는
                // 대안으로 텔레그램 등록을 안내한다.
                if (/지원하지 않습니다/.test(e.message || '')) {
                    statusText.innerHTML = '이 기기/브라우저는 알림 기능을 지원하지 않아요.<br>아이폰이시라면 아래 텔레그램으로 알림을 받아보세요.';
                } else {
                    statusText.innerText = e.message || '알림 설정에 실패했어요.';
                }
                showToast(e.message || '알림 설정에 실패했어요.', 'error');
            }
        });

        document.getElementById('pushPhoneOnlyCheckbox').addEventListener('change', async (e) => {
            const checked = e.target.checked;
            const success = await savePartnerField(
                { pushPhoneOnly: checked },
                checked ? '전화번호 있는 상담신청만 알림받도록 설정했어요.' : '새 견적요청에도 알림을 받도록 설정했어요.'
            );
            if (!success) e.target.checked = !checked;
        });
        if (typeof PushNotify !== 'undefined') {
            PushNotify.isSubscribed().then((subscribed) => {
                if (subscribed) {
                    document.getElementById('enablePushBtn').innerText = '✅ 알림설정완료';
                }
            });
        }



        document.getElementById('editShortIdBtn').addEventListener('click', async () => {
            const val = document.getElementById('shortId').value.trim();
            
            if (val && !/^[a-zA-Z0-9_-]+$/.test(val)) {
                showToast('홍보 ID는 영문, 숫자, 밑줄(_), 하이픈(-)만 사용할 수 있습니다.', 'error');
                return;
            }

            if (val.length > 8) {
                showToast('홍보 ID는 최대 8글자 이하만 입력할 수 있습니다.', 'error');
                return;
            }

            const success = await savePartnerField({ shortId: val }, '홍보 단축 ID가 업데이트 되었습니다.');
            if (success) {
                currentShortId = val;
                updateQuoteUrl(val ? `https://1film.co.kr/${val}` : `https://1film.co.kr/${partnerId}`);
            } else {
                document.getElementById('shortId').value = currentShortId;
            }
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

        // 플러스 회원 전용 "내 광고" 섹션: 구독상태가 '무료회원'이 아닐 때만 노출/입력값 채움
        let ownAdImageBase64 = null; // 새 파일을 고른 경우에만 채워짐 (data: 접두어 제외한 순수 base64)
        let ownAdImageFilename = '';
        let ownAdImageContentType = '';

        function renderOwnAdSection(subscriptionStatus, ownAdText, ownAdLink, ownAdImage) {
            const section = document.getElementById('ownAdSection');
            if (!section) return;
            const isPlus = (subscriptionStatus || '') !== '무료회원';
            section.style.display = isPlus ? 'block' : 'none';
            if (!isPlus) return;

            document.getElementById('ownAdText').value = ownAdText || '';
            document.getElementById('ownAdLink').value = ownAdLink || '';
            const preview = document.getElementById('ownAdImagePreview');
            if (ownAdImage) {
                preview.src = ownAdImage;
                preview.style.display = 'block';
            } else {
                preview.style.display = 'none';
                preview.src = '';
            }
        }

        document.getElementById('ownAdImageInput').addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            if (file.size > 4 * 1024 * 1024) {
                showToast('사진 용량은 4MB 이하로 올려주세요.', 'error');
                e.target.value = '';
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result; // "data:image/png;base64,...."
                const commaIdx = dataUrl.indexOf(',');
                ownAdImageBase64 = dataUrl.slice(commaIdx + 1);
                ownAdImageContentType = file.type || 'image/jpeg';
                ownAdImageFilename = file.name || 'ad.jpg';
                const preview = document.getElementById('ownAdImagePreview');
                preview.src = dataUrl;
                preview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        });

        document.getElementById('saveOwnAdBtn').addEventListener('click', async () => {
            const text = document.getElementById('ownAdText').value.trim();
            const link = document.getElementById('ownAdLink').value.trim();
            const payload = { ownAdText: text, ownAdLink: link };
            if (ownAdImageBase64) {
                payload.ownAdImageBase64 = ownAdImageBase64;
                payload.ownAdImageFilename = ownAdImageFilename;
                payload.ownAdImageContentType = ownAdImageContentType;
            }
            const btn = document.getElementById('saveOwnAdBtn');
            btn.disabled = true;
            const originalText = btn.innerText;
            btn.innerText = '저장 중...';
            const success = await savePartnerField(payload, '내 광고가 저장되었습니다.');
            btn.disabled = false;
            btn.innerText = originalText;
            if (success) {
                ownAdImageBase64 = null; // 다음 저장 때 사진을 또 보내지 않도록 초기화 (텍스트/링크만 저장해도 안전)
            }
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
            const remainingDaysBadge = document.getElementById('remainingDaysBadge');
            if (!data.contractPeriod) {
                // 계약(결제) 기간이 없는 경우(무료회원 등 만료 개념이 없는 등급) - 가짜 기간/D-day 대신
                // 구독등급 이름만 보여줌
                document.getElementById('servicePeriod').textContent = data.subscriptionStatus || '무료회원';
                if (remainingDaysBadge) remainingDaysBadge.style.display = 'none';
            } else {
                document.getElementById('servicePeriod').textContent = data.contractPeriod;

                // 남은 기간 계산 및 배지 렌더링
                const remainingDaysNum = document.getElementById('remainingDaysNum');

                if (remainingDaysBadge && remainingDaysNum) {
                    let diffDays = 0;
                    if (data.contractPeriod.includes(' ~ ')) {
                        const parts = data.contractPeriod.split(' ~ ');
                        const endDateStr = parts[1] ? parts[1].trim() : null;
                        if (endDateStr) {
                            const endDate = new Date(endDateStr.replace(/\./g, '-'));
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            endDate.setHours(0, 0, 0, 0);
                            if (!isNaN(endDate.getTime())) {
                                const diffTime = endDate.getTime() - today.getTime();
                                diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            }
                        }
                    }
                    
                    if (diffDays > 0) {
                        remainingDaysNum.textContent = diffDays;
                        remainingDaysBadge.style.display = 'flex';
                        
                        // 남은 기간이 30일 이하인 경우 빨간 경고 스타일 적용
                        if (diffDays <= 30) {
                            remainingDaysBadge.style.borderColor = '#fee2e2';
                            remainingDaysBadge.style.background = '#fef2f2';
                            remainingDaysNum.style.color = '#ef4444';
                        } else {
                            remainingDaysBadge.style.borderColor = '#f3f4f6';
                            remainingDaysBadge.style.background = '#ffffff';
                            remainingDaysNum.style.color = '#1e293b';
                        }
                    } else {
                        remainingDaysBadge.style.display = 'none';
                    }
                }
            }
            if (data.quoteUrl) updateQuoteUrl(data.quoteUrl);
            if (data.shortId !== undefined) {
                const val = data.shortId || '';
                document.getElementById('shortId').value = val;
                currentShortId = val;
            }
            if (data.ceoName) document.getElementById('mgrName').value = data.ceoName;
            if (data.position) document.getElementById('mgrTitle').value = data.position;
            if (data.phone) document.getElementById('mgrPhone').value = data.phone;
            if (data.notice) document.getElementById('quoteNotice').value = data.notice;

            // 체험중(구독상태='대기중') 가맹점에게만 연회원 전환 할인 배너 노출
            // (고객이 보는 견적페이지가 아니라 가맹점 담당자만 접속하는 이 관리자페이지에만 표시)
            renderYearlyDiscountBanner(data.subscriptionStatus, data.partnerCode);

            // 플러스 회원(구독상태 !== '무료회원')에게만 "내 광고" 입력 섹션 노출
            renderOwnAdSection(data.subscriptionStatus, data.ownAdText, data.ownAdLink, data.ownAdImage);

            const pushPhoneOnlyCb = document.getElementById('pushPhoneOnlyCheckbox');
            if (pushPhoneOnlyCb) pushPhoneOnlyCb.checked = !!data.pushPhoneOnly;

            // 견적문의 탭에서 쓸 구독상태/광고 정보 저장 (10건 초과시 5초 광고용)
            currentSubscriptionStatus = data.subscriptionStatus || '';
            currentAdText = data.adText || '';
            currentAdLink = data.adLink || '';
            currentPartnerCode = data.partnerCode || '';

            // 공지사항 및 공식카페 배너 렌더링
            const noticeContainer = document.getElementById('noticeContainer');
            if (noticeContainer) {
                noticeContainer.innerHTML = '';
                noticeContainer.className = '';
                noticeContainer.style.display = 'none';
                
                let notices = [];
                if (data.boardNotice) {
                    if (Array.isArray(data.boardNotice)) {
                        notices = data.boardNotice;
                    } else if (data.boardNotice.content) {
                        notices = [data.boardNotice];
                    }
                }
                
                if (notices.length > 0) {
                    noticeContainer.className = 'notice-container-box';
                    noticeContainer.style.display = 'block';
                    
                    notices.forEach((notice) => {
                        const noticeRow = document.createElement('div');
                        noticeRow.className = 'notice-row';
                        
                        const noticeContent = document.createElement('div');
                        noticeContent.className = 'notice-content';
                        
                        const badge = document.createElement('span');
                        badge.className = 'notice-badge';
                        badge.textContent = '공지';
                        
                        const text = document.createElement('span');
                        text.className = 'notice-text';
                        text.textContent = notice.content;
                        
                        noticeContent.appendChild(badge);
                        noticeContent.appendChild(text);
                        noticeRow.appendChild(noticeContent);

                        
                        if (notice.cafeUrl) {
                            const linkBtn = document.createElement('a');
                            linkBtn.href = notice.cafeUrl;
                            linkBtn.target = '_blank';
                            linkBtn.className = 'notice-link-btn';
                            linkBtn.textContent = '내용보기';
                            noticeRow.appendChild(linkBtn);
                        }
                        
                        noticeContainer.appendChild(noticeRow);
                    });

                }
            }





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
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <input type="checkbox" class="visibility-checkbox" ${item.visible !== false ? 'checked' : ''} onclick="event.stopPropagation(); toggleItemVisibility('${item.id}', this.checked)" style="width: 18px; height: 18px; cursor: pointer; accent-color: #4A90E2;" title="노출 여부 설정">
                        <div class="accordion-title" style="${item.visible !== false ? '' : 'color: #a0aec0; text-decoration: line-through;'}">${item.name}</div>
                    </div>
                    <div class="accordion-price" id="header-total-${item.id}" style="${item.visible !== false ? '' : 'color: #a0aec0;'}">${grandTotal.toLocaleString()}원</div>
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
                        <div class="calc-row calc-row-breakdown">
                            <div class="calc-label" id="labor-label-${item.id}">인건비<span>(${isPyeong ? '인건비 단가 x (설정 길이 x 1m 시공시 자재소모량)' : '인건비 단가 x 자재 소모량'})</span></div>
                            <div class="calc-val" id="labor-total-${item.id}">${laborTotal.toLocaleString()}원</div>
                        </div>
                        <div class="calc-row calc-row-breakdown">
                            <div class="calc-label" id="material-label-${item.id}">자재비<span>(${isPyeong ? '공통 자재비 단가 x (설정 길이 x 1m 시공시 자재소모량)' : '자재비 단가 x 자재 소모량'})</span></div>
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

    window.toggleItemVisibility = async function(id, isChecked) {
        const body = document.getElementById(`body-${id}`);
        if (!body) return;
        const parent = body.parentElement;
        const headerTitle = parent ? parent.querySelector('.accordion-title') : null;
        const headerPrice = document.getElementById(`header-total-${id}`);
        
        // Update UI styles immediately for a responsive feel
        if (isChecked) {
            if (headerTitle) {
                headerTitle.style.color = '';
                headerTitle.style.textDecoration = '';
            }
            if (headerPrice) {
                headerPrice.style.color = '';
            }
        } else {
            if (headerTitle) {
                headerTitle.style.color = '#a0aec0';
                headerTitle.style.textDecoration = 'line-through';
            }
            if (headerPrice) {
                headerPrice.style.color = '#a0aec0';
            }
        }

        const payload = {
            partnerId: partnerId,
            type: 'item_visibility',
            itemId: id,
            visible: isChecked
        };

        try {
            const response = await fetch(WEBHOOK_POST_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                throw new Error('Server responded with error');
            }
            showToast(isChecked ? '1분견적 페이지에 해당 품목 나타납니다.' : '1분견적 페이지에 해당 품목이 사라집니다.', 'success');
        } catch (error) {
            console.error('Failed to update visibility:', error);
            showToast('서버 저장에 실패했습니다. 다시 시도해주세요.', 'error');
            // Revert UI styles and checkbox on failure
            const checkbox = parent ? parent.querySelector('.visibility-checkbox') : null;
            if (checkbox) checkbox.checked = !isChecked;
            
            if (!isChecked) {
                if (headerTitle) {
                    headerTitle.style.color = '';
                    headerTitle.style.textDecoration = '';
                }
                if (headerPrice) {
                    headerPrice.style.color = '';
                }
            } else {
                if (headerTitle) {
                    headerTitle.style.color = '#a0aec0';
                    headerTitle.style.textDecoration = 'line-through';
                }
                if (headerPrice) {
                    headerPrice.style.color = '#a0aec0';
                }
            }
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

        const laborLabel = document.getElementById(`labor-label-${id}`);
        const materialLabel = document.getElementById(`material-label-${id}`);
        if (laborLabel) {
            laborLabel.innerHTML = `인건비<span>(${isPyeong ? `${laborUnit.toLocaleString()}원 × ${inputVal}m × ${staticFactor}m` : `${laborUnit.toLocaleString()}원 × ${inputVal}m`})</span>`;
        }
        if (materialLabel) {
            materialLabel.innerHTML = `자재비<span>(${isPyeong ? `${globalMaterialPrice.toLocaleString()}원 × ${inputVal}m × ${staticFactor}m` : `${globalMaterialPrice.toLocaleString()}원 × ${inputVal}m`})</span>`;
        }

        const headerTotal = document.getElementById(`header-total-${id}`);
        if (headerTotal) {
            headerTotal.textContent = `${grandTotal.toLocaleString()}원`;
        }
    }

    // 인건비/자재비 하단 라벨을 "숫자 계산식"이 아닌 원래의 "설명 문구"로 되돌린다.
    // (calcTotal은 입력값이 바뀔 때마다 실시간 숫자 계산식을 보여주기 위한 것이고,
    //  취소/닫기/저장 후처럼 편집이 끝난 시점에는 다시 설명 문구로 복귀해야 한다.)
    function restoreCalcLabelText(id) {
        const bodyEl = document.getElementById(`body-${id}`);
        if (!bodyEl) return;
        const el = bodyEl.parentElement;
        const isPyeong = (el.dataset.category || '').trim() === '평형별';
        const laborLabel = document.getElementById(`labor-label-${id}`);
        const materialLabel = document.getElementById(`material-label-${id}`);
        if (laborLabel) {
            laborLabel.innerHTML = `인건비<span>(${isPyeong ? '인건비 단가 x (설정 길이 x 1m 시공시 자재소모량)' : '인건비 단가 x 자재 소모량'})</span>`;
        }
        if (materialLabel) {
            materialLabel.innerHTML = `자재비<span>(${isPyeong ? '공통 자재비 단가 x (설정 길이 x 1m 시공시 자재소모량)' : '자재비 단가 x 자재 소모량'})</span>`;
        }
    }

    window.resetCalc = function(id) {
        const el = document.getElementById(`body-${id}`).parentElement;
        document.getElementById(`labor-unit-${id}`).value = Number(el.dataset.originalLabor).toLocaleString();
        document.getElementById(`material-qty-${id}`).value = el.dataset.originalQty;
        calcTotal(id);
        restoreCalcLabelText(id);
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
            restoreCalcLabelText(id);
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
            restoreCalcLabelText(closingId);
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

        restoreCalcLabelText(id);
        showToast('에어테이블에 정상적으로 적용되었습니다.', 'success');
    }

    // [New] 견적문의 탭 진입시(하루 10건 초과 무료회원 한정) 5초 광고 표시 후 콜백 실행
    function showInquiryLoadingAd(onDone) {
        const existing = document.querySelector('.inquiry-loading-ad-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'inquiry-loading-ad-overlay';
        overlay.innerHTML = `
            <div class="inquiry-loading-ad-title">견적내역 확인중</div>
            <div class="inquiry-loading-ad-spinner"></div>
            <a class="inquiry-loading-ad-box" href="${currentAdLink || '#'}" target="_blank">
                <span class="ad-badge">광고</span>
                <span class="ad-text">${currentAdText}</span>
            </a>
        `;
        document.body.appendChild(overlay);

        setTimeout(() => {
            overlay.remove();
            onDone();
        }, 5000);
    }

    // [New] 5초 광고가 끝난 뒤 견적문의 목록 상단에 같은 광고를 배너로 정착시킴
    function showDashboardAdBanner() {
        if (document.querySelector('.dashboard-ad-banner')) return;
        const container = document.getElementById('inquiryListContainer');
        if (!container) return;

        const banner = document.createElement('a');
        banner.className = 'dashboard-ad-banner';
        banner.href = currentAdLink || '#';
        if (currentAdLink) banner.target = '_blank';
        banner.innerHTML = `
            <span class="ad-badge">광고</span>
            <span class="ad-text">${currentAdText}</span>
        `;
        container.parentNode.insertBefore(banner, container);
    }

    // 💡 신규 기능: 견적문의 내역 조회
    async function loadInquiries(recordId) {
        const container = document.getElementById('inquiryListContainer');
        container.innerHTML = '<div class="no-data">견적문의 내역을 불러오는 중입니다...</div>';
        
        if (!recordId) {
            container.innerHTML = '<div class="no-data">가맹점 정보를 조회할 수 없습니다.</div>';
            return;
        }
        
        try {
            const response = await fetch(`${WEBHOOK_INQUIRY_URL}?partnerId=${recordId}`);
            if (!response.ok) throw new Error('데이터 조회 실패');

            const data = await response.json();
            const inquiries = data.inquiries || [];

            if (inquiries.length === 0) {
                container.innerHTML = '<div class="no-data">접수된 견적문의 내역이 없습니다.</div>';
                return;
            }

            // [New] 무료회원(광고형) 가맹점이 오늘 10건 넘게 문의를 받았을 때만
            // 5초짜리 광고를 먼저 보여준 뒤 목록을 열람하게 함 (텔레그램 10건 제한과 같은 기준)
            const todayStr = new Date().toDateString();
            const todayCount = inquiries.filter(inq => inq.date && new Date(inq.date).toDateString() === todayStr).length;
            const DAILY_LIMIT = 10;

            if (currentSubscriptionStatus === '무료회원' && todayCount > DAILY_LIMIT && currentAdText) {
                showInquiryLoadingAd(() => {
                    renderInquiryList(inquiries);
                    showDashboardAdBanner();
                });
            } else {
                renderInquiryList(inquiries);
            }
        } catch (error) {
            console.error("견적 조회 실패:", error);
            container.innerHTML = `<div class="no-data" style="color:var(--danger);">데이터를 가져오지 못했습니다.<br>오류 내용: ${error.message}</div>`;
        }
    }

    // 견적문의 리스트 렌더링 (더보기 버튼 포함)
    function renderInquiryList(inquiries) {
        const container = document.getElementById('inquiryListContainer');
        container.innerHTML = '';
        
        let currentIndex = 0;
        const batchSize = 10;

        // 실제 카드 요소를 생성하는 헬퍼 함수
        function createCard(inq) {
            if (!inq.htmlContent) return null;
            
            const itemCard = document.createElement('div');
            itemCard.className = 'inquiry-card';
            itemCard.style.padding = '0'; // HTML 자체 패딩 사용
            itemCard.style.overflow = 'hidden';
            itemCard.style.background = 'transparent';
            itemCard.style.border = 'none';
            itemCard.style.boxShadow = 'none';
            
            // 날짜 정보 추가 표시 (카드 상단)
            let dateStr = '';
            if (inq.date) {
                const dateObj = new Date(inq.date);
                dateStr = dateObj.toLocaleDateString('ko-KR', {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit'
                });
            }
            
            itemCard.innerHTML = `
                ${dateStr ? `<div style="font-size: 12px; color: var(--text-muted); font-weight: 600; margin-bottom: 6px; padding-left: 8px;">신청 일시: ${dateStr}</div>` : ''}
                <div class="inquiry-card-html-wrap">${inq.htmlContent}</div>
            `;
            return itemCard;
        }

        // 더보기 버튼을 관리하기 위한 컨테이너 정의
        const listWrapper = document.createElement('div');
        listWrapper.id = 'inquiryListWrapper';
        container.appendChild(listWrapper);

        const moreBtnContainer = document.createElement('div');
        moreBtnContainer.style.textAlign = 'center';
        moreBtnContainer.style.margin = '20px 0 10px 0';
        container.appendChild(moreBtnContainer);

        function showNext() {
            const limit = Math.min(currentIndex + batchSize, inquiries.length);
            for (let i = currentIndex; i < limit; i++) {
                const card = createCard(inquiries[i]);
                if (card) listWrapper.appendChild(card);
            }
            currentIndex = limit;

            // 더보기 버튼 제어
            if (currentIndex < inquiries.length) {
                moreBtnContainer.innerHTML = `
                    <button id="loadMoreInquiriesBtn" class="action-btn" style="background:var(--accent); color:white; width: 100%; max-width: 200px; padding: 12px; border-radius: 12px; border:none; font-weight:700; cursor:pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.05); outline: none;">
                        더보기 (${inquiries.length - currentIndex}개 남음)
                    </button>
                `;
                document.getElementById('loadMoreInquiriesBtn').addEventListener('click', showNext);
            } else {
                moreBtnContainer.innerHTML = '';
            }
        }

        // 초기 10개 출력
        showNext();
    }
});
