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
# 못 받은 답 다시 묻기 (사장님 11/1): 마지막으로 묻거나 업체가 답한 뒤 2시간, 저녁 6시 넘으면 다음 날 9시(일·공휴일 13시) 뒤.
# 텔레그램 없이 자동으로 남은 번호만. 업체를 조르지 않게 3번까지, 그래도 없으면 사장님께 한 번 알림
REASK_AFTER = 2 * 3600
REASK_END = 18
MAX_REASK = 3
HOURS = (9, 20)             # 텔레그램은 평일·토요일 오전 9시~저녁 8시 (사장님 11/1)
HOLIDAY_START = 13          # 일요일·공휴일은 오후 1시부터
# 공휴일 (설·추석 연휴, 대체공휴일, 2026 지방선거 포함). 매년 말에 다음 해를 더한다.
# 임시공휴일처럼 갑자기 생긴 날은 config.json "holidays": ["2026-12-31"] 로 더한다
HOLIDAYS = {
    "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18", "2026-03-01", "2026-03-02", "2026-05-05",
    "2026-05-24", "2026-05-25", "2026-06-03", "2026-06-06", "2026-08-15", "2026-08-17", "2026-09-24",
    "2026-09-25", "2026-09-26", "2026-10-03", "2026-10-05", "2026-10-09", "2026-12-25",
    "2027-01-01", "2027-02-06", "2027-02-07", "2027-02-08", "2027-02-09", "2027-03-01", "2027-05-05",
    "2027-05-13", "2027-06-06", "2027-08-15", "2027-08-16", "2027-09-14", "2027-09-15", "2027-09-16",
    "2027-10-03", "2027-10-04", "2027-10-09", "2027-10-11", "2027-12-25", "2027-12-27",
}
FIELDS = ("pwLobby", "pwUnit", "toilet")
LABEL = {"pwLobby": "공동현관 비번", "pwUnit": "세대 비번", "toilet": "화장실 위치", "films": "필름 정보"}
ASK_LABEL = dict(LABEL, films="필름 번호 (위치별)")
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


def check_text(c, site):
    """업체 확인 질문 글 — {날짜} 는 그 현장 시공날짜 (11/25)."""
    return str(c.get("text") or "").replace("{날짜}", md(site["date"]))


def numbered(site):
    """[(번호, 질문)] — 빈칸 먼저, 그다음 업체 확인 질문 (앱 설정 순서). 업체에 가는 번호 그대로."""
    items = [ASK_LABEL[k] for k in site["missing"] if k in ASK_LABEL] + [check_text(c, site) for c in site.get("checks") or []]
    return list(enumerate(items, 1))


def item_numbers(site):
    """[[칸 또는 'check:id', 번호]] — numbered() 와 같은 순서."""
    keys = [k for k in site["missing"] if k in ASK_LABEL] + ["check:" + c["id"] for c in site.get("checks") or []]
    return [[k, n] for n, k in enumerate(keys, 1)]


def send_to_room(room, text, log):
    """카톡 목록에서 방을 열어 text 를 보내고 닫는다 → (연 방 이름, 실패 이유 '' | 'no-room' | 'send')."""
    import chatlist
    import kakao_window
    chatlist.refresh_geom()
    h, opened = chatlist.open_room(room, None, log)
    if not h:
        return room, "no-room"
    try:
        ok = kakao_window.send_text(opened, text)
    finally:
        kakao_window.close_window(h)
    return opened, "" if ok else "send"


def question(site):
    """업체 카톡 방에 보낼 질문 — 번호를 매겨 번호로 짧게 답하게 (사장님 11/1: 질문이 많으면 답하기·정리하기 어렵다)."""
    lines = [GREETING, "%s (%s 시공) 확인 부탁드려요." % (site["name"], md(site["date"])), "번호로 짧게 답 주시면 됩니다 🙏"]
    return "\n".join(lines + ["%d. %s" % (n, t) for n, t in numbered(site)])


def ask_text(site, more=""):
    """텔레그램 (굵은 첫 줄, 11/1):
    🏠 그린워크1차 1104동 604호 (굵게)
    봄애 · 11/25 시작
    공동현관 비번·…이 비어 있습니다.
    📋 업체 확인 질문 3개
    + more (업체에 물어볼까요? 등)"""
    import tg
    names = [LABEL[k] for k in site["missing"] if k in LABEL]
    who = " · ".join(x for x in (site.get("client"), md(site["date"]) + " 시작") if x)
    checks = site.get("checks") or []
    return tg.lines("🏠 " + tg.b(site["name"]), tg.esc(who),
                    "%s%s 비어 있습니다." % ("·".join(names), _josa(names[-1])) if names else "",
                    "📋 업체 확인 질문 %d개" % len(checks) if checks else "", tg.esc(more))


MAX_ROOM_BUTTONS = 2  # 카톡_알림 은 한 줄에 버튼 3개까지 → 방 2개 + [나중에]


