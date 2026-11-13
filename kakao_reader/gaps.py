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

import worklog

CHECK_EVERY = 3600          # 빈칸 확인 1시간마다
ASK_KEEP = 7 * 86400        # 물어본 뒤 답을 7일 기다림
WATCH_KEEP = 30 * 86400     # 답을 다 받아도 시공일까지(길어야 30일) 그 방을 보며 바뀐 정보를 고쳐 넣는다 (사장님 11/1)
ASKED_KEEP = 60 * 86400     # '물어봄' 기록 (현장당 한 번) 60일 보관
# 못 받은 답 다시 묻기 (사장님 11/1): 마지막으로 묻거나 업체가 답한 뒤 3시간, 저녁 6시 넘으면 다음 날 9시(일·공휴일 13시) 뒤.
# 텔레그램 없이 자동으로 남은 것만 1번부터 다시 번호를 매겨. 업체를 조르지 않게 3번까지, 그래도 없으면 사장님께 한 번 알림
REASK_AFTER = 3 * 3600
# 업체가 답하면 3분쯤 뒤 그 방에 보내는 인사 (사장님 11/1) — 넷 중 아무거나. 값(비번·필름·답)이 온 글마다,
# 값이 없는 글('네' 처럼)은 묻기·다시 묻기 한 번에 한 번만. 비번·필름을 바꾼다는 글에는 CHANGE_REPLY
THANKS = ("감사합니다~😊\n궁금한거 생기면 다시 연락드릴께요.",
          "네~ 알겠습니다.🙂",
          "알겠어요~👍\n준비 잘할께요~",
          "알겠어요~\n또 연락드릴께요~😊")
CHANGE_REPLY = "알겠습니다~ 변경할께요.."
REPLY_DELAY = 120   # 방을 여는 데 이미 1분(조용해지면 엶) — 2분 더 기다려 글이 온 뒤 3분쯤에 보낸다
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
        # 목록 화면 밖으로 밀린 방 — 카톡 검색으로 (11/5: 이종수실장님 방을 못 찾음). 이름이 정확히 같은 방만 열린다
        h, opened = chatlist.search_open(room, log), room
    if not h:
        return room, "no-room"
    try:
        ok = kakao_window.send_text(opened, text)
    finally:
        kakao_window.close_window(h)
    return opened, "" if ok else "send"


def question(site):
    """업체 카톡 방에 보낼 질문 — 번호를 매겨 묻는다 (사장님 11/1: 질문이 많으면 답하기·정리하기 어렵다. 11/6: 안내 한 줄은 뺐다)."""
    lines = [GREETING, "%s (%s 시공) 확인 부탁드려요." % (site["name"], md(site["date"]))]
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


DEFAULT_ALERT_HOURS = {"평일": [HOURS[0], HOURS[1]], "토요일": [HOURS[0], HOURS[1]],
                       "일요일": [HOLIDAY_START, HOURS[1]], "공휴일": [HOLIDAY_START, HOURS[1]]}


def day_kind(t, cfg=None):
    """'평일' · '토요일' · '일요일' · '공휴일' (공휴일 = HOLIDAYS + config holidays, 일요일이 공휴일이면 공휴일)."""
    lt = time.localtime(t)
    day = time.strftime("%Y-%m-%d", lt)
    if day in HOLIDAYS or day in set((cfg or {}).get("holidays") or ()):
        return "공휴일"
    return "일요일" if lt.tm_wday == 6 else "토요일" if lt.tm_wday == 5 else "평일"


def alert_hours(t, cfg=None):
    """그날 알림을 보내는 [시작, 끝] 시각. config.json "alert_hours": {"평일": [9, 20], "토요일": [9, 20],
    "일요일": [13, 20], "공휴일": [13, 20]} 로 요일 종류마다 따로 바꾼다 (사장님 11/1). 빠진 칸은 기본값."""
    kind = day_kind(t, cfg)
    v = ((cfg or {}).get("alert_hours") or {}).get(kind)
    try:
        start, end = int(v[0]), int(v[1])
    except (TypeError, ValueError, IndexError):
        start, end = DEFAULT_ALERT_HOURS[kind]
    return start, end


def in_hours(t, cfg=None):
    """빈칸·필름 알림을 보내도 되는 때 (alert_hours)."""
    start, end = alert_hours(t, cfg)
    return start <= time.localtime(t).tm_hour < end


