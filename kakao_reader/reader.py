"""카톡 읽기 프로그램 — 정한 방의 새 글·사진만 n8n 으로 보낸다.
김정헌 방에 '견적발행시작 거래처' 를 쓰면 그 앞 글·사진으로 가견적을 내고 링크를 그 방에 보낸 뒤 텔레그램으로 알린다.
알릴 방(watch_rooms)에 새 글이 와서 1분 조용하면 그 방을 열어 읽고 닫은 뒤 n8n Gemini 로 분류·요약을 텔레그램으로 (chatlist.py).

    python reader.py           # 계속 돌기 (config.json 의 interval 초마다)
    python reader.py --once    # 한 번만 확인
    python reader.py --dry     # 보내지 않고 새 글 '개수' 만 화면에 (글 내용은 찍지 않음)

처음 실행 때는 지금 보이는 글·폴더의 사진을 모두 '읽음' 으로만 표시하고 보내지 않는다.
state.json 에는 글 지문(sha1 앞 16자)과 사진 파일 이름만 남는다 — 글 내용은 저장하지 않는다.
"""
import json
import re
import os
import socket
import sys
import time
import urllib.parse
from datetime import datetime, timedelta, timezone

import assist
import chatlist
import gaps
import jobs
import kakao_photo
import kakao_send
import kakao_text
import kakao_window
import n8n_send
import report
import tone
import worklog

# 명령 프롬프트가 cp949 일 때 '—' 같은 글자로 멈추지 않게 (파이프·기록 파일로 보낼 때)
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(errors="replace")
    except Exception:
        pass

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG = os.path.join(HERE, "config.json")
STATE = os.path.join(HERE, "state.json")
KEEP_KEYS = 3000

DEFAULTS = {
    "webhook_url": "https://primary-production-a6fa.up.railway.app/webhook/kakao-inbox",
    "owner_key": "",
    "rooms": ["김정헌"],
    "interval": 60,
    "mask_secrets": True,
    "photo_dir": "",
    "auto_save_photos": True,
    "quote_rooms": ["김정헌"],   # '견적발행시작 거래처' 를 쓰면 그 앞 글·사진으로 가견적을 낼 방
    "send_rooms": ["김정헌"],    # 발행 링크를 카톡으로 보낼 방 (사장님 규칙: 김정헌 방만)
    "client_aliases": {},         # 거래처 별명 → 현장관리 거래처 이름 (예 {"피케이디자인": "PK디자인"})
    "notify_url": "https://primary-production-a6fa.up.railway.app/webhook/kakao-notify",  # 결과 → 사장님 텔레그램
    "watch_list": True,           # 카톡 채팅 목록의 안 읽은 표시가 생기거나 늘면 텔레그램으로 (방은 열지 않음, 10/30 A안)
    "watch_rooms": [],            # 알릴 방 (업체 방 이름, 방 이름 안에 들어 있으면). 비우면 모든 방
    "exclude_rooms": [],          # 그 알림에서 뺄 방 (가족·개인). quote_rooms(김정헌)는 늘 빠짐
    "auto_read": True,            # 알릴 방에 글이 멈추면 방을 열어 읽고 분류·요약을 텔레그램으로 (10/30 B안). 끄면 '새 글 N개' 만
    "read_quiet_seconds": 60,
    "my_names": ["김정헌"],       # 카톡에 보이는 사장님 이름 — 이 이름으로 쓴 글은 보고하지 않는다     # 배지가 이만큼 그대로면(글이 멈추면) 연다 (사장님 10/30: 시험이라 1분)
    "classify_url": "https://primary-production-a6fa.up.railway.app/webhook/kakao-classify",  # n8n 카톡_분류 (Gemini)
    "jobs_url": "https://primary-production-a6fa.up.railway.app/webhook/kakao-jobs",  # n8n 카톡_버튼 (누른 버튼 가져오기)
    # 현장 빈칸 채우기 (4단계, 사장님 10/31): 시공 1주 전 빈칸 → [시작해] → 업체 방에 질문 → 답을 현장관리 칸에
    "site_gaps": True,
    "client_rooms": {},           # 현장관리 거래처 이름 → 그 업체 카톡 방 이름 (예 {"봄애": "봄애실장님"})
    "site_gaps_url": "https://primary-production-a6fa.up.railway.app/webhook/site-gaps",  # n8n 현장관리_빈칸
    "site_fill_url": "https://primary-production-a6fa.up.railway.app/webhook/site-fill",  # 우편함 (앱이 가져가 칸에 넣음)
    "digest_url": "https://primary-production-a6fa.up.railway.app/webhook/kakao-digest",  # 현장관리 📥 카톡 정리 AI
    # 📋 업무일정표 (사장님 11/3): 저녁 7시 n8n 이 만든 보고서 글을 이 방에 (결재 링크 포함)
    "report_url": "https://primary-production-a6fa.up.railway.app/webhook/report",
    "report_room": "김정헌",
    # 🤖 능동 비서 (사장님 11/4): 업체 방 새 글을 물어보지 않았어도 AI 가 판단 → 현장에 넣기·결재함·답장(간단한 답만 자동)
    "assist": True,
    "assist_url": "https://primary-production-a6fa.up.railway.app/webhook/kakao-assist",
    "work_log_url": "https://primary-production-a6fa.up.railway.app/webhook/work-log",  # 📋 업무 내역 (11/4)
    "kakao_send_url": "https://primary-production-a6fa.up.railway.app/webhook/kakao-send",  # 💬 앱 비서가 맡긴 카톡 보내기 (11/4)
    # 🗣 사장님 말투 (11/12): 업체 방을 읽을 때 사장님이 쓴 줄(+바로 앞 업체 말)을 n8n 에 모은다 → 비서가 그 말투로 묻고 답한다. 긴 숫자는 가림
    "tone": True,
    "tone_url": "https://primary-production-a6fa.up.railway.app/webhook/kakao-tone",
    "tone_skip_rooms": [],        # 말투에서 뺄 방 (가족·개인 방을 시험용으로 지켜볼 때). 방 이름에 들어 있으면 뺀다
}

