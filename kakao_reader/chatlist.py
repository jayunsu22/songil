"""카톡 채팅 목록에서 안 읽은 표시(빨간 숫자 배지)가 생기거나 늘어난 방을 찾는다 — 방은 열지 않는다 (사장님 10/30 A안).

카톡 메인 창을 그림으로 떠서(PrintWindow, 다른 창에 가려도 됨) 목록 오른쪽의 빨간 배지를 찾고,
윈도우에 들어 있는 한국어 OCR(winocr.ps1, 인터넷·AI 안 씀)로 그 줄의 방 이름과 배지 숫자를 읽는다.
배지가 그대로면 OCR 도 하지 않는다. 그림은 임시 폴더에 잠깐 썼다가 바로 지운다.

    python chatlist.py     # 시험: 지금 보이는 배지·방 이름을 화면에 (알림 안 보냄), 그림은 chatlist_probe.png
"""
import ctypes
import ctypes.wintypes as w
import hashlib
import os
import re
import subprocess
import sys
import tempfile
import time

from PIL import Image

u = ctypes.windll.user32
g = ctypes.windll.gdi32
HERE = os.path.dirname(os.path.abspath(__file__))
NO_NAME = "(이름 못 읽음)"
LAST = {"sig": None, "warn": None}  # 지난번 배지 그림 지문 (같으면 OCR 안 함), 지난 경고 (같은 경고 반복 안 함)


# ---- 그림에서 찾기 (윈도우와 상관없는 부분 — 테스트 있음) ----

def is_red(p):
    r, gg, b = p[:3]
    return r > 190 and r - gg > 90 and r - b > 90


def find_badges(img, region):
    """region(x1, y1, x2, y2) 의 오른쪽 30% 에서 배지만 한 빨간 덩어리 상자들 [(x1, y1, x2, y2)] (위에서 아래 순)."""
    x1, y1, x2, y2 = region
    sx = x1 + (x2 - x1) * 7 // 10
    strip = img.crop((sx, y1, x2, y2)).convert("RGB")
    W, H = strip.size
    px = strip.load()
    seen = bytearray(W * H)
    out = []
    for y in range(H):
        for x in range(W):
            if seen[y * W + x] or not is_red(px[x, y]):
                continue
            seen[y * W + x] = 1
            stack, bx = [(x, y)], [x, y, x, y]
            while stack:
                cx, cy = stack.pop()
                bx = [min(bx[0], cx), min(bx[1], cy), max(bx[2], cx), max(bx[3], cy)]
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx] and is_red(px[nx, ny]):
                        seen[ny * W + nx] = 1
                        stack.append((nx, ny))
            bw, bh = bx[2] - bx[0], bx[3] - bx[1]
            if 10 <= bh <= 50 and 10 <= bw <= 90:
                out.append((bx[0] + sx, bx[1] + y1, bx[2] + sx, bx[3] + y1))
    return sorted(out, key=lambda b: b[1])


def parse_ocr(out):
    """winocr.ps1 출력 → {파일: [(x, y, 너비, 높이, 글)]}."""
    files, cur = {}, None
    for row in out.splitlines():
        if row.startswith("#FILE "):
            cur = row[6:].strip()
            files[cur] = []
            continue
        try:
            pos, txt = row.split("\t", 1)
            x, y, wd, ht = map(int, pos.split())
        except ValueError:
            continue
        if cur is not None:
            files[cur].append((x, y, wd, ht, txt.strip()))
    return files


def parse_count(text):
    """배지 숫자 OCR → 숫자 (못 읽으면 None). OCR 이 1 을 l·I·| 로, 0 을 O 로 읽기도 한다."""
    t = text.translate(str.maketrans("lI|!iOoSs", "111110055")).replace(" ", "")
    m = re.match(r"(\d+)", t)
    return int(m.group(1)) if m else None


def row_name(lines, badge, list_w):
    """배지와 같은 줄(방 한 칸)의 왼쪽 맨 위 글 = 방 이름. lines 는 목록 그림 기준 좌표."""
    bh = badge[3] - badge[1] + 1
    cy = (badge[1] + badge[3]) / 2
    cand = [ln for ln in lines
            if ln[0] < list_w * 0.6 and ln[0] + ln[2] < badge[0]
            and cy - 2.5 * bh <= ln[1] + ln[3] / 2 <= cy + bh]
    return min(cand, key=lambda ln: ln[1])[4] if cand else None


