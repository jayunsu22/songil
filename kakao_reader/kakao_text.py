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


TRIGGER_RE = re.compile(r"^\s*견적\s*발행\s*시작\s*[:：]?\s*(.*?)\s*$")


def trigger_client(text):
    """'견적발행시작 [거래처]' 이면 거래처 이름("" = 안 씀), 아니면 None. 글 맨 앞에 있을 때만 신호."""
    m = TRIGGER_RE.match(text)
    return m.group(1) if m else None


UNKNOWN_CLIENT = "업체미확인"


def _norm(s):
    s = re.sub(r"\(주\)|㈜|주식회사", "", s or "")
    return re.sub(r"[\s\-_.·()]", "", s).lower()


def match_client(name, names, aliases=None, unknown=UNKNOWN_CLIENT):
    """현장관리 거래처 이름(names) 중 하나를 고른다 → (이름 또는 None, 어떻게).
    띄어쓰기·대소문자 무시 → 별명(aliases: 별명 → 진짜 이름) → 이름 일부가 한 곳에만 맞을 때.
    비슷한 이름을 짐작으로 고르지 않는다 (pk디자인/ph디자인 — 틀린 업체에 들어가는 게 더 나쁘다).
    못 찾으면 '업체미확인' 거래처 (사장님이 거기서 진짜 업체로 옮긴다), 그것도 없으면 None."""
    fallback = unknown if unknown in names else None
    n = _norm(name)
    if not n:
        return fallback, "이름 없음"
    by_norm = {_norm(x): x for x in names}
    if n in by_norm:
        return by_norm[n], "같은 이름"
    for a, real in (aliases or {}).items():
        if _norm(a) == n and _norm(real) in by_norm:
            return by_norm[_norm(real)], "별명"
    part = [x for k, x in by_norm.items() if len(n) >= 2 and x != unknown and (n in k or (len(k) >= 2 and k in n))]
    if len(part) == 1:
        return part[0], "이름 일부"
    return fallback, "못 찾음"
