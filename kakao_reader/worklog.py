"""📋 업무 내역 (사장님 11/4) — 노트북이 한 일(자동 답장·답장 초안·필름 변경 요청)을 n8n work-log 에 적는다.
칸 넣기는 우편함(site-fill)이 알아서 적으니 여기선 안 적는다. 비번은 가려서 보낸다. 실패해도 본래 일에는 영향 없음.
설계 docs/superpowers/specs/2026-11-04-업무내역-design.md"""
CFG = {}


def setup(cfg):
    CFG.clear()
    CFG.update(cfg)


def _post(body):
    url, key = CFG.get("work_log_url"), CFG.get("owner_key")
    if not url or not key:
        return
    try:
        import n8n_send
        n8n_send.post_json(url, key, body, timeout=15)
    except Exception:
        pass   # 내역을 못 적어도 카톡 일은 계속


def add(kind, title, detail="", site_id="", need=False, key=""):
    import kakao_text
    _post({"action": "add", "items": [{"src": "auto", "kind": kind, "title": title, "detail": kakao_text.mask(str(detail)),
                                       "siteId": site_id, "state": "need" if need else "", "key": key}]})


def resolve(key):
    _post({"action": "resolve", "key": key})


def feed(room, site_id, site_name, msgs, lines, left):
    """🤖 앱 비서 대화에 띄울 업체 답·처리 결과 (11/5). 글 원문은 n8n 에 7일만, 칸 값은 lines 에 안 적는다."""
    text = "\n".join(str(m.get("text") or "") for m in (msgs or []))[-600:]
    _post({"action": "feed_add", "items": [{"kind": "kakao", "from": room, "siteId": site_id, "siteName": site_name, "text": text, "lines": lines, "left": left}]})