# 방마다 '견적발행시작' 을 기다리는 글·사진 묶음 (메모리에만 — 글 내용을 노트북 파일에 남기지 않는다.
# 프로그램을 다시 켜면 비어 있으니 그때는 글을 다시 올리고 신호를 준다)
PENDING = {}
# 신호를 받아 발행할 묶음. need = 아직 저장 못 한 사진 장수 (0 이 되면 발행)
READY = []


def is_ours(text):
    """프로그램이 보낸 링크 글은 견적 문의로 다시 읽지 않는다."""
    return "/q/" in text or text.startswith(("[가견적]", "[자동]"))


KST = timezone(timedelta(hours=9))


def log(msg):
    # 노트북 시간대 설정과 상관없이 한국 시간으로 (10/30 노트북 기록이 5시간 어긋남)
    print("%s %s" % (datetime.now(KST).strftime("%m-%d %H:%M:%S"), msg), flush=True)


def load_json(path, default):
    try:
        with open(path, encoding="utf-8-sig") as f:  # 메모장이 붙이는 BOM 도 괜찮게
            text = f.read()
    except FileNotFoundError:
        return default
    # 메모장으로 고치다 남긴 맨 끝 쉼표 (["가족", ] 처럼) 는 봐준다
    return json.loads(re.sub(r",\s*([\]}])", r"\1", text))


def save_state(state):
    tmp = STATE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False)
    os.replace(tmp, STATE)


def check_room(cfg, state, room, dry):
    """방 하나 확인. 돌려주는 값: 보낼 메시지 목록(새 것) 과 새 지문 목록."""
    text = kakao_window.copy_room_text(room)
    if text is None:
        if kakao_window.find_room(room)[0]:
            why = getattr(kakao_window, "last_fail", "")
            log("[%s] 글 복사 실패%s — 다음 확인 때 다시" % (room, " (%s)" % why if why else ""))
        else:
            log("[%s] 채팅창이 열려 있지 않음 — 카톡에서 그 방 창을 열어 두세요" % room)
        return None
    msgs = kakao_text.with_keys(kakao_text.parse(text))
    rs = state["rooms"].setdefault(room, {"keys": [], "at": None})
    if rs["at"] is None:
        rs["keys"] = [m["key"] for m in msgs][-KEEP_KEYS:]
        rs["at"] = datetime.now().isoformat(timespec="seconds")
        log("[%s] 처음 실행: 지금 보이는 글 %d개를 읽음 처리 (보내지 않음)" % (room, len(msgs)))
        return []
    fresh = kakao_text.new_messages(msgs, set(rs["keys"]))
    return fresh


