// 블로그_임시저장_재료 n8n 흐름 JSON 을 만든다: node n8n/blog_compose/build.js > n8n/blog_compose/workflow.json
// 노트북(블로그 임시저장 프로그램)이 POST blog-compose-v2 { journalId } 로 부르면
// 현장일지 한 일차를 네이버 글쓰기에 넣을 순서대로 '글목록'(items)으로 돌려준다 (사장님 11/13: 노션 없이 네이버 임시저장).
// 기존 '블로그 발행 JSON API (PC 자동화 연동, 신규)' (blog-compose) 는 그대로 두고, 이건 발행도우미와 같은 서식
// (큰 제목·밑작업/시공 소제목·구분선·줄마다 색/크기/굵기, 회사정보.발행서식설정) 을 같이 넣은 새 버전.
// 사진은 Airtable 원본 주소(url)로 받고, 블로그 발행 때 만든 Drive '(일지제목) 사진' 폴더 사본(driveFileId)은 예비로 붙인다.
// 사진 받기: GET blog-image-v2?fileId=… (사장님 열쇠).
const AIRTABLE = { airtableTokenApi: { id: 'J5wefJCMalpjjm3Q', name: 'Airtable Personal Access Token account 2' } };
const DRIVE = { googleDriveOAuth2Api: { id: '7CvqGwBS9IT5oDdh', name: 'Google Drive account' } };
const OWNER_KEY = { httpHeaderAuth: { id: 'Tm4pgTszEk1zUiQ8', name: '사장님 열쇠' } };
const BASE = { __rl: true, value: 'appV2Qy61YVhyRkZV', mode: 'list' };
const BLOG_PHOTO_ROOT = '1aROA5LyUI2aTnLA47mWoTD3WyJ5VpXYE'; // 블로그 사진 폴더들이 들어 있는 Drive 폴더

const airtable = (id, name, x, table, extra) => ({
  id, name, type: 'n8n-nodes-base.airtable', typeVersion: 2, position: [x, 0],
  parameters: Object.assign({ base: BASE, table: { __rl: true, value: table, mode: 'list' }, options: {} }, extra),
  credentials: AIRTABLE,
});