def _site(s):
    return {"id": s["id"], "name": s.get("name") or "(이름없음)", "client": s.get("client") or "", "date": s.get("date") or "",
            "missing": [k for k in s.get("missing") or [] if k in LABEL],
            "checks": [{"id": str(c["id"]), "text": str(c["text"]), "ok": bool(c.get("ok"))}
                       for c in s.get("checks") or [] if c.get("id") and c.get("text")]}


ORDER_DAYS = 5   # 필름 주문 알림: 시공 5일 전부터 (사장님 11/1 — 재고 없음·판매 중지도 있어서)
APP_URL = "https://jayunsu22.github.io/sitenote/"


def order_text(o, cfg, now):
    """🎞 필름 주문할 때입니다 · 현장 / 업체 · 11/8 시작 (D-5) / 번호 필요량 … / 👉 앱에서 문자 보내기 (그 현장 필름 탭)."""
    import tg
    try:
        left = int((time.mktime(time.strptime(o["date"], "%Y-%m-%d")) - time.mktime(time.strptime(
            time.strftime("%Y-%m-%d", time.localtime(now)), "%Y-%m-%d"))) // 86400)
    except (ValueError, KeyError):
        left = None
    who = " · ".join(x for x in (o.get("client"), md(o.get("date")) + " 시작" + (" (D-%d)" % left if left is not None else "")) if x)
    films = o.get("films") or []
    lines = ["🎞 " + tg.b("필름 주문할 때입니다 · %s" % o["name"]), tg.esc(who)]
    lines += [tg.esc("%s %s" % (f["code"], f.get("qty") or "(필요량 미정)")) for f in films]
    if not films:
        lines.append("❓ 필름 번호가 아직 없습니다")
    elif any(not f.get("qty") for f in films):
        lines.append("❓ 필요량을 골라 주세요")
    url = (cfg.get("app_url") or APP_URL) + "#site/%s/film" % o["id"]
    lines.append(tg.link(url, "👉 앱에서 문자 보내기"))
    return tg.lines(*lines)


def film_orders(cfg, g, now, orders, notify, log):
    """시공 5일 안·아직 '필름 주문' 전인 현장을 현장마다 한 번 텔레그램으로 (check 와 같은 알림 시간)."""
    told = {k: v for k, v in (g.get("film_told") or {}).items() if now - v.get("at", 0) < ASKED_KEEP}
    g["film_told"] = told
    for o in orders:
        if not o.get("id") or o["id"] in told:
            continue
        if notify(order_text(o, cfg, now)):
            told[o["id"]] = {"at": now}
            log("[필름] 주문 알림: %s (%s)" % (o.get("name"), o.get("date")))


def sync_checks(state, site):
    """물어본 뒤 앱에서 질문을 '확답만' 으로 바꾸거나 글을 고치면 기다리는 질문에도 반영 (사장님 11/1 — '네' 를 놓친 것)."""
    now = {c["id"]: c for c in site["checks"]}
    for lst in (state.get("asks") or {}).values():
        for e in lst:
            if e["id"] == site["id"]:
                e["checks"] = [dict(c, ok=now[c["id"]]["ok"], text=now[c["id"]]["text"]) if c["id"] in now else c
                               for c in e.get("checks") or []]


def film_checks(cfg, state, g, now, items, send, log):
    """🚚 업체가 필름을 가져다주는 현장 — 시공 전날 그 방에 한 번 묻는다 (사장님 11/5). 답은 🤖 비서 대화에 뜨게 방을 지켜본다."""
    import assist
    told = {k: v for k, v in (g.get("film_checked") or {}).items() if now - v.get("at", 0) < ASKED_KEEP}
    g["film_checked"] = told
    for o in items or []:
        if not o.get("id") or o["id"] in told:
            continue
        told[o["id"]] = {"at": now}
        rooms = rooms_for(cfg, o.get("client"))
        if not rooms:
            log("[필름] %s 방 짝이 없어 도착 확인을 못 함" % o.get("client"))
            worklog.add("reply", "필름 도착 확인 못 함 — 카톡 방 없음", o.get("name", ""), o["id"], need=True)
            continue
        text = "안녕하세요 섬세한손길입니다 🙂\n[%s]\n내일 시공인데 필름은 현장으로 가져다주시는 것 맞을까요?" % o.get("name", "")
        opened, why = send(rooms[0], text, log)
        if why:
            log("[필름] %s 도착 확인 못 보냄 (%s)" % (rooms[0], why))
            worklog.add("reply", "필름 도착 확인 못 보냄", rooms[0], o["id"], need=True)
        else:
            assist.watch_room(state, opened or rooms[0], {"siteId": o["id"], "name": o.get("name", ""), "until": o.get("date", ""), "vendor": True}, now)
            log("[필름] %s 방에 도착 확인: %s" % (opened, o.get("name")))
            worklog.add("reply", "%s 방에 필름 도착 확인" % (opened or rooms[0]), o.get("name", ""), o["id"])
        return   # 한 번에 한 방


PLAN_VIA = {"sms": "📨 문자", "kakao": "💬 카톡"}


def plan_text(site, p):
    """결재함에서 묻기로 한 현장 — [시작해] 대신 이 알림 한 번 (사장님 11/6: 노트북에도 알려줘야 안 헷갈림)."""
    import tg
    who = " · ".join(x for x in (p.get("who"), PLAN_VIA.get(p.get("via"), "")) if x)
    when = "%s 9시" % md(p.get("date") or "") if p.get("date") else "9시"
    return tg.lines("📋 " + tg.b("결재함에서 묻기로 함 · %s" % site["name"]),
                    tg.esc("→ %s (%s에 보냄)" % (who or "담당자", when)),
                    tg.esc("노트북은 따로 묻지 않습니다. 답이 오면 앱 칸에 들어갑니다."))


def done_text(site, a):
    import tg
    who = " · ".join(x for x in (a.get("who"), PLAN_VIA.get(a.get("via"), "")) if x)
    return tg.lines("📋 " + tg.b("결재함에서 이미 물음 · %s" % site["name"]), tg.esc("→ %s — 노트북은 따로 묻지 않습니다." % (who or "담당자")))


def tell_asked(cfg, site_id, via, who):
    """노트북이 업체에 물었다고 결재함(업무일정표)에 알린다 — 결재함 카드에 '이미 물어봄', 9시에 또 안 보냄 (11/6). 실패해도 묻기는 그대로."""
    url, key = cfg.get("report_url"), cfg.get("owner_key")
    if not url or not key:
        return
    try:
        import n8n_send
        n8n_send.post_json(url, key, {"action": "asked", "siteId": site_id, "by": "노트북", "via": via, "who": who}, timeout=15)
    except Exception:
        pass


def check(cfg, state, now, fetch, notify, log, send=None, plan=None):
    """reader.py 가 확인할 때마다 부른다. 1시간마다·알림 시간(in_hours)에만 빈칸 현장을 가져와 처음 보는 현장만 텔레그램으로."""
    import jobs
    g = state.setdefault("gaps", {"at": 0, "asked": {}})
    if now - g.get("at", 0) < CHECK_EVERY or not in_hours(now, cfg):
        return
    g["at"] = now
    try:
        data = fetch()
    except Exception as e:
        log("[현장] 빈칸 확인 실패: %s" % str(e)[:150])
        return
    sites = (data.get("sites") or []) if isinstance(data, dict) else data
    if isinstance(data, dict):
        film_orders(cfg, g, now, data.get("orders") or [], notify, log)
        film_checks(cfg, state, g, now, data.get("filmChecks") or [], send or send_to_room, log)
    asked = {k: v for k, v in (g.get("asked") or {}).items() if now - v.get("at", 0) < ASKED_KEEP}
    g["asked"] = asked
    # 결재함에서 [진행해] 한 현장·이미 물은 현장 (11/6) — 이 현장엔 [시작해] 를 띄우지 않고 '결재함에서 묻기로 함' 을 한 번
    plans, done = {}, {}
    if plan:
        try:
            pd = plan() or {}
            plans, done = pd.get("plans") or {}, pd.get("asked") or {}
            # '결재함이 묻기로 함' 을 알린 뒤 ⏸ 멈춤을 눌렀으면 다시 [시작해] 로 (11/6)
            for sid in [k for k, v in asked.items() if v.get("by") == "결재함" and k not in plans and k not in done]:
                del asked[sid]
        except Exception as e:
            log("[현장] 결재함 묻기 계획 못 읽음: %s" % str(e)[:100])
    for raw in sites:
        site = _site(raw)
        sync_checks(state, site)
        if site["id"] in asked or not (site["missing"] or site["checks"]):
            continue
        if site["id"] in plans or (site["id"] in done and done[site["id"]].get("by") == "결재함"):
            p = plans.get(site["id"])
            if notify(plan_text(site, p) if p else done_text(site, done[site["id"]])):
                asked[site["id"]] = {"at": now, "by": "결재함"}
                log("[현장] 결재함이 묻기로 함: %s" % site["name"])
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
    if why:   # 못 물었으면 '이미 알림' 을 지워 다음 확인 때 다시 알린다 (11/5: 이종수실장님 — 60일 동안 안 왔을 것)
        ((state.get("gaps") or {}).get("asked") or {}).pop(site["id"], None)
    if why == "no-room":
        notify("[현장] 업체에 못 물음 · %s\n카톡 목록에서 방을 못 찾았습니다 (목록 화면에 보이게 해 주세요). 손으로 보내려면:\n%s" % (room, text))
        return opened, why
    if why:
        notify("[현장] 업체에 못 물음 · %s\n입력칸에 쓰던 글이 있거나 보내기가 안 됐습니다. 손으로 보내려면:\n%s" % (opened, text))
        log("[%s] 빈칸 질문 보내기 실패" % opened)
        return opened, why
    asks = state.setdefault("asks", {})
    lst = [x for x in asks.get(opened, []) if x["id"] != site["id"]]
    # q = 보낸 질문 그대로 — 답이 일부만 와서 남은 질문이 줄어도, 업체가 본 번호로 맞추게 (비번 같은 값은 없음)
    # items = [[칸 또는 'check:id', 번호]] — 다시 물을 때 남은 것만 처음 번호 그대로 (11/1). last = 마지막으로 묻거나 업체가 답한 때
    now = time.time()
    lst.append(dict(site, at=now, q=text, items=item_numbers(site), last=now, tries=0))
    asks[opened] = lst
    log("[%s] 빈칸 질문 보냄: %s" % (opened, site["name"]))
    tell_asked(cfg, site["id"], "kakao", opened)   # 결재함에 '이미 물어봄' (11/6)
    import tg
    notify(tg.lines("🏠 " + tg.b("업체에 물었습니다 · %s" % opened), tg.esc(site["name"]), "답이 오면 현장관리 칸에 넣고 알려 드립니다."))
    return opened, ""


def reask_at(last, cfg=None):
    """다시 물어도 되는 때: last + 간격(2시간), 끝(저녁 6시) 넘으면 다음 날 알림 시작(alert_hours), 시작 전이면 그 시각.
    config.json "reask": {"간격": 2, "끝": 18} 로 바꾼다."""
    r = (cfg or {}).get("reask") or {}
    try:
        gap = float(r.get("간격", REASK_AFTER / 3600)) * 3600
        stop = int(r.get("끝", REASK_END))
    except (TypeError, ValueError):
        gap, stop = REASK_AFTER, REASK_END
    t = last + gap
    for _ in range(14):
        lt = time.localtime(t)
        if lt.tm_hour >= stop:
            t = time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday + 1, 0, 0, 0, 0, 0, -1))
            continue
        start = alert_hours(t, cfg)[0]
        if lt.tm_hour < start:
            return time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, start, 0, 0, 0, 0, -1))
        return t
    return t


