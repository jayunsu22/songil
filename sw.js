// 1분견적 웹푸시 서비스워커.
// 브라우저가 백그라운드/닫힌 상태에서도 push 이벤트를 받아 OS 알림을 띄우기 위한 파일.
// 사이트 루트에 위치해야 전체 페이지 범위(scope: "/")에서 동작한다.

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = { title: '1분견적 알림', body: event.data ? event.data.text() : '' };
    }

    const title = data.title || '1분견적 알림';
    const options = {
        body: data.body || '',
        data: { url: data.url || '/' },
        tag: 'ilbunfilm-notice',
        renotify: true,
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/';
    // 클릭 직후 "사용자 조작" 상태가 살아있는 아주 짧은 시간 안에 openWindow를 바로 호출해야
    // 안드로이드 크롬 등에서 정상적으로 새 창/탭이 열린다. 그 전에 await로 다른 비동기 작업
    // (예: 기존 탭 찾기)을 먼저 하면 그 사이에 상태가 만료되어 조용히 아무 일도 안 일어난다.
    event.waitUntil(self.clients.openWindow(url));
});