// ---- 글목록 만들기 (발행도우미 'PB 발행도우미 HTML 생성' 과 같은 순서·문구·서식) ----
const COMPOSE = String.raw`// 블로그_임시저장_재료 › 글목록 만들기: 현장일지 한 일차 → 네이버 글쓰기에 넣을 순서대로 items.
// 순서·문구는 발행도우미(PB 발행도우미 HTML 생성)·노션 블록 조립과 같다. 서식은 회사정보.발행서식설정(서식설정 화면) 을 따른다.
// items: heading{text,style} · subheading{text,kind:'prep'|'const',style} · divider · text{text,style} (한 줄에 하나) · image{caption,url,filename}
// image.url = Airtable 첨부 원본 주소 (몇 시간 뒤 만료 — 노트북이 받자마자 내려받는다)
const journal = $('현장일지 조회').first().json;
const projectInfo = $('현장 주소 조회').first()?.json || {};
const rawTasks = $('작업목록 조회').all().filter(t => t.json && Object.keys(t.json).length > 0);

let tasks = rawTasks;
const orderList = (journal.포함작업목록 || '').split(',').map(s => s.trim()).filter(Boolean);
if (orderList.length > 0) {
    const byId = new Map(rawTasks.map(t => [t.json.id, t]));
    const ordered = orderList.map(id => byId.get(id)).filter(Boolean);
    const orderedIds = new Set(orderList);
    const leftovers = rawTasks.filter(t => !orderedIds.has(t.json.id));
    tasks = ordered.concat(leftovers);
}
const company = $('회사정보 조회').first()?.json || {};

const STYLE_DEFAULTS = {
    heading: { color: '#1a5fb4', size: 20, weight: 800 },
    prepAccent: { color: '#c97b2e', size: 13, weight: 800 },
    constAccent: { color: '#2f5fa8', size: 13, weight: 800 },
    photoTag: { color: '#1a5fb4', size: 14, weight: 700 },
    notice: { color: '#333333', size: 14, weight: 400 },
    check: { color: '#226039', size: 14, weight: 400 },
    worker: { color: '#555555', size: 14, weight: 700 },
    focus: { color: '#555555', size: 14, weight: 700 },
    body: { color: '#333333', size: 14, weight: 400 },
    address: { color: '#555555', size: 13, weight: 400 },
    weather: { color: '#333333', size: 14, weight: 400 },
    feature: { color: '#333333', size: 14, weight: 400 },
    episode: { color: '#333333', size: 14, weight: 400 },
    closing: { color: '#333333', size: 14, weight: 700 },
    company: { color: '#767b85', size: 13, weight: 400 }
};
let savedStyle = {};
try { savedStyle = JSON.parse(company.발행서식설정 || '{}'); } catch (e) { savedStyle = {}; }
const STYLE = {};
Object.keys(STYLE_DEFAULTS).forEach(key => {
    STYLE[key] = Object.assign({}, STYLE_DEFAULTS[key], savedStyle[key] || {});
});
const NOTICE_BG = '#fff3cd';
function st(key, extra) {
    const s = STYLE[key];
    return Object.assign({ color: s.color, size: Number(s.size), bold: Number(s.weight) >= 700 }, extra || {});
}

const quickNoticeMap = new Map(
    $('자주쓰는공지 조회').all().map(n => [
        (n.json.공지내용 || '').trim(),
        (n.json['공지내용(블로그용)'] || '').trim()
    ])
);
const itemTemplateMap = new Map(
    $('시공품목 조회').all().map(n => [n.json.품목명, n.json])
);

function validPhotos(arr) {
    return (arr || []).filter(a => a.url && !a.url.includes('1x1.png'));
}

const items = [];
let photoNum = 1;

// 여러 줄 글은 줄마다 나눠 줄 머리(📢 ✅ ☐ 👷 🔍)로 서식을 고른다. styleKey 가 있으면 그 서식.
function paragraph(text, styleKey) {
    if (!text) return;
    String(text).split('\n').map(l => l.trim()).filter(l => l !== '').forEach(line => {
        let style;
        if (styleKey) style = st(styleKey);
        else if (/^📢/.test(line)) style = st('notice', { background: NOTICE_BG });
        else if (/^✅/.test(line)) style = st('check');
        else if (/^☐/.test(line)) style = st('body', { color: '#999999' });
        else if (/^👷/.test(line)) style = st('worker');
        else if (/^🔍/.test(line)) style = st('focus');
        else style = st('body');
        items.push({ type: 'text', text: line, style });
    });
}
function divider() { items.push({ type: 'divider' }); }
function heading(text) {
    if (items.length > 0) divider();
    items.push({ type: 'heading', text, style: st('heading') });
}
function subheading(text, kind) {
    divider();
    const a = STYLE[kind === 'prep' ? 'prepAccent' : 'constAccent'];
    items.push({ type: 'subheading', text, kind, style: { color: '#ffffff', background: a.color, size: Number(a.size), bold: Number(a.weight) >= 700 } });
}
function photo(caption, p) {
    items.push({ type: 'image', caption: String(photoNum).padStart(2, '0') + ' ' + caption, url: p.url, filename: p.filename || null });
    photoNum++;
}

const safeTitle = journal.일지제목 || '현장명 미확인';

if (projectInfo.주소) paragraph('주소: ' + projectInfo.주소, 'address');

if (journal.당일공지사항) {
    const noticeLines = journal.당일공지사항
        .split('\n').map(l => l.trim()).filter(l => l !== '')
        .map(l => {
            if (!quickNoticeMap.has(l)) return l;
            const blogText = quickNoticeMap.get(l);
            if (blogText && blogText.trim().toUpperCase() === 'X') return null; // X = 블로그에서 뺌
            return blogText || l;
        })
        .filter(l => l !== null)
        .map(l => '📢 ' + l)
        .join('\n');
    if (noticeLines) {
        heading('공지사항');
        paragraph(noticeLines);
    }
}

if (journal.오늘의날씨) { heading('오늘의 날씨'); paragraph(journal.오늘의날씨, 'weather'); }
if (journal.현장의특징) { heading('현장의 특징'); paragraph(journal.현장의특징, 'feature'); }
if (journal.오늘의에피소드) { heading('오늘의 에피소드'); paragraph(journal.오늘의에피소드, 'episode'); }

const filmPhotos = validPhotos(journal.필름사진);
if (filmPhotos.length > 0) {
    heading('필름 사진');
    filmPhotos.forEach((p, i) => photo('필름사진' + (i + 1), p));
}
const scenePhotos = validPhotos(journal.현장사진);
if (scenePhotos.length > 0) {
    heading('오늘의 현장사진');
    scenePhotos.forEach((p, i) => photo('현장사진' + (i + 1), p));
}

function maskName(name) {
    if (!name) return '';
    return name.length > 1 ? name[0] + 'O'.repeat(name.length - 1) : name;
}
// 블로그용 지침: 한 줄에 "원본 문구 → 블로그 설명". X 면 그 줄을 뺀다.
function parseBlogGuideMap(raw) {
    const map = new Map();
    (raw || '').split('\n').forEach(line => {
        const arrowIdx = line.indexOf('→');
        if (arrowIdx === -1) return;
        const key = line.slice(0, arrowIdx).trim();
        const value = line.slice(arrowIdx + 1).trim();
        if (key) map.set(key, value);
    });
    return map;
}
function buildBlogCheckLines(raw, blogMap) {
    return (raw || '')
        .split('\n').map(l => l.trim()).filter(l => l !== '')
        .map(l => {
            const checked = l.startsWith('[✓]');
            const t = l.replace(/^\[[✓ ]\]\s*/, '');
            const blogText = blogMap.has(t) ? blogMap.get(t) : null;
            if (blogText && blogText.trim().toUpperCase() === 'X') return null;
            return (checked ? '✅' : '☐') + ' ' + (blogText || t);
        })
        .filter(line => line !== null)
        .join('\n');
}

if (tasks.length > 0) {
    heading('오늘의 시공내역');
    tasks.forEach((t) => {
        const f = t.json;
        const itemName = (f.시공품목 || '시공품목').replace(/[\/:*?"<>|]/g, '');
        const before = validPhotos(f.시공전사진);
        const after = validPhotos(f.시공후사진);
        const itemTemplate = itemTemplateMap.get(f.시공품목) || {};
        const prepBlogMap = parseBlogGuideMap(itemTemplate['밑작업지침(블로그용)']);
        const inspBlogMap = parseBlogGuideMap(itemTemplate['시공후점검지침(블로그용)']);

        if (f.밑작업기사) {
            subheading('시공품목: ' + (f.시공품목 || '') + ' (밑작업 내역입니다.)', 'prep');
            paragraph('👷 밑작업 기사: ' + maskName(f.밑작업기사) + ' 기사님');
            before.forEach((p, i) => photo(itemName + ' 밑작업사진' + (i + 1), p));
            paragraph('🔍 밑작업 중점사항:\n' + buildBlogCheckLines(f.점검결과, prepBlogMap));
        }
        if (f.시공기사) {
            subheading('시공품목: ' + (f.시공품목 || '') + ' (시공 내역입니다.)', 'const');
            paragraph('👷 시공 기사: ' + maskName(f.시공기사) + ' 기사님');
            after.forEach((p, i) => photo(itemName + ' 시공사진' + (i + 1), p));
            const damageBefore = validPhotos(f.파손비포사진);
            const damageAfter = validPhotos(f.파손애프터사진);
            const n = Math.max(damageBefore.length, damageAfter.length);
            for (let i = 0; i < n; i++) {
                if (damageBefore[i]) photo(itemName + ' 파손 복구 비포' + (i + 1), damageBefore[i]);
                if (damageAfter[i]) photo(itemName + ' 파손 복구 애프터' + (i + 1), damageAfter[i]);
            }
            paragraph('🔍 시공 중점사항:\n' + buildBlogCheckLines(f.점검결과, inspBlogMap));
        }
    });
}

const cleanupPhotos = validPhotos(journal.정리정돈사진);
if (cleanupPhotos.length > 0) {
    heading('정리정돈 사진');
    cleanupPhotos.forEach((p, i) => photo('정리정돈사진' + (i + 1), p));
}

paragraph((journal.일차 || '') + '일차 마무리 했습니다.', 'closing');
paragraph('꿈꿈하고 정성스럽게 섬세한 손길이었습니다.', 'closing');
paragraph('감사합니다.', 'closing');

heading('회사정보');
paragraph(company.업체명 || '섬세한손길', 'company');
paragraph('대표번호: ' + (company.대표전화 || '010-6657-1222'), 'company');
paragraph('홈페이지: ' + (company.홈페이지주소 || 'https://1film.co.kr/songil'), 'company');

const escapedTitle = safeTitle.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const driveSearchQuery = "'${BLOG_PHOTO_ROOT}' in parents and name contains '" + escapedTitle + " 사진' and mimeType='application/vnd.google-apps.folder' and trashed=false";

return [{ json: { title: safeTitle, journalId: journal.id, day: journal.일차 || null, driveSearchQuery, items } }];
`;

