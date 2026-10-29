"""사진: '문서\\카카오톡 받은 파일' 에 새로 생긴 사진을 고른다.

카톡은 받은 사진을 PC 안에 암호화해 두므로(…\\chat_data\\*.cng) 직접 읽지 않는다.
사진이 그 폴더에 저장되면(사장님이 손으로 저장하거나 save_latest_photos 가 저장) 다음 주기에 넘어간다.

save_latest_photos 는 시험 기능(config auto_save_photos, 기본 끔): 방 창을 앞으로 띄우고
맨 아래 사진 말풍선을 더블클릭 → 사진 뷰어에서 Ctrl+S 로 저장한다. 마우스를 움직이므로 카톡 전용 노트북에서만 켠다.
"""
import ctypes
import os
import time

PHOTO_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"}


def default_dir():
    return os.path.join(os.path.expanduser("~"), "Documents", "카카오톡 받은 파일")


def file_id(path):
    st = os.stat(path)
    return "%s|%d|%d" % (os.path.basename(path), st.st_size, int(st.st_mtime))


def list_photos(folder):
    if not os.path.isdir(folder):
        return []
    out = []
    for name in os.listdir(folder):
        p = os.path.join(folder, name)
        if os.path.splitext(name)[1].lower() in PHOTO_EXT and os.path.isfile(p):
            out.append(p)
    out.sort(key=os.path.getmtime)
    return out


def new_photos(folder, seen):
    """seen 에 없는 사진 경로들 (오래된 것부터). 막 쓰는 중인 파일(2초 안)은 다음 주기로 미룬다."""
    now = time.time()
    return [p for p in list_photos(folder) if file_id(p) not in seen and now - os.path.getmtime(p) > 2]


# ---- 시험 기능: 맨 아래 사진 말풍선 저장 ----

u = ctypes.windll.user32


class RECT(ctypes.Structure):
    _fields_ = [("left", ctypes.c_long), ("top", ctypes.c_long), ("right", ctypes.c_long), ("bottom", ctypes.c_long)]


def _rect(h):
    r = RECT()
    u.GetWindowRect(h, ctypes.byref(r))
    return r.left, r.top, r.right, r.bottom


def find_bottom_photo(img):
    """채팅 목록 화면 이미지에서 맨 아래 사진 말풍선의 가운데 (x, y) — 없으면 None.
    줄마다 색 가짓수를 세어 40줄 넘게 이어진 '색 많은 띠' 를 사진으로 본다 (글 말풍선은 색이 몇 가지뿐)."""
    small = img.convert("RGB").quantize(64).convert("RGB")
    wid, hei = small.size
    px = small.load()
    rows = []
    for y in range(hei):
        colors = {px[x, y] for x in range(0, wid, 2)}
        rows.append(len(colors) >= 12)
    y = hei - 1
    while y >= 0:
        if rows[y]:
            end = y
            while y >= 0 and rows[y]:
                y -= 1
            if end - y >= 40:
                mid = (end + y) // 2
                bg = px[wid // 2, 2]
                xs = [x for x in range(wid) if px[x, mid] != bg]
                if xs:
                    return (min(xs) + max(xs)) // 2, mid
        y -= 1
    return None


def _double_click(x, y):
    u.SetCursorPos(x, y)
    for _ in range(2):
        u.mouse_event(0x0002, 0, 0, 0, 0)
        u.mouse_event(0x0004, 0, 0, 0, 0)
        time.sleep(0.08)


def _key(vk, ctrl=False):
    if ctrl:
        u.keybd_event(0x11, 0, 0, 0)
    u.keybd_event(vk, 0, 0, 0)
    u.keybd_event(vk, 0, 2, 0)
    if ctrl:
        u.keybd_event(0x11, 0, 2, 0)


def save_latest_photos(room_hwnd, list_hwnd, count, folder):
    """맨 아래 사진을 열어 count 장 저장 시도. 새로 생긴 파일 수를 돌려준다."""
    from PIL import ImageGrab
    before = set(list_photos(folder))
    u.ShowWindow(room_hwnd, 9)  # SW_RESTORE
    u.SetForegroundWindow(room_hwnd)
    time.sleep(0.5)
    left, top, right, bottom = _rect(list_hwnd)
    spot = find_bottom_photo(ImageGrab.grab((left, top, right, bottom), all_screens=True))
    if not spot:
        return 0
    _double_click(left + spot[0], top + spot[1])
    time.sleep(1.5)
    for i in range(max(1, count)):
        _key(ord("S"), ctrl=True)
        time.sleep(1.0)
        if i < count - 1:
            _key(0x27)  # →
            time.sleep(0.6)
    _key(0x1B)  # Esc 로 뷰어 닫기
    return len(set(list_photos(folder)) - before)
