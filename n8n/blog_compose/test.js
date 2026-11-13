// node n8n/blog_compose/test.js — 블로그_임시저장_재료 › 글목록 만들기·폴더 고르기·마무리 (사장님 11/13). 이름·주소는 지어낸 것
const path = require('path');
const assert = require('assert');
const wf = JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build.js')]).toString());
const code = (name) => wf.nodes.find((n) => n.name === name).parameters.jsCode;
const nodeRef = (data) => (name) => {
  const rows = (data[name] || []).map((json) => ({ json }));
  return { first: () => rows[0], all: () => rows };
};
const P = (n) => Array.from({ length: n }, (_, i) => ({ url: 'https://x/p' + i + '.jpg' }));

const data = {
  '현장일지 조회': [{
    id: 'recJOURNAL000001a', 일지제목: '그린빌 101동 1일차', 일차: 1, 포함작업목록: 'recTASK2, recTASK1',
    당일공지사항: '현관 비번 공유 금지\n엘리베이터 보양 필수\n직접 쓴 공지',
    오늘의날씨: '맑음', 현장의특징: '오래된 몰딩\n곰팡이 있음', 오늘의에피소드: '',
    필름사진: [{ url: 'https://x/1x1.png' }, ...P(1)], 현장사진: P(2), 정리정돈사진: P(1),
  }],
  '현장 주소 조회': [{ 주소: '인천 어딘가 1-2' }],
  '작업목록 조회': [
    { id: 'recTASK1', 시공품목: '방문', 밑작업기사: '홍길동', 시공기사: '김철수', 시공전사진: P(1), 시공후사진: P(2),
      점검결과: '[✓] 퍼티 마감\n[ ] 비밀 메모', 파손비포사진: P(1), 파손애프터사진: P(1) },
    { id: 'recTASK2', 시공품목: '샤시/창틀', 시공기사: '이영', 시공후사진: P(1), 점검결과: '[✓] 들뜸 없음' },
  ],
  '회사정보 조회': [{ 업체명: '섬세한손길', 대표전화: '010-0000-0000', 홈페이지주소: 'https://example.com',
    발행서식설정: JSON.stringify({ heading: { color: '#ff0000', size: 24 }, worker: { weight: 400 } }) }],
  '자주쓰는공지 조회': [
    { 공지내용: '현관 비번 공유 금지', '공지내용(블로그용)': 'X' },
    { 공지내용: '엘리베이터 보양 필수', '공지내용(블로그용)': '엘리베이터를 꼼꼼히 보양했습니다' },
  ],
  '시공품목 조회': [{ 품목명: '방문', '밑작업지침(블로그용)': '퍼티 마감 → 퍼티로 매끈하게 다듬었습니다\n비밀 메모 → X',
    '시공후점검지침(블로그용)': '비밀 메모 → X' }],
};

const built = new Function('$', code('글목록 만들기'))(nodeRef(data))[0].json;
const items = built.items;
const types = items.map((it) => it.type);
const texts = items.filter((it) => it.text).map((it) => it.text);
const captions = items.filter((it) => it.type === 'image').map((it) => it.caption);

assert.strictEqual(built.title, '그린빌 101동 1일차');
assert.ok(built.driveSearchQuery.includes("name contains '그린빌 101동 1일차 사진'"));
// 공지: X 는 빠지고, 블로그용 문구로 바뀌고, 없는 건 그대로. 줄마다 하나, 노란 바탕
assert.ok(!texts.some((t) => t.includes('비번')), '블로그에서 뺀 공지가 나옴');
const notice = items.filter((it) => it.type === 'text' && it.text.startsWith('📢'));
assert.deepStrictEqual(notice.map((it) => it.text), ['📢 엘리베이터를 꼼꼼히 보양했습니다', '📢 직접 쓴 공지']);
assert.strictEqual(notice[0].style.background, '#fff3cd');
// 큰 제목: 서식설정의 색·크기, 첫 제목 앞에는 구분선이 없음 (주소 뒤라 있음)
const h = items.find((it) => it.type === 'heading');
assert.deepStrictEqual(h.style, { color: '#ff0000', size: 24, bold: true });
assert.strictEqual(types[0], 'text', '주소가 맨 위');
assert.strictEqual(items[0].style.size, 13);
assert.strictEqual(types[1], 'divider');
// 빈 에피소드는 제목도 없음, 여러 줄 특징은 줄마다
assert.ok(!texts.includes('오늘의 에피소드'));
assert.ok(texts.includes('오래된 몰딩') && texts.includes('곰팡이 있음'));
// 작업 순서는 포함작업목록 순서 (샤시 먼저), 소제목 앞에는 구분선
const subs = items.filter((it) => it.type === 'subheading');
assert.deepStrictEqual(subs.map((s) => [s.text, s.kind]), [
  ['시공품목: 샤시/창틀 (시공 내역입니다.)', 'const'],
  ['시공품목: 방문 (밑작업 내역입니다.)', 'prep'],
  ['시공품목: 방문 (시공 내역입니다.)', 'const'],
]);
assert.strictEqual(subs[1].style.background, '#c97b2e');
assert.strictEqual(subs[1].style.color, '#ffffff');
assert.strictEqual(items[items.indexOf(subs[0]) - 1].type, 'divider');
// 기사 이름 가리기, 서식설정의 굵기
const worker = items.find((it) => it.text === '👷 밑작업 기사: 홍OO 기사님');
assert.ok(worker);
assert.strictEqual(worker.style.bold, false);
// 지침: 블로그 문구로, X 줄은 빠짐
assert.ok(texts.includes('✅ 퍼티로 매끈하게 다듬었습니다'));
assert.ok(!texts.some((t) => t.includes('비밀')));
// 사진: 1x1 은 빼고, 번호는 Drive 파일 이름과 같은 순서 (샤시 파일명은 / 를 뺌)
assert.deepStrictEqual(captions, [
  '01 필름사진1', '02 현장사진1', '03 현장사진2',
  '04 샤시창틀 시공사진1',
  '05 방문 밑작업사진1', '06 방문 시공사진1', '07 방문 시공사진2', '08 방문 파손 복구 비포1', '09 방문 파손 복구 애프터1',
  '10 정리정돈사진1',
]);
// 마무리 문구·회사정보
assert.ok(texts.includes('1일차 마무리 했습니다.'));
assert.strictEqual(texts[texts.length - 1], '홈페이지: https://example.com');