// ---- Drive 폴더 고르기: 같은 이름이 여럿이면 가장 최근. 없으면 멈추지 않고 '폴더없음' 으로 넘김 ----
const PICK = String.raw`// 블로그_임시저장_재료 › 폴더 고르기: '(일지제목) 사진' 폴더 중 가장 최근 것. 없으면 folderId 없이 넘겨 '마무리' 가 알려 준다.
const folders = ($json.files || []).slice();
folders.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
const f = folders[0];
return [{ json: { folderId: f ? f.id : null, folderName: f ? f.name : null } }];
`;

// ---- 마무리: 사진 캡션 ↔ Drive 파일 이름 맞추기 ----
const FINISH = String.raw`// 블로그_임시저장_재료 › 마무리: 사진마다 받을 곳을 붙인다.
// 1) url = Airtable 원본 (늘 지금 사진, 노트북이 먼저 쓴다)  2) driveFileId = 발행 때 Drive 에 저장한 사본 (예비)
// Drive 파일 이름은 발행할 때의 이름이라, 그 뒤 품목 이름을 바꾸면 ('안방파티션' → '방1파티션') 이름이 안 맞는다 (11/13 송도 퍼스트월드).
// 그래서 이름이 같으면 그 파일, 아니면 사진 수가 Drive 와 똑같을 때만 번호('03')로 맞춘다 (수가 다르면 번호가 밀렸을 수 있어 안 맞춤).
const built = $('글목록 만들기').first().json;
const folder = $('폴더 고르기').first().json;
const files = folder.folderId ? ($json.files || []) : [];
const stripExt = (name) => String(name).replace(/\.[^/.]+$/, '');
const numOf = (s) => (String(s).match(/^(\d+) /) || [])[1] || null;
const byCaption = new Map(files.map(f => [stripExt(f.name), f]));
const byNum = new Map(files.filter(f => numOf(f.name)).map(f => [numOf(f.name), f]));
const photos = built.items.filter(it => it.type === 'image').length;
const numberOk = files.length === photos && byNum.size === photos;
let missing = 0;
let renamed = 0;
const items = built.items.map(it => {
    if (it.type !== 'image') return it;
    let m = byCaption.get(it.caption);
    let how = m ? 'name' : null;
    if (!m && numberOk) { m = byNum.get(numOf(it.caption)); if (m) { how = 'number'; renamed++; } }
    const out = Object.assign({}, it, { driveFileId: m ? m.id : null, driveName: m ? m.name : null, driveMatch: how });
    if (!it.url && !m) { missing++; out.warning = '사진을 받을 곳이 없습니다 (Airtable 첨부도 Drive 사본도 없음)'; }
    return out;
});
return [{ json: { ok: missing === 0, version: 2, title: built.title, journalId: built.journalId, day: built.day,
    folderId: folder.folderId, photos, missingPhotos: missing, driveRenamed: renamed, items } }];
`;

