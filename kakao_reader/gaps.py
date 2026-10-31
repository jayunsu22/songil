"""현장 빈칸 채우기 (카톡 '비서' 4단계, 사장님 10/31).

시공 1주 전인데 공동현관 비번·세대 비번·화장실·필름 번호가 빈 현장 → 텔레그램 "업체에 물어볼까요? [시작해] [나중에]".
[시작해] → 그 업체 카톡 방에 질문을 보낸다 ('카톡은 김정헌 방만' 규칙의 유일한 예외 — 사장님이 누른 질문만).
업체가 답하면 현장관리 📥 카톡 정리 AI(n8n kakao-digest) 로 값을 뽑아 n8n 우편함(site-fill)에 두고 텔레그램으로 알린다.
현장관리 앱이 열릴 때 우편함을 가져가 칸에 바로 넣는다 (원본이 기기에 있어서).
state.json 에는 현장 id·이름·날짜·빈칸 이름만 — 비번·글 내용은 남기지 않는다.
설계 docs/superpowers/specs/2026-10-31-현장빈칸-design.md
"""
import re
import time

CHECK_EVERY = 3600          # 빈칸 확인 1시간마다
ASK_KEEP = 7 * 86400        # 물어본 뒤 답을 7일 기다림
ASKED_KEEP = 60 * 86400     # '물어봄' 기록 (현장당 한 번) 60일 보관
HOURS = (8, 20)             # 텔레그램은 아침 8시~저녁 8시에만
FIELDS = ("pwLobby", "pwUnit", "toilet")
LABEL = {"pwLobby": "공동현관 비번", "pwUnit": "세대 비번", "toilet": "화장실 위치", "films": "필름 정보"}
ASK_LABEL = dict(LABEL, films="필름 정보(위치별 번호)")
GREETING = "안녕하세요. 실장님~"  # 사장님 10/31


def _norm(s):
    return re.sub(r"\s+", "", str(s or "")).lower()


def rooms_for(cfg, client):
    """거래처 이름 → 카톡 방 목록 (config.json client_rooms). 한 업체에 방이 여럿이면 목록으로 적는다:
    {"봄애": ["봄애실장님", "봄애대리님"]} (같은 이름을 두 번 쓰면 JSON 이 뒤의 것만 남긴다). 띄어쓰기·대소문자 무시, 없으면 []."""
    rooms = cfg.get("client_rooms") or {}
    c = _norm(client)
    if not c:
        return []
    hit = next((v for k, v in rooms.items() if _norm(k) == c), None)
    if hit is None:  # '보람인테리어(인천)' 처럼 뒤에 붙은 것
        hit = next((v for k, v in rooms.items() if _norm(k) and c.startswith(_norm(k))), None)
    if hit is None:
        return []
    return [r for r in ([hit] if isinstance(hit, str) else list(hit)) if str(r).strip()]


def md(date):
    """'2026-11-25' → '11/25'."""
    try:
        return "%d/%d" % (int(date[5:7]), int(date[8:10]))
    except (ValueError, TypeError):
        return str(date or "")


def _josa(word):
    """받침 있으면 '이', 없으면 '가'."""
    ch = word[-1:] or "가"
    return "이" if "가" <= ch <= "힣" and (ord(ch) - 0xAC00) % 28 else "가"


def question(site):
    """업체 카톡 방에 보낼 질문 (빈칸만)."""
    want = ", ".join(ASK_LABEL[k] for k in site["missing"] if k in ASK_LABEL)
    return "%s\n%s (%s 시공)\n%s 알려주세요." % (GREETING, site["name"], md(site["date"]), want)


def ask_text(site, more=""):
    """텔레그램 (굵은 첫 줄, 11/1):
    🏠 그린워크1차 1104동 604호 (굵게)
    봄애 · 11/25 시작
    공동현관 비번·…이 비어 있습니다.
    + more (업체에 물어볼까요? 등)"""
    import tg
    names = [LABEL[k] for k in site["missing"] if k in LABEL]
    who = " · ".join(x for x in (site.get("client"), md(site["date"]) + " 시작") if x)
    return tg.lines("🏠 " + tg.b(site["name"]), tg.esc(who),
                    "%s%s 비어 있습니다." % ("·".join(names), _josa(names[-1]) if names else "가"), tg.esc(more))


MAX_ROOM_BUTTONS = 2  # 카톡_알림 은 한 줄에 버튼 3개까지 → 방 2개 + [나중에]


