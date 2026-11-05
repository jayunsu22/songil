"""🤖 능동 비서 (사장님 11/4): 물어보지 않은 업체 방 글도 AI(n8n 카톡_비서)가 읽고 판단한다.

- 확실한 현장의 비번·화장실·필름 → 우편함(앱이 열릴 때 칸에 넣음) + 텔레그램 '📥 넣었어요'. 필름 번호 변경은 알림만 (11/1 규칙).
- 어느 현장인지 애매한 정보·'잔금 넣었어요' → 결재함 카드 (업무일정표 inbox_add) — 사장님이 누르기만.
- 답장: 받았다·되묻기(간단한 답)는 3분쯤 뒤 자동(gaps.queue_reply), 시간·금액·약속은 텔레그램 초안 [보내][고쳐서 보내][안 보냄].
- 비서가 물어본 방(gaps asks)은 지금처럼 gaps.on_answer 가 맡는다 — 같은 글을 두 번 처리하지 않게.
답장 초안 글은 메모리(DRAFTS)에만 — state.json 에 글 내용을 남기지 않는다 (프로그램을 다시 켜면 [보내] 는 '초안 없음').
설계 docs/superpowers/specs/2026-11-04-능동비서-design.md
"""
import re
import time

import worklog

APP_URL = "https://jayunsu22.github.io/sitenote/"
REPLY_HOURS = (8, 21)   # 자동 답장은 아침 8시~저녁 9시 — 그 밖은 초안으로
PRIVATE_CLIENT = "개인고객"
REASK_AFTER = 3 * 3600  # [물어봐] 를 누르면 3시간 뒤 다시 묻는다
KEY_LABEL = {"pwLobby": "공동현관 비번", "pwUnit": "세대 비번", "toilet": "화장실 위치"}
DRAFTS = {}             # 할 일 번호 → {"room", "text"}


def _norm(s):
    return re.sub(r"\s+", "", str(s or "")).lower()


def client_of(cfg, room):
    """방 이름 → 현장관리 거래처 이름 (config.json client_rooms 를 거꾸로). 모르면 ''."""
    r = _norm(room)
    for client, rooms in (cfg.get("client_rooms") or {}).items():
        for x in ([rooms] if isinstance(rooms, str) else list(rooms or [])):
            if _norm(x) and (_norm(x) == r or r.startswith(_norm(x))):
                return client
    return ""


# ── 👤 개인고객 방 지켜보기 (사장님 11/5): 앱에서 카톡을 보낸 고객 방을 시공일까지. state 에는 현장 id·이름·날짜·칸 이름만
def watch_room(state, room, watch, now):
    state.setdefault("cust_watch", {})[room] = {"siteId": watch.get("siteId", ""), "name": watch.get("name", ""), "until": watch.get("until", ""),
                                               "keys": [k for k in (watch.get("keys") or []) if k in KEY_LABEL], "at": now, "vendor": bool(watch.get("vendor"))}


def watch_rooms(state, now):
    """지켜볼 고객 방 목록. 시공일이 지난 방은 뺀다."""
    w = state.get("cust_watch") or {}
    today = time.strftime("%Y-%m-%d", time.localtime(now))
    for room in [r for r, x in w.items() if x.get("until") and x["until"] < today]:
        del w[room]
    return list(w)


def _watch_of(state, room):
    w = state.get("cust_watch") or {}
    return next((v for k, v in w.items() if _norm(k) == _norm(room)), None)


def _remaining(state, room, cw, fills, notify, now):
    """받은 칸을 빼고, 아직 남았으면 [물어봐] 를 묻는다 (값이 온 글에만 — 고객을 조르지 않게)."""
    got = {f.get("field") for f in fills if f.get("kind") == "field"}
    if not got or not cw.get("keys"):
        return
    cw["keys"] = [k for k in cw["keys"] if k not in got]
    if not cw["keys"]:
        return
    import jobs
    import tg
    js = {k: v for k, v in (state.get("jobs") or {}).items() if now - v.get("at", 0) < jobs.KEEP}
    job = jobs._new_id(js)
    js[job] = {"title": room, "kind": "다시묻기", "at": now}
    state["jobs"] = js
    notify(tg.lines("❓ " + tg.b("아직 못 받음 · %s" % cw.get("name", room)), tg.esc(" · ".join(KEY_LABEL[k] for k in cw["keys"])), "3시간 뒤에 다시 물어볼까요?"),
           [[{"text": "물어봐", "data": "k|%s|ra" % job}, {"text": "내가 할게", "data": "k|%s|later" % job}]])


