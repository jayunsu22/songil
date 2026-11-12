// 카톡_대화 n8n 흐름 JSON 을 만든다: node n8n/kakao_chat/build.js > n8n/kakao_chat/workflow.json
// 앱 🤖 비서 화면 ↔ 클로드 소넷 5.5 (11/12 사장님: 비교해 보니 실수가 가장 적음), 클로드가 안 되면 그 자리에서 Gemini 로 (크레딧 만료·장애).
// 저장 없음 — 대화·현장 상태는 앱이 매번 보낸다 (사장님 11/4).
// 설계 docs/superpowers/specs/2026-11-04-대화형비서-design.md · 시험 node n8n/kakao_chat/test.js
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const OWNER = { httpHeaderAuth: { id: 'Tm4pgTszEk1zUiQ8', name: '사장님 열쇠' } };
const GEM = { googlePalmApi: { id: 'DVT2g7GvXhSY4Y4b', name: 'Google Gemini(PaLM) Api account' } };
const ANT = { anthropicApi: { id: 'XFs5RbM6Mxdpdvzo', name: '앤드로픽열쇠' } };   // 사장님이 직접 넣은 열쇠 (Max 프로모션 크레딧 12/2 까지, 카드 없음)
const CLAUDE_MODEL = 'claude-sonnet-5-5';
// Gemini 모양(contents/parts·inlineData) → 클로드 messages (그림은 image 블록)
const toClaude = "={{ JSON.stringify({ model: '" + CLAUDE_MODEL + "', max_tokens: 8000, system: $json.system + '\\n\\n[답하는 형식] 무슨 말이든 반드시 say·actions·chips 를 가진 JSON 객체 하나로만 답한다. 사진만 보고 말할 때도 say 에 넣는다. JSON 앞뒤에 다른 글·코드 표시·설명을 쓰지 마라.', messages: $json.contents.map((m) => ({ role: m.role === 'model' ? 'assistant' : 'user', "
  + "content: m.parts.map((p) => p.inlineData ? { type: 'image', source: { type: 'base64', media_type: p.inlineData.mimeType, data: p.inlineData.data } } : { type: 'text', text: p.text || ' ' }) })) }) }}";
// 클로드가 안 되면 사장님께 하루 한 번 알림 (넘어가도 대답은 Gemini 로 계속 나간다)
const NOTICE = "const sd = $getWorkflowStaticData('global'); const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);\n"
  + "if (sd.fallbackDay === day) return [];\nsd.fallbackDay = day;\n"
  + "return [{ json: { html: true, text: '🤖 <b>비서: 클로드(소넷) 답을 못 받아 오늘은 제미나이로 대답합니다</b>\\n이유: ' + String($json.error || '').replace(/[<>&]/g, '') + '\\n크레딧 만료(12/2)·잔액이면 Claude Console 결제 화면을 봐 주세요' } }];";
// 🗣 사장님 말투 (11/12): 사장님_말투 에서 평소·AS 예시를 받아 AI 에 묻기 전에 붙인다. 못 받아도 그대로 돈다
const toneFetch = (x) => ({
  id: 'tf', name: '말투가져오기', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [x, 200], continueOnFail: true, alwaysOutputData: true, executeOnce: true, credentials: OWNER,
  parameters: { method: 'POST', url: 'https://primary-production-a6fa.up.railway.app/webhook/kakao-tone', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify({ action: "examples", n: 30, nAs: 12 }) }}', options: { timeout: 8000 } },
});
const toneAttach = (x, field) => ({
  id: 'ta', name: '말투붙이기', type: 'n8n-nodes-base.code', typeVersion: 2, position: [x, 200],
  parameters: { mode: 'runOnceForAllItems', jsCode: fs.readFileSync(path.join(__dirname, '..', 'kakao_tone', 'block.js'), 'utf8') + '\n' +
    "const p = $('프롬프트').first().json;\nlet t = {};\ntry { t = $('말투가져오기').first().json || {}; } catch (e) { t = {}; }\nconst block = toneBlock(t);\n" +
    (field === 'system'
      ? "return [{ json: Object.assign({}, p, { system: p.system + block }) }];"
      : "const mark = '\\n[그 방 최근 대화';\nconst i = String(p.prompt).indexOf(mark);\nreturn [{ json: Object.assign({}, p, { prompt: i < 0 ? p.prompt + block : p.prompt.slice(0, i) + block + p.prompt.slice(i) }) }];") },
});
const code = (id, name, file, x) => ({ id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: [x, 0],
  parameters: { mode: 'runOnceForAllItems', jsCode: read(file) } });
