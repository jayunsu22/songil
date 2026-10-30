"""사진: '문서\\카카오톡 받은 파일' 에 새로 생긴 사진을 고른다.

카톡은 받은 사진을 PC 안에 암호화해 두므로(…\\chat_data\\*.cng) 직접 읽지 않는다.
사진이 그 폴더에 저장되면(사장님이 손으로 저장하거나 save_latest_photos 가 저장) 다음 주기에 넘어간다.

save_latest_photos (config auto_save_photos, 기본 켬): 방 창을 앞으로 띄우고
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
    out.sort(key=lambda q: (os.path.basename(q), os.path.getmtime(q)))  # 카톡 파일 이름 = 받은 시각 → 보낸 순서대로
    return out


def new_photos(folder, seen):
    """seen 에 없는 사진 경로들 (오래된 것부터). 막 쓰는 중인 파일(2초 안)은 다음 주기로 미룬다."""
    now = time.time()
    return [p for p in list_photos(folder) if file_id(p) not in seen and now - os.path.getmtime(p) > 2]


# ---- 시험 기능: 맨 아래 사진 말풍선 저장 ----

u = ctypes.windll.user32
u.SetProcessDPIAware()  # 화면 배율이 100% 가 아니어도 창 좌표·화면 캡처가 맞게


class RECT(ctypes.Structure):
    _fields_ = [("left", ctypes.c_long), ("top", ctypes.c_long), ("right", ctypes.c_long), ("bottom", ctypes.c_long)]


def _rect(h):
    r = RECT()
    u.GetWindowRect(h, ctypes.byref(r))
    return r.left, r.top, r.right, r.bottom


def find_bottom_photo(img):
    """채팅 목록 화면 이미지에서 맨 아래 사진 말풍선의 가운데 (x, y) — 없으면 None.
    배경색(왼쪽 끝 열에서 가장 흔한 색)과 다른 줄 묶음을 아래에서부터 보며, 높이 100 이상이고
    한 가지 색이 35% 미만인 묶음을 사진으로 본다 (글 말풍선은 노랑·흰 바탕색이 대부분)."""
    img = img.convert("RGB")
    wid, hei = img.size
    px = img.load()
    edge = [px[3, y] for y in range(hei)]
    bg = max(set(edge), key=edge.count)

    def differs(c):
        return abs(c[0] - bg[0]) + abs(c[1] - bg[1]) + abs(c[2] - bg[2]) > 30

    lo, hi = 40, wid - 30  # 왼쪽 프로필·오른쪽 스크롤 막대 빼고
    rows = [sum(1 for x in range(lo, hi, 3) if differs(px[x, y])) > 15 for y in range(hei)]
    y = hei - 1
    while y >= 0:
        if not rows[y]:
            y -= 1
            continue
        end = y
        while y >= 0 and rows[y]:
            y -= 1
        top = y + 1
        if end - top < 100:
            continue
        mid = (top + end) // 2
        # 가운데 줄에서 가장 긴 '배경 아닌' 구간 = 말풍선 가로 범위 (옆의 시각 글씨는 짧아서 빠짐)
        best, run = (0, -1), None
        for x in range(lo, hi):
            if differs(px[x, mid]):
                run = x if run is None else run
                if x - run > best[1] - best[0]:
                    best = (run, x)
            else:
                run = None
        x0, x1 = best
        if x1 - x0 < 60:
            continue
        box = img.crop((x0, top, x1 + 1, end + 1)).resize((80, 80))
        colors = list(box.getdata())
        common = max(set(colors), key=colors.count)
        if colors.count(common) / len(colors) < 0.35:
            return (x0 + x1) // 2, mid
    return None


def _double_click(x, y):
    """마우스를 옮겨 두 번 누른다. 윈도우가 마우스 옮기기를 막으면(다른 프로그램이 마우스를 쓰는 중 등) False."""
    if not u.SetCursorPos(x, y):
        return False
    for _ in range(2):
        u.mouse_event(0x0002, 0, 0, 0, 0)
        u.mouse_event(0x0004, 0, 0, 0, 0)
        time.sleep(0.08)
    return True


def _key(vk, ctrl=False):
    if ctrl:
        u.keybd_event(0x11, 0, 0, 0)
    u.keybd_event(vk, 0, 0, 0)
    u.keybd_event(vk, 0, 2, 0)
    if ctrl:
        u.keybd_event(0x11, 0, 2, 0)


def _foreground_class():
    b = ctypes.create_unicode_buffer(64)
    u.GetClassNameW(u.GetForegroundWindow(), b, 64)
    return b.value


def _finish_save_dialog(folder):
    """Ctrl+S 로 뜬 '다른 이름으로 저장' 창에서 파일 이름 앞에 folder 를 붙이고 저장. 이미 있으면 취소.
    돌려주는 값: 저장(또는 이미 있던) 파일 경로, 창이 없으면 None."""
    for _ in range(60):  # 느린 노트북: 저장 창이 늦게 뜬다
        if _foreground_class() == "#32770":
            break
        time.sleep(0.1)
    else:
        return None
    dlg = u.GetForegroundWindow()
    edits = []
    proc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)

    def cb(c, _):
        b = ctypes.create_unicode_buffer(64)
        u.GetClassNameW(c, b, 64)
        pb = ctypes.create_unicode_buffer(64)
        u.GetClassNameW(u.GetParent(c), pb, 64)
        if b.value == "Edit" and pb.value.startswith("ComboBox"):
            edits.append(c)
        return True

    u.EnumChildWindows(dlg, proc(cb), 0)
    if not edits:
        u.PostMessageW(dlg, 0x111, 2, 0)  # 취소
        return None
    buf = ctypes.create_unicode_buffer(520)
    u.SendMessageW(edits[0], 0x0D, 520, buf)  # WM_GETTEXT
    target = os.path.join(folder, os.path.basename(buf.value))
    if os.path.exists(target):
        u.PostMessageW(dlg, 0x111, 2, 0)
        return target
    u.SendMessageW(edits[0], 0x0C, 0, ctypes.c_wchar_p(target))  # WM_SETTEXT
    u.PostMessageW(dlg, 0x111, 1, 0)  # 저장
    for _ in range(60):
        if os.path.exists(target):
            return target
        time.sleep(0.1)
    return None


def _same_process(a, b):
    pa, pb = ctypes.c_ulong(), ctypes.c_ulong()
    u.GetWindowThreadProcessId(a, ctypes.byref(pa))
    u.GetWindowThreadProcessId(b, ctypes.byref(pb))
    return pa.value == pb.value


def _wait_viewer(room_hwnd, seconds):
    """카톡 사진 뷰어(카톡 프로그램의 다른 창)가 앞에 뜰 때까지 기다린다. 뜨면 그 창, 아니면 None."""
    end = time.time() + seconds
    while time.time() < end:
        fg = u.GetForegroundWindow()
        if fg and fg != room_hwnd and _same_process(fg, room_hwnd) and _foreground_class() != "#32770":
            return fg
        time.sleep(0.2)
    return None


def save_latest_photos(room_hwnd, list_hwnd, count, folder):
    """맨 아래 사진을 열어 거기서부터 앞으로 count 장을 folder 에 저장.
    돌려주는 값: (저장된·이미 있던 파일 수, 못 했으면 이유)"""
    from PIL import ImageGrab
    u.ShowWindow(room_hwnd, 9)  # SW_RESTORE
    # 다른 창(메모장 등)이 앞에 있으면 윈도우가 창 앞으로 가져오기를 막는다 → Alt 를 한 번 눌렀다 떼고 가져온다
    u.keybd_event(0x12, 0, 0, 0)
    u.keybd_event(0x12, 0, 2, 0)
    u.SetForegroundWindow(room_hwnd)
    time.sleep(0.5)
    if u.GetForegroundWindow() != room_hwnd:
        return 0, "채팅창을 앞으로 못 가져옴"
    viewer = None
    for attempt in range(2):  # 느린 노트북은 뷰어가 늦게 뜬다 → 넉넉히 기다리고, 안 뜨면 한 번 더 누른다
        left, top, right, bottom = _rect(list_hwnd)
        spot = find_bottom_photo(ImageGrab.grab((left, top, right, bottom), all_screens=True))
        if not spot:
            return 0, "사진 말풍선을 못 찾음 (창이 가려졌나 확인)"
        if not _double_click(left + spot[0], top + spot[1]):
            return 0, "윈도우가 마우스 움직임을 막음"
        viewer = _wait_viewer(room_hwnd, 8)
        if viewer:
            break
        u.SetForegroundWindow(room_hwnd)
        time.sleep(0.5)
    if not viewer:
        return 0, "사진 뷰어가 안 열림 (앞 창: %s, 누른 곳 %s)" % (_foreground_class(), spot)
    time.sleep(0.8)  # 뷰어가 사진을 다 띄울 때까지
    saved = set()
    for i in range(max(1, count)):
        _key(ord("S"), ctrl=True)
        path = _finish_save_dialog(folder)
        if path:
            saved.add(path)
        time.sleep(0.5)
        if i < count - 1:
            _key(0x25)  # ← 한 장 앞 사진
            time.sleep(0.8)
    _key(0x1B)  # Esc 로 뷰어 닫기
    return len(saved), ""
