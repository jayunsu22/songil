# -*- coding: utf-8 -*-
"""📋 업무일정표 → 카톡 김정헌방 (사장님 11/3, 결재함).
n8n 업무일정표 흐름이 저녁 7시에 만든 카톡 글(outbox)을 5분마다 가져와 report_room 방에 보낸다.
가져가면 n8n 에서 지워지므로, 방에 못 보내면 텔레그램으로 글을 그대로 보낸다 (놓치지 않게).
설계 songil docs/superpowers/specs/2026-11-03-결재함-design.md"""

EVERY = 300


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