def run_reask(cfg, state, job, info, notify, log):
    """텔레그램 [물어봐] — 3시간 뒤로 잡는다 (보내는 건 reask_due)."""
    cw = _watch_of(state, info["title"])
    if cw:
        cw["reask_at"] = time.time() + REASK_AFTER


def reask_due(state, now, send, notify, log):
    """때가 된 다시 묻기를 보낸다 (한 번에 한 방, 저녁 9시~아침 8시는 미룸)."""
    if not REPLY_HOURS[0] <= time.localtime(now).tm_hour < REPLY_HOURS[1]:
        return
    for room, cw in (state.get("cust_watch") or {}).items():
        if not cw.get("reask_at") or now < cw["reask_at"]:
            continue
        cw.pop("reask_at")
        if not cw.get("keys"):
            continue
        text = "안녕하세요 섬세한손길입니다 🙂\n[%s]\n" % cw.get("name", "") + "\n".join("- %s 알려주세요" % KEY_LABEL[k] for k in cw["keys"])
        _, why = send(room, text, log)
        if why:
            notify("[비서] '%s' 방에 다시 못 물어봤어요 (%s) — 직접 보내 주세요\n\n%s" % (room, why, text))
            worklog.add("reply", "%s 방 다시 묻기 못 보냄" % room, why, cw.get("siteId", ""), need=True)
        else:
            log("[%s] 🤖 못 받은 정보 다시 물어봄" % room)
            worklog.add("reply", "%s 방에 다시 물어봄" % room, " · ".join(KEY_LABEL[k] for k in cw["keys"]), cw.get("siteId", ""))
        return


def _line(m):
    return {"d": m.get("date", ""), "t": m.get("time", ""), "who": m.get("sender", ""), "text": m.get("text", "")}


def _mailbox(f, room, today):
    o = {"siteId": f["siteId"], "kind": f["kind"], "room": room, "at": today}
    if f["kind"] == "field":
        o.update(field=f["field"], value=f["value"])
    else:
        o["films"] = f["films"]
    return o


def _extras(res, room, today, put, notify, log):
    """📌 업체가 부탁한 일 → 앱 할 일, 🚚 필름 업체가 가져옴 → 현장 표시 (사장님 11/5). 비서 대화에 띄울 줄을 돌려준다."""
    import tg
    tasks, fvs = res.get("tasks") or [], res.get("filmVendors") or []
    if not tasks and not fvs:
        return []
    box = [{"siteId": x["siteId"], "kind": "filmVendor", "room": room, "at": today} for x in fvs]
    box += [{"siteId": t.get("siteId") or "-", "kind": "task", "room": room, "at": today, "date": today, "vendor": True,
             "title": "%s · %s" % (t["title"], room)} for t in tasks]
    try:
        put(box)
    except Exception as e:
        log("[%s] 🤖 할 일·표시 넣기 실패: %s" % (room, str(e)[:150]))
        return ["할 일·표시를 못 넣었어요 — 글을 보고 직접 챙겨 주세요"]
    lines = ["🚚 필름 업체가 가져옴으로 표시 — 주문 알림 안 함" for _ in fvs] + ["📌 할 일로 넣음: %s" % t["title"] for t in tasks]
    notify(tg.lines("📌 " + tg.b(room), *[tg.esc(x) for x in lines]))
    log("[%s] 🤖 %s" % (room, " / ".join(lines)))
    return lines


def _value(f):
    if f["kind"] == "field":
        return f["value"]
    return ", ".join(("%s %s" % (x.get("place") or "", x["code"])).strip() for x in f["films"])


def filled_text(site_name, site_id, fills, room, cfg):
    import tg
    url = (cfg.get("app_url") or APP_URL) + "#site/%s" % site_id
    return tg.lines("📥 " + tg.b("%s 앱에 넣었어요" % site_name),
                    *[tg.esc("· %s: %s%s" % (f["label"], _value(f), " (바뀜)" if f.get("update") else "")) for f in fills],
                    tg.esc("(%s님이 먼저 보내줌 · 앱을 열면 들어갑니다)" % room),
                    tg.link(url, "👉 앱에서 보기"))


