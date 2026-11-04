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


def poll(cfg, state, now, call, send, notify, log):
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
            opened, why = send(room, text, log)
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
