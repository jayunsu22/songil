"""카톡 읽기 프로그램 — 정한 방의 새 글·사진만 n8n 으로 보낸다.
김정헌 방에 '견적발행시작 거래처' 를 쓰면 그 앞 글·사진으로 가견적을 내고 링크를 그 방에 보낸 뒤 텔레그램으로 알린다.

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
from datetime import datetime, timezone

import kakao_photo
import kakao_text
import kakao_window
import n8n_send

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
}

# 못 저장한 사진: 방 → {n: 장수, tries: 시도 횟수}. 3번까지 다시 해 보고, 그동안 견적 발행을 미룬다.
PHOTO_RETRY = {}

# 방마다 '견적발행시작' 을 기다리는 글·사진 묶음 (메모리에만 — 글 내용을 노트북 파일에 남기지 않는다.
# 프로그램을 다시 켜면 비어 있으니 그때는 글을 다시 올리고 신호를 준다)
PENDING = {}
# 신호를 받아 발행할 묶음 (사진을 다시 저장하는 중이면 끝날 때까지 기다린다)
READY = []


def is_ours(text):
    """프로그램이 보낸 링크 글은 견적 문의로 다시 읽지 않는다."""
    return "/q/" in text or text.startswith(("[가견적]", "[자동]"))


def log(msg):
    print("%s %s" % (datetime.now().strftime("%m-%d %H:%M:%S"), msg), flush=True)


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


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
            log("[%s] 글 복사 실패 — 다음 확인 때 다시" % room)
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
    photo_dir = cfg["photo_dir"] or kakao_photo.default_dir()
    first_photos = state.get("photos") is None
    if first_photos:
        state["photos"] = [kakao_photo.file_id(p) for p in kakao_photo.list_photos(photo_dir)]

    for room in cfg["rooms"]:
        fresh = check_room(cfg, state, room, dry)
        if fresh is None:
            continue
        n_photo = sum(kakao_text.photo_count(m["text"]) for m in fresh)
        retry = PHOTO_RETRY.get(room)
        if not n_photo and retry:
            n_photo = retry["n"]  # 지난번에 못 저장한 사진 다시 시도
        if n_photo and cfg["auto_save_photos"] and not dry:
            h, lst = kakao_window.find_room(room)
            got, why = kakao_photo.save_latest_photos(h, lst, n_photo, photo_dir)
            tries = (retry["tries"] if retry else 0) + 1
            if got >= n_photo or tries >= 3:
                PHOTO_RETRY.pop(room, None)
            else:
                PHOTO_RETRY[room] = {"n": n_photo, "tries": tries}
            log("[%s] 사진 %d장 중 %d장 저장%s" % (room, n_photo, got,
                (" — %s → %s" % (why, "다음 확인 때 다시" if room in PHOTO_RETRY else "손으로 받은 파일에 저장해 주세요")) if why else ""))
            if got < n_photo and room not in PHOTO_RETRY:
                notify(cfg, "[카톡읽기] %s 방 사진 %d장 중 %d장만 저장됨 (%s)\n노트북에서 사진을 '카카오톡 받은 파일' 에 손으로 저장해 주세요." % (room, n_photo, got, why or "이유 모름"))
        photos = [] if first_photos else kakao_photo.new_photos(photo_dir, set(state["photos"]))
        if not fresh and not photos:
            continue
        log("[%s] 새 글 %d개 · 사진 %d장" % (room, len(fresh), len(photos)))
        if dry:
            continue
        payload = {
            "room": room,
            "messages": [{"date": m["date"], "time": m["time"], "sender": m["sender"],
                          "text": kakao_text.mask(m["text"]) if cfg["mask_secrets"] else m["text"],
                          "photos": kakao_text.photo_count(m["text"]), "key": m["key"]} for m in fresh],
            "photoFiles": [os.path.basename(p) for p in photos],
            "sentAt": datetime.now().isoformat(timespec="seconds"),
            "reader": socket.gethostname(),
        }
        try:
            status, body = n8n_send.send(cfg["webhook_url"], cfg["owner_key"], payload, photos)
        except Exception as e:  # 네트워크·열쇠 문제 → 지문을 저장하지 않으니 다음 주기에 다시 보낸다
            log("[%s] 보내기 실패: %s" % (room, e))
            continue
        log("[%s] 보냄 (%s) %s" % (room, status, body[:200]))
        rs = state["rooms"][room]
        rs["keys"] = (rs["keys"] + [m["key"] for m in fresh])[-KEEP_KEYS:]
        rs["at"] = datetime.now().isoformat(timespec="seconds")
        state["photos"] = (state["photos"] + [kakao_photo.file_id(p) for p in photos])[-KEEP_KEYS:]
        if room in cfg["quote_rooms"]:
            collect(room, payload["messages"], photos)
    if not dry:
        for job in list(READY):
            if job["room"] not in PHOTO_RETRY:  # 사진 저장을 다시 시도하는 중이면 기다린다
                READY.remove(job)
                publish_job(cfg, job)
        save_state(state)


def collect(room, messages, photos):
    """'견적발행시작 [거래처]' 신호 방식 (사장님 10/30): 고객이 아직 쓰는 중에 견적을 내지 않게,
    사장님이 김정헌 방에 글·사진을 모아 올리고 신호를 주면 그 앞 묶음(지난 신호·지난 링크 뒤)으로 발행한다."""
    waiting = [j for j in READY if j["room"] == room]
    pend = PENDING.get(room)
    if pend and time.time() - pend["last"] > 24 * 3600:  # 하루 넘게 신호가 없던 묶음은 버린다
        pend = None
    pend = pend or {"texts": [], "photos": [], "first": None}
    # 사진을 다시 저장하는 중에 신호가 먼저 왔으면, 늦게 저장된 사진은 기다리는 그 묶음 것
    (waiting[-1] if waiting and not messages else pend)["photos"] += photos
    for m in messages:
        t = m["text"]
        if kakao_text.photo_count(t):
            continue
        if is_ours(t):  # 발행 링크 = 앞 묶음 끝
            pend = {"texts": [], "photos": [], "first": None}
            continue
        client = kakao_text.trigger_client(t)
        if client is not None:
            READY.append({"room": room, "client": client, "texts": pend["texts"], "photos": pend["photos"], "first": pend["first"]})
            log("[%s] 견적발행시작 신호 (거래처 '%s', 글 %d개, 사진 %d장)" % (room, client, len(pend["texts"]), len(pend["photos"])))
            pend = {"texts": [], "photos": [], "first": None}
            continue
        pend["texts"].append(t)
        pend["first"] = pend["first"] or datetime.now(timezone.utc).isoformat()
    pend["last"] = time.time()
    PENDING[room] = pend


def notify(cfg, text):
    if cfg.get("notify_url") and cfg["owner_key"]:
        if not n8n_send.notify(cfg["notify_url"], cfg["owner_key"], text):
            log("텔레그램 알림 실패")


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
    sent = ""
    if room in cfg["send_rooms"]:
        # 링크만 보낸다 - 카톡이 미리보기 카드(제목·섬세한손길 시공 견적서)를 붙여 준다. 앞에 글을 붙이면 지저분하다 (사장님 10/30)
        ok = kakao_window.send_text(room, r["link"])
        log("[%s] 카톡 전송 %s" % (room, "완료" if ok else "실패"))
        sent = "\n%s 방에 링크 %s" % (room, "보냄" if ok else "못 보냄 (손으로 보내 주세요)")
    if r["client"] and r["client"] != kakao_text.UNKNOWN_CLIENT:
        where = "거래처: %s%s" % (r["client"], "" if r["client_how"] == "같은 이름" else " (%s '%s')" % (r["client_how"], client))
    elif r["client"]:
        where = "⚠ 거래처 '%s' 못 찾음 → 현장관리 '%s' 에 들어감. 진짜 업체로 옮겨 주세요." % (client, kakao_text.UNKNOWN_CLIENT)
    else:
        where = "⚠ 거래처 '%s' 못 찾음, '%s' 거래처도 없음 → 현장관리 견적요청 내역에 안 들어감." % (client, kakao_text.UNKNOWN_CLIENT)
    lines = ["[카톡읽기] 가견적 발행", r["title"], where,
             "품목 %d개 · 사진 %d장" % (len(r["items"]), len(job["photos"]))]
    if r["missing"]:
        lines.append("빠진 정보(메모에 적음): " + ", ".join(r["missing"]))
    if r["unmatched"]:
        lines.append("못 넣은 품목: " + ", ".join(r["unmatched"]))
    notify(cfg, "\n".join(lines) + sent + "\n" + r["link"])


def main():
    args = sys.argv[1:]
    cfg = dict(DEFAULTS, **load_json(CONFIG, {}))
    # 등록 링크(…#key=열쇠)를 통째로 넣어도 열쇠만 쓴다
    m = re.search(r"key=([^&\s]+)", cfg["owner_key"])
    if m:
        cfg["owner_key"] = urllib.parse.unquote(m.group(1))
    if not cfg["owner_key"] and "--dry" not in args:
        log("config.json 에 owner_key(사장님 열쇠) 가 비어 있음 — README 를 보고 넣어 주세요")
    state = load_json(STATE, {"rooms": {}, "photos": None})
    if "--dry" in args:
        run_once(cfg, json.loads(json.dumps(state)), dry=True)
        return
    while True:
        try:
            run_once(cfg, state)
        except Exception as e:
            log("오류: %r" % e)
        if "--once" in args:
            return
        time.sleep(max(15, int(cfg["interval"])))


if __name__ == "__main__":
    main()
