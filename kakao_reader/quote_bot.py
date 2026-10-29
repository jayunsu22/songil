"""카톡 견적 문의 → 현장견적 앱(quote_pro.html)에서 가견적 발행 (따로 쓰는 크롬, Playwright).

앱의 계산·규칙을 그대로 쓰려고 사람이 하던 순서를 그대로 누른다:
  새 견적 → 📋 요청 붙여넣기(카톡) → 초안 만들기 → 품목마다 사진 넣기 → 저장 → 발행(가견적, 메모에 빠진 정보) → 링크.
빠진 정보는 묻지 않고 견적서 메모에 적는다 (사장님 2026-10-29).

    python quote_bot.py --setup      # 처음 한 번: 크롬 창이 뜨면 관리자 암호를 사장님이 직접 넣는다
    python quote_bot.py --try "방문3개 부평 삼산동" [사진...]   # 시험 발행 (김정헌 이름으로)
    python quote_bot.py --revise XFXUPBRJ 샤시=2중창            # 발행한 견적 고쳐 다시 발행
"""
import json
import os
import sys
import time
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
PROFILE = os.path.join(HERE, "browser_profile")
APP = "https://songil.netlify.app/quote_pro.html"
DRAFT_TIMEOUT = 110_000


def _key():
    with open(os.path.join(HERE, "config.json"), encoding="utf-8-sig") as f:
        k = json.load(f).get("owner_key", "")
    import re
    import urllib.parse
    m = re.search(r"key=([^&\s]+)", k)
    return urllib.parse.unquote(m.group(1)) if m else k


def _open(p, headless):
    ctx = p.chromium.launch_persistent_context(PROFILE, headless=headless, viewport={"width": 1280, "height": 900},
                                               locale="ko-KR", timezone_id="Asia/Seoul")
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.on("dialog", lambda d: d.accept())  # '새로 시작할까요?' 같은 확인 창은 '예'
    page.goto(APP)
    page.evaluate("k => localStorage.setItem('ownerKey', k)", _key())
    page.reload()
    return ctx, page


def setup():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        ctx, page = _open(p, headless=False)
        print("크롬 창에서 관리자 암호를 넣어 주세요 (5분 기다립니다).", flush=True)
        ok = False
        for _ in range(300):
            if page.evaluate("() => !document.getElementById('pinGate') && localStorage.getItem('settleUnlocked')"):
                ok = True
                break
            time.sleep(1)
        page.wait_for_timeout(1500)
        print("준비 완료" if ok else "아직 잠겨 있어요 — 다시 --setup 해 주세요")
        ctx.close()


def _wait_master(page):
    page.wait_for_function("() => typeof MASTER !== 'undefined' && MASTER && MASTER.zones && MASTER.zones.length", timeout=60_000)


def _publish_and_wait(page):
    """발행 창에서 [발행하기] → 링크. 앱은 링크를 먼저 주고 사진을 뒤에서 올리므로 다 올라갈 때까지 기다린다."""
    page.check("#optDesc")  # 품목설명 포함 (링크에 d=1)
    page.click('#kindRow button[data-kind="가견적"]')
    page.click("#doPublish")
    page.wait_for_selector("#pubAfter:not([hidden])", timeout=90_000)
    page.wait_for_timeout(1500)
    page.wait_for_function("() => !사진올리는중", timeout=180_000)
    if page.evaluate("() => !document.getElementById('photoRetry').hidden"):
        raise RuntimeError("발행은 됐지만 사진 일부가 안 올라감: " + page.inner_text("#photoUp")[:100])
    return page.evaluate("() => 링크()")


def _row_name(page, cid):
    return page.evaluate("(id) => { for (const z of MASTER.zones) for (const it of z.items) if (it.체크_ID === id) return z.구역 + ' ' + it.표시_품목명; return id; }", cid)