def inbox_text(room, picks, pays, cfg):
    import tg
    url = (cfg.get("app_url") or APP_URL) + "#approve"
    rows = ["❓ %s — 어느 현장인지 골라 주세요" % ", ".join(p["label"] for p in picks)] if picks else []
    rows += ["💰 %s 잔금 넣었다고 함 — 확인되면 완료표시" % p["name"] for p in pays]
    return tg.lines("📋 " + tg.b("결재함에 올렸어요 · %s" % room), *[tg.esc(r) for r in rows], tg.link(url, "👉 결재함 열기"))


def draft_text(room, reply):
    import tg
    return tg.lines("✍️ " + tg.b("%s 답장 초안" % room),
                    tg.esc("확인이 필요해서 안 보냈어요 (%s)" % (reply.get("why") or "사장님 확인")),
                    tg.esc("「%s」" % reply["text"]))


def new_reply_job(state, room, text, t):
    import jobs
    js = {k: v for k, v in (state.get("jobs") or {}).items() if t - v.get("at", 0) < jobs.KEEP}
    job = jobs._new_id(js)
    js[job] = {"title": room, "kind": "답장", "at": t}   # 글 내용은 DRAFTS(메모리)에만
    state["jobs"] = js
    DRAFTS[job] = {"room": room, "text": text}
    return job


def reply_buttons(job):
    return [[{"text": "보내", "data": "k|%s|rs" % job}, {"text": "고쳐서 보내", "data": "k|%s|rc" % job},
             {"text": "안 보냄", "data": "k|%s|rn" % job}]]


