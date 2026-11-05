// 현장관리_빈칸 › 노트북확인: 10분마다. 노트북 신호(worklog.js beat)가 30분 넘게 없으면 텔레그램 한 번, 돌아오면 한 번 (사장님 11/5)
// 밤(21시~8시)에는 안 깨운다 — 그때까지 멈춰 있으면 아침 8시에 알린다
const sd = $getWorkflowStaticData('global');
const now = Date.now();
const hour = new Date(now + 9 * 3600e3).getUTCHours();
const at = (sd.beat && sd.beat.at) || 0;
if (!at) return [];
const late = now - at > 30 * 60e3;
if (late && !sd.beatDown && hour >= 8 && hour < 21) {
  sd.beatDown = now;
  return [{ json: { html: true, text: '🔴 <b>노트북이 멈춘 것 같아요</b>\n' + Math.round((now - at) / 60e3) + '분째 신호가 없습니다 — 카톡 읽기·보내기가 안 되고 있어요.\n노트북을 켜고 python reader.py 를 실행해 주세요.' } }];
}
if (!late && sd.beatDown) {
  delete sd.beatDown;
  return [{ json: { html: true, text: '🟢 <b>노트북이 다시 돌아왔어요</b>' } }];
}
return [];
