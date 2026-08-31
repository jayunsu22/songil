// [New] 카카오톡/문자 등으로 링크 공유할 때, 미리보기 카드 제목이 업체명 없이
// "인테리어필름 1분견적" / "가맹점 페이지"로만 뜨는 문제를 해결하기 위한 Edge Function.
//
// index.html / com_film_dashboard.html의 <title>, og:title 등은 원래 정적 값인데,
// 실제 업체명은 페이지가 열린 뒤 JS(index_app.js/com_film_app.js)가 백엔드에서 받아와
// 클라이언트에서만 바꿔치기한다. 카카오톡 같은 링크 미리보기 봇은 JS를 실행하지 않고
// 서버가 내려준 원본 HTML만 읽기 때문에, 항상 정적 기본값만 보여주는 게 원인이었다.
//
// 이 Edge Function은 정적 파일 응답을 가로채서, URL의 code(또는 id) 파라미터로
// 기존 백엔드(webhook)에 업체명을 물어본 뒤, 그 응답 HTML의 <title>/og 태그만 실제
// 업체명으로 바꿔서 내려준다. 백엔드 조회가 느리거나 실패해도 원본 정적 페이지를
// 그대로 보여주도록(사이트가 절대 깨지지 않도록) 모든 단계에 안전장치를 둠.

const PARTNER_INFO_URL = 'https://primary-production-a6fa.up.railway.app/webhook/partner-info';
const DASHBOARD_INFO_URL = 'https://primary-production-a6fa.up.railway.app/webhook/dashboard-save';

// index.html 쪽 partners.js와 동일한 매핑(짧은 홍보ID -> 실제 업체코드). 이 파일이 서버(엣지)에서
// 정적 partners.js를 import할 수 없어 최소한으로 복제해둔 것 - partners.js를 고칠 때 여기도 같이 확인 필요.
const PARTNER_MAPPING = {
    songil: 'p_001',
    hyun: 'p_002',
    semo: 'p_003',
    test: 'p_004',
    good: 'p_999',
    jeongseong_test: 'p_999',
};

async function fetchWithTimeout(url, ms) {
    // [수정] AbortController 수동 조합 대신 표준 AbortSignal.timeout()을 사용.
    // (원인 불명이지만 수동 AbortController 조합에서 실제 유효한 code=p_001 같은 요청에서만
    //  응답이 통째로 안 돌아오는 현상이 있어 더 단순한 방식으로 교체함)
    return await fetch(url, { signal: AbortSignal.timeout(ms) });
}

export default async (request, context) => {
    const response = await context.next();
    let debug = 'start';

    try {
        const contentType = response.headers.get('content-type') || '';
        debug = 'contentType=' + contentType;
        if (!contentType.includes('text/html')) {
            const r2 = new Response(response.body, response);
            r2.headers.set('x-partner-og-debug', 'skip:' + debug);
            return r2;
        }

        const url = new URL(request.url);
        const isDashboard = url.pathname.toLowerCase().includes('com_film_dashboard');

        let partnerName = null;

        if (isDashboard) {
            const id = url.searchParams.get('id');
            debug = 'dashboard id=' + id;
            if (id) {
                const r = await fetchWithTimeout(`${DASHBOARD_INFO_URL}?id=${encodeURIComponent(id)}`, 2800);
                debug += ' fetchStatus=' + r.status;
                if (r.ok) {
                    const data = await r.json();
                    partnerName = data.partner_name || data.업체명 || null;
                    debug += ' name=' + partnerName;
                }
            }
        } else {
            let code = url.searchParams.get('code');
            if (!code) {
                const path = url.pathname.replace(/^\/|\/$/g, '').toLowerCase();
                if (path && path !== 'index.html') {
                    code = PARTNER_MAPPING[path] || path;
                }
            }
            debug = 'path=' + url.pathname + ' code=' + code;
            if (code) {
                const r = await fetchWithTimeout(`${PARTNER_INFO_URL}?code=${encodeURIComponent(code)}`, 2800);
                debug += ' fetchStatus=' + r.status;
                if (r.ok) {
                    const data = await r.json();
                    debug += ' success=' + data.success;
                    if (data.success === 'true' || data.success === true) {
                        partnerName = data.partner_name || null;
                        debug += ' name=' + partnerName;
                    }
                }
            }
        }

        if (!partnerName) {
            const r2 = new Response(response.body, response);
            r2.headers.set('x-partner-og-debug', 'noname:' + debug);
            r2.headers.set('cache-control', 'no-store');
            return r2;
        }

        const title = isDashboard ? `${partnerName} 가맹점페이지` : `${partnerName} 1분견적`;
        const desc = isDashboard
            ? `${partnerName} 파트너 관리자페이지입니다.`
            : `${partnerName}의 빠른 필름 견적 서비스입니다.`;

        class TextSetter {
            element(el) { el.setInnerContent(title); }
        }
        class AttrSetter {
            constructor(attr, val) { this.attr = attr; this.val = val; }
            element(el) { el.setAttribute(this.attr, this.val); }
        }

        const rewritten = new HTMLRewriter()
            .on('title', new TextSetter())
            .on('meta[property="og:title"]', new AttrSetter('content', title))
            .on('meta[property="og:description"]', new AttrSetter('content', desc))
            .on('meta[name="twitter:title"]', new AttrSetter('content', title))
            .on('meta[name="twitter:description"]', new AttrSetter('content', desc))
            .transform(response);
        rewritten.headers.set('x-partner-og-debug', 'ok:' + debug);
        rewritten.headers.set('cache-control', 'no-store');
        return rewritten;
    } catch (e) {
        // 어떤 이유로든 실패하면 원본 정적 페이지를 그대로 서빙 (사이트가 절대 깨지지 않게)
        try {
            const r2 = new Response(response.body, response);
            r2.headers.set('x-partner-og-debug', 'error:' + debug + ' :: ' + (e && e.message));
            return r2;
        } catch (e2) {
            return response;
        }
    }
};

// path 등록은 netlify.toml의 [[edge_functions]] 블록에서 함 (in-source config와 중복 등록 방지)
