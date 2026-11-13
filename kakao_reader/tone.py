"""🗣 사장님 말투 모으기 (사장님 11/12: 업체 사장님들과 나눈 대화의 톤으로 비서가 묻고 답하게).
업체 방을 읽을 때(chatlist.read_and_report) 사장님이 쓴 줄을 바로 앞 업체 말과 함께 n8n 사장님_말투(kakao-tone)에 보낸다.
- 비번·계좌처럼 숫자가 긴 것은 가린다 (●). 날짜·시간·수량 같은 짧은 숫자는 그대로 (말투에 필요).
- 노트북 파일에는 글 내용을 남기지 않는다 — 이미 보낸 줄의 지문(key)만 state['tone_sent'] 에.
- 보내기에 실패하면 지문을 남기지 않아 다음에 그 방을 읽을 때 다시 보낸다."""
import re

import kakao_text

LONG_DIGITS = re.compile(r"\d[\d\-\s*#]{2,}\d")   # 4자리 이상 숫자 덩어리 (비번·차량번호·전화·계좌) — 11/12 4자리가 새던 것
WORD = re.compile(r"[가-힣A-Za-z]")                  # 'ㅇ'·'ㅋㅋ'·이모티콘만 있는 줄은 말투가 아니다
KEEP = 5000


def _norm(s):
    return re.sub(r"\s+", "", str(s or ""))


def skipped(cfg, room):
    """말투에서 뺄 방인가 — config 의 tone_skip_rooms (가족·개인 방을 시험용으로 지켜볼 때, 11/12). 방 이름에 들어 있으면 뺀다."""
    r = _norm(room)
    return any(_norm(x) and _norm(x) in r for x in cfg.get("tone_skip_rooms") or [])


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
            if m.get("key") and m["key"] not in sent and WORD.search(text) and "http" not in text:
                out.append({"k": m["key"], "room": room, "d": m.get("date", ""), "t": m.get("time", ""),
                            "prevWho": (prev or {}).get("sender", ""), "prev": _hide((prev or {}).get("text"), 200), "text": text})
        else:
            prev = m
    return out


def read_export(path):
    """카톡 '대화 내보내기' txt (utf-8 / utf-16 / cp949 어느 것이든)."""
    raw = open(path, "rb").read()
    for enc in ("utf-8-sig", "utf-16", "cp949"):
        try:
            text = raw.decode(enc)
            if "[" in text:
                return text
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "replace")


# 카톡 내보내기 모양이 기기마다 다르다 (11/12 노트북 파일을 못 읽음) — 한 줄에 날짜·시간·보낸이가 다 있는 꼴들
_LINE_FORMS = [
    # 2026년 11월 12일 오후 2:53, 봄애실장님 : 글   (안드로이드·일부 PC)
    re.compile(r"^(\d{4})년 (\d{1,2})월 (\d{1,2})일 (오전|오후) (\d{1,2}):(\d{2}),? (.+?) : (.*)$"),
    # 2026. 11. 12. 오후 2:53, 봄애실장님 : 글   (아이폰)
    re.compile(r"^(\d{4})\. ?(\d{1,2})\. ?(\d{1,2})\.? (오전|오후) (\d{1,2}):(\d{2}),? (.+?) : (.*)$"),
]
_CSV = re.compile(r'^"?(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::\d{2})?"?,"?(.*?)"?,"?(.*?)"?$')   # Date,User,Message (맥·새 PC)