def ask_buttons(pairs):
    """[(방, 할 일 번호)] → 방 하나면 [시작해] [나중에], 여럿이면 방마다 버튼(누른 방에 묻는다, 2개까지) + [나중에]. 한 줄."""
    first = pairs[0][1]
    if len(pairs) == 1:
        return [[{"text": "시작해", "data": "k|%s|ask" % first}, {"text": "나중에", "data": "k|%s|later" % first}]]
    row = [{"text": room[:20], "data": "k|%s|ask" % job} for room, job in pairs[:MAX_ROOM_BUTTONS]]
    return [row + [{"text": "나중에", "data": "k|%s|later" % first}]]


def in_hours(t):
    return HOURS[0] <= time.localtime(t).tm_hour < HOURS[1]


def _site(s):
    return {"id": s["id"], "name": s.get("name") or "(이름없음)", "client": s.get("client") or "", "date": s.get("date") or "",
            "missing": [k for k in s.get("missing") or [] if k in LABEL]}


def check(cfg, state, now, fetch, notify, log):
    """reader.py 가 확인할 때마다 부른다. 1시간마다·8~20시에만 빈칸 현장을 가져와 처음 보는 현장만 텔레그램으로."""
    import jobs
    g = state.setdefault("gaps", {"at": 0, "asked": {}})
    if now - g.get("at", 0) < CHECK_EVERY or not in_hours(now):
        return
    g["at"] = now
    try:
        sites = fetch()
    except Exception as e:
        log("[현장] 빈칸 확인 실패: %s" % str(e)[:150])
        return
    asked = {k: v for k, v in (g.get("asked") or {}).items() if now - v.get("at", 0) < ASKED_KEEP}
    g["asked"] = asked
    for raw in sites:
        site = _site(raw)
        if site["id"] in asked or not site["missing"]:
            continue
        rooms = rooms_for(cfg, site["client"])
        room = ", ".join(rooms)
        if rooms:
            pairs = [(r, jobs.new_ask_job(state, r, site, now)) for r in rooms]
            more = "업체(%s 방)에 물어볼까요?" % rooms[0] if len(rooms) == 1 else "어느 방에 물어볼까요?"
            if len(rooms) > MAX_ROOM_BUTTONS:
                log("[현장] %s 방이 %d개 — 앞의 %d개만 버튼으로" % (site["client"], len(rooms), MAX_ROOM_BUTTONS))
            ok = notify(ask_text(site, more), ask_buttons(pairs))
        else:
            ok = notify(ask_text(site, "카톡 방 짝이 없어 물어볼 수 없습니다 — 노트북 config.json 의 client_rooms 에 "
                                       "\"%s\": \"카톡 방 이름\" 을 넣어 주세요." % (site["client"] or "거래처")))
        if ok:
            asked[site["id"]] = {"at": now}
            log("[현장] 빈칸 알림: %s (%s)" % (site["name"], room or "방 짝 없음"))


def run_ask(cfg, state, job, info, notify, log):
    """[시작해] — 그 업체 방을 열어 질문을 보내고, 답을 7일 기다린다 (asks)."""
    import chatlist
    import kakao_window
    site, room = info["site"], info["title"]
    text = question(site)
    chatlist.refresh_geom()
    h, opened = chatlist.open_room(room, None, log)
    if not h:
        notify("[현장] 업체에 못 물음 · %s\n카톡 목록에서 방을 못 찾았습니다 (목록 화면에 보이게 해 주세요). 손으로 보내려면:\n%s" % (room, text))
        return
    try:
        ok = kakao_window.send_text(opened, text)
    finally:
        kakao_window.close_window(h)
    if not ok:
        notify("[현장] 업체에 못 물음 · %s\n입력칸에 쓰던 글이 있거나 보내기가 안 됐습니다. 손으로 보내려면:\n%s" % (opened, text))
        log("[%s] 빈칸 질문 보내기 실패" % opened)
        return
    asks = state.setdefault("asks", {})
    lst = [x for x in asks.get(opened, []) if x["id"] != site["id"]]
    lst.append(dict(site, at=time.time()))
    asks[opened] = lst
    log("[%s] 빈칸 질문 보냄: %s" % (opened, site["name"]))
    import tg
    notify(tg.lines("🏠 " + tg.b("업체에 물었습니다 · %s" % opened), tg.esc(site["name"]), "답이 오면 현장관리 칸에 넣고 알려 드립니다."))


def _ask_key(asks, room):
    if room in asks:
        return room
    for k in asks:
        if _norm(k) == _norm(room):
            return k
    return None