def clean_name(name):
    """OCR 로 읽은 방 이름에서 아이콘 찌꺼기를 지운다 (10/30 노트북: 오픈채팅 아이콘 → '0', 핀 → '%', 인원수 '169').
    '0 매드센스 …' → '매드센스 …', '류춘화 ' ,' → '류춘화', '삼산미래타운3단지(2 169 %' → '삼산미래타운3단지(2'."""
    if not name:
        return name
    n = re.sub(r"^[^\w가-힣\[(]+", "", name.strip())
    n = re.sub(r"^[0Oo©@]\s*(?=[가-힣\[(])", "", n)
    for _ in range(3):
        n = re.sub(r"[\s'\",;:%*#~`^|/\\]+$", "", n)
        n = re.sub(r"\s+\d{1,4}$", "", n)
    return n or name


def _norm(s):
    return re.sub(r"[\s…]|\.{2,}", "", s).lower()


def _jamo(s):
    """자모로 풀기 (춘 → ㅊㅜㄴ): OCR 이 '류춘화' 를 '류준화' 로 읽어도 한 자모만 다르게. 'TT' 는 ㅠ 로 (10/30 '류' → 'TT')."""
    import unicodedata
    return unicodedata.normalize("NFD", _norm(s).replace("tt", "ᅲ"))


def _ratio(a, b):
    import difflib
    return difflib.SequenceMatcher(None, a, b).ratio()


def fuzzy_in(word, name):
    """word 가 name 안에 들어 있나 — 자모로 80% 이상 같은 토막이 있으면 (OCR 이 한두 자모 틀려도)."""
    w, n = _jamo(word), _jamo(name)
    if not w or not n:
        return False
    if w in n:
        return True
    if len(w) < 5:
        return False
    k = len(w)
    return any(_ratio(n[i:i + k], w) >= 0.8 for i in range(max(1, len(n) - k + 1)))


def same_room(a, b):
    """OCR 이 한두 글자 틀려도 같은 방으로 (띄어쓰기·대소문자 무시, 자모로 80% 이상 같으면)."""
    a, b = _jamo(a), _jamo(b)
    return a == b or (min(len(a), len(b)) >= 5 and _ratio(a, b) >= 0.8)


def known_name(cands, known):
    """여러 번 읽은 이름 후보 중 하나가 config 에 적은 이름(알릴 방 등)을 품고 있으면 그 이름으로."""
    for k in known:
        if any(c and fuzzy_in(k, c) for c in cands):
            return k
    return None


def match_names(prev, now):
    """now 의 방 이름을 prev 에 있는 비슷한 이름으로 맞춘다 (OCR 이 매번 조금 다르게 읽어도 같은 방)."""
    out = {}
    for room, v in now.items():
        old = next((p for p in prev if same_room(p, room)), room)
        out[old] = v
    return out


def watched(name, watch):
    """알릴 방인지 (사장님 10/30: 업체 방 10곳 정도만 적는다). 적은 이름이 방 이름 안에 들어 있으면
    (띄어쓰기·대소문자 무시, OCR 이 한두 글자 틀려도). watch 가 비어 있으면 모든 방."""
    if not watch:
        return True
    if not name:
        return False
    return any(_norm(e) and fuzzy_in(e, name) for e in watch)


def excluded(name, exclude):
    """빼는 방인지. 띄어쓰기·대소문자 무시, 목록에서 이름이 잘려('…') 보이면 앞부분만 맞아도 뺀다."""
    if not name:
        return False
    n = _norm(name)
    cut = name.rstrip().endswith(("…", ".."))
    for e in exclude:
        e = _norm(e)
        if e and (n.startswith(e) or (cut and len(n) >= 2 and e.startswith(n)) or same_room(n, e)):
            return True
    return False


def news(prev, now):
    """새로 생기거나 늘어난 방 [(방, 늘어난 수, 지금 수)] — 수를 못 읽으면 None.
    prev·now = {방: {"n": 숫자 또는 None, "fp": 배지 모양 지문}}. 배지 모양이 그대로면 같은 알림을 다시 안 보낸다."""
    out = []
    for room, cur in now.items():
        old = prev.get(room)
        n = cur["n"]
        if old is None:
            out.append((room, n, n))
        elif cur["fp"] != old["fp"]:
            if n is None or old["n"] is None:
                out.append((room, None, n))
            elif n > old["n"]:
                out.append((room, n - old["n"], n))
    return out


def message(items):
    lines = ["[카톡] 새 글"]
    for room, add, total in items:
        if add is None:
            lines.append("%s 방에 새 글%s" % (room, " (안 읽은 글 %d개)" % total if total else ""))
        elif add == total:
            lines.append("%s 방에 새 글 %d개" % (room, add))
        else:
            lines.append("%s 방에 새 글 %d개 (안 읽은 글 %d개)" % (room, add, total))
    return "\n".join(lines)


