"""복사 실패 이유·다시 시도 (11/6). 실제 키보드·클립보드는 건드리지 않는다."""
import unittest
import kakao_window as kw

MARK = "\u2063kakao-reader\u2063"


class FakeU:
    def __init__(self, foreground=0, ctrl=True):
        self.foreground, self.ctrl = foreground, ctrl
        self.keys = []

    def GetForegroundWindow(self):
        return self.foreground

    def GetShellWindow(self):
        return 9

    def SetForegroundWindow(self, h):
        return 0

    def keybd_event(self, *a):
        self.keys.append(a)

    def GetAsyncKeyState(self, vk):
        return -32768 if self.ctrl else 0

    def PostMessageW(self, *a):
        return 1


class CopyTest(unittest.TestCase):
    def setUp(self):
        self.saved = {n: getattr(kw, n) for n in ("u", "find_room", "get_clipboard_text", "set_clipboard_text", "_post_key", "_clipboard_holder", "_screen_locked")}
        self.clip = "쓰던 글"
        self.answers = []          # Ctrl+C 때마다 클립보드에 들어갈 글 (None 이면 그대로)
        kw.u = FakeU()
        kw.find_room = lambda room: (1, 2)
        kw.get_clipboard_text = lambda: self.clip
        kw.set_clipboard_text = self.put
        kw._post_key = self.key
        kw._clipboard_holder = lambda: ""
        kw._screen_locked = lambda: False
        self.sets = []

    def tearDown(self):
        for n, v in self.saved.items():
            setattr(kw, n, v)

    def put(self, t):
        self.sets.append(t)
        self.clip = t

    def key(self, lst, vk):
        if vk == ord("C") and self.answers:
            a = self.answers.pop(0)
            if a is not None:
                self.clip = a

    def copy(self):
        return kw.copy_room_text("방", wait=0, retry_wait=0)

    def fast(self):
        real = kw.time.time
        t = [0]
        def tick():
            t[0] += 1.2
            return t[0]
        kw.time.time = tick
        self.addCleanup(setattr, kw.time, "time", real)

    def test_ok_first(self):
        self.answers = ["방 글"]
        self.assertEqual(self.copy(), "방 글")
        self.assertEqual(kw.last_fail, "")
        self.assertEqual(self.clip, "쓰던 글", "쓰던 클립보드를 되돌림")

    def test_retry_succeeds(self):
        self.fast()
        self.answers = [None, "방 글"]
        self.assertEqual(self.copy(), "방 글")
        self.assertEqual(kw.last_fail, "")

    def test_no_reaction(self):
        self.fast()
        self.assertIsNone(self.copy())
        self.assertEqual(kw.last_fail, "카톡이 복사에 반응 안 함")
        self.assertEqual(self.clip, "쓰던 글")

    def test_ctrl_and_lock_reasons(self):
        self.fast()
        kw.u = FakeU(ctrl=False)
        kw._screen_locked = lambda: True
        self.assertIsNone(self.copy())
        self.assertEqual(kw.last_fail, "Ctrl 입력이 안 먹음 · 화면 잠김")

    def test_foreground_reason(self):
        self.fast()
        kw.u = FakeU(foreground=1)
        self.assertIsNone(self.copy())
        self.assertIn("맨 앞", kw.last_fail)

    def test_clipboard_busy_never_returns_old_text(self):
        # 표시를 못 넣으면 쓰던 글을 방 글로 잘못 읽으면 안 된다
        kw.set_clipboard_text = lambda t: None
        kw._clipboard_holder = lambda: "chrome.exe"
        self.answers = ["방 글", "방 글"]
        self.assertIsNone(self.copy())
        self.assertEqual(kw.last_fail, "클립보드를 못 씀 (사용 중: chrome.exe)")

    def test_no_window_has_no_reason(self):
        kw.find_room = lambda room: (0, 0)
        self.assertIsNone(self.copy())
        self.assertEqual(kw.last_fail, "")


if __name__ == "__main__":
    unittest.main()
