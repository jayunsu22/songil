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
//
// [디버깅 기록] 한동안 "matched"(실제 업체 코드로 치환하는) 분기에서만 500 "uncaught exception
// during edge function invocation"이 나서 원인 파악에 오래 걸렸음. 최종 원인: 디버그용
// 'x-partner-og-hit' 응답 헤더 값에 업체명(한글, 예: '섬세한손길')을 그대로 넣었던 것.
// HTTP 헤더 값은 ASCII(Latin-1)만 허용되는데, 한글을 넣으면 Headers/Response 생성 시점에
// 예외가 나고, 그 예외가 catch 블록에서 원본 response.body를 다시 쓰려다(이미 response.text()로
// 소진됨) 또 실패하면서 내 try/catch로는 전혀 잡히지 않는 플랫폼 레벨 에러로 번졌던 것.
// -> 교훈: 응답 헤더 값에는 절대 한글/비ASCII 문자를 직접 넣지 말 것 (필요하면 encodeURIComponent).
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

// [수정] 원래는 카카오톡/페이스북 등 알려진 링크 미리보기 봇의 User-Agent만 걸러서
// (지연 0을 위해) 그때만 og 태그를 바꿔치기했는데, 밴드(band.us)에 실제로 홍보 게시글을
// 올려보니 밴드 자체의 미리보기 크롤러 UA가 이 목록에 없어서 개인화가 전혀 안 먹혔던 게
// 확인됨(실제 밴드 게시글 미리보기 카드가 업체명 없이 "인테리어필름 1분견적"으로만 뜸).
// 새 플랫폼이 나올 때마다 UA를 하나씩 추가하는 건 계속 구멍이 생기는 방식이라, 아예
// UA 검사 자체를 없애고 모든 요청에 대해 처리하도록 변경. 문자열 치환 몇 번뿐이라
// 실제 방문자 체감 지연도 없고, 오히려 브라우저 탭 제목도 처음부터 정확하게 뜨는 장점도 있음.
export default async (request, context) => {
    const response = await context.next();

    try {
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html')) {
            return response;
        }

        const url = new URL(request.url);

        // [New] 현장견적 견적서 링크(/q/<코드>).
        // 카톡 미리보기 카드 제목에 현장명을 띄운다.
        //
        // [중요] 여기서 백엔드를 조회하면 안 된다. 예전에 업체명을 실시간 조회로
        // 가져오게 만들었다가 응답이 1.5~1.8초 걸려 Edge Function 제한시간을 넘겨
        // 응답이 통째로 씹힌 사고가 있었다(위 주석 참조). 그래서 현장명을 링크의
        // ?t= 파라미터에 실어 보내고 여기서는 문자열만 읽는다 — 네트워크 호출 0회.
        if (url.pathname.startsWith('/q/')) {
            const escAttrQ = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
            const escTextQ = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            // n = base64url 로 담은 현장명(주소를 짧게 하려고 2026-09-04 에 바꿈).
            // t = 예전 방식(퍼센트 인코딩). 이미 카톡으로 보낸 링크가 살아 있어야
            // 하므로 둘 다 읽는다. n 이 있으면 n 을 쓴다.
            let 현장명 = '';
            const n = (url.searchParams.get('n') || '').trim();
            if (n) {
                try {
                    const b64 = n.replace(/-/g, '+').replace(/_/g, '/');
                    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
                    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
                    현장명 = new TextDecoder().decode(bytes);
                } catch (e) {
                    // 값이 깨졌으면 이름 없이 기본 제목으로 간다. 페이지는 그대로 나가야 한다.
                    현장명 = '';
                }
            }
            if (!현장명) 현장명 = (url.searchParams.get('t') || '').trim();
            현장명 = 현장명.trim().slice(0, 60);
            const qTitle = 현장명 || '섬세한손길 시공 견적서';
            const qDesc = 현장명 ? '섬세한손길 시공 견적서' : '인테리어필름 시공 견적서입니다.';

            const qHtml = await response.text();
            const out = qHtml
                .replace(/<title>[^<]*<\/title>/, () => `<title>${escTextQ(qTitle)}</title>`)
                .replace(/(<meta property="og:title" content=")[^"]*(")/, (_, a, b) => `${a}${escAttrQ(qTitle)}${b}`)
                .replace(/(<meta property="og:description" content=")[^"]*(")/, (_, a, b) => `${a}${escAttrQ(qDesc)}${b}`);

            // 응답 헤더에는 한글을 절대 넣지 않는다 (HTTP 헤더는 ASCII만 허용 - 과거 500 사고 원인)
            return new Response(out, {
                status: 200,
                headers: { 'content-type': 'text/html; charset=UTF-8' },
            });
        }

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
            return response;
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
        // [중요] 치환 문자열에 $1/$2처럼 캡처그룹을 참조하는 패턴을 쓰면, 치환할 내용(업체명 등) 안에
        // 우연히 '$' 문자가 섞였을 때 결과가 오염될 수 있어서, 항상 콜백 함수 형태로 치환한다.
        // [New] 카톡 미리보기 카드 하단에 뜨는 주소 줄이 항상 "1film.co.kr"처럼 도메인만 짧게
        // 나오는 게 아니라, 실제 클릭된 링크(예: 1film.co.kr/good)까지 끝까지 보이게 og:url도
        // 실제 요청 주소로 바꿔치기함.
        const ogUrl = request.url;

        const html = await response.text();
        const finalHtml = html
            .replace(/<title>[^<]*<\/title>/, () => `<title>${escText(title)}</title>`)
            .replace(/(<meta property="og:title" content=")[^"]*(")/, (_, p1, p2) => `${p1}${escAttr(title)}${p2}`)
            .replace(/(<meta property="og:description" content=")[^"]*(")/, (_, p1, p2) => `${p1}${escAttr(desc)}${p2}`)
            .replace(/(<meta property="og:url" content=")[^"]*(")/, (_, p1, p2) => `${p1}${escAttr(ogUrl)}${p2}`)
            .replace(/(<meta name="twitter:title" content=")[^"]*(")/, (_, p1, p2) => `${p1}${escAttr(title)}${p2}`)
            .replace(/(<meta name="twitter:description" content=")[^"]*(")/, (_, p1, p2) => `${p1}${escAttr(desc)}${p2}`);

        return new Response(finalHtml, {
            status: 200,
            headers: {
                'content-type': 'text/html; charset=UTF-8',
            },
        });
    } catch (e) {
        // 어떤 이유로든 실패하면 원본 정적 페이지를 그대로 서빙 (사이트가 절대 깨지지 않게).
        // [주의] response.text()를 이미 호출한 뒤라면 response.body는 소진된 상태라 재사용할 수
        // 없다 - 그래서 여기서 response.body를 다시 감싸려 하지 않고, 애초에 이 시점까지 온 경우는
        // response.text() 이전 단계(주로 파싱/매핑 로직)에서 난 에러이므로 원본 response를 그대로 반환.
        return response;
    }
};

// path 등록은 netlify.toml의 [[edge_functions]] 블록에서 함 (in-source config와 중복 등록 방지)