def run_once(cfg, state, dry=False):
    worklog.setup(cfg)
    if not dry:
        worklog.beat()
    if cfg.get("kakao_send_url") and not dry:
        kakao_send.sync_rooms(cfg, state, time.time(), lambda body: n8n_send.post_json(cfg["kakao_send_url"], cfg["owner_key"], body, timeout=20), log)
    photo_dir = cfg["photo_dir"] or kakao_photo.default_dir()
    if state.get("photos") is None:
        state["photos"] = [kakao_photo.file_id(p) for p in kakao_photo.list_photos(photo_dir)]

    for room in cfg["rooms"]:
        fresh = check_room(cfg, state, room, dry)
        if fresh:
            log("[%s] 새 글 %d개" % (room, len(fresh)))
        if fresh and not dry:
            payload = {
                "room": room,
                "messages": [{"date": m["date"], "time": m["time"], "sender": m["sender"],
                              "text": kakao_text.mask(m["text"]) if cfg["mask_secrets"] else m["text"],
                              "photos": kakao_text.photo_count(m["text"]), "key": m["key"]} for m in fresh],
                "photoFiles": [],
                "sentAt": datetime.now().isoformat(timespec="seconds"),
                "reader": socket.gethostname(),
            }
            try:
                status, body = n8n_send.send(cfg["webhook_url"], cfg["owner_key"], payload, [])
            except Exception as e:  # 네트워크·열쇠 문제 → 지문을 저장하지 않으니 다음 주기에 다시 보낸다
                log("[%s] 보내기 실패: %s" % (room, e))
                continue
            log("[%s] 보냄 (%s) %s" % (room, status, body[:200]))
            rs = state["rooms"][room]
            rs["keys"] = (rs["keys"] + [m["key"] for m in fresh])[-KEEP_KEYS:]
            rs["at"] = datetime.now().isoformat(timespec="seconds")
            if room in cfg["quote_rooms"]:
                collect(room, payload["messages"])
        if fresh is not None and not dry:
            for job in [j for j in READY if j["room"] == room and j["need"]]:
                save_job_photos(cfg, state, job, photo_dir)
    if cfg["watch_list"]:
        # 빈칸을 물어보고 답을 기다리는 업체 방(7일)은 알릴 방에 더한다 — 그 방 새 글을 읽어야 칸을 채운다
        extra = gaps.watch_extra(state, time.time()) if cfg["site_gaps"] else []
        # 👤 앱에서 카톡을 보낸 고객 방도 시공일까지 지켜본다 (11/5)
        extra = extra + [r for r in assist.watch_rooms(state, time.time()) if r not in extra]
        # 💬 앱 고정값에 적은 카톡방도 지켜본다 (11/5)
        extra = extra + [r for r in kakao_send.app_rooms(state) if r not in extra]
        # 사장님 자기 방(김정헌)은 지켜보지 않는다 — 고객 카톡방 시험으로 들어가도 (11/5)
        own = set(cfg.get("rooms") or []) | set(cfg.get("quote_rooms") or []) | {cfg.get("report_room")}
        extra = [r for r in extra if r not in own]
        wcfg = cfg
        if extra and cfg["watch_rooms"]:
            wcfg = dict(cfg, watch_rooms=list(cfg["watch_rooms"]) + [r for r in extra if r not in cfg["watch_rooms"]])
        chatlist.check(wcfg, state, lambda text, buttons=None: notify(cfg, text, buttons), log, dry,
                       classify=lambda room, msgs: n8n_send.classify(cfg["classify_url"], cfg["owner_key"], room, msgs),
                       answer=lambda room, msgs: gaps.on_answer(
                           cfg, state, room, msgs,
                           lambda r, today, sites, ms, asked="": n8n_send.post_json(
                               cfg["digest_url"], cfg["owner_key"],
                               {"room": r, "today": today, "sites": sites, "messages": ms, "asked": asked}),
                           lambda fills: n8n_send.post_json(cfg["site_fill_url"], cfg["owner_key"], {"fills": fills}),
                           lambda text: notify(cfg, text), log, gaps.send_to_room) if cfg["site_gaps"] else None,
                       assist=lambda room, new, msgs: assist.handle(
                           cfg, state, room, new, msgs,
                           lambda body: n8n_send.post_json(cfg["assist_url"], cfg["owner_key"], body),
                           lambda fills: n8n_send.post_json(cfg["site_fill_url"], cfg["owner_key"], {"fills": fills}),
                           lambda items: n8n_send.post_json(cfg["report_url"], cfg["owner_key"], {"action": "inbox_add", "items": items}),
                           lambda text, buttons=None: notify(cfg, text, buttons), log) if cfg["assist"] else None,
                       tone=lambda room, msgs: tone.harvest(cfg, state, room, msgs,
                                                            lambda body: n8n_send.post_json(cfg["tone_url"], cfg["owner_key"], body), log))
    if cfg["auto_read"] and cfg["watch_list"] and not dry:  # 텔레그램 버튼 [가견적 발행]·[시작해] (3·4단계, 10/31)
        jobs.poll(cfg, state, lambda text: notify(cfg, text), log,
                  lambda: n8n_send.fetch_jobs(cfg["jobs_url"], cfg["owner_key"]), {"pub": jobs.run_publish, "ask": gaps.run_ask, "rs": assist.run_send, "ra": assist.run_reask})
        if cfg["site_gaps"]:
            gaps.check(cfg, state, time.time(),
                       # orders = 필름 주문 알림 (시공 5일 전, 사장님 11/1)
                       lambda: n8n_send.post_json(cfg["site_gaps_url"], cfg["owner_key"], {"days": 7, "orderDays": gaps.ORDER_DAYS}),
                       lambda text, buttons=None: notify(cfg, text, buttons), log,
                       # 📋 결재함에서 묻기로 한 현장은 [시작해] 대신 알림만 (11/6)
                       plan=lambda: n8n_send.post_json(cfg["report_url"], cfg["owner_key"], {"action": "askPlan"}, timeout=20))
            # 못 받은 답은 2시간 뒤 남은 번호만 자동으로 다시 (사장님 11/1, 18시 넘으면 다음 날 9시)
            gaps.reask(cfg, state, time.time(), gaps.send_to_room, lambda text: notify(cfg, text), log,
                       # 앱에서 받은 것은 다시 안 묻기 (11/13) — 30일 안 현장의 지금 빈칸
                       fetch=lambda: n8n_send.post_json(cfg["site_gaps_url"], cfg["owner_key"], {"days": 30, "orderDays": 0}))
            # 업체 답에 3분쯤 뒤 인사 (사장님 11/1)
            gaps.send_replies(state, time.time(), gaps.send_to_room, log,
                              lambda room, text, why: worklog.add("reply", "%s 방에 답장" % room, text) if not why else
                              worklog.add("reply", "%s 방에 답장 못 보냄" % room, why, need=True))
        # 💬 앱 🤖 비서가 맡긴 카톡 → 그 업체 방에 (사장님 11/4)
        if cfg.get("kakao_send_url"):
            kakao_send.poll(cfg, state, time.time(),
                            lambda body: n8n_send.post_json(cfg["kakao_send_url"], cfg["owner_key"], body, timeout=20),
                            report.send_to_room, lambda text: notify(cfg, text), log, report.send_exact)
            assist.reask_due(state, time.time(), report.send_exact, lambda text: notify(cfg, text), log)
        # 📋 업무일정표 → 카톡 김정헌방 (사장님 11/3, 결재함)
        report.poll(cfg, state, time.time(),
                    lambda: n8n_send.post_json(cfg["report_url"], cfg["owner_key"], {"action": "outbox"}),
                    report.send_to_room, lambda text: notify(cfg, text), log)
    if not dry:
        for job in [j for j in READY if not j["need"]]:
            READY.remove(job)
            publish_job(cfg, job)
        save_state(state)


