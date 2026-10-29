"""카톡 읽기 프로그램 — 정한 방의 새 글·사진만 n8n 으로 보낸다 (읽기만, 카톡에 보내지 않음).

    python reader.py           # 계속 돌기 (config.json 의 interval 초마다)
    python reader.py --once    # 한 번만 확인
    python reader.py --dry     # 보내지 않고 새 글 '개수' 만 화면에 (글 내용은 찍지 않음)

처음 실행 때는 지금 보이는 글·폴더의 사진을 모두 '읽음' 으로만 표시하고 보내지 않는다.
state.json 에는 글 지문(sha1 앞 16자)과 사진 파일 이름만 남는다 — 글 내용은 저장하지 않는다.
"""
import json
import os
import socket
import sys
import time
from datetime import datetime

import kakao_photo
import kakao_text
import kakao_window
import n8n_send

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
    "auto_save_photos": False,
}


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
        if n_photo and cfg["auto_save_photos"] and not dry:
            h, lst = kakao_window.find_room(room)
            got = kakao_photo.save_latest_photos(h, lst, n_photo, photo_dir)
            log("[%s] 사진 %d장 중 %d장 저장" % (room, n_photo, got))
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
    if not dry:
        save_state(state)


def main():
    args = sys.argv[1:]
    cfg = dict(DEFAULTS, **load_json(CONFIG, {}))
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
