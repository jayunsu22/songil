"""PC 카톡 채팅창에서 복사한 글을 다루는 순수 함수들 (윈도우 API 없음, 테스트: test_kakao_text.py).

복사 글 모양:
    2026년 10월 29일 목요일
    [보낸이] [오후 8:43] 첫 줄
    여러 줄 메시지는 다음 줄이 머리 없이 이어진다
"""
import hashlib
import re

DATE_RE = re.compile(r"^(\d{4})년 (\d{1,2})월 (\d{1,2})일 \S+요일$")
MSG_RE = re.compile(r"^\[(.+?)\] \[(오전|오후) (\d{1,2}):(\d{2})\] ?(.*)$")
PHOTO_RE = re.compile(r"^사진(?: (\d+)장)?$")
# 이 말이 있는 줄의 3자리 이상 숫자는 가린다 (공동현관·세대 비번 등)
SECRET_WORD_RE = re.compile(r"비번|비밀번호|현관|세대|도어락|번호키|키번호|패스워드")
DIGITS_RE = re.compile(r"\d{3,}")


def _time24(ampm, h, m):
    h = int(h) % 12
    if ampm == "오후":
        h += 12
    return "%02d:%s" % (h, m)


def parse(text):
    """복사 글 → [{date, time, sender, text}]. 날짜 줄보다 앞에 있는(날짜 모르는) 메시지는 버린다."""
    msgs, date, cur = [], None, None
    for line in text.replace("\r\n", "\n").split("\n"):
        d = DATE_RE.match(line.strip())
        if d:
            date = "%s-%02d-%02d" % (d.group(1), int(d.group(2)), int(d.group(3)))
            cur = None
            continue
        m = MSG_RE.match(line)
        if m:
            cur = None
            if date:
                cur = {"date": date, "time": _time24(m.group(2), m.group(3), m.group(4)),
                       "sender": m.group(1), "text": m.group(5)}
                msgs.append(cur)
            continue
        if cur is not None and line != "":
            cur["text"] += "\n" + line
    return msgs


def with_keys(msgs):
    """메시지마다 지문(key) 을 붙인다. 같은 분에 같은 글이 두 번이면 순번으로 구분.
    지문은 sha1 앞 16자라 글 내용을 담지 않는다."""
    count = {}
    out = []
    for m in msgs:
        base = "\x1f".join([m["date"], m["time"], m["sender"], m["text"]])
        n = count.get(base, 0)
        count[base] = n + 1
        key = hashlib.sha1(("%s\x1f%d" % (base, n)).encode("utf-8")).hexdigest()[:16]
        out.append(dict(m, key=key))
    return out


def new_messages(msgs, seen):
    return [m for m in msgs if m["key"] not in seen]


def photo_count(text):
    """'사진' → 1, '사진 3장' → 3, 그 밖 → 0."""
    p = PHOTO_RE.match(text.strip())
    if not p:
        return 0
    return int(p.group(1) or 1)


def mask(text):
    lines = []
    for line in text.split("\n"):
        if SECRET_WORD_RE.search(line):
            line = DIGITS_RE.sub(lambda d: "●" * len(d.group(0)), line)
        lines.append(line)
    return "\n".join(lines)