def save_job_photos(cfg, state, job, photo_dir):
    """신호를 받은 뒤에야 사진을 저장한다 (사장님 10/30 — 신호 전에는 아무것도 하지 않는다).
    묶음의 사진 장수만큼 이 방의 가장 최근 사진부터 저장. 못 하면 3번까지 다시, 그래도 안 되면 사진 없이 발행."""
    room, need = job["room"], job["need"]
    got, why = 0, "사진 자동 저장 꺼짐 (auto_save_photos)"
    if cfg["auto_save_photos"]:
        h, lst = kakao_window.find_room(room)
        got, why = kakao_photo.save_latest_photos(h, lst, need, photo_dir)
    time.sleep(2.5)  # new_photos 는 막 쓰는 중인(2초 안) 파일을 뺀다
    new = kakao_photo.new_photos(photo_dir, set(state["photos"]))
    state["photos"] = (state["photos"] + [kakao_photo.file_id(p) for p in new])[-KEEP_KEYS:]
    job["photos"] += new
    job["tries"] += 1
    log("[%s] 사진 %d장 중 %d장 저장%s" % (room, need, len(new), (" — " + why) if why else ""))
    if len(job["photos"]) >= need:
        job["need"] = 0
    elif job["tries"] >= 3 or not cfg["auto_save_photos"]:
        notify(cfg, "[카톡읽기] %s 방 사진 %d장 중 %d장만 저장됨 (%s) — 사진이 빠진 채로 발행합니다." % (room, need, len(job["photos"]), why or "이유 모름"))
        job["need"] = 0


