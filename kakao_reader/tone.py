"""🗣 사장님 말투 모으기 (사장님 11/12: 업체 사장님들과 나눈 대화의 톤으로 비서가 묻고 답하게).
업체 방을 읽을 때(chatlist.read_and_report) 사장님이 쓴 줄을 바로 앞 업체 말과 함께 n8n 사장님_말투(kakao-tone)에 보낸다.
- 비번·계좌처럼 숫자가 긴 것은 가린다 (●). 날짜·시간·수량 같은 짧은 숫자는 그대로 (말투에 필요).
- 노트북 파일에는 글 내용을 남기지 않는다 — 이미 보낸 줄의 지문(key)만 state['tone_sent'] 에.
- 보내기에 실패하면 지문을 남기지 않아 다음에 그 방을 읽을 때 다시 보낸다."""
import re

import kakao_text

LONG_DIGITS = re.compile(r"\d[\d\-\s*#]{3,}\d")   # 4자리 넘는 숫자 덩어리 (비번·전화·계좌)
WORD = re.compile(r"[가-힣A-Za-z]")                  # 'ㅇ'·'ㅋㅋ'·이모티콘만 있는 줄은 말투가 아니다
KEEP = 5000


def _norm(s):
    return re.sub(r"\s+", "", str(s or ""))


def _hide(text, n):
    t = kakao_text.mask(str(text or ""))
    t = LONG_DIGITS.sub(lambda m: "●" * len(m.group(0)), t)
    return t.strip()[:n]


def pairs(msgs, mine, room, sent):
    """[{k, room, d, t, prevWho, prev, text}] — 아직 안 보낸 사장님 줄만. prev = 그 앞 마지막 업체 말 (없으면 '')."""
    out, prev = [], None
    for m in msgs or []:
        if _norm(m.get("sender")) in mine:
            text = _hide(m.get("text"), 400)
            if m.get("key") and m["key"] not in sent and WORD.search(text) and "/q/" not in text:
                out.append({"k": m["key"], "room": room, "d": m.get("date", ""), "t": m.get("time", ""),
                            "prevWho": (prev or {}).get("sender", ""), "prev": _hide((prev or {}).get("text"), 200), "text": text})
        else:
            prev = m
    return out


def harvest(cfg, state, room, msgs, post, log):
    """읽은 방 글(msgs, kakao_text.with_keys 를 거친 것)에서 사장님 줄을 모아 보낸다. 몇 줄 보냈는지 돌려준다."""
    if not cfg.get("tone", True) or not cfg.get("tone_url"):
        return 0
    mine = {_norm(x) for x in cfg.get("my_names", ["김정헌"])}
    sent = state.setdefault("tone_sent", [])
    items = pairs(msgs, mine, room, set(sent))[:100]
    if not items:
        return 0
    try:
        post({"action": "add", "items": items})
    except Exception as e:
        log("[%s] 🗣 말투 보내기 실패 (다음에 다시): %s" % (room, str(e)[:120]))
        return 0
    state["tone_sent"] = (sent + [x["k"] for x in items])[-KEEP:]
    log("[%s] 🗣 사장님 말투 %d줄 모음" % (room, len(items)))
    return len(items)