def ask_buttons(pairs):
    """[(방, 할 일 번호)] → 방 하나면 [시작해] [나중에], 여럿이면 방마다 버튼(누른 방에 묻는다, 2개까지) + [나중에]. 한 줄."""
    first = pairs[0][1]
    if len(pairs) == 1:
        return [[{"text": "시작해", "data": "k|%s|ask" % first}, {"text": "나중에", "data": "k|%s|later" % first}]]
    row = [{"text": room[:20], "data": "k|%s|ask" % job} for room, job in pairs[:MAX_ROOM_BUTTONS]]
    return [row + [{"text": "나중에", "data": "k|%s|later" % first}]]


def is_holiday(t, extra=()):
    """일요일이거나 공휴일(HOLIDAYS + config holidays)."""
    lt = time.localtime(t)
    day = time.strftime("%Y-%m-%d", lt)
    return lt.tm_wday == 6 or day in HOLIDAYS or day in set(extra or ())


def in_hours(t, extra=()):
    """빈칸 알림을 보내도 되는 때: 평일·토요일 9시~20시, 일요일·공휴일 13시~20시."""
    start = HOLIDAY_START if is_holiday(t, extra) else HOURS[0]
    return start <= time.localtime(t).tm_hour < HOURS[1]


def _site(s):
    return {"id": s["id"], "name": s.get("name") or "(이름없음)", "client": s.get("client") or "", "date": s.get("date") or "",
            "missing": [k for k in s.get("missing") or [] if k in LABEL],
            "checks": [{"id": str(c["id"]), "text": str(c["text"]), "ok": bool(c.get("ok"))}
                       for c in s.get("checks") or [] if c.get("id") and c.get("text")]}


def check(cfg, state, now, fetch, notify, log):
    """reader.py 가 확인할 때마다 부른다. 1시간마다·알림 시간(in_hours)에만 빈칸 현장을 가져와 처음 보는 현장만 텔레그램으로."""
    import jobs
    g = state.setdefault("gaps", {"at": 0, "asked": {}})
    if now - g.get("at", 0) < CHECK_EVERY or not in_hours(now, cfg.get("holidays")):
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
        if site["id"] in asked or not (site["missing"] or site["checks"]):
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
    site, room = info["site"], info["title"]
    text = question(site)
    opened, why = send_to_room(room, text, log)
    if why == "no-room":
        notify("[현장] 업체에 못 물음 · %s\n카톡 목록에서 방을 못 찾았습니다 (목록 화면에 보이게 해 주세요). 손으로 보내려면:\n%s" % (room, text))
        return
    if why:
        notify("[현장] 업체에 못 물음 · %s\n입력칸에 쓰던 글이 있거나 보내기가 안 됐습니다. 손으로 보내려면:\n%s" % (opened, text))
        log("[%s] 빈칸 질문 보내기 실패" % opened)
        return
    asks = state.setdefault("asks", {})
    lst = [x for x in asks.get(opened, []) if x["id"] != site["id"]]
    # q = 보낸 질문 그대로 — 답이 일부만 와서 남은 질문이 줄어도, 업체가 본 번호로 맞추게 (비번 같은 값은 없음)
    # items = [[칸 또는 'check:id', 번호]] — 다시 물을 때 남은 것만 처음 번호 그대로 (11/1). last = 마지막으로 묻거나 업체가 답한 때
    now = time.time()
    lst.append(dict(site, at=now, q=text, items=item_numbers(site), last=now, tries=0))
    asks[opened] = lst
    log("[%s] 빈칸 질문 보냄: %s" % (opened, site["name"]))
    import tg
    notify(tg.lines("🏠 " + tg.b("업체에 물었습니다 · %s" % opened), tg.esc(site["name"]), "답이 오면 현장관리 칸에 넣고 알려 드립니다."))


def reask_at(last, extra=()):
    """다시 물어도 되는 때: last + 2시간, 저녁 6시 넘으면 다음 날 알림 시작(9시, 일·공휴일 13시), 시작 전이면 그 시각."""
    t = last + REASK_AFTER
    for _ in range(14):
        lt = time.localtime(t)
        if lt.tm_hour >= REASK_END:
            t = time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday + 1, 0, 0, 0, 0, 0, -1))
            continue
        start = HOLIDAY_START if is_holiday(t, extra) else HOURS[0]
        if lt.tm_hour < start:
            return time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, start, 0, 0, 0, 0, -1))
        return t
    return t


def remaining(entry):
    """아직 못 받은 [(처음 번호, 질문)]."""
    left = {k: ASK_LABEL[k] for k in entry["missing"] if k in ASK_LABEL}
    left.update({"check:" + c["id"]: check_text(c, entry) for c in entry.get("checks") or []})
    return [(n, left[k]) for k, n in entry.get("items") or [] if k in left]


def reask_text(entry):
    lines = ["실장님~ %s (%s 시공) 아직 확인 못 한 것만 부탁드려요 🙏" % (entry["name"], md(entry["date"]))]
    return "\n".join(lines + ["%d. %s" % (n, t) for n, t in remaining(entry)])


