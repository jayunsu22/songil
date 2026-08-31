// [New] 카카오톡/문자 등으로 링크 공유할 때, 미리보기 카드 제목이 업체명 없이
// "인테리어필름 1분견적" / "가맹점 페이지"로만 뜨는 문제를 해결하기 위한 Edge Function.
//
// index.html / com_film_dashboard.html의 <title>, og:title 등은 원래 정적 값인데,
// 실제 업체명은 페이지가 열린 뒤 JS(index_app.js/com_film_app.js)가 백엔드에서 받아와
// 클라이언트에서만 바꿔치기한다. 카카오톡 같은 링크 미리보기 봇은 JS를 실행하지 않고
// 서버가 내려준 원본 HTML만 읽기 때문에, 항상 정적 기본값만 보여주는 게 원인이었다.
//
// [중요] 처음엔 실시간으로 n8n 백엔드(webhook/partner-info 등)를 조회해서 업체명을 가져오는
// 방식으로 만들었으나, 그 백엔드 응답이 1.5~1.8초 정도 걸려서 Netlify Edge Function의 실행
// 제한시간을 넘겨버려 응답 자체가 통째로 씹히는 문제가 있었다(에러조차 안 잡힘). 그래서 실시간
// 조회 대신, 아래 PARTNER_NAMES/DASHBOARD_NAMES 정적 표에서 즉시 찾아 바꿔치기하는 방식으로 변경.
// -> 새 가맹점이 생기거나 업체명이 바뀌면 이 파일도 같이 업데이트해줘야 함(partners.js와 동일한 유지보수 방식).

const PARTNER_NAMES = {
    p_001: '섬세한손길',
    p_002: '3m인테리어필름',
    p_003: '세모필름',
    p_004: '테스트필름',
    p_999: '정성필름',
    hoho: '호호필름',
    haha: '하하필름',
    singi: '신기필름',
    t1film: '테스트필름',
    test5: '테스트5',
    test6: '테스트6',
};

// com_film_dashboard.html?id=<레코드ID> 용 - 레코드ID -> 업체명
const DASHBOARD_NAMES = {
    recl7DPCfMjH5osKW: '섬세한손길',
    recWJ7MMgEtVbby98: '3m인테리어필름',
    recB6GeWza9e58Q3o: '세모필름',
    reco1fjkFCMNCW1g3: '테스트필름',
    recJS9X2s7LyCPrQ0: '정성필름',
    recyJzc6dKJha4cBY: '신기필름',
    rec03lbudI0QmIH4E: '테스트필름',
    recrhyXNVXy15szZ4: '하하필름',
    recn8M8zwIFaLBMBT: '호호필름',
    rec45CNMgm5zy8Gdk: '테스트5',
    recAcziPTWwzUK59v: '테스트6',
};

// index.html 쪽 partners.js와 동일한 매핑(짧은 홍보ID -> 실제 업체코드).
const PARTNER_MAPPING = {
    songil: 'p_001',
    hyun: 'p_002',
    semo: 'p_003',
    test: 'p_004',
    good: 'p_999',
    jeongseong_test: 'p_999',
};

// 일반 방문자에게는 이 함수가 개입하지 않게(지연 0) 하고, 카카오톡/문자/SNS 링크 미리보기 봇으로
// 보이는 요청에서만 og 태그를 바꿔치기한다.
const BOT_UA_PATTERN = /kakaotalk|kakaostory|facebookexternalhit|twitterbot|slackbot|discordbot|telegrambot|whatsapp|line\/|naver.?bot|daumoa|preview/i;

export default async (request, context) => {
    const userAgent = request.headers.get('user-agent') || '';
    if (!BOT_UA_PATTERN.test(userAgent)) {
        return context.next();
    }

    const response = await context.next();

    try {
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html')) {
            const passthrough = new Response(response.body, response);
            passthrough.headers.set('x-partner-og-hit', 'skip-non-html');
            return passthrough;
        }

        const url = new URL(request.url);
        const isDashboard = url.pathname.toLowerCase().includes('com_film_dashboard');

        let partnerName = null;

        if (isDashboard) {
            const id = url.searchParams.get('id');
            if (id) partnerName = DASHBOARD_NAMES[id] || null;
        } else {
            let code = url.searchParams.get('code');
            if (!code) {
                const path = url.pathname.replace(/^\/|\/$/g, '').toLowerCase();
                if (path && path !== 'index.html') {
                    code = PARTNER_MAPPING[path] || path;
                }
            }
            if (code) partnerName = PARTNER_NAMES[code] || null;
        }

        if (!partnerName) {
            const passthrough = new Response(response.body, response);
            passthrough.headers.set('x-partner-og-hit', 'no-match');
            return passthrough;
        }

        const title = isDashboard ? `${partnerName} 가맹점페이지` : `${partnerName} 1분견적`;
        const desc = isDashboard
            ? `${partnerName} 파트너 관리자페이지입니다.`
            : `${partnerName}의 빠른 필름 견적 서비스입니다.`;
        const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // [수정] HTMLRewriter(스트리밍 파서)를 썼을 때 원인 불명으로 응답이 통째로 원본으로 되돌아가는
        // 현상이 있어서, 훨씬 단순한 방식(전체 HTML을 문자열로 받아 그대로 텍스트 치환)으로 교체함.
        // 페이지 용량이 작아서(수 KB) 성능 문제 없음.
        let html;
        try {
            html = await response.text();
        } catch (readErr) {
            return new Response('read-failed:' + (readErr && readErr.message), {
                status: 200,
                headers: { 'content-type': 'text/plain', 'x-partner-og-hit': 'read-error' },
            });
        }
        html = html.replace(/<title>[^<]*<\/title>/, `<title>${escText(title)}</title>`);
        html = html.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escAttr(title)}$2`);
        html = html.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escAttr(desc)}$2`);
        html = html.replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${escAttr(title)}$2`);
        html = html.replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${escAttr(desc)}$2`);

        // [중요] 'cache-control': 'no-store' 헤더를 넣으면 이 Netlify Edge Function이
        // 원인 불명의 "uncaught exception during edge function invocation" 500 에러를
        // 뱉는 현상을 여러 차례 재현/격리로 확인함(동일 코드에서 이 헤더만 껐다 켰다 하며 검증).
        // 대신 각기 다른 code/id 쿼리는 요청 경로 자체가 달라서 Netlify가 자연히 별도로 캐싱하므로
        // (짧은 랜덤 경로 테스트에서 항상 fwd=miss로 확인됨) 캐시 오염 위험은 낮음. 절대 다시 추가하지 말 것.
        return new Response(html, {
            status: 200,
            headers: {
                'content-type': 'text/html; charset=UTF-8',
                'x-partner-og-hit': 'matched:' + partnerName,
            },
        });
    } catch (e) {
        // 어떤 이유로든 실패하면 원본 정적 페이지를 그대로 서빙 (사이트가 절대 깨지지 않게)
        try {
            const passthrough = new Response(response.body, response);
            passthrough.headers.set('x-partner-og-hit', 'error:' + (e && (e.stack || e.message || String(e))).slice(0, 500));
            return passthrough;
        } catch (e2) {
            return response;
        }
    }
};

// path 등록은 netlify.toml의 [[edge_functions]] 블록에서 함 (in-source config와 중복 등록 방지)