// 폴더 고르기: 가장 최근 / 없으면 null
const pick = (files) => new Function('$json', code('폴더 고르기'))({ files })[0].json;
assert.strictEqual(pick([{ id: 'old', createdTime: '2026-01-01' }, { id: 'new', createdTime: '2026-11-01' }]).folderId, 'new');
assert.strictEqual(pick([]).folderId, null);

// 사진마다 Airtable 원본 주소
const imgItems = items.filter((it) => it.type === 'image');
assert.ok(imgItems.every((it) => it.url && it.url.startsWith('https://x/')), '사진마다 url');
assert.strictEqual(imgItems[0].url, 'https://x/p0.jpg', '1x1 은 건너뛰고 첫 진짜 사진');

// 마무리: 이름이 같으면 그 파일 / 수가 같으면 번호로 / 수가 다르면 번호로 안 맞춤
const finish = (folder, files, b) => new Function('$', '$json', code('마무리'))(
  nodeRef({ '글목록 만들기': [b || built], '폴더 고르기': [folder] }), { files })[0].json;
let out = finish({ folderId: 'F1' }, [{ id: 'd1', name: '01 필름사진1.jpg' }, { id: 'd4', name: '04 샤시창틀 시공사진1.png' }]);
assert.strictEqual(out.ok, true, 'url 이 있으니 Drive 가 모자라도 됨');
assert.strictEqual(out.photos, 10);
assert.strictEqual(out.missingPhotos, 0);
let imgs = out.items.filter((it) => it.type === 'image');
assert.deepStrictEqual([imgs[0].driveFileId, imgs[3].driveFileId, imgs[1].driveFileId], ['d1', 'd4', null]);
assert.strictEqual(imgs[0].driveMatch, 'name');
assert.ok(!('driveSearchQuery' in out));
// 발행 뒤 품목 이름을 바꾼 경우 (Drive 는 옛 이름) — 수가 같으면 번호로
const renamedFiles = captions.map((c, k) => ({ id: 'r' + k, name: c.replace('방문', '안방문') + '.jpg' }));
out = finish({ folderId: 'F1' }, renamedFiles);
imgs = out.items.filter((it) => it.type === 'image');
assert.strictEqual(imgs[5].caption, '06 방문 시공사진1');
assert.deepStrictEqual([imgs[5].driveFileId, imgs[5].driveName, imgs[5].driveMatch], ['r5', '06 안방문 시공사진1.jpg', 'number']);
assert.strictEqual(out.driveRenamed, 5);
// 수가 다르면 번호로 맞추지 않음
out = finish({ folderId: 'F1' }, renamedFiles.slice(1));
imgs = out.items.filter((it) => it.type === 'image');
assert.strictEqual(imgs[5].driveFileId, null);
// url 도 Drive 도 없으면 ok:false
const noUrl = Object.assign({}, built, { items: built.items.map((it) => it.type === 'image' ? Object.assign({}, it, { url: undefined }) : it) });
out = finish({ folderId: null }, [{ id: 'x', name: '01 필름사진1.jpg' }], noUrl);
assert.strictEqual(out.ok, false);
assert.strictEqual(out.missingPhotos, 10, '폴더가 없으면 아무 파일도 맞추지 않음');
assert.ok(out.items.find((it) => it.type === 'image').warning);

// 일지번호
const parse = (json) => new Function('$json', code('일지번호'))(json)[0].json.journalId;
assert.strictEqual(parse({ body: { journalId: 'recABCDEFGHIJKLMN' } }), 'recABCDEFGHIJKLMN');
assert.strictEqual(parse({ query: { journalId: ' recABCDEFGHIJKLMN ' } }), 'recABCDEFGHIJKLMN');
assert.throws(() => parse({ body: { journalId: "rec' OR 1" } }));

// 흐름 연결·열쇠
const c = wf.connections;
assert.deepStrictEqual(c['글목록 만들기'].main[0].map((x) => x.node), ['Drive 폴더 찾기']);
assert.deepStrictEqual(c['Drive 사진 받기'].main.map((m) => m[0].node), ['사진 응답', '사진 없음']);
for (const n of ['글목록요청', '사진요청']) {
  assert.strictEqual(wf.nodes.find((x) => x.name === n).parameters.authentication, 'headerAuth', n + ' 에 사장님 열쇠');
}
console.log('blog_compose ok');