def reask(cfg, state, now, send, notify, log):
    """물어본 현장에 못 받은 답이 남았으면 때가 됐을 때 남은 번호만 업체 방에 다시 보낸다 (한 번에 한 현장).
    send(방, 글, log) → (연 방, 실패 이유). 3번 다시 물어도 안 오면 사장님께 텔레그램 한 번."""
    import tg
    today = time.strftime("%Y-%m-%d", time.localtime(now))
    for room, lst in (state.get("asks") or {}).items():
        for e in lst:
            if e.get("gaveup") or "items" not in e or (e.get("date") or "") < today or not remaining(e):
                continue
            if now < reask_at(e.get("last", e["at"]), cfg.get("holidays")):
                continue
            if e.get("tries", 0) >= MAX_REASK:
                e["gaveup"] = True
                notify(tg.lines("🏠 " + tg.b("업체 답이 없습니다 · %s" % e["name"]),
                                tg.esc("%s 방에 %d번 다시 물었는데 못 받은 것:" % (room, MAX_REASK)),
                                *[tg.esc("%d. %s" % nt) for nt in remaining(e)], "직접 확인해 주세요."))
                log("[%s] %s — 다시 묻기 %d번, 그만 (사장님께 알림)" % (room, e["name"], MAX_REASK))
                return
            opened, why = send(room, reask_text(e), log)
            e["last"] = now   # 못 보냈어도 2시간 뒤에 다시 (계속 방을 열지 않게)
            if why:
                log("[%s] 못 받은 답 다시 묻기 실패 (%s)" % (room, why))
                return
            e["tries"] = e.get("tries", 0) + 1
            log("[%s] 못 받은 답 다시 물음 (%d번째): %s" % (opened, e["tries"], e["name"]))
            return


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
        elif kind == "check" and it.get("checkId") in {c["id"] for c in by_id[sid].get("checks") or []} \
                and str(it.get("value") or "").strip():
            # 업체 확인 질문의 답 (11/1)
            got[(sid, "check:" + it["checkId"])] = {"siteId": sid, "kind": "check", "checkId": it["checkId"],
                                                    "value": str(it["value"]).strip(), "room": room, "at": today}
    return list(got.values())


def _done_key(f):
    return "check:" + f["checkId"] if f["kind"] == "check" else (f.get("field") or "films")


def filled_text(site, fills):
    import tg
    checks = {c["id"]: c for c in site.get("checks") or []}
    short = lambda c: re.sub(r"\s*\(.*?\)", "", check_text(c, site))[:24]   # 괄호 설명은 빼고 짧게
    lines = ["✅ " + tg.b("넣었습니다 · %s" % site["name"])]
    for f in fills:
        if f["kind"] == "field":
            lines.append(tg.esc("%s: %s" % (LABEL[f["field"]], f["value"])))
        elif f["kind"] == "check":
            lines.append(tg.esc("📋 %s: %s" % (short(checks[f["checkId"]]), f["value"])))
        else:
            lines.append(tg.esc("필름: " + ", ".join(("%s %s" % (x["place"], x["code"])).strip() for x in f["films"])))
    done = {_done_key(f) for f in fills}
    left = [LABEL[k] for k in site["missing"] if k not in done] + \
           [short(c) for c in site.get("checks") or [] if "check:" + c["id"] not in done]
    if left:
        lines.append("❓ 아직 못 받음: " + tg.esc(" · ".join(left)) + " (2시간 뒤 다시 물어봄)")
    lines.append("(현장관리 앱을 열면 들어갑니다)")
    return tg.lines(*lines)


def on_answer(cfg, state, room, msgs, digest, put, notify, log):
    """물어본 방에 업체 새 글(사장님 글 뺀 것)이 오면 → kakao-digest 로 값 뽑기 → 우편함 → 텔레그램. 받은 칸은 asks 에서 뺀다."""
    asks = state.get("asks") or {}
    key = _ask_key(asks, room)
    if not key or not asks[key] or not msgs:
        return
    pend = asks[key]
    for s in pend:
        s["last"] = time.time()   # 업체가 뭐라도 답했으면 다시 묻기는 그때부터 2시간 뒤
    today = time.strftime("%Y-%m-%d")
    # 비번은 일반 정보로 다룬다(사장님 10/31) — 이 경우만 가리지 않고 보낸다
    messages = [{"d": m["date"], "t": m["time"], "who": m["sender"], "text": m["text"]} for m in msgs]
    sites = [{"id": s["id"], "name": s["name"], "date": s["date"], "known": {},
              "checks": [dict(c, text=check_text(c, s)) for c in s.get("checks") or []]} for s in pend]
    asked = "\n\n".join(s.get("q") or question(s) for s in pend)   # 업체가 본 번호 그대로
    client = pend[0].get("client") or key
    log("[%s] 물어본 현장 %d곳 — 답에서 값 찾는 중" % (key, len(pend)))
    try:
        res = digest({"client": client, "name": key}, today, sites, messages, asked)
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
        done = {_done_key(f) for f in mine}
        s["missing"] = [k for k in s["missing"] if k not in done]
        s["checks"] = [c for c in s.get("checks") or [] if "check:" + c["id"] not in done]
    asks[key] = [s for s in pend if s["missing"] or s.get("checks")]
    if not asks[key]:
        del asks[key]
