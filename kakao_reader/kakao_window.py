"""PC 카톡 채팅창 글 복사 (윈도우 API, ctypes 만 사용).

채팅창(제목 = 방 이름, 클래스 EVA_Window_Dblclk) 안의 메시지 목록(EVA_VH_ListControl_Dblclk)에
Ctrl+A · Ctrl+C 를 PostMessage 로 보내 클립보드로 글을 가져온다. 창을 앞으로 띄우지 않는다.
사장님이 쓰던 클립보드 글은 복사 뒤 되돌려 놓는다.
"""
import ctypes
import ctypes.wintypes as w
import time

u = ctypes.windll.user32
k = ctypes.windll.kernel32
k.GlobalLock.restype = ctypes.c_void_p
k.GlobalLock.argtypes = [ctypes.c_void_p]
k.GlobalUnlock.argtypes = [ctypes.c_void_p]
k.GlobalAlloc.restype = ctypes.c_void_p
u.GetClipboardData.restype = ctypes.c_void_p
u.SetClipboardData.argtypes = [w.UINT, ctypes.c_void_p]

CF_UNICODETEXT = 13
WM_KEYDOWN, WM_KEYUP = 0x100, 0x101
VK_CONTROL = 0x11
LIST_CLASS = "EVA_VH_ListControl_Dblclk"


def find_room(room):
    """방 이름이 제목인 카톡 채팅창 → (창, 메시지 목록) 핸들. 없으면 (0, 0)."""
    h = u.FindWindowW("EVA_Window_Dblclk", room)
    if not h:
        return 0, 0
    return h, u.FindWindowExW(h, 0, LIST_CLASS, None)


def _open_clipboard():
    for _ in range(20):
        if u.OpenClipboard(0):
            return True
        time.sleep(0.05)
    return False


def get_clipboard_text():
    if not _open_clipboard():
        return None
    try:
        hd = u.GetClipboardData(CF_UNICODETEXT)
        if not hd:
            return None
        p = k.GlobalLock(hd)
        try:
            return ctypes.wstring_at(p)
        finally:
            k.GlobalUnlock(hd)
    finally:
        u.CloseClipboard()


def set_clipboard_text(text):
    if not _open_clipboard():
        return
    try:
        u.EmptyClipboard()
        if text is None:
            return
        data = (text + "\0").encode("utf-16-le")
        hd = k.GlobalAlloc(0x0002, len(data))  # GMEM_MOVEABLE
        p = k.GlobalLock(hd)
        ctypes.memmove(p, data, len(data))
        k.GlobalUnlock(hd)
        u.SetClipboardData(CF_UNICODETEXT, hd)
    finally:
        u.CloseClipboard()


def _post_key(hwnd, vk):
    u.PostMessageW(hwnd, WM_KEYDOWN, vk, 0)
    time.sleep(0.05)
    u.PostMessageW(hwnd, WM_KEYUP, vk, 0)


def copy_room_text(room, wait=0.6):
    """방 채팅창의 글 전체(창에 불러온 만큼)를 돌려준다. 창이 없으면 None."""
    h, lst = find_room(room)
    if not lst:
        return None
    if u.GetForegroundWindow() == h:
        # 채팅창이 맨 앞이면 키가 입력칸으로 가서 복사가 안 된다 (사진 저장 뒤에 이렇게 남음)
        # → 바탕화면을 앞으로 해 두고 복사한다.
        u.keybd_event(0x12, 0, 0, 0)  # Alt: 윈도우가 앞으로 가져오기를 허락하게
        u.keybd_event(0x12, 0, 2, 0)
        u.SetForegroundWindow(u.GetShellWindow())
        time.sleep(0.3)
    before = get_clipboard_text()
    marker = "⁣kakao-reader⁣"
    set_clipboard_text(marker)
    # 카톡은 Ctrl 눌림을 실제 키보드 상태로 본다 → 아주 잠깐 Ctrl 을 누른다.
    u.keybd_event(VK_CONTROL, 0, 0, 0)
    try:
        _post_key(lst, ord("A"))
        time.sleep(0.2)
        _post_key(lst, ord("C"))
    finally:
        u.keybd_event(VK_CONTROL, 0, 2, 0)
    text = None
    end = time.time() + wait + 2
    time.sleep(wait)
    while time.time() < end:
        t = get_clipboard_text()
        if t and t != marker:
            text = t
            break
        time.sleep(0.2)
    set_clipboard_text(before)
    # Ctrl+A 로 전체 선택된 채로 두면 사진을 눌러도 뷰어가 안 열린다 → 목록 왼쪽 위 빈 곳을 한 번 눌러 선택을 푼다
    lp = (3 << 16) | 3
    u.PostMessageW(lst, 0x201, 1, lp)  # WM_LBUTTONDOWN
    u.PostMessageW(lst, 0x202, 0, lp)  # WM_LBUTTONUP
    return text


PLACEHOLDER = "메시지 입력"  # 비어 있을 때 입력칸이 돌려주는 안내 글


def _input_text(edit):
    """입력칸 글 (비어 있으면 '')."""
    n = u.SendMessageW(edit, 0x000E, 0, 0)  # WM_GETTEXTLENGTH
    buf = ctypes.create_unicode_buffer(n + 1)
    u.SendMessageW(edit, 0x000D, n + 1, buf)  # WM_GETTEXT
    return "" if buf.value == PLACEHOLDER else buf.value


def send_text(room, text):
    """방 채팅창 입력칸에 text 를 넣고 Enter 로 전송 (AI 없음). 창 제목이 room 과 같을 때만.
    입력칸에 쓰던 글이 있으면 덮어쓰지 않고 그만둔다. 전송되면(입력칸이 비면) True."""
    h, _ = find_room(room)
    if not h:
        return False
    n = u.GetWindowTextLengthW(h)
    title = ctypes.create_unicode_buffer(n + 1)
    u.GetWindowTextW(h, title, n + 1)
    if title.value != room:
        return False
    edit = u.FindWindowExW(h, 0, "RICHEDIT50W", None)
    if not edit or _input_text(edit).strip():
        return False
    # 빈 입력칸에 WM_SETTEXT 만 하면 카톡은 여전히 '빈칸' 으로 여겨 Enter 를 무시한다 (10/29 확인).
    # 한 글자를 먼저 '친' 것처럼(WM_CHAR) 해 두면 그다음 넣은 글을 Enter 로 보낸다. 창을 앞으로 띄울 필요 없음.
    u.SendMessageW(edit, 0x0102, 0x20, 1)  # WM_CHAR ' '
    u.SendMessageW(edit, 0x000C, 0, ctypes.c_wchar_p(text))  # WM_SETTEXT
    time.sleep(0.3)
    u.PostMessageW(edit, WM_KEYDOWN, 0x0D, 0x001C0001)
    time.sleep(0.05)
    u.PostMessageW(edit, WM_KEYUP, 0x0D, 0xC01C0001)
    for _ in range(20):
        time.sleep(0.2)
        if not _input_text(edit).strip():
            return True
    return False
