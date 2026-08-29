// 웹푸시 발송 전용 Netlify Function.
// n8n(대시보드_백엔드_V5, 상담신청_알림 등)이 새 이벤트가 생길 때마다 이 함수를 HTTP로 호출하면,
// 여기서 실제 Web Push 프로토콜(VAPID 서명 + 페이로드 암호화)을 처리해서 구독된 브라우저로 알림을 보낸다.
// n8n의 기본 Airtable/HTTP Request 노드만으로는 Web Push의 암호화·서명을 직접 구현하기 어려워서,
// 이미 npm 패키지(web-push)를 쓸 수 있는 이 서버리스 함수 쪽에 그 책임을 분리했다.
const webpush = require('web-push');

// 이 프로젝트 전체에서 공용으로 쓰는 시크릿 토큰과 동일 (n8n 워크플로우들의 x-secret-token과 매칭)
const SECRET_TOKEN = 'songil_secret_2025';

// VAPID 키는 git에 커밋하지 않고 Netlify 환경변수(Site settings > Environment variables)에서 읽는다.
// 공개키(VAPID_PUBLIC_KEY)는 push-notify.js에 그대로 박혀있어도 되는 값(원래 공개용)이지만,
// 개인키(VAPID_PRIVATE_KEY)는 이 서버리스 함수만 알아야 하는 진짜 비밀값이라 여기서는 반드시 환경변수로만 읽는다.
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:admin@1film.co.kr', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-secret-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ success: false, message: 'Method Not Allowed' }) };
  }
  if (event.headers['x-secret-token'] !== SECRET_TOKEN) {
    return { statusCode: 401, headers, body: JSON.stringify({ success: false, message: 'unauthorized' }) };
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY 환경변수가 설정되지 않았습니다.' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'invalid json body' }) };
  }

  const { subscription, title, message, url } = body;
  if (!subscription || !subscription.endpoint) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'subscription missing' }) };
  }

  const payload = JSON.stringify({
    title: title || '1분견적 알림',
    body: message || '',
    url: url || 'https://songil.netlify.app/com_film_dashboard.html',
  });

  try {
    await webpush.sendNotification(subscription, payload);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch (e) {
    // 구독이 만료/취소된 경우(410/404)를 포함해 실패해도 호출한 n8n 워크플로우 자체는 끊기지 않게
    // 200으로 응답하고 success:false만 알려준다 (텔레그램 발송 등 다른 알림 경로는 그대로 진행되도록).
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: false, message: e.message, statusCode: e.statusCode || null }),
    };
  }
};