def remaining(entry):
    """아직 못 받은 [(처음 번호, 질문)]."""
    left = {k: ASK_LABEL[k] for k in entry["missing"] if k in ASK_LABEL}
    left.update({"check:" + c["id"]: check_text(c, entry) for c in entry.get("checks") or []})
    return [(n, left[k]) for k, n in entry.get("items") or [] if k in left]


def _ask_phrase(t):
    """다시 물을 때는 부탁하는 말로: '공동현관 비번' → '공동현관 비번 부탁드려요', 이미 '…요' 로 끝나면 그대로."""
    t = str(t).strip()
    return t if t.endswith("요") or t.endswith("요)") else t + " 부탁드려요"


def reask_text(entry):
    """남은 것만 1번부터 다시 번호를 매긴다 (사장님 11/1). 업체가 여러 현장을 하면 헷갈리니 현장 줄을 넣는다."""
    lines = ["실장님.. 궁금한거 있어서 연락드려요", "%s (%s 시공)" % (entry["name"], md(entry["date"]))]
    return "\n".join(lines + ["%d. %s" % (i, _ask_phrase(t)) for i, (_, t) in enumerate(remaining(entry), 1)])


def urgent_asks(state, now, notify, log):
    """현장이 이틀 안인데 아직 못 받은 답 — 사장님께 '전화해 보세요' 한 번 (사장님 11/5). 다시 묻기를 다 썼어도 알린다."""
    import tg
    if not 8 <= time.localtime(now).tm_hour < 20:
        return
    today = time.strftime("%Y-%m-%d", time.localtime(now))
    base = time.mktime(time.strptime(today, "%Y-%m-%d"))
    for room, lst in (state.get("asks") or {}).items():
        for e in lst:
            if e.get("urgent") or "items" not in e or now - e.get("at", now) < 3 * 3600 or not remaining(e):
                continue
            try:
                left = int(round((time.mktime(time.strptime(e.get("date") or "", "%Y-%m-%d")) - base) / 86400))
            except ValueError:
                continue
            if not 0 <= left <= 2:
                continue
            e["urgent"] = True
            notify(tg.lines("📞 " + tg.b("전화해 보셔야 해요 · %s" % e["name"]),
                            tg.esc("%s 시공 (D-%d) — %s 방에서 아직 못 받은 것:" % (md(e["date"]), left, room)),
                            *[tg.esc("%d. %s" % nt) for nt in remaining(e)]))
            log("[%s] %s — 현장 임박, 사장님께 전화 알림" % (room, e["name"]))


