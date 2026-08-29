// 웹푸시 구독 공용 헬퍼. apply.html(가입완료 화면)과 com_film_dashboard.html(기본정보 탭)에서
// 둘 다 이 파일을 불러와 PushNotify.subscribeToPush(partnerId)만 호출하면 된다.
(function (global) {
    const VAPID_PUBLIC_KEY = 'BM8jyhW7o4JcrHNww-B8eaAvXOqRYUJ8uAfXYkscm68RnEOX62ADjydxtcgEpngcpJZG22DYlVgNJTx7f02KdLc';
    const WEBHOOK_POST_URL = 'https://primary-production-a6fa.up.railway.app/webhook/dashboard-save';

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
        return outputArray;
    }

    // partnerId: Airtable 레코드ID 또는 업체코드 (dashboard-save 웹훅이 둘 다 받아줌)
    async function subscribeToPush(partnerId) {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            throw new Error('이 브라우저(또는 기기)는 알림 기능을 지원하지 않습니다.');
        }
        if (!partnerId) {
            throw new Error('가맹점 정보를 확인할 수 없습니다.');
        }

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            throw new Error('알림 권한이 거부되었습니다. 브라우저 설정에서 알림을 허용해 주세요.');
        }

        const registration = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });
        }

        const res = await fetch(WEBHOOK_POST_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                partnerId: partnerId,
                type: 'partner',
                pushSubscription: JSON.stringify(subscription),
            }),
        });
        if (!res.ok) throw new Error('구독 정보 저장에 실패했습니다.');
        return true;
    }

    async function isSubscribed() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
        try {
            const registration = await navigator.serviceWorker.getRegistration('/sw.js');
            if (!registration) return false;
            const subscription = await registration.pushManager.getSubscription();
            return !!subscription;
        } catch (e) {
            return false;
        }
    }

    global.PushNotify = { subscribeToPush, isSubscribed };
})(window);