# ---- 카톡 창 (윈도우 API) ----

def _text(h):
    n = u.GetWindowTextLengthW(h)
    b = ctypes.create_unicode_buffer(n + 1)
    u.GetWindowTextW(h, b, n + 1)
    return b.value


def find_chatlist():
    """(카톡 메인 창, 채팅 목록 칸 ChatRoomListCtrl). 없으면 (0, 0)."""
    found = []
    P = ctypes.WINFUNCTYPE(ctypes.c_bool, w.HWND, w.LPARAM)

    def top(h, _):
        b = ctypes.create_unicode_buffer(64)
        u.GetClassNameW(h, b, 64)
        if b.value == "EVA_Window_Dblclk":
            u.EnumChildWindows(h, P(lambda c, _l: child(h, c)), 0)
        return True

    def child(h, c):
        if _text(c).startswith("ChatRoomListCtrl"):
            found.append((h, c))
        return True

    u.EnumWindows(P(top), 0)
    return found[0] if found else (0, 0)


def _rect(h):
    r = w.RECT()
    u.GetWindowRect(h, ctypes.byref(r))
    return r.left, r.top, r.right, r.bottom


def capture(h):
    """창 전체를 그림으로 (PrintWindow — 다른 창에 가려도 된다. 최소화돼 있으면 안 된다)."""
    l, t, r, b = _rect(h)
    wd, ht = r - l, b - t
    if wd <= 0 or ht <= 0:
        return None
    hdc = u.GetWindowDC(h)
    mdc = g.CreateCompatibleDC(hdc)
    bmp = g.CreateCompatibleBitmap(hdc, wd, ht)
    old = g.SelectObject(mdc, bmp)
    u.PrintWindow(h, mdc, 2)  # PW_RENDERFULLCONTENT
    buf = ctypes.create_string_buffer(wd * ht * 4)
    bi = (ctypes.c_uint32 * 10)(40, wd, (-ht) & 0xFFFFFFFF, 1 | (32 << 16), 0, 0, 0, 0, 0, 0)
    g.GetDIBits(mdc, bmp, 0, ht, buf, bi, 0)
    g.SelectObject(mdc, old)
    g.DeleteObject(bmp)
    g.DeleteDC(mdc)
    u.ReleaseDC(h, hdc)
    return Image.frombuffer("RGB", (wd, ht), buf, "raw", "BGRX", 0, 1).copy()