def sync_open(state, now, fetch, log):
    """다시 묻기 전에 앱의 지금 빈칸(site-gaps)으로 기다리는 질문을 줄인다 (사장님 11/13: 통화로 다 받았는데 노트북이 또 물었다).
    앱에서 칸을 채웠거나 업체 확인에 답·'확답 받음'을 적었거나 [📞 통화로 확인 — 그만 묻기] 를 누른 것은 빼고,
    앱 목록에 아예 없는 현장(다 받음·그만 묻기·지난 현장)은 그만 묻는다. 30분에 한 번만 받는다. 못 받으면 그대로 둔다"""
    g = state.setdefault("gaps", {"at": 0, "asked": {}})
    if fetch is None:
        return
    if now - g.get("open_at", 0) >= 1800:
        try:
            data = fetch()
            sites = (data.get("sites") or []) if isinstance(data, dict) else data
            g["open"] = {x["id"]: {"missing": list(x.get("missing") or []), "checks": [str(c.get("id")) for c in x.get("checks") or []]}
                         for x in sites if x and x.get("id")}
            g["open_at"] = now
        except Exception as e:
            log("[현장] 다시 묻기 전 빈칸 확인 실패: %s" % str(e)[:120])
            return
    op = g.get("open")
    if op is None:
        return
    for room, lst in (state.get("asks") or {}).items():
        for e in lst:
            if e.get("gaveup") or "items" not in e:
                continue
            cur = op.get(e["id"])
            if cur is None:
                if remaining(e):
                    log("[%s] %s — 앱에서 다 받았거나 그만 묻기라 다시 안 물음" % (room, e.get("name")))
                e["missing"], e["checks"] = [], []
                continue
            e["missing"] = [k for k in e["missing"] if k in cur["missing"]]
            e["checks"] = [c for c in e.get("checks") or [] if str(c["id"]) in cur["checks"]]


