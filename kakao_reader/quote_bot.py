"""카톡 견적 문의 → 현장견적 앱(quote_pro.html)에서 가견적 발행 (따로 쓰는 크롬, Playwright).

앱의 계산·규칙을 그대로 쓰려고 사람이 하던 순서를 그대로 누른다:
  새 견적 → 📋 요청 붙여넣기(카톡) → 초안 만들기 → 품목마다 사진 넣기 → 저장 → 발행(가견적, 메모에 빠진 정보) → 링크.
빠진 정보는 묻지 않고 견적서 메모에 적는다 (사장님 2026-10-29).

    python quote_bot.py --setup      # 처음 한 번: 크롬 창이 뜨면 관리자 암호를 사장님이 직접 넣는다
    python quote_bot.py --try "방문3개 부평 삼산동" [사진...]   # 시험 발행 (김정헌 이름으로)
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
            page.click("#saveBtn")
            page.wait_for_timeout(800)

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
            page.click("#doPublish")
            page.wait_for_selector("#pubAfter:not([hidden])", timeout=90_000)
            link = page.evaluate("() => { const a = document.querySelector('#pubLink a'); return a ? a.href : document.getElementById('pubLink').innerText.trim(); }")
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
    else:
        print(__doc__)