def handle(cfg, state, room, new, msgs, call, put, inbox, notify, log, now=None, queue=None):
    """업체 방 새 글(new, 사장님 글 뺀 것)을 AI 에게 판단받아 넣고·올리고·답한다. msgs = 그 방에서 읽은 글 전부(최근 흐름·말투)."""
    import gaps
    now = now or time.time()
    if not cfg.get("assist", True) or not new:
        return
    asks = state.get("asks") or {}
    k = gaps._ask_key(asks, room)
    asked = bool(k and asks[k])   # 비서가 물어본 방 — 칸은 gaps.on_answer 가 맡고, 여기서는 업체 부탁·🚚 만 본다 (11/5)
    mine = {_norm(x) for x in cfg.get("my_names", ["김정헌"])}
    body = {"room": room, "client": client_of(cfg, room), "today": time.strftime("%Y-%m-%d", time.localtime(now)),
            "messages": [_line(m) for m in new], "recent": [_line(m) for m in (msgs or [])[-40:]],
            "mine": list(cfg.get("my_names", ["김정헌"]))}
    cw = _watch_of(state, room)
    if cw and not cw.get("vendor"):   # 👤 앱에서 카톡을 보낸 고객 방 — 어느 현장인지 안다 (🚚 확인으로 지켜보는 업체 방은 현장이 여럿이라 뺀다)
        body["client"], body["siteId"] = PRIVATE_CLIENT, cw.get("siteId", "")
    log("[%s] 🤖 비서가 새 글 %d개 판단 중" % (room, len(new)))
    try:
        res = call(body) or {}
    except Exception as e:
        log("[%s] 🤖 비서 판단 실패: %s" % (room, str(e)[:150]))
        return
    if not res.get("ok"):
        log("[%s] 🤖 비서: AI 답 없음" % room)
        return
    today = body["today"]
    extra = _extras(res, room, today, put, notify, log)
    if asked:
        if extra:
            first = (res.get("filmVendors") or res.get("tasks") or [{}])[0]
            worklog.feed(room, first.get("siteId", ""), first.get("name", ""), new, extra, [])
        return
    fills = res.get("fills") or []
    # 필름 번호를 바꾸자는 건 앱에 넣지 않고 알림만 (사장님 11/1)
    film_changes = [f for f in fills if f["kind"] == "films" and f.get("update")]
    fills = [f for f in fills if f not in film_changes]
    for f in film_changes:
        notify(gaps.film_change_text({"id": f["siteId"], "name": f["name"]}, f["films"], room, cfg))
        worklog.add("site", "필름 번호 변경 요청 — 직접 바꿔 주세요", room, f["siteId"], need=True)
    if fills:
        try:
            put([_mailbox(f, room, today) for f in fills])
            for sid in dict.fromkeys(f["siteId"] for f in fills):
                mine_f = [f for f in fills if f["siteId"] == sid]
                notify(filled_text(mine_f[0]["name"], sid, mine_f, room, cfg))
            log("[%s] 🤖 앱에 %d개 넣음 (안 물어본 정보)" % (room, len(fills)))
            if cw:
                _remaining(state, room, cw, fills, notify, now)
        except Exception as e:
            log("[%s] 🤖 우편함 넣기 실패: %s" % (room, str(e)[:150]))
            notify("[비서] %s 정보를 받았지만 현장관리에 못 넣었습니다\n%s" % (room, str(e)[:200]))
    picks, pays = res.get("picks") or [], res.get("pays") or []
    if picks or pays:
        items = [{"kind": "pick", "room": room, "title": p["label"] + " 받음", "quote": p.get("quote", ""),
                  "fills": [_mailbox(dict(p, siteId=""), room, today)], "cands": p["cands"]} for p in picks]
        items += [{"kind": "pay", "room": room, "title": "잔금 넣었다고 함", "quote": p.get("quote", ""),
                   "siteId": p["siteId"], "name": p["name"]} for p in pays]
        try:
            inbox(items)
            notify(inbox_text(room, picks, pays, cfg))
            log("[%s] 🤖 결재함에 %d개 올림" % (room, len(items)))
        except Exception as e:
            log("[%s] 🤖 결재함 올리기 실패: %s" % (room, str(e)[:150]))
    # 🤖 앱 비서 대화에 — 지켜보던 고객 방이거나, 넣고 올린 게 있을 때만 (잡담까지 띄우지 않게)
    if cw or fills or film_changes or picks or pays or extra:
        put_lines = extra + [("%s%s" % (f["label"], " 바꿈" if f.get("update") else " 넣음")) for f in fills]
        put_lines += ["필름 번호 변경 요청 — 직접 바꿔 주세요"] * bool(film_changes)
        put_lines += ["%s — 어느 현장인지 결재함에서 골라 주세요" % p["label"] for p in picks]
        put_lines += ["잔금 넣었다고 함 — 결재함에서 완료표시"] * bool(pays)
        first = (fills or film_changes or res.get("filmVendors") or res.get("tasks") or [{}])[0]
        worklog.feed(room, (cw or {}).get("siteId") or first.get("siteId", ""), (cw or {}).get("name") or first.get("name", ""), new, put_lines,
                     [KEY_LABEL[k] for k in (cw or {}).get("keys", [])])
    reply = res.get("reply")
    if not reply or not reply.get("text"):
        return
    if msgs and _norm(msgs[-1].get("sender")) in mine:
        log("[%s] 🤖 사장님이 이미 답함 — 답장 안 함" % room)
        return
    hour = time.localtime(now).tm_hour
    if reply.get("auto") and REPLY_HOURS[0] <= hour < REPLY_HOURS[1]:
        (queue or gaps.queue_reply)(state, room, reply["text"], now)
        log("[%s] 🤖 자동 답장 줄 세움: %s" % (room, reply["text"].split("\n")[0]))
        return
    if reply.get("auto"):
        reply = dict(reply, why="밤이라 자동으로 안 보냄")
    job = new_reply_job(state, room, reply["text"], now)
    notify(draft_text(room, reply), reply_buttons(job))
    worklog.add("reply", "답장 초안 기다리는 중", "%s · 텔레그램에서 [보내] 필요" % room, need=True, key="draft:" + job)
    log("[%s] 🤖 답장 초안 → 텔레그램 (%s)" % (room, reply.get("why") or ""))


def run_send(cfg, state, job, info, notify, log, send=None):
    """텔레그램 [보내] — 초안을 그 업체 방에 보낸다."""
    import gaps
    d = DRAFTS.pop(job, None)
    if not d:
        notify("[비서] 답장 초안이 없습니다 (노트북 프로그램을 다시 켰거나 이미 보냄) — 카톡에서 직접 보내 주세요 · %s" % info["title"])
        return
    opened, why = (send or gaps.send_to_room)(d["room"], d["text"], log)
    if why:
        notify("[비서] %s 방에 답장을 못 보냈습니다 (%s) — 카톡에서 직접 보내 주세요\n\n%s" % (d["room"], why, d["text"]))
    else:
        notify("✔ %s 방에 답장 보냄: %s" % (opened, d["text"].split("\n")[0]))
        worklog.resolve("draft:" + job)
        worklog.add("reply", "%s 방에 답장" % opened, d["text"])
    log("[%s] 🤖 초안 답장 %s" % (d["room"], "못 보냄 (%s)" % why if why else "보냄"))