def reask(cfg, state, now, send, notify, log, fetch=None):
    """물어본 현장에 못 받은 답이 남았으면 때가 됐을 때 남은 번호만 업체 방에 다시 보낸다 (한 번에 한 현장).
    send(방, 글, log) → (연 방, 실패 이유). 3번 다시 물어도 안 오면 사장님께 텔레그램 한 번.
    fetch = 앱의 지금 빈칸 (site-gaps) — 앱에서 받은 것은 다시 묻지 않는다 (11/13)"""
    import tg
    today = time.strftime("%Y-%m-%d", time.localtime(now))
    due = [e for lst in (state.get("asks") or {}).values() for e in lst
           if not e.get("gaveup") and "items" in e and (e.get("date") or "") >= today and remaining(e) and now >= reask_at(e.get("last", e["at"]), cfg)]
    if due:
        sync_open(state, now, fetch, log)
    urgent_asks(state, now, notify, log)
    for room, lst in (state.get("asks") or {}).items():
        for e in lst:
            if e.get("gaveup") or "items" not in e or (e.get("date") or "") < today or not remaining(e):
                continue
            if now < reask_at(e.get("last", e["at"]), cfg):
                continue
            if e.get("tries", 0) >= MAX_REASK:
                e["gaveup"] = True
                notify(tg.lines("🏠 " + tg.b("업체 답이 없습니다 · %s" % e["name"]),
                                tg.esc("%s 방에 %d번 다시 물었는데 못 받은 것:" % (room, MAX_REASK)),
                                *[tg.esc("%d. %s" % nt) for nt in remaining(e)], "직접 확인해 주세요."))
                log("[%s] %s — 다시 묻기 %d번, 그만 (사장님께 알림)" % (room, e["name"], MAX_REASK))
                return
            text = reask_text(e)
            opened, why = send(room, text, log)
            e["last"] = now   # 못 보냈어도 3시간 뒤에 다시 (계속 방을 열지 않게)
            if why:
                log("[%s] 못 받은 답 다시 묻기 실패 (%s)" % (room, why))
                return
            e["q"] = text          # 업체는 이제 새 번호로 답한다 → AI 에 이 글을 준다
            e["thanked"] = False   # 이번 다시 묻기에 답이 오면 또 한 번 인사
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
    """물어본 현장의 업체 방 — 알릴 방(watch_rooms)에 더해 그 방의 새 글을 읽게. 답을 다 받아도 시공일까지는 본다
    (사장님 11/1: 업체가 나중에 '비번 바꿨어요' 하면 고쳐 넣게). 시공일이 지났거나 물은 지 30일 넘은 것은 지운다."""
    asks = state.get("asks") or {}
    today = time.strftime("%Y-%m-%d", time.localtime(now))
    for k in list(asks):
        asks[k] = [x for x in asks[k] if (x.get("date") or "") >= today and now - x.get("at", 0) < WATCH_KEEP]
        if not asks[k]:
            del asks[k]
    return list(asks)