def revise(code, options=None, memo=None, headless=True):
    """발행한 견적(code)을 불러와 고쳐서 가견적으로 다시 발행. 새 링크를 돌려준다 (앞 견적은 '이전 견적코드' 로 남는다).
    options: {'샤시': '2중창'} — 이름이 '샤시' 로 시작하는 품목의 종류를 '2중창' 이 들어간 옵션으로.
    memo: 메모를 이걸로 바꾼다 (None 이면 그대로)."""
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        ctx, page = _open(p, headless)
        try:
            _wait_master(page)
            # 이 크롬의 저장함에 있으면 그걸(사진까지) 열고, 없으면 발행된 견적서에서 가져온다
            found = page.evaluate("""async (code) => {
                let 항목 = 저장함읽기().find((x) => x.현장코드 === code || (x.상태 && x.상태.현장코드 === code));
                if (!항목) 항목 = await 발행견적가져오기(code, null, true);
                if (!항목) return false;
                저장함불러오기(항목);
                return true;
            }""", code)
            if not found:
                raise RuntimeError("견적을 못 찾음: " + code)
            changed = []
            for name, opt in (options or {}).items():
                r = page.evaluate("""([name, opt]) => {
                    const out = [];
                    for (const z of MASTER.zones) for (const it of z.items) {
                        const s = state.선택[it.체크_ID];
                        if (!s || !String(it.표시_품목명).startsWith(name)) continue;
                        const i = (it.옵션들 || []).findIndex((o) => String(o.품목명 || o.옵션명 || '').includes(opt));
                        if (i >= 0) { s.옵션 = i; out.push(z.구역 + ' ' + it.표시_품목명 + ' → ' + opt); }
                    }
                    buildAll(); refresh(); persist();
                    return out;
                }""", [name, opt])
                if not r:
                    raise RuntimeError("바꿀 품목·종류를 못 찾음: %s %s" % (name, opt))
                changed += r
            page.click("#saveBtn")
            page.wait_for_timeout(800)
            page.click("#publishBtn")
            page.wait_for_selector("#pubSheet:not([hidden])")
            if memo is not None:
                page.fill("#memoText", memo)
                page.dispatch_event("#memoText", "input")
            link = _publish_and_wait(page)
            page.evaluate("() => 저장함에담기()")  # 고친 내용(메모 포함)을 저장함에도
            total = page.evaluate("() => (window.__quote && window.__quote.result.총액) || 0")
            return {"link": link, "title": page.evaluate("() => state.현장명"), "changed": changed, "total": total}
        finally:
            ctx.close()