def parse_export(text):
    """카톡 '대화 내보내기' 글 → [{date, time, sender, text}]. PC 꼴([보낸이] [오후 2:53])이 아니면 한 줄 꼴·CSV 로 읽는다."""
    msgs = kakao_text.parse(text)
    if msgs:
        return msgs
    cur = None
    for line in text.replace("\r\n", "\n").split("\n"):
        hit = None
        for form in _LINE_FORMS:
            m = form.match(line.strip())
            if m:
                y, mo, d, ap, h, mi, who, body = m.groups()
                hit = {"date": "%s-%02d-%02d" % (y, int(mo), int(d)), "time": kakao_text._time24(ap, h, mi), "sender": who.strip(), "text": body}
                break
        if not hit:
            m = _CSV.match(line.strip())
            if m:
                y, mo, d, h, mi, who, body = m.groups()
                hit = {"date": "%s-%s-%s" % (y, mo, d), "time": "%s:%s" % (h, mi), "sender": who.strip(), "text": body.replace('""', '"')}
        if hit:
            msgs.append(hit)
            cur = hit
        elif cur is not None and line.strip() and not re.match(r"^-*\s*\d{4}년 .*요일\s*-*$|^\d{4}년 \d{1,2}월 \d{1,2}일 (오전|오후) \d", line.strip()):
            cur["text"] += "\n" + line
    return msgs


def _shape(text):
    """못 읽은 파일의 모양을 보여 준다 (글자는 가리고 꼴만): 한글→가, 영문→a, 숫자→0"""
    lines = [l for l in text.replace("\r\n", "\n").split("\n") if l.strip()][:6]
    return " / ".join(re.sub(r"\d", "0", re.sub(r"[A-Za-z]", "a", re.sub(r"[가-힣]", "가", l)))[:50] for l in lines)


def import_folder(cfg, folder, post, log, per_room=800):
    """🗣 지난 대화로 말투 한 번에 모으기 (사장님 11/12): 업체 방을 카톡 '대화 내보내기' 로 저장한 txt 들(파일 이름 = 방 이름).
    방마다 최근 사장님 줄 per_room 개까지 보낸다. 같은 줄은 n8n 이 지문으로 걸러서 여러 번 해도 괜찮다.
    파일을 옮기거나 복사하지 않는다 — 다 보낸 뒤 사장님이 지우면 된다."""
    import glob
    import os
    mine = {_norm(x) for x in cfg.get("my_names", ["김정헌"])}
    total = 0
    files = sorted(glob.glob(os.path.join(folder, "*.txt")))
    if not files:
        log("🗣 %s 에 txt 가 없음 — 카톡 방 ≡ › 대화 내용 › 대화 내보내기로 저장해 넣어 주세요" % folder)
        return 0
    for path in files:
        room = os.path.splitext(os.path.basename(path))[0]
        if skipped(cfg, room):
            log("🗣 [%s] 말투에서 빼는 방 (tone_skip_rooms) — 건너뜀" % room)
            continue
        text = read_export(path)
        msgs = kakao_text.with_keys(parse_export(text))
        items = pairs(msgs, mine, room, set())[-per_room:]
        if not msgs:
            log("🗣 [%s] 글을 못 읽음 — 파일 모양: %s" % (room, _shape(text)))
            continue
        if not items:
            names = sorted({m["sender"] for m in msgs})[:8]
            log("🗣 [%s] 글 %d개는 읽었는데 사장님 줄이 없음 — 보낸이 이름: %s (config 의 my_names 에 사장님 이름을 넣어 주세요)" % (room, len(msgs), ", ".join(names)))
            continue
        sent = 0
        for i in range(0, len(items), 100):
            try:
                post({"action": "add", "items": items[i:i + 100]})
                sent += len(items[i:i + 100])
            except Exception as e:
                log("🗣 [%s] 보내기 실패: %s" % (room, str(e)[:120]))
                break
        log("🗣 [%s] 글 %d개 중 사장님 줄 %d개 보냄" % (room, len(msgs), sent))
        total += sent
    log("🗣 지난 대화 말투 %d줄 보냄 — 다 됐으면 txt 파일은 지워 주세요" % total)
    return total


def harvest(cfg, state, room, msgs, post, log):
    """읽은 방 글(msgs, kakao_text.with_keys 를 거친 것)에서 사장님 줄을 모아 보낸다. 몇 줄 보냈는지 돌려준다."""
    if not cfg.get("tone", True) or not cfg.get("tone_url") or skipped(cfg, room):
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