def pick_fills(items, pend, room, today):
    """digest 결과 중 물어본 현장의 비번·화장실·필름과 남은 확인 질문 값만. 물어본 현장이 하나면 AI 가 현장을 못 정해도 그 현장으로.
    이미 받은 칸(비번·화장실·필름)에 새 값이 오면 update: True — 업체가 바꾼 것 (사장님 11/1, 텔레그램 🔄 로 알림)."""
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
        if kind == "field" and it.get("field") in FIELDS and str(it.get("value") or "").strip():
            got[(sid, it["field"])] = {"siteId": sid, "kind": "field", "field": it["field"], "value": str(it["value"]).strip(),
                                       "room": room, "at": today, "update": it["field"] not in miss}
        elif kind == "films":
            films = [{"place": str(f.get("place") or "").strip(), "code": str(f.get("code") or "").strip()}
                     for f in it.get("films") or [] if str(f.get("code") or "").strip()]
            if films:
                prev = got.get((sid, "films"))
                got[(sid, "films")] = {"siteId": sid, "kind": "films", "films": (prev["films"] if prev else []) + films,
                                       "room": room, "at": today, "update": "films" not in miss}
        elif kind == "check" and it.get("checkId") in {c["id"] for c in by_id[sid].get("checks") or []} \
                and str(it.get("value") or "").strip():
            # 업체 확인 질문의 답 (11/1)
            got[(sid, "check:" + it["checkId"])] = {"siteId": sid, "kind": "check", "checkId": it["checkId"],
                                                    "value": str(it["value"]).strip(), "room": room, "at": today}
    return list(got.values())


def _done_key(f):
    return "check:" + f["checkId"] if f["kind"] == "check" else (f.get("field") or "films")


def reask_gap_hours(cfg=None):
    try:
        return float(((cfg or {}).get("reask") or {}).get("간격", REASK_AFTER / 3600))
    except (TypeError, ValueError):
        return REASK_AFTER / 3600


def film_confirmed_text(site, films, cfg=None):
    """업체 답으로 필름 번호가 들어왔을 때 (사장님 11/1) — 사장님이 앱에서 수량을 골라야 주문할 수 있다."""
    import tg
    url = ((cfg or {}).get("app_url") or APP_URL) + "#site/%s/film" % site["id"]
    return tg.lines("🎞 " + tg.b("필름 넘버가 확정되었습니다 · %s" % site["name"]),
                    tg.esc(" / ".join(("%s %s" % (x.get("place") or "", x["code"])).strip() for x in films)),
                    "수량을 표시해주시면 주문을 넣도록 하겠습니다.",
                    tg.link(url, "👉 앱에서 수량 고르기"))


