"""텔레그램 버튼 (카톡 읽기 3단계, 사장님 10/31).

노트북이 보내는 요약에 버튼을 붙인다: 견적 문의 → [가견적 발행] [나중에], 그 밖 → [확인함].
버튼 누름은 n8n 카톡_버튼 이 받아 둔다 ('나중에'·'확인함' 은 n8n 이 표시만 바꾸고 끝).
[가견적 발행] 은 노트북이 확인할 때마다 가져가(poll) 그 방을 다시 열어 같은 글·사진으로 가견적을 내고 링크를 텔레그램으로.
state.json 의 jobs 에는 글 지문(key)·사진 장수만 — 글 내용은 남기지 않는다.
설계 docs/superpowers/specs/2026-10-31-카톡버튼-design.md
"""
import random
import string
import time

KEEP = 7 * 86400  # 7일 지난 할 일은 지운다
PUB_KINDS = {"견적 문의"}


def buttons_for(kind, job):
    """콜백 'k|번호|동작' (텔레그램 64바이트 한도 안)."""
    if kind in PUB_KINDS:
        return [[{"text": "가견적 발행", "data": "k|%s|pub" % job}, {"text": "나중에", "data": "k|%s|later" % job}]]
    return [[{"text": "확인함", "data": "k|%s|ok" % job}]]


def _new_id(taken):
    while True:
        job = "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(6))
        if job not in taken:
            return job


def new_job(state, title, kind, msgs, t):
    """요약 하나 = 할 일 번호 하나. → (번호, 버튼)."""
    from kakao_text import photo_count
    jobs = {k: v for k, v in (state.get("jobs") or {}).items() if t - v.get("at", 0) < KEEP}
    job = _new_id(jobs)
    jobs[job] = {"title": title, "kind": kind, "keys": [m["key"] for m in msgs],
                 "photos": sum(photo_count(m["text"]) for m in msgs), "at": t}
    state["jobs"] = jobs
    return job, buttons_for(kind, job)


def pick_by_keys(msgs, keys):
    want = set(keys)
    return [m for m in msgs if m["key"] in want]


WARNED = {"fetch": False}


def poll(cfg, state, notify, log, fetch, run):
    """n8n 에서 할 일을 가져와 [가견적 발행] 만 처리 (같은 번호는 한 번만)."""
    try:
        todo = fetch()
    except Exception as e:
        if not WARNED["fetch"]:
            log("[버튼] 할 일 가져오기 실패: %s" % str(e)[:100])
            WARNED["fetch"] = True
        return
    WARNED["fetch"] = False
    done = state.setdefault("jobs_done", [])
    for j in todo:
        job = j.get("job")
        if j.get("action") != "pub" or job in done:
            continue
        done.append(job)
        del done[:-300]
        info = (state.get("jobs") or {}).get(job)
        if not info:
            log("[버튼] 모르는 할 일 %s" % job)
            notify("[카톡] 가견적 발행을 못 했습니다 — 7일 넘은 요약이거나 이 노트북이 보낸 요약이 아닙니다.")
            continue
        log("[%s] 버튼: 가견적 발행" % info["title"])
        try:
            run(cfg, state, job, info, notify, log)
        except Exception as e:
            log("[%s] 가견적 발행 실패: %s" % (info["title"], str(e)[:200]))
            notify("[카톡] 가견적 발행 실패 · %s\n%s" % (info["title"], str(e)[:300]))


def run_publish(cfg, state, job, info, notify, log):
    """그 방을 다시 열어 요약했던 글(지문으로 찾기)·사진으로 가견적 → 링크를 텔레그램으로. 카톡으로는 보내지 않는다."""
    import chatlist
    import kakao_photo
    import kakao_text
    import kakao_window
    import quote_bot
    title = info["title"]
    chatlist.refresh_geom()
    h, opened = chatlist.open_room(title, None, log)
    if not h:
        notify("[카톡] 가견적 발행 못 함 · %s\n목록에서 방을 못 찾았습니다 (목록 화면에 보이게 해 주세요)." % title)
        return
    photo_dir = cfg.get("photo_dir") or kakao_photo.default_dir()
    photos, why, picked = [], "", []
    try:
        text = kakao_window.copy_room_text(opened) or ""
        picked = pick_by_keys(kakao_text.with_keys(kakao_text.parse(text)), info["keys"])
        if picked and info.get("photos") and cfg.get("auto_save_photos", True):
            seen = set(state.get("photos") or [])
            rh, rl = kakao_window.find_room(opened)
            got, why = kakao_photo.save_latest_photos(rh, rl, info["photos"], photo_dir)
            time.sleep(2.5)  # new_photos 는 막 쓰는 중인(2초 안) 파일을 뺀다
            photos = kakao_photo.new_photos(photo_dir, seen)
            state["photos"] = (list(seen) + [kakao_photo.file_id(p) for p in photos])[-3000:]
    finally:
        kakao_window.close_window(h)
    if not picked:
        notify("[카톡] 가견적 발행 못 함 · %s\n요약했던 글을 방에서 다시 못 찾았습니다." % opened)
        return
    words = [m["text"] for m in picked if not kakao_text.photo_count(m["text"])]
    log("[%s] 가견적 발행 시작 (글 %d개, 사진 %d장)" % (opened, len(words), len(photos)))
    r = quote_bot.publish("\n".join(words), photos, client=opened, aliases=cfg.get("client_aliases") or {})
    lines = ["[카톡] 가견적 발행 · %s" % opened, r["title"],
             "거래처: %s" % (r["client"] or "못 찾음 — 현장관리에 안 들어감"),
             "품목 %d개 · 사진 %d장" % (len(r["items"]), len(photos))]
    if info.get("photos") and len(photos) < info["photos"]:
        lines.append("⚠ 사진 %d장 중 %d장만 저장됨 (%s)" % (info["photos"], len(photos), why or "이유 모름"))
    if r["missing"]:
        lines.append("빠진 정보(메모에 적음): " + ", ".join(r["missing"]))
    lines.append(r["link"])
    notify("\n".join(lines))
    log("[%s] 가견적 발행 %s" % (opened, r["link"]))