def publish(text, photos, client="김정헌", received_at=None, headless=True):
    """가견적을 발행하고 {link, title, items, missing, unmatched} 를 돌려준다. 실패하면 예외."""
    from playwright.sync_api import sync_playwright
    received_at = received_at or datetime.now(timezone.utc).isoformat()
    with sync_playwright() as p:
        ctx, page = _open(p, headless)
        try:
            if page.evaluate("() => !!document.getElementById('pinGate')"):
                raise RuntimeError("현장견적이 잠겨 있음 — python quote_bot.py --setup 으로 관리자 암호를 한 번 넣어 주세요")
            _wait_master(page)
            page.click("#resetBtn")
            page.wait_for_timeout(500)
            # 현장관리 '견적요청 작성하기' 로 연 것처럼: 접수일시·거래처명 → 제목 '위치 가견적 10월29일 오후8시(김정헌)'
            page.evaluate("([t, c]) => { state.요청 = { 접수일시: t, 거래처명: c }; state.현장명 = ''; persist(); }", [received_at, client])

            page.click("#draftToggle")
            page.click('.draft-chips[data-k="출처"] button[data-v="카톡"]')
            page.click('.draft-chips[data-k="보낸이"] button[data-v="고객"]')
            page.fill("#draftText", text)
            page.click("#draftGo")
            page.wait_for_function("() => { const b = document.getElementById('draftGo'); return !b.disabled && !document.getElementById('draftResult').hidden; }",
                                   timeout=DRAFT_TIMEOUT)
            if page.evaluate("() => document.getElementById('draftResult').classList.contains('err')"):
                raise RuntimeError("초안 실패: " + page.inner_text("#draftResult")[:200])
            ids = page.evaluate("() => Object.keys(state.선택)")
            if not ids:
                raise RuntimeError("품목을 못 읽음: " + page.inner_text("#draftResult")[:200])
            info = page.evaluate("""() => {
                const 이름 = (id) => { for (const z of MASTER.zones) for (const it of z.items) if (it.체크_ID === id) return (z.구역 + ' ' + it.표시_품목명); return id; };
                const 공통 = (state.요청초안 && state.요청초안.공통) || {};
                return { items: Object.keys(state.선택).map(이름), missing: RequestDraft.빠진것(공통),
                         unmatched: ((state.요청초안 && state.요청초안.확인필요) || []).map((x) => x.품목명) };
            }""")

            # 사진: 품목 수와 같으면 말한 순서대로 한 장씩, 아니면 전부 첫 품목에 (첫 사진 = 방1 규칙과 같은 방향)
            if photos:
                groups = [[ph] for ph in photos] if len(photos) == len(ids) else [list(photos)]
                for cid, files in zip(ids, groups):
                    # 품목 줄 '사진' 버튼이 하는 일 그대로 (접힌 구역은 버튼이 안 보여서 함수를 직접 부른다)
                    page.evaluate("""(id) => { for (const z of MASTER.zones) for (const it of z.items) if (it.체크_ID === id)
                        return 사진트레이열기(z.구역, { 구역: z.구역, 체크_ID: id, 품목명: it.표시_품목명 }); }""", cid)
                    page.wait_for_selector("#traySheet:not([hidden])")
                    page.set_input_files("#trayPick", files)
                    # 사진이 그 품목에 묶일 때까지 기다린다. 먼저 닫으면 사진대상이 비어 품목 없는 사진이 된다 (10/29 샤시 사진 빠짐)
                    page.wait_for_function("(id) => 표시된품목.has(id)", arg=cid, timeout=60_000)
                    page.wait_for_timeout(500)
                    page.evaluate("() => { const b = document.querySelector('#trayClose, #traySheet .close, #trayDone'); if (b) b.click(); else { document.getElementById('trayBack').click(); } }")
                    page.wait_for_timeout(400)

            title = page.evaluate("() => 요청제목만들기()") or ""
            if title:
                page.evaluate("t => { state.현장명 = t; const el = document.getElementById('siteName'); if (el) el.value = t; persist(); }", title)
            memo = []
            if info["missing"]:
                memo.append("확인 필요: " + ", ".join(info["missing"]) + " — 알려주시면 반영해 드립니다.")
            if info["unmatched"]:
                memo.append("견적에 못 넣은 품목: " + ", ".join(info["unmatched"]) + " (따로 안내드립니다)")
            page.click("#publishBtn")
            page.wait_for_selector("#pubSheet:not([hidden])")
            if memo:
                page.fill("#memoText", "\n".join(memo))
                page.dispatch_event("#memoText", "input")
            link = _publish_and_wait(page)
            return {"link": link, "title": title, "items": info["items"], "missing": info["missing"], "unmatched": info["unmatched"]}
        finally:
            ctx.close()


if __name__ == "__main__":
    if "--setup" in sys.argv:
        setup()
    elif "--try" in sys.argv:
        i = sys.argv.index("--try")
        r = publish(sys.argv[i + 1], sys.argv[i + 2:], headless="--show" not in sys.argv)
        print(json.dumps(r, ensure_ascii=False, indent=1))
    elif "--revise" in sys.argv:
        i = sys.argv.index("--revise")
        opts = dict(a.split("=", 1) for a in sys.argv[i + 2:] if "=" in a)
        r = revise(sys.argv[i + 1], options=opts, headless="--show" not in sys.argv)
        print(json.dumps(r, ensure_ascii=False, indent=1))
    else:
        print(__doc__)