def _eul(word):
    """받침 있으면 '을', 없으면 '를'."""
    ch = str(word)[-1:] or "가"
    return "을" if "가" <= ch <= "힣" and (ord(ch) - 0xAC00) % 28 else "를"


def _ro(word):
    """받침 없거나 ㄹ 받침이면 '로', 그 밖 받침이면 '으로' (숫자·영문 끝은 '로')."""
    ch = str(word)[-1:] or "가"
    if not ("가" <= ch <= "힣"):
        # 숫자는 읽는 소리로: 영·삼·육 은 받침(으로), 일·칠·팔 은 ㄹ 받침(로), 나머지는 받침 없음(로). 영문 끝도 '로'
        return "으로" if ch in "036" else "로"
    j = (ord(ch) - 0xAC00) % 28
    return "로" if j in (0, 8) else "으로"


def film_change_text(site, films, room, cfg=None):
    """업체가 필름 번호를 바꾸자고 할 때 — 앱은 그대로 두고 알림만 (사장님 11/1: 필름·일정 변경은 직접 바꾼다)."""
    import tg
    url = ((cfg or {}).get("app_url") or APP_URL) + "#site/%s/film" % site["id"]
    v = ", ".join(("%s %s" % (x["place"], x["code"])).strip() for x in films)
    return tg.lines("🎞 " + tg.b("필름 번호 변경 요청 · %s" % site["name"]),
                    tg.esc("%s님이 필름을 %s%s 바꾸자고 합니다." % (room, v, _ro(v))),
                    "앱은 그대로입니다 — 확인하고 직접 바꿔 주세요.",
                    tg.link(url, "👉 앱에서 필름 바꾸기"))


def changed_text(site, fills, room):
    """업체가 이미 받은 정보를 바꿨을 때 (사장님 11/1): '류춘화님이 세대 비번을 1234로 바꿨다고 해서 앱에서도 수정했습니다.'"""
    import tg
    parts = []
    for f in fills:
        name = LABEL[f["field"]] if f["kind"] == "field" else "필름"
        v = f["value"] if f["kind"] == "field" else ", ".join(("%s %s" % (x["place"], x["code"])).strip() for x in f["films"])
        parts.append("%s%s %s%s" % (name, _eul(name), v, _ro(v)))
    return tg.lines("🔄 " + tg.b("바뀐 정보 · %s" % site["name"]),
                    tg.esc("%s님이 %s 바꿨다고 해서 앱에서도 수정했습니다." % (room, ", ".join(parts))),
                    "(현장관리 앱을 열면 들어갑니다)")


def filled_text(site, fills, cfg=None):
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
        lines.append("❓ 아직 못 받음: " + tg.esc(" · ".join(left)) + " (%g시간 뒤 다시 물어봄)" % reask_gap_hours(cfg))
    lines.append("(현장관리 앱을 열면 들어갑니다)")
    return tg.lines(*lines)


def queue_reply(state, room, text, now):
    """인사를 바로 보내지 않고 REPLY_DELAY 뒤에 (send_replies). 그 사이 또 오면 '변경' 인사가 이긴다."""
    q = state.setdefault("replies", {})
    old = q.get(room)
    if old and old["text"] == CHANGE_REPLY:
        text = CHANGE_REPLY
    q[room] = {"text": text, "due": now + REPLY_DELAY}


def send_replies(state, now, send, log, done=None):
    """때가 된 인사를 보낸다 (한 번에 한 방). 못 보내면 버린다 — 인사 때문에 방을 계속 열지 않게."""
    q = state.get("replies") or {}
    for room, r in list(q.items()):
        if now < r["due"]:
            continue
        del q[room]
        _, why = send(room, r["text"], log)
        log("[%s] 인사 %s" % (room, "못 보냄 (%s)" % why if why else "보냄: " + r["text"].split("\n")[0]))
        if done:
            done(room, r["text"], why)
        return


def _reply(state, key, pend, kind, now):
    """kind: 'change' = 바꾼다는 글, 'got' = 값이 온 글, '' = 값 없는 글 (이번 묻기에 아직 인사 안 했을 때만)."""
    import random
    if not kind and all(s.get("thanked") for s in pend):
        return
    queue_reply(state, key, CHANGE_REPLY if kind == "change" else random.choice(THANKS), now)
    for s in pend:
        s["thanked"] = True