def collect(room, messages):
    """'견적발행시작' 신호 방식 (사장님 10/30): 신호 전에는 글을 모아 두기만 하고 아무것도 하지 않는다.
    신호가 오면 그 앞 묶음(지난 신호·지난 링크 뒤의 글, 사진 장수)으로 발행한다."""
    pend = PENDING.get(room)
    if pend and time.time() - pend["last"] > 24 * 3600:  # 하루 넘게 신호가 없던 묶음은 버린다
        pend = None
    pend = pend or {"texts": [], "n_photo": 0, "first": None}
    for m in messages:
        t = m["text"]
        n = kakao_text.photo_count(t)
        if n:
            pend["n_photo"] += n
            continue
        if is_ours(t):  # 발행 링크 = 앞 묶음 끝
            pend = {"texts": [], "n_photo": 0, "first": None}
            continue
        client = kakao_text.trigger_client(t)
        if client is not None:
            READY.append({"room": room, "client": client, "texts": pend["texts"], "photos": [],
                          "need": pend["n_photo"], "tries": 0, "first": pend["first"]})
            log("[%s] 견적발행시작 신호 (글 %d개, 사진 %d장)" % (room, len(pend["texts"]), pend["n_photo"]))
            pend = {"texts": [], "n_photo": 0, "first": None}
            continue
        pend["texts"].append(t)
        pend["first"] = pend["first"] or datetime.now(timezone.utc).isoformat()
    pend["last"] = time.time()
    PENDING[room] = pend


def notify(cfg, text, buttons=None):
    if cfg.get("notify_url") and cfg["owner_key"]:
        if n8n_send.notify(cfg["notify_url"], cfg["owner_key"], text, buttons):
            return True
        log("텔레그램 알림 실패")
    return False


def publish_job(cfg, job):
    room, client = job["room"], job["client"]
    if not job["texts"]:
        log("[%s] 견적발행시작: 앞에 글이 없음 — 안 함" % room)
        notify(cfg, "[카톡읽기] 견적발행시작 '%s' — 앞에 문의 글이 없어 발행 안 함.\n글·사진을 다시 올리고 신호를 주세요." % client)
        return
    import quote_bot
    log("[%s] 가견적 발행 시작 (글 %d개, 사진 %d장)" % (room, len(job["texts"]), len(job["photos"])))
    try:
        r = quote_bot.publish("\n".join(job["texts"]), job["photos"], client=client,
                              received_at=job["first"], aliases=cfg["client_aliases"])
    except Exception as e:
        log("[%s] 견적 안 함: %s" % (room, str(e)[:200]))
        notify(cfg, "[카톡읽기] 가견적 발행 실패 ('%s')\n%s" % (client, str(e)[:300]))
        return
    log("[%s] 가견적 발행 %s (거래처 %s, 품목 %d개, 빠진 정보 %d개)" % (room, r["link"], r["client"], len(r["items"]), len(r["missing"])))
    notes = []
    if room in cfg["send_rooms"]:
        # 링크만 보낸다 - 카톡이 미리보기 카드(제목·섬세한손길 시공 견적서)를 붙여 준다. 앞에 글을 붙이면 지저분하다 (사장님 10/30)
        ok = kakao_window.send_text(room, r["link"])
        log("[%s] 카톡 전송 %s" % (room, "완료" if ok else "실패"))
        notes.append("%s 방에 링크 %s" % (room, "보냄" if ok else "못 보냄 (손으로 보내 주세요)"))
    warn = []
    if r["client"] and r["client"] != kakao_text.UNKNOWN_CLIENT:
        if r["client_how"] != "같은 이름":
            notes.insert(0, "거래처: %s (%s '%s')" % (r["client"], r["client_how"], client))
    elif r["client"]:
        warn.append("거래처 '%s' 못 찾음 → 현장관리 '%s' 에 들어감. 진짜 업체로 옮겨 주세요." % (client, kakao_text.UNKNOWN_CLIENT))
    else:
        warn.append("거래처 '%s' 못 찾음, '%s' 거래처도 없음 → 현장관리 견적요청 내역에 안 들어감." % (client, kakao_text.UNKNOWN_CLIENT))
    import tg
    notify(cfg, tg.published(r["client"] or client, r["title"], len(r["items"]), len(job["photos"]), r["link"],
                             warn, r["missing"], r["unmatched"], notes))


