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

    event.waitUntil(
        (async () => {
            try {
                const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
                // 이미 열려있는 탭이 있으면(같은 사이트 origin) 그 탭으로 이동시키고 포커스
                for (const client of clientList) {
                    if (client.url.startsWith(self.registration.scope) && 'navigate' in client) {
                        await client.navigate(url);
                        if ('focus' in client) return client.focus();
                        return;
                    }
                }
            } catch (e) {
                // 위 매칭이 실패해도 아래 openWindow로 폴백
            }
            return self.clients.openWindow(url);
        })()
    );
});
