# -*- coding: utf-8 -*-
"""📋 업무일정표 → 카톡 김정헌방 (사장님 11/3, 결재함).
n8n 업무일정표 흐름이 저녁 7시에 만든 카톡 글(outbox)을 5분마다 가져와 report_room 방에 보낸다.
가져가면 n8n 에서 지워지므로, 방에 못 보내면 텔레그램으로 글을 그대로 보낸다 (놓치지 않게).
설계 songil docs/superpowers/specs/2026-11-03-결재함-design.md"""

EVERY = 300


def send_to_room(room, text, log):
    """김정헌 방이 이미 열려 있으면 그 창에 바로 보낸다 (가견적 링크와 같은 방법, 창은 그대로 둔다).
    안 열려 있으면 목록에서 열어 보내고 닫는다 (gaps.send_to_room). → (방, 실패 이유 '' | 'no-room' | 'send')"""
    import gaps
    import kakao_window
    if kakao_window.find_room(room)[0]:
        return room, "" if kakao_window.send_text(room, text) else "send"
    return gaps.send_to_room(room, text, log)


def send_exact(room, text, log):
    """👤 개인고객 방 (11/5): 제목이 정확히 같은 방에만 보낸다. 열린 창 → 목록 → 카톡 검색. → (방, '' | 'no-room' | 'send')"""
    import chatlist
    import kakao_window
    if kakao_window.find_room(room)[0]:
        return room, "" if kakao_window.send_text(room, text) else "send"
    h = 0
    try:
        chatlist.refresh_geom()
        h, opened = chatlist.open_room(room, None, log)
        if h and opened != room:
            log("[%s] 목록에서 비슷한 방('%s')이 열려 닫음 — 정확히 같은 방에만 보냄" % (room, opened))
            kakao_window.close_window(h)
            h = 0
    except Exception as e:
        log("[%s] 목록에서 못 엶: %s" % (room, str(e)[:80]))
        h = 0
    if not h:
        h = chatlist.search_open(room, log)
    if not h:
        return room, "no-room"
    try:
        return room, "" if kakao_window.send_text(room, text) else "send"
    finally:
        kakao_window.close_window(h)


def poll(cfg, state, now, fetch, send, notify, log):
    if now - state.get("report_at", 0) < EVERY:
        return
    state["report_at"] = now
    try:
        texts = (fetch() or {}).get("texts") or []
    except Exception as e:
        log("[결재함] 업무일정표 가져오기 실패: %s" % str(e)[:100])
        return
    room = cfg.get("report_room") or "김정헌"
    for t in texts:
        text = str(t.get("text") or "")
        if not text:
            continue
        try:
            opened, why = send(room, text, log)
        except Exception as e:
            opened, why = room, "send: %s" % str(e)[:80]
        if why:
            log("[결재함] %s 방에 못 보냄 (%s)" % (room, why))
            notify("[카톡] 업무일정표를 '%s' 방에 못 올렸습니다 (%s) — 글을 여기 보냅니다\n\n%s" % (room, why, text))
        else:
            log("[결재함] 업무일정표 → %s" % opened)