def main():
    args = sys.argv[1:]
    if "--find-room" in args:   # 👤 카톡 검색으로 방이 열리는지 시험 (보내지 않고 닫음, 11/5): python reader.py --find-room 방이름
        name = " ".join(args[args.index("--find-room") + 1:]).strip()
        h = chatlist.search_open(name, log)
        print("찾음 — 3초 뒤 닫습니다" if h else "못 찾음 (제목이 정확히 같은 방이 안 열림)")
        if h:
            time.sleep(3)
            kakao_window.close_window(h)
        return
    cfg = dict(DEFAULTS, **load_json(CONFIG, {}))
    # 등록 링크(…#key=열쇠)를 통째로 넣어도 열쇠만 쓴다
    m = re.search(r"key=([^&\s]+)", cfg["owner_key"])
    if m:
        cfg["owner_key"] = urllib.parse.unquote(m.group(1))
    if "--tone-import" in args:   # 🗣 지난 대화로 말투 모으기 (11/12): python reader.py --tone-import [폴더, 기본 말투내보내기]
        rest = args[args.index("--tone-import") + 1:]
        folder = rest[0] if rest else os.path.join(HERE, "말투내보내기")
        tone.import_folder(cfg, folder, lambda body: n8n_send.post_json(cfg["tone_url"], cfg["owner_key"], body), log)
        return
    if not cfg["owner_key"] and "--dry" not in args:
        log("config.json 에 owner_key(사장님 열쇠) 가 비어 있음 — README 를 보고 넣어 주세요")
    # 켤 때 버전(노트북용 zip 을 만든 때)을 먼저 보여 준다 — 새 zip 을 제대로 덮어썼는지 확인 (사장님 10/31)
    try:
        with open(os.path.join(HERE, "version.txt"), encoding="utf-8") as f:
            ver = f.read().strip()
    except OSError:
        ver = "표시 없음 (예전 파일 — 새 zip 을 이 폴더에 덮어썼는지 확인)"
    log("카톡 읽기 프로그램 버전 %s · 폴더 %s" % (ver, HERE))
    state = load_json(STATE, {"rooms": {}, "photos": None})
    if "--dry" in args:
        run_once(cfg, json.loads(json.dumps(state)), dry=True)
        return
    import faulthandler
    while True:
        # 한 번 확인이 3분 넘게 걸리면 어디서 멈췄는지 화면에 찍는다 (사진으로 보내면 원인을 찾을 수 있게)
        if sys.stderr:  # pythonw 로 돌면 화면이 없다
            faulthandler.dump_traceback_later(180, exit=False)
        try:
            run_once(cfg, state)
        except Exception as e:
            log("오류: %r" % e)
        if sys.stderr:
            faulthandler.cancel_dump_traceback_later()
        if "--once" in args:
            return
        pause = max(15, int(cfg["interval"]))
        due = chatlist.wait_seconds(state, cfg, time.time()) if cfg["watch_list"] else None
        if due is not None:
            pause = min(pause, due + 1)  # 열 방이 있으면 그 시각에 맞춰 깬다
        time.sleep(pause)


if __name__ == "__main__":
    main()