const c = (n) => [[{ node: n, type: 'main', index: 0 }]];
const workflow = {
  name: '카톡_대화',   // n8n id irFJMTUqIGdvy54U
  nodes: [
    {
      id: 'w', name: '대화요청', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: '7e2d4b19-6c83-4a5f-9d17-3b8f0c6e2a51',
      parameters: { httpMethod: 'POST', path: 'kakao-chat', responseMode: 'responseNode', authentication: 'headerAuth', options: { allowedOrigins: '*' } },
      credentials: OWNER,
    },
    code('p', '프롬프트', 'prompt.js', 220),
    toneFetch(220), toneAttach(330, 'system'),
    {
      id: 'a', name: '클로드', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [440, 0], continueOnFail: true, credentials: ANT,
      parameters: {
        method: 'POST', url: 'https://api.anthropic.com/v1/messages',
        authentication: 'predefinedCredentialType', nodeCredentialType: 'anthropicApi',
        sendHeaders: true, headerParameters: { parameters: [{ name: 'anthropic-version', value: '2023-06-01' }] },
        sendBody: true, specifyBody: 'json', jsonBody: toClaude,
        options: { timeout: 90000, response: { response: { neverError: true } } },
      },
    },
    code('r', '결과정리', 'result.js', 660),
    {
      id: 'f', name: '제미나이로', type: 'n8n-nodes-base.if', typeVersion: 2, position: [880, 0],
      parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ id: 'f1', leftValue: '={{ !!$json.fallback }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} },
    },
    {
      id: 'g', name: 'Gemini', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1100, -100], continueOnFail: true, credentials: GEM,
      parameters: {
        method: 'POST', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json',
        jsonBody: "={{ JSON.stringify({ systemInstruction: { parts: [{ text: $('말투붙이기').first().json.system }] }, contents: $('말투붙이기').first().json.contents, generationConfig: { temperature: 0.4, responseMimeType: 'application/json' } }) }}",
        options: { timeout: 60000 },
      },
    },
    Object.assign(code('r2', '결과정리2', 'result.js', 1320), { position: [1320, -100] }),
    { id: 'n', name: '넘김알림', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1100, 150], parameters: { mode: 'runOnceForAllItems', jsCode: NOTICE } },
    {
      id: 'h', name: '알림보내기', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1320, 150], continueOnFail: true, credentials: OWNER,
      parameters: { method: 'POST', url: 'https://primary-production-a6fa.up.railway.app/webhook/kakao-notify', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
        sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json) }}', options: { timeout: 20000 } },
    },
    { id: 'o', name: '응답', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [1540, 0],
      parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}',
        options: { responseHeaders: { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }] } } } },
  ],
  connections: {
    대화요청: { main: c('프롬프트') }, 프롬프트: { main: c('말투가져오기') }, 말투가져오기: { main: c('말투붙이기') }, 말투붙이기: { main: c('클로드') }, 클로드: { main: c('결과정리') }, 결과정리: { main: c('제미나이로') },
    제미나이로: { main: [[{ node: 'Gemini', type: 'main', index: 0 }, { node: '넘김알림', type: 'main', index: 0 }], [{ node: '응답', type: 'main', index: 0 }]] },
    Gemini: { main: c('결과정리2') }, 결과정리2: { main: c('응답') }, 넘김알림: { main: c('알림보내기') },
  },
  settings: { executionOrder: 'v1', timezone: 'Asia/Seoul' },
};
process.stdout.write(JSON.stringify(workflow, null, 2));