def on_answer(cfg, state, room, msgs, digest, put, notify, log, send=None):
    """물어본 방에 업체 새 글(사장님 글 뺀 것)이 오면 → kakao-digest 로 값 뽑기 → 우편함 → 텔레그램 → 3분쯤 뒤 인사.
    받은 칸은 asks 에서 뺀다. send 가 있으면 인사를 줄에 넣는다 (send_replies 가 보냄)."""
    asks = state.get("asks") or {}
    key = _ask_key(asks, room)
    if not key or not asks[key] or not msgs:
        return
    pend = asks[key]
    now = time.time()
    for s in pend:
        s["last"] = now   # 업체가 뭐라도 답했으면 다시 묻기는 그때부터 3시간 뒤
    kind = _answer(cfg, key, pend, msgs, digest, put, notify, log)
    if send:
        _reply(state, key, pend, kind, now)


def _fill_line(f):
    if f["kind"] == "check":
        return "업체 확인 답 받음"
    name = LABEL[f["field"]] if f["kind"] == "field" else "필름 번호"
    return name + (" 바꿈" if f.get("update") else " 넣음") + (" → 수량을 골라 주세요" if f["kind"] == "films" else "")


def _left_labels(site, done):
    return [LABEL[k] for k in site.get("missing") or [] if k not in done] + \
           [re.sub(r"\s*\(.*?\)", "", check_text(c, site))[:24] for c in site.get("checks") or []]


def _answer(cfg, key, pend, msgs, digest, put, notify, log):
    """값을 뽑아 넣고 알린다. 돌려줌: 'change' / 'got' / '' (인사 고르기용)."""
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
        return ""
    fills = pick_fills((res or {}).get("items"), pend, key, today)
    # 필름 번호를 바꾸자는 건 앱에 넣지 않고 알림만 — 사장님이 직접 바꾼다 (11/1). 비번·화장실 변경은 바로 고쳐 넣는다
    film_changes = [f for f in fills if f["kind"] == "films" and f.get("update")]
    fills = [f for f in fills if f not in film_changes]
    for f in film_changes:
        s = next(x for x in pend if x["id"] == f["siteId"])
        notify(film_change_text(s, f["films"], key, cfg))
        worklog.add("site", "필름 번호 변경 요청 — 직접 바꿔 주세요", key, s["id"], need=True)
        log("[%s] 필름 번호 변경 알림 (앱은 그대로): %s" % (key, s["name"]))
    if not fills:
        if not film_changes:
            log("[%s] 답에 넣을 값 없음" % key)
        worklog.feed(key, pend[0]["id"], pend[0]["name"], msgs, ["필름 번호 변경 요청 — 직접 바꿔 주세요"] if film_changes else [],
                     _left_labels(pend[0], set()))
        return "change" if film_changes else ""
    try:
        put(fills)
    except Exception as e:
        log("[%s] 우편함 넣기 실패: %s" % (key, str(e)[:150]))
        notify("[현장] 업체 답을 받았지만 현장관리에 못 넣었습니다 · %s\n%s" % (key, str(e)[:200]))
        return "got"
    for s in list(pend):
        mine = [f for f in fills if f["siteId"] == s["id"]]
        new = [f for f in mine if not f.get("update")]
        changed = [f for f in mine if f.get("update")]
        if new:
            notify(filled_text(s, new, cfg))
            log("[%s] 빈칸 %d개 넣음: %s" % (key, len(new), s["name"]))
        if changed:
            notify(changed_text(s, changed, key))
            log("[%s] 바뀐 정보 %d개 고쳐 넣음: %s" % (key, len(changed), s["name"]))
        films = [x for f in new if f["kind"] == "films" for x in f["films"]]
        if films:
            notify(film_confirmed_text(s, films, cfg))
        done = {_done_key(f) for f in mine}
        s["missing"] = [k for k in s["missing"] if k not in done]
        s["checks"] = [c for c in s.get("checks") or [] if "check:" + c["id"] not in done]
        if mine:
            worklog.feed(key, s["id"], s["name"], msgs, [_fill_line(f) for f in mine], _left_labels(s, set()))
    # 다 받은 현장도 시공일까지 남겨 둔다 — 업체가 나중에 바꾼 정보를 고쳐 넣게 (watch_extra 가 시공일 뒤 지움)
    return "change" if film_changes or any(f.get("update") for f in fills) else "got"
