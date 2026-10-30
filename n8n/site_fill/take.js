// 현장관리_빈칸 › 우편함꺼내기: 현장관리 앱이 POST site-fill-take (사장님 열쇠) {done:[번호]}.
// done 은 그 기기가 칸에 넣은 것 → 지운다. 남은 것을 모두 준다 (이 기기에 없는 현장은 앱이 건너뛰고 다른 기기를 기다린다). 14일 지나면 지움.
const body = $input.first().json.body || {};
const done = new Set((Array.isArray(body.done) ? body.done : []).map(String));
const sd = $getWorkflowStaticData('global');
const now = Date.now();
sd.fills = (sd.fills || []).filter((f) => !done.has(f.id) && now - f.t < 14 * 864e5);
return [{ json: { fills: sd.fills.map((f) => Object.assign({}, f)) } }];
