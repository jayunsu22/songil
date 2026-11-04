"""💬 비서 카톡 보내기 (사장님 11/4: '문자는 가는데 왜 카톡은 안 돼').
앱 🤖 비서가 n8n 카톡_보내기(kakao-send)에 맡긴 카톡을 가져와 그 방에 보낸다 → 보냈는지 n8n 에 알린다 (앱 카드가 바뀐다).
방: 앱이 준 방 이름 → 없으면 config client_rooms 의 거래처 방 → 그래도 없으면 거래처 이름으로 카톡 목록에서 찾는다.
글은 메모리에서만 쓰고 state.json 에 남기지 않는다. 실패하면 텔레그램으로 글을 그대로 보내 손으로 보내게 한다."""
EVERY = 30   # 초 — 노트북 확인 주기마다, 그래도 30초에 한 번까지만


def room_of(cfg, job):
    if (job.get("room") or "").strip():
        return job["room"].strip()
    client = (job.get("client") or "").strip()
    rooms = (cfg.get("client_rooms") or {}).get(client)
    if isinstance(rooms, str) and rooms.strip():
        return rooms.strip()
    if isinstance(rooms, list) and rooms:
        return str(rooms[0]).strip()
    return client


ROOMS_EVERY = 3600


def merged_rooms(own, app, off=None):
    """노트북 config client_rooms + 앱에 적은 방. 설정의 방이 먼저. off = 앱에서 ✕ 로 뺀 방은 뺀다."""
    gone = {r for v in (off or {}).values() for r in (v if isinstance(v, list) else [v])}
    out = {}
    for src in (own or {}, app or {}):
        for client, rooms in src.items():
            lst = out.setdefault(client, [])
            for r in ([rooms] if isinstance(rooms, str) else list(rooms or [])):
                if str(r).strip() and r not in lst and r not in gone:
                    lst.append(r)
    return out


def sync_rooms(cfg, state, now, call, log):
    """💬 앱에 적은 카톡방을 받아 오고, 노트북 설정의 방을 앱에 알려 준다 (11/5, 한 시간에 한 번). → cfg["client_rooms"] 를 합친 것으로."""
    own = cfg.setdefault("_own_rooms", dict(cfg.get("client_rooms") or {}))
    if now - state.get("rooms_at", 0) >= ROOMS_EVERY:
        state["rooms_at"] = now
        try:
            res = call({"action": "rooms", "side": "laptop", "rooms": merged_rooms(own, None)}) or {}
            state["app_rooms"], state["app_rooms_off"] = res.get("rooms") or {}, res.get("off") or {}
        except Exception as e:
            log("[카톡방] 앱과 맞추기 실패: %s" % str(e)[:100])
    off = state.get("app_rooms_off") or {}
    cfg["client_rooms"] = merged_rooms(own, state.get("app_rooms"), off)
    # ✕ 로 뺀 방은 지켜보지 않는다 — watch_rooms 에 있어도
    base = cfg.setdefault("_own_exclude", list(cfg.get("exclude_rooms") or []))
    cfg["exclude_rooms"] = base + [r for v in off.values() for r in (v if isinstance(v, list) else [v]) if r not in base]


def app_rooms(state):
    """앱에 적은 방 이름들 — 지켜볼 방에 더한다."""
    return [r for v in (state.get("app_rooms") or {}).values() for r in (v if isinstance(v, list) else [v])]


def poll(cfg, state, now, call, send, notify, log, send_exact=None):
    """call(body) → n8n kakao-send 답, send(room, text, log) → (연 방, 실패 이유)."""
    if now - state.get("kakao_send_at", 0) < EVERY:
        return
    state["kakao_send_at"] = now
    try:
        jobs = (call({"action": "take"}) or {}).get("jobs") or []
    except Exception as e:
        log("[비서 카톡] 가져오기 실패: %s" % str(e)[:100])
        return
    for j in jobs:
        room = room_of(cfg, j)
        text = str(j.get("text") or "")
        if not room or not text:
            continue
        try:
            # 👤 개인고객 방은 이름이 정확히 같은 방에만 (11/5)
            opened, why = (send_exact if j.get("watch") and send_exact else send)(room, text, log)
        except Exception as e:
            opened, why = room, "send: %s" % str(e)[:80]
        reason = {"no-room": "카톡 목록에서 '%s' 방을 못 찾음 (목록 화면에 보이게 해 주세요)" % room, "send": "방은 열었는데 못 보냄"}.get(why, why)
        try:
            call({"action": "result", "id": j.get("id"), "ok": not why, "why": reason, "room": opened or room})
        except Exception as e:
            log("[비서 카톡] 결과 알리기 실패: %s" % str(e)[:100])
        import worklog
        if why:
            log("[비서 카톡] %s 방에 못 보냄 (%s)" % (room, why))
            notify("[비서] '%s' 방에 카톡을 못 보냈어요 (%s) — 직접 보내 주세요\n\n%s" % (room, reason, text))
            worklog.add("reply", "%s 방 카톡 못 보냄" % room, reason, need=True)
        else:
            log("[비서 카톡] %s 방에 보냄" % opened)
            worklog.add("reply", "%s 방에 카톡 (비서)" % opened, text)
            if j.get("watch"):
                import assist
                assist.watch_room(state, opened or room, j["watch"], now)