def badge_digits(img, b):
    """배지(빨간 바탕 흰 숫자) → 숫자 밝기 그림 (0 = 빨간 바탕, 255 = 흰 숫자, 배지 밖은 0).
    줄마다 첫 빨간 점 ~ 마지막 빨간 점 사이만 본다 (배지 밖 흰 바탕은 빼고)."""
    c = img.crop((b[0], b[1], b[2] + 1, b[3] + 1)).convert("RGB")
    px = c.load()
    out = Image.new("L", c.size, 0)
    po = out.load()
    # 배지 바탕의 초록 값 (가짜 그림 ~80, 10/30 노트북 진짜 카톡 (255, 122, 107) → 122) → 0, 흰색(255) → 255
    greens = sorted(px[x, y][1] for y in range(c.height) for x in range(c.width) if is_red(px[x, y]))
    bg = greens[len(greens) // 2] if greens else 80
    span = max(1, 255 - bg)
    for y in range(c.height):
        reds = [x for x in range(c.width) if is_red(px[x, y])]
        for x in range(reds[0], reds[-1] + 1) if reds else ():
            po[x, y] = max(0, min(255, (px[x, y][1] - bg) * 255 // span))
    return out


def _glyphs(gray):
    """숫자 밝기 그림 → 글자마다 상자 [(x1, y1, x2, y2)] (왼쪽부터). 빈 세로줄로 나누고, 붙은 두 글자는 가장 옅은 곳에서 나눈다."""
    W, H = gray.size
    px = gray.load()
    col = [sum(px[x, y] for y in range(H)) for x in range(W)]
    on = [c > 255 * 0.6 for c in col]
    spans, start = [], None
    for x, v in enumerate(on + [False]):
        if v and start is None:
            start = x
        elif not v and start is not None:
            spans.append([start, x])
            start = None
    boxes = []
    for x1, x2 in spans:
        box = gray.crop((x1, 0, x2, H)).point(lambda v: 255 if v > 110 else 0).getbbox()
        if box:
            boxes.append((x1, box[1], x2, box[3]))
    if not boxes:
        return []
    full_h = max(b[3] - b[1] for b in boxes)
    out = []
    for x1, y1, x2, y2 in boxes:
        if x2 - x1 > full_h * 0.95 and y2 - y1 >= full_h * 0.7:  # 두 글자가 붙어 보임
            mid = min(range(x1 + 2, x2 - 2), key=lambda x: col[x])
            out += [(x1, y1, mid, y2), (mid, y1, x2, y2)]
        else:
            out.append((x1, y1, x2, y2))
    return out


_TEMPLATES = {}


def _template(ch, h, bold):
    """맑은 고딕으로 그린 글자 ch (숫자 높이 h, 밝기 그림)."""
    key = (ch, h, bold)
    if key not in _TEMPLATES:
        from PIL import ImageDraw, ImageFont
        font = ImageFont.truetype(os.path.join(os.environ.get("WINDIR", "C:/Windows"), "Fonts",
                                               "malgunbd.ttf" if bold else "malgun.ttf"), max(6, round(h * 1.4)))
        im = Image.new("L", (h * 3, h * 3), 0)
        ImageDraw.Draw(im).text((h, h // 2), ch, font=font, fill=255)
        _TEMPLATES[key] = im.crop(im.point(lambda v: 255 if v > 110 else 0).getbbox())
    return _TEMPLATES[key]


def _similar(a, b):
    """두 밝기 그림이 얼마나 닮았나 (-1 ~ 1, 같은 크기로 맞춰 상관계수)."""
    size = (max(a.width, b.width, 6), max(a.height, b.height, 8))
    xa = list(a.resize(size, Image.BILINEAR).tobytes())
    xb = list(b.resize(size, Image.BILINEAR).tobytes())
    ma, mb = sum(xa) / len(xa), sum(xb) / len(xb)
    da, db = [v - ma for v in xa], [v - mb for v in xb]
    den = (sum(v * v for v in da) * sum(v * v for v in db)) ** 0.5
    return sum(p * q for p, q in zip(da, db)) / den if den else 0.0


def read_digits(gray):
    """배지 숫자 → 숫자 (못 읽으면 None — 틀린 숫자보다 낫다). OCR 은 한 자리 숫자를 잘 못 읽어서
    글자 모양을 맑은 고딕 0~9 와 맞춰 본다. 맨 끝의 작은 글자는 '+' (300+)."""
    boxes = _glyphs(gray)
    if not boxes or len(boxes) > 4:
        return None
    full_h = max(b[3] - b[1] for b in boxes)
    text = ""
    for i, b in enumerate(boxes):
        if b[3] - b[1] < full_h * 0.8:
            if i == len(boxes) - 1 and text:
                break  # '+'
            return None
        g = gray.crop(b)
        ratio = g.width / g.height
        best, score, second = None, -1.0, -1.0
        for ch in "0123456789":
            for bold in (False, True):
                t = _template(ch, full_h, bold)
                if abs(t.width / t.height - ratio) > 0.35 and ch != "1":
                    continue
                s = _similar(g, t)
                if s > score:
                    best, second, score = ch, score if best != ch else second, s
                elif s > second and ch != best:
                    second = s
        if best is None or score < 0.6 or score - second < 0.05:
            return None
        text += best
    return int(text) if text else None


def ocr(paths):
    p = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
                        os.path.join(HERE, "winocr.ps1")] + list(paths),
                       capture_output=True, timeout=60, creationflags=0x08000000)  # 검은 창 안 띄움
    out = p.stdout.decode("utf-8", "replace")
    if p.returncode != 0:
        raise RuntimeError("윈도우 OCR 실패 (%s) %s" % ("한국어 OCR 없음" if "NO_KOREAN_OCR" in out else p.returncode,
                                                  p.stderr.decode("utf-8", "replace").strip()[:200]))
    return parse_ocr(out)


def read_badges(force=False, keep_image=None, known=()):
    """지금 배지가 붙은 방들 {방 이름: 숫자 또는 None}. 배지가 지난번과 같으면 None (OCR 생략).
    카톡 창을 못 쓰면 RuntimeError (이유는 쉬운 말로)."""
    top, lst = find_chatlist()
    if not lst:
        raise RuntimeError("카톡 메인 창을 못 찾음 — 카톡이 켜져 있고 로그인돼 있나요?")
    if u.IsIconic(top) or not u.IsWindowVisible(top):
        raise RuntimeError("카톡 메인 창이 최소화(또는 닫힘) — 창을 열어 두세요 (다른 창 뒤에 있어도 됨)")
    if not u.IsWindowVisible(lst):
        raise RuntimeError("카톡 메인 창이 '채팅' 탭이 아님 — 말풍선(채팅) 탭을 눌러 두세요")
    img = capture(top)
    if img is None or img.convert("L").getextrema()[1] < 30:
        raise RuntimeError("카톡 창 그림이 비어 있음 — 창이 화면 밖이거나 최소화")
    if keep_image:
        img.save(keep_image)
    tl, tt, _, _ = _rect(top)
    ll, lt, lr, lb = _rect(lst)
    LAST["geom"] = (top, lst, tl, tt, ll, lt, lr - ll)
    return analyze(img, (ll - tl, lt - tt, lr - tl, lb - tt), force, known)


# 줄 그림을 여러 가지로 읽는다 (배율, 흑백 여부) — 한 가지로는 짧은 이름을 자주 틀림 (10/30 '류춘화' → 'TT춘화')
VARIANTS = ((3, False), (4, False), (3, True))


def analyze(img, region, force=False, known=()):
    """창 그림 + 채팅 목록 칸 위치 → {방 이름: 숫자 또는 None}, 배지가 지난번과 같으면 None."""
    badges = find_badges(img, region)
    if not badges:
        LAST["sig"] = ()
        return {}
    sig = hashlib.sha1(b"".join(img.crop(b).tobytes() + repr(b).encode() for b in badges)).hexdigest()
    if sig == LAST["sig"] and not force:
        return None
    # 배지가 있는 줄만 잘라 3배로 키워 읽는다 (목록 전체를 읽는 것보다 이름을 덜 틀림 — 10/30 '류춘화' 를 'TT준화' 로)
    rows = []
    for b in badges:
        bh = b[3] - b[1] + 1
        cy = (b[1] + b[3]) // 2
        rows.append((region[0], max(region[1], cy - 3 * bh), b[0] - 2, min(region[3], cy + bh + bh // 2)))
    tmp = tempfile.mkdtemp(prefix="kakao_list_")
    try:
        paths = []
        for i, r in enumerate(rows):
            crop = img.crop(r)
            for j, (sc, bw_) in enumerate(VARIANTS):
                v = crop.resize((crop.width * sc, crop.height * sc), Image.LANCZOS)
                if bw_:
                    v = v.convert("L").point(lambda x: 0 if x < 150 else 255)
                p = os.path.join(tmp, "row%d_%d.png" % (i, j))
                v.save(p)
                paths.append(p)
        res = ocr(paths)
    finally:
        for f in os.listdir(tmp):
            os.remove(os.path.join(tmp, f))
        os.rmdir(tmp)
    lw = region[2] - region[0]
    now = {}
    for i, (b, r) in enumerate(zip(badges, rows)):
        rb = (b[0] - region[0], b[1] - region[1], b[2] - region[0], b[3] - region[1])
        dx, dy = r[0] - region[0], r[1] - region[1]
        cands = []
        for j, (sc, _) in enumerate(VARIANTS):
            # 줄 그림 좌표 → 목록 칸 좌표
            lines = [(x // sc + dx, y // sc + dy, wd // sc, ht // sc, t)
                     for x, y, wd, ht, t in res.get(os.path.join(tmp, "row%d_%d.png" % (i, j)), [])]
            cands.append(clean_name(row_name(lines, rb, lw)))
        name = known_name(cands, known) or next((c for c in cands if c), None) or NO_NAME
        bw = badge_digits(img, b)
        # 숫자를 못 읽어도 배지 모양(지문)이 바뀌면 새 글로 본다
        fp = hashlib.sha1(bw.point(lambda v: 255 if v > 128 else 0).tobytes() + repr(bw.size).encode()).hexdigest()[:12]
        now[name] = {"n": read_digits(bw), "fp": fp, "box": list(b)}
    LAST["sig"] = sig
    return now


def check(cfg, state, notify, log, dry=False, classify=None):
    """reader.py 가 확인할 때마다 부른다. 알릴 방에 배지가 새로 생기거나 늘면:
    - auto_read 꺼짐(A안): 바로 "○○ 방에 새 글 N개" 텔레그램.
    - auto_read 켜짐(B안, 사장님 10/30): 배지가 read_quiet_seconds 동안 그대로면(글이 멈추면) 그 방을 열어 읽고 닫은 뒤
      n8n 카톡_분류(Gemini) 로 종류·요약을 텔레그램. 방을 열면 상대 카톡의 '1' 과 사장님 폰의 숫자가 사라진다."""
    auto = bool(cfg.get("auto_read")) and classify is not None
    try:
        known = list(cfg.get("watch_rooms", [])) + list(cfg.get("exclude_rooms", [])) + list(cfg.get("quote_rooms", []))
        now = read_badges(known=known)
    except Exception as e:
        if str(e) != LAST["warn"]:
            log("[채팅 목록] %s" % e)
        LAST["warn"] = str(e)
        return
    LAST["warn"] = None
    if now is not None:  # None = 배지 그대로
        # 배지가 바뀔 때마다 읽은 그대로 남긴다 (10/30 노트북: 방을 안 열었는데 이유가 기록에 없었음)
        log("[채팅 목록] 배지: " + (", ".join("%s %s" % (r, c["n"] if c["n"] is not None else "?") for r, c in now.items()) or "없음"))
        skip = list(cfg.get("exclude_rooms", [])) + list(cfg.get("quote_rooms", []))
        now = {r: n for r, n in now.items() if watched(r, cfg.get("watch_rooms", [])) and not excluded(r, skip)}
        if state.get("badges") is None:
            for cur in now.values():
                cur["since"] = None  # 켜기 전부터 있던 배지는 열지 않는다
            state["badges"] = now
            log("[채팅 목록] 처음 실행: 안 읽은 방 %d곳을 기억 (알리지 않음)" % len(now))
            return
        prev = state["badges"]
        now = match_names(prev, now)
        items = news(prev, now)
        mark_since(prev, now, time.time())
        keep_unread(prev, now)
        if items:
            log("[채팅 목록] " + ", ".join("%s +%s" % (r, a if a is not None else "?") for r, a, _ in items))
            if dry:
                return
            if not auto and not notify(message(items)):
                LAST["sig"] = None  # 다음 확인 때 다시 보낸다
                return
        if dry:
            return
        state["badges"] = now
    if auto and not dry:
        quiet = int(cfg.get("read_quiet_seconds", 60))
        for r, c in state["badges"].items():
            if c.get("since") is not None and not c.get("told"):
                c["told"] = True
                log("[%s] 새 글 — %d초 조용하면 방을 엶" % (r, quiet))
        due = due_rooms(state["badges"], time.time(), quiet)
        if due:
            read_and_report(cfg, state, due[0], notify, log, classify)


def mark_since(prev, now, t):
    """배지가 새로 생기거나 바뀐 방은 since = 지금 (글이 멈춘 지 얼마나 됐는지 재려고)."""
    for room, cur in now.items():
        old = prev.get(room)
        if old is None or old["fp"] != cur["fp"]:
            cur["since"] = t
        else:
            cur["since"], cur["told"] = old.get("since"), old.get("told")


def keep_unread(prev, now):
    """새 글이 와서 아직 노트북이 안 읽은 방은 배지가 사라져도(사장님이 폰으로 먼저 봄) 남겨 둔다 → 그래도 열어 읽고 보고한다
    (사장님 10/30). 그런 방은 배지 자리(box)가 없으니 열 때 이름으로 줄을 찾는다."""
    for room, old in prev.items():
        if room not in now and old.get("since") is not None:
            now[room] = dict(old, box=None, fp=None, gone=True)


def due_rooms(badges, t, quiet):
    """배지가 quiet 초 동안 그대로인(글이 멈춘) 방들 — 먼저 생긴 것부터."""
    due = [(c["since"], r) for r, c in badges.items() if c.get("since") is not None and t - c["since"] >= quiet]
    return [r for _, r in sorted(due)]


def pick_new(msgs, seen, n):
    """연 방의 글 중 새 글. 전에 읽은 적이 있으면 그 뒤 글, 처음이면 배지 숫자만큼(모르면 10개) 끝에서. 많아야 30개."""
    if seen:
        new = [m for m in msgs if m["key"] not in seen]
        if new:
            return new[-30:]
    return msgs[-min(n or 10, 30):]


def report(room, res, msgs):
    """텔레그램 글: [카톡] 방 · 종류 / 요약 / (새 글 N개 · 사진 k장)."""
    from kakao_text import photo_count
    photos = sum(photo_count(m["text"]) for m in msgs)
    head = "[카톡] %s%s · %s" % ("⚠ " if res.get("급함") else "", room, res.get("종류") or "기타")
    tail = "(새 글 %d개%s)" % (len(msgs), " · 사진 %d장" % photos if photos else "")
    return "\n".join(x for x in (head, res.get("요약") or "", tail) if x)


def _title_ok(room, title):
    return bool(title) and (fuzzy_in(room, title) or fuzzy_in(title, room) or same_room(room, title))


def find_row(room):
    """배지 없는 방의 줄을 이름으로 찾는다 → 창 그림 기준 [x1, y1, x2, y2] (못 찾으면 None).
    목록 왼쪽(이름 쪽) 을 3배로 키워 OCR 하고, 줄 맨 위 글(이름) 중 room 과 자모로 맞는 것 (위에서부터)."""
    top, lst = find_chatlist()
    img = capture(top)
    if img is None:
        return None
    tl, tt, _, _ = _rect(top)
    ll, lt, lr, lb = _rect(lst)
    return row_by_name(img, (ll - tl, lt - tt, lr - tl, lb - tt), room)


def row_by_name(img, region, room):
    region = (region[0], region[1], region[0] + (region[2] - region[0]) * 7 // 10, region[3])
    crop = img.crop(region)
    tmp = tempfile.mkdtemp(prefix="kakao_list_")
    try:
        p = os.path.join(tmp, "list.png")
        crop.resize((crop.width * 3, crop.height * 3), Image.LANCZOS).save(p)
        lines = ocr([p]).get(p, [])
    finally:
        for f in os.listdir(tmp):
            os.remove(os.path.join(tmp, f))
        os.rmdir(tmp)
    for x, y, wd, ht, t in sorted(lines, key=lambda ln: ln[1]):
        name = clean_name(t)
        if name and (fuzzy_in(room, name) or same_room(room, name)):
            return [region[0] + x // 3, region[1] + y // 3, region[0] + (x + wd) // 3, region[1] + (y + ht) // 3]
    return None


def open_room(room, box, log, wait=4.0):
    """채팅 목록에서 배지 줄을 더블클릭해 방을 연다 → (창, 제목). 엉뚱한 방이 열리면 바로 닫고 (0, None).
    먼저 마우스 없이(창에 클릭 신호) 해 보고, 안 열리면 마우스로 (카톡 메인 창을 앞으로)."""
    import kakao_photo
    import kakao_window
    top, lst, tl, tt, ll, lt, lw = LAST["geom"]
    x = int(lw * 0.35)
    if box is None:
        box = find_row(room)
        if box is None:
            log("[%s] 배지가 없어져서 목록에서 이름으로 찾았지만 못 찾음" % room)
            return 0, None
    y = (box[1] + box[3]) // 2 - (lt - tt)
    before = set(kakao_window.chat_windows())
    for how in ("signal", "mouse"):
        if how == "mouse":
            log("[채팅 목록] 마우스 없이는 안 열림 → 마우스로")
        if how == "signal":
            kakao_window.double_click_list(lst, x, y)
        else:
            u.keybd_event(0x12, 0, 0, 0)  # Alt: 윈도우가 앞으로 가져오기를 허락하게
            u.keybd_event(0x12, 0, 2, 0)
            u.SetForegroundWindow(top)
            time.sleep(0.4)
            kakao_photo._double_click(ll + x, lt + y)
        end = time.time() + wait
        while time.time() < end:
            time.sleep(0.3)
            new = {h: t for h, t in kakao_window.chat_windows().items() if h not in before and h != top}
            if new:
                h, title = next(iter(new.items()))
                if _title_ok(room, title):
                    time.sleep(1.0)  # 글을 다 불러오게
                    return h, title
                log("[채팅 목록] '%s' 을 열려다 다른 방이 열려 그냥 닫음" % room)
                kakao_window.close_window(h)
                return 0, None
    return 0, None


def read_and_report(cfg, state, room, notify, log, classify):
    """글이 멈춘 방 하나를 열어 새 글을 읽고 닫은 뒤 분류·요약을 텔레그램으로. 실패해도 같은 배지로 다시 열지 않는다."""
    import kakao_text
    import kakao_window
    cur = state["badges"][room]
    cur["since"] = None
    LAST["sig"] = None  # 방을 열면 목록이 바뀐다 → 다음 확인 때 새로 본다
    log("[%s] 글이 멈춤 → 방 열기" % room)
    h, title = open_room(room, cur["box"], log)
    if not h:
        log("[채팅 목록] '%s' 방을 못 열었음 — 새 글 알림만" % room)
        notify(message([(room, cur.get("n"), cur.get("n"))]) + "\n(방을 못 열어서 요약 없음)")
        return
    log("[%s] 열림 → 글 읽기" % title)
    try:
        text = kakao_window.copy_room_text(title)
    finally:
        kakao_window.close_window(h)
    if not text:
        log("[%s] 글 복사 실패" % title)
        notify(message([(title, cur.get("n"), cur.get("n"))]) + "\n(글을 못 읽어서 요약 없음)")
        return
    msgs = kakao_text.with_keys(kakao_text.parse(text))
    seen_all = state.setdefault("read", {})
    seen = seen_all.get(title, [])
    new = pick_new(msgs, set(seen), cur.get("n"))
    seen_all[title] = (seen + [m["key"] for m in msgs if m["key"] not in set(seen)])[-300:]
    if not new:
        log("[%s] 새 글을 못 찾음" % title)
        return
    send = [{"time": m["time"], "sender": m["sender"],
             "text": kakao_text.mask(m["text"]) if cfg.get("mask_secrets", True) else m["text"]} for m in new]
    log("[%s] 새 글 %d개 → 분류 묻는 중" % (title, len(send)))
    try:
        res = classify(title, send)
        if res.get("error") and not res.get("요약"):
            raise RuntimeError(res["error"])
    except Exception as e:
        log("[%s] 분류 실패: %s" % (title, str(e)[:200]))
        res = {"종류": "분류 실패", "요약": "\n".join("%s: %s" % (m["sender"], m["text"][:100]) for m in send[-5:])}
    log("[%s] 새 글 %d개 → %s" % (title, len(new), res.get("종류")))
    notify(report(title, res, new))


def diagnose(path):
    """배지를 못 찾을 때: 창·목록 칸 위치와 그림 전체의 빨간 덩어리(위치·크기·색)를 보여 준다 (글 내용은 안 보임)."""
    top, lst = find_chatlist()
    img = Image.open(path).convert("RGB")
    tl, tt, tr, tb = _rect(top)
    ll, lt, lr, lb = _rect(lst)
    print("창", (tl, tt, tr, tb), "그림 크기", img.size, "목록 칸(창 기준)", (ll - tl, lt - tt, lr - tl, lb - tt))
    try:
        print("화면 배율", u.GetDpiForWindow(top), "/ 96")
    except Exception:
        pass
    W, H = img.size
    px = img.load()
    loose = lambda p: p[0] > 150 and p[0] - p[1] > 50 and p[0] - p[2] > 50
    seen = bytearray(W * H)
    blobs = []
    for y in range(H):
        for x in range(W):
            if seen[y * W + x] or not loose(px[x, y]):
                continue
            seen[y * W + x] = 1
            stack, bx, cols = [(x, y)], [x, y, x, y], []
            while stack:
                cx, cy = stack.pop()
                cols.append(px[cx, cy])
                bx = [min(bx[0], cx), min(bx[1], cy), max(bx[2], cx), max(bx[3], cy)]
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx] and loose(px[nx, ny]):
                        seen[ny * W + nx] = 1
                        stack.append((nx, ny))
            if len(cols) >= 20:
                avg = tuple(sum(c[i] for c in cols) // len(cols) for i in range(3))
                blobs.append((bx, len(cols), avg))
    print("빨간 덩어리 %d개 (상자, 점 수, 평균 색):" % len(blobs))
    for b in blobs[:15]:
        print("  ", *b)


def main():
    try:
        u.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
    except Exception:
        pass
    for s in (sys.stdout, sys.stderr):
        try:
            s.reconfigure(errors="replace")
        except Exception:
            pass
    path = os.path.join(HERE, "chatlist_probe.png")
    try:
        import reader
        cfg = reader.load_json(os.path.join(HERE, "config.json"), {})
        known = list(cfg.get("watch_rooms", [])) + list(cfg.get("exclude_rooms", [])) + ["김정헌"]
        now = read_badges(force=True, keep_image=path, known=known)
    except Exception as e:
        print("안 됨:", e)
        return 1
    print("카톡 창 그림:", path, "(카톡으로 보내지 마세요)")
    if not now:
        print("빨간 배지가 안 보임 — 아래 숫자를 사진으로 보내 주세요")
        diagnose(path)
    for room, cur in now.items():
        mark = "알림" if watched(room, cfg.get("watch_rooms", [])) else "안 알림"
        print("  %s : %s  (%s)" % (room, cur["n"] if cur["n"] is not None else "숫자 못 읽음", mark))
    if any(cur["n"] is None for cur in now.values()):
        show_badges(path)
    return 0


def show_badges(path, most=3):
    """숫자를 못 읽은 배지를 글자 그림으로 (사진으로 보내 주시면 숫자 읽기를 맞춘다. 배지 안만 — 글 내용은 안 보임)."""
    top, lst = find_chatlist()
    tl, tt, _, _ = _rect(top)
    ll, lt, lr, lb = _rect(lst)
    img = Image.open(path).convert("RGB")
    shades = " .:-=+*#%@"
    for b in find_badges(img, (ll - tl, lt - tt, lr - tl, lb - tt))[:most]:
        c = img.crop((b[0], b[1], b[2] + 1, b[3] + 1))
        print("배지", b, "크기", c.size, "가운데 색", c.getpixel((1, c.height // 2)), "숫자 칸:")
        gray = badge_digits(img, b)
        for y in range(gray.height):
            print("   |" + "".join(shades[gray.getpixel((x, y)) * 9 // 255] for x in range(min(gray.width, 60))) + "|")


if __name__ == "__main__":
    sys.exit(main())
