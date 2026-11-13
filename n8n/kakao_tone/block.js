// 🗣 사장님 말투 붙이기 (사장님 11/12) — 비서 흐름(카톡_대화·카톡_비서)이 AI 에 묻기 바로 전에 쓰는 공용 조각.
// 앞 노드 '말투가져오기' 가 사장님_말투(kakao-tone) 에서 { normal: [...], as: [...] } 를 받아 온다. 못 받아도 비서는 그대로 돈다 (말투만 빠짐).
// build.js 들이 이 파일을 읽어 코드 노드 앞에 붙인다. TONE_TARGET = 'system'(카톡_대화) | 'prompt'(카톡_비서)
function toneBlock(t) {
  const fmt = (list) => (Array.isArray(list) ? list : []).slice(0, 40).map((x) =>
    (x.prev ? '업체: ' + String(x.prev).replace(/\s+/g, ' ').slice(0, 80) + '\n' : '') + '사장님: ' + String(x.text || '').replace(/\n/g, ' / ').slice(0, 200)).join('\n\n');
  const normal = fmt(t && t.normal), as = fmt(t && t.as);
  if (!normal && !as) return '';
  return '\n\n[사장님 말투] 업체 사장님·실장님께 보내는 글(문자·카톡·답장)은 아래 사장님이 실제로 보낸 카톡처럼 쓴다.\n' +
    '내용은 따라 쓰지 말고 호칭(실장님~·사장님~)·말끝·길이·물결(~)·쉼표(,,)·이모지 쓰는 버릇만 따른다. 짧게. 사장님께 하는 말은 지금처럼 비서 말투.\n' +
    'AS(하자)·불만·사과가 필요한 상황이면 [AS 때] 예시만 따르고, 그 밖에는 [평소] 예시를 따른다. 긴 숫자는 ● 로 가려져 있다.\n' +
    (normal ? '\n[평소]\n' + normal + '\n' : '') + (as ? '\n[AS 때]\n' + as + '\n' : '');
}
