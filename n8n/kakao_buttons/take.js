// 카톡_버튼 › 할일꺼내기: 노트북이 POST kakao-jobs (사장님 열쇠) 로 부른다 → 안 가져간 할 일을 주고 가져감 표시.
const sd = $getWorkflowStaticData('global');
sd.jobs = (sd.jobs || []).filter((j) => Date.now() - j.at < 7 * 864e5);
const out = sd.jobs.filter((j) => !j.taken).map((j) => ({ job: j.job, action: j.action, at: j.at }));
sd.jobs.forEach((j) => { j.taken = true; });
return [{ json: { jobs: out } }];