const PARSE = String.raw`// 블로그_임시저장_재료 › 일지번호: POST body { journalId: "rec…" } (시험용으로 ?journalId= 도 받음)
const body = $json.body || {};
const query = $json.query || {};
const journalId = String(body.journalId || query.journalId || '').trim();
if (!/^rec[A-Za-z0-9]{14}$/.test(journalId)) throw new Error('journalId 가 필요합니다 (rec 로 시작하는 17자). 받은 값: ' + journalId);
return [{ json: { journalId } }];
`;

const IMG_PARSE = String.raw`// 블로그_임시저장_재료 › 사진번호: GET blog-image-v2?fileId=…
const fileId = String(($json.query || {}).fileId || '').trim();
if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) throw new Error('fileId 가 필요합니다');
return [{ json: { fileId } }];
`;

const workflow = {
  name: '블로그_임시저장_재료',
  nodes: [
    {
      id: 'w', name: '글목록요청', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [-240, 0],
      webhookId: 'c1fa7e3b-92a0-4404-984a-7dadd1638551',
      parameters: { httpMethod: 'POST', path: 'blog-compose-v2', responseMode: 'responseNode', authentication: 'headerAuth', options: {} },
      credentials: OWNER_KEY,
    },
    { id: 'p', name: '일지번호', type: 'n8n-nodes-base.code', typeVersion: 2, position: [0, 0], parameters: { jsCode: PARSE } },
    airtable('j', '현장일지 조회', 220, '현장일지', { id: '={{ $json.journalId }}' }),
    Object.assign(airtable('t', '작업목록 조회', 440, 'tblj2GWegEvPHICsb', {
      operation: 'search',
      filterByFormula: "={{ $('현장일지 조회').first().json.포함작업목록 ? (\"OR(\" + $('현장일지 조회').first().json.포함작업목록.split(',').map(id => \"RECORD_ID()='\" + id.trim() + \"'\").join(\",\") + \")\") : \"FALSE()\" }}",
    }), { alwaysOutputData: true, executeOnce: true }),
    Object.assign(airtable('s', '현장 주소 조회', 660, '현장목록', { id: "={{ $('현장일지 조회').first().json.현장[0] }}" }), { executeOnce: true, alwaysOutputData: true, onError: 'continueRegularOutput' }),
    Object.assign(airtable('c', '회사정보 조회', 880, '회사정보', { operation: 'search' }), { executeOnce: true, alwaysOutputData: true }),
    Object.assign(airtable('n', '자주쓰는공지 조회', 1100, '자주쓰는공지', { operation: 'search' }), { executeOnce: true, alwaysOutputData: true }),
    Object.assign(airtable('i', '시공품목 조회', 1320, '시공품목', { operation: 'search' }), { executeOnce: true, alwaysOutputData: true }),
    { id: 'b', name: '글목록 만들기', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1540, 0],
      notes: 'Why Code: 발행도우미와 같은 순서·문구·서식 규칙(공지/지침 블로그용 문구 바꾸기, 기사 이름 가리기, 사진 번호)을 한 번에 만든다.',
      parameters: { jsCode: COMPOSE } },
    {
      id: 'ds', name: 'Drive 폴더 찾기', type: 'n8n-nodes-base.httpRequest', typeVersion: 3, position: [1760, 0],
      parameters: {
        url: 'https://www.googleapis.com/drive/v3/files', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api',
        sendQuery: true,
        queryParameters: { parameters: [
          { name: 'q', value: '={{ $json.driveSearchQuery }}' },
          { name: 'fields', value: 'files(id,name,createdTime)' },
          { name: 'orderBy', value: 'createdTime desc' },
        ] },
        options: {},
      },
      credentials: DRIVE,
    },
    { id: 'dp', name: '폴더 고르기', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1980, 0], parameters: { jsCode: PICK } },
    {
      id: 'df', name: 'Drive 사진목록', type: 'n8n-nodes-base.httpRequest', typeVersion: 3, position: [2200, 0],
      parameters: {
        url: 'https://www.googleapis.com/drive/v3/files', authentication: 'predefinedCredentialType', nodeCredentialType: 'googleDriveOAuth2Api',
        sendQuery: true,
        queryParameters: { parameters: [
          { name: 'q', value: "={{ $json.folderId ? \"'\" + $json.folderId + \"' in parents and trashed=false\" : \"name = '__없는폴더__' and trashed=false\" }}" },
          { name: 'fields', value: 'files(id,name)' },
          { name: 'pageSize', value: '1000' },
        ] },
        options: {},
      },
      credentials: DRIVE,
    },
    { id: 'f', name: '마무리', type: 'n8n-nodes-base.code', typeVersion: 2, position: [2420, 0], parameters: { jsCode: FINISH } },
    {
      id: 'r', name: '응답', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [2640, 0],
      parameters: { respondWith: 'json', responseBody: '={{ $json }}', options: {} },
    },

    // ---- 사진 받기 ----
    {
      id: 'iw', name: '사진요청', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [-240, 400],
      webhookId: '1f4973cd-061d-446d-80a8-07ece4bbfe3f',
      parameters: { httpMethod: 'GET', path: 'blog-image-v2', responseMode: 'responseNode', authentication: 'headerAuth', options: {} },
      credentials: OWNER_KEY,
    },
    { id: 'ip', name: '사진번호', type: 'n8n-nodes-base.code', typeVersion: 2, position: [0, 400], parameters: { jsCode: IMG_PARSE } },
    {
      id: 'id', name: 'Drive 사진 받기', type: 'n8n-nodes-base.googleDrive', typeVersion: 2, position: [220, 400],
      parameters: { resource: 'file', operation: 'download', fileId: { __rl: true, value: '={{ $json.fileId }}', mode: 'id' }, options: {} },
      credentials: DRIVE,
      onError: 'continueErrorOutput',
    },
    {
      id: 'ir', name: '사진 응답', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [440, 300],
      parameters: {
        respondWith: 'binary', responseDataSource: 'set', inputFieldName: 'data',
        options: { responseHeaders: { entries: [
          { name: 'Content-Type', value: '={{ $binary.data.mimeType }}' },
          { name: 'Content-Disposition', value: "=attachment; filename*=UTF-8''{{ encodeURIComponent($binary.data.fileName) }}" },
        ] } },
      },
    },
    {
      id: 'ie', name: '사진 없음', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [440, 500],
      parameters: {
        respondWith: 'json',
        responseBody: "={{ { error: 'Drive 에서 사진을 못 받았습니다', fileId: $('사진번호').first().json.fileId } }}",
        options: { responseCode: 404 },
      },
    },
  ],
  connections: {},
  settings: { executionOrder: 'v1' },
};

const chain = ['글목록요청', '일지번호', '현장일지 조회', '작업목록 조회', '현장 주소 조회', '회사정보 조회', '자주쓰는공지 조회',
  '시공품목 조회', '글목록 만들기', 'Drive 폴더 찾기', '폴더 고르기', 'Drive 사진목록', '마무리', '응답'];
const link = (a, b, out = 0) => {
  const c = workflow.connections[a] = workflow.connections[a] || { main: [] };
  while (c.main.length <= out) c.main.push([]);
  c.main[out].push({ node: b, type: 'main', index: 0 });
};
for (let k = 0; k + 1 < chain.length; k++) link(chain[k], chain[k + 1]);
link('사진요청', '사진번호');
link('사진번호', 'Drive 사진 받기');
link('Drive 사진 받기', '사진 응답', 0);
link('Drive 사진 받기', '사진 없음', 1);

process.stdout.write(JSON.stringify(workflow, null, 2) + '\n');
