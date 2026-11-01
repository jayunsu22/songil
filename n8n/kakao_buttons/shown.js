// 카톡_버튼 › 표시: 텔레그램에 답하고 글을 고칠 내용 — 문자를 보냈으면 문자결과, 인원 모집이면 모집결과, 아니면 버튼정리 그대로
const pick = $('문자결과').isExecuted ? '문자결과' : $('모집결과').isExecuted ? '모집결과' : '버튼정리';
return [{ json: $(pick).first().json }];