def watch_extra(state, now):
    """물어보고 답을 기다리는 방 (7일 지난 것은 지움) — 알릴 방(watch_rooms)에 더해 그 방의 새 글을 읽게."""
    asks = state.get("asks") or {}
    for k in list(asks):
        asks[k] = [x for x in asks[k] if now - x.get("at", 0) < ASK_KEEP]
        if not asks[k]:
            del asks[k]
    return list(asks)


def pick_fills(items, pend, room, today):
    """digest 결과 중 물어본 현장의 '물어본 빈칸' 값만. 물어본 현장이 하나면 AI 가 현장을 못 정해도 그 현장으로."""
    by_id = {s["id"]: s for s in pend}
    got = {}
    for it in items or []:
        sid = it.get("siteId") or ""
        if sid not in by_id:
            if sid or len(pend) != 1:
                continue
            sid = pend[0]["id"]
        miss = by_id[sid]["missing"]
        kind = it.get("kind")
        if kind == "field" and it.get("field") in FIELDS and it["field"] in miss and str(it.get("value") or "").strip():
            got[(sid, it["field"])] = {"siteId": sid, "kind": "field", "field": it["field"], "value": str(it["value"]).strip(),
                                       "room": room, "at": today}
        elif kind == "films" and "films" in miss:
            films = [{"place": str(f.get("place") or "").strip(), "code": str(f.get("code") or "").strip()}
                     for f in it.get("films") or [] if str(f.get("code") or "").strip()]
            if films:
                prev = got.get((sid, "films"))
                got[(sid, "films")] = {"siteId": sid, "kind": "films", "films": (prev["films"] if prev else []) + films,
                                       "room": room, "at": today}
    return list(got.values())


def filled_text(site, fills):
    import tg
    lines = ["✅ " + tg.b("넣었습니다 · %s" % site["name"])]
    for f in fills:
        if f["kind"] == "field":
            lines.append(tg.esc("%s: %s" % (LABEL[f["field"]], f["value"])))
        else:
            lines.append(tg.esc("필름: " + ", ".join(("%s %s" % (x["place"], x["code"])).strip() for x in f["films"])))
    left = [LABEL[k] for k in site["missing"] if k not in {f.get("field") or "films" for f in fills}]
    if left:
        lines.append("❓ 아직 못 받음: " + "·".join(left))
    lines.append("(현장관리 앱을 열면 들어갑니다)")
    return tg.lines(*lines)


def on_answer(cfg, state, room, msgs, digest, put, notify, log):
    """물어본 방에 업체 새 글(사장님 글 뺀 것)이 오면 → kakao-digest 로 값 뽑기 → 우편함 → 텔레그램. 받은 칸은 asks 에서 뺀다."""
    asks = state.get("asks") or {}
    key = _ask_key(asks, room)
    if not key or not asks[key] or not msgs:
        return
    pend = asks[key]
    today = time.strftime("%Y-%m-%d")
    # 비번은 일반 정보로 다룬다(사장님 10/31) — 이 경우만 가리지 않고 보낸다
    messages = [{"d": m["date"], "t": m["time"], "who": m["sender"], "text": m["text"]} for m in msgs]
    sites = [{"id": s["id"], "name": s["name"], "date": s["date"], "known": {}} for s in pend]
    client = pend[0].get("client") or key
    log("[%s] 물어본 현장 %d곳 — 답에서 값 찾는 중" % (key, len(pend)))
    try:
        res = digest({"client": client, "name": key}, today, sites, messages)
    except Exception as e:
        log("[%s] 값 찾기 실패: %s" % (key, str(e)[:150]))
        return
    fills = pick_fills((res or {}).get("items"), pend, key, today)
    if not fills:
        log("[%s] 답에 넣을 값 없음" % key)
        return
    try:
        put(fills)
    except Exception as e:
        log("[%s] 우편함 넣기 실패: %s" % (key, str(e)[:150]))
        notify("[현장] 업체 답을 받았지만 현장관리에 못 넣었습니다 · %s\n%s" % (key, str(e)[:200]))
        return
    for s in list(pend):
        mine = [f for f in fills if f["siteId"] == s["id"]]
        if not mine:
            continue
        notify(filled_text(s, mine))
        log("[%s] 빈칸 %d개 넣음: %s" % (key, len(mine), s["name"]))
        done = {f.get("field") or "films" for f in mine}
        s["missing"] = [k for k in s["missing"] if k not in done]
    asks[key] = [s for s in pend if s["missing"]]
    if not asks[key]:
        del asks[key]
