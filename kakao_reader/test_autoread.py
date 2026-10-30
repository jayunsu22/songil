"""B안 (글이 멈추면 방을 열어 읽고 분류·요약) — 윈도우 없이 되는 부분."""
import unittest

import chatlist


def B(n, fp, since=None):
    return {"n": n, "fp": fp, "box": [0, 0, 10, 10], "since": since}


def M(text, key, sender="pk"):
    return {"time": "21:30", "sender": sender, "text": text, "key": key}


class QuietTest(unittest.TestCase):
    def test_since_resets_when_badge_changes(self):
        prev = {"pk": B(1, "a", 100), "한솔": B(2, "b", 50)}
        now = {"pk": B(2, "c"), "한솔": B(2, "b"), "투나": B(1, "d")}
        chatlist.mark_since(prev, now, 200)
        self.assertEqual({r: c["since"] for r, c in now.items()}, {"pk": 200, "한솔": 50, "투나": 200})

    def test_due_after_quiet(self):
        b = {"pk": B(1, "a", 100), "한솔": B(1, "b", 30), "투나": B(1, "c", None)}
        self.assertEqual(chatlist.due_rooms(b, 150, 60), ["한솔"])
        self.assertEqual(chatlist.due_rooms(b, 170, 60), ["한솔", "pk"])


class RowsTest(unittest.TestCase):
    def test_row_times(self):
        lines = [
            (60, 10, 60, 18, "류춘화 ' ,"), (60, 34, 200, 16, "견적문의 방문3세트"), (330, 12, 60, 14, "오후 10:17"),
            (60, 80, 200, 18, "0 매드센스 티스토리"), (330, 82, 60, 14, "오후 9:00"),
            (60, 150, 90, 18, "pk디자인 대리님"), (330, 152, 40, 14, "어 제"),
            (60, 220, 90, 18, "이종수"), (330, 222, 40, 14, "오후3대2"),        # OCR 이 깨뜨린 시간은 모른 척
            (60, 290, 320, 18, "오니브 오전 6:07"),                             # 이름과 시간을 한 줄로 붙여 읽음
        ]
        self.assertEqual(chatlist.row_times(lines, ["류춘화", "pk디자인", "오니브", "이종수"], 400),
                         {"류춘화": "오후 10:17", "pk디자인": "어제", "오니브": "오전 6:07"})

    def test_time_change_makes_pending(self):
        # 사장님이 폰으로 먼저 읽어 배지가 안 생겨도, 목록의 시간이 바뀌면 새 글로 본다
        from PIL import Image
        orig = chatlist.ocr
        out = {"t": "오후 10:17"}
        chatlist.ocr = lambda paths: {paths[0]: [(240, 40, 120, 72, "류춘화"), (1320, 48, 240, 56, out["t"])]}  # 4배 그림 좌표
        try:
            cfg = {"watch_rooms": ["류춘화"]}
            st = {}
            chatlist.LAST.update(img=Image.new("RGB", (500, 300), "white"), region=(0, 0, 400, 300), rows_sig=None)
            chatlist.check_rows(cfg, st, lambda m: None, 100)
            self.assertEqual(st["rows"], {"류춘화": "오후 10:17"})
            self.assertNotIn("류춘화", st.get("badges", {}))          # 처음은 기억만
            out["t"] = "오후 10:25"
            chatlist.LAST.update(img=Image.new("RGB", (500, 300), "gray"))
            chatlist.check_rows(cfg, st, lambda m: None, 200)
            self.assertEqual(st["badges"]["류춘화"]["since"], 200)
            self.assertIsNone(st["badges"]["류춘화"]["box"])
        finally:
            chatlist.ocr = orig


class WaitTest(unittest.TestCase):
    def test_wake_when_due(self):
        st = {"badges": {"pk": B(1, "a", 100), "한솔": B(1, "b", None)}}
        self.assertEqual(chatlist.wait_seconds(st, {"auto_read": True, "read_quiet_seconds": 60}, 130), 30)
        self.assertEqual(chatlist.wait_seconds(st, {"auto_read": True, "read_quiet_seconds": 60}, 200), 1)
        self.assertIsNone(chatlist.wait_seconds({"badges": {}}, {"auto_read": True}, 0))
        self.assertIsNone(chatlist.wait_seconds(st, {"auto_read": False}, 130))


class PickTest(unittest.TestCase):
    def test_after_seen_or_last_n(self):
        msgs = [M("옛 글", "1"), M("또 옛 글", "2"), M("새 글", "3"), M("사진", "4")]
        self.assertEqual([m["key"] for m in chatlist.pick_new(msgs, {"1", "2"}, 5)], ["3", "4"])
        self.assertEqual(chatlist.pick_new(msgs, {"1", "2", "3", "4"}, 5), [])  # 다 읽은 글이면 없음
        self.assertEqual([m["key"] for m in chatlist.pick_new(msgs, set(), 2)], ["3", "4"])
        self.assertEqual(len(chatlist.pick_new(msgs, set(), None)), 4)  # 숫자 모르면 10개까지


class ReportTest(unittest.TestCase):
    def test_message(self):
        msgs = [M("투나 현장 14일을 16일로 미뤄도 될까요", "1"), M("사진 2장", "2")]
        r = chatlist.report("pk디자인 대리님", {"종류": "일정 변경", "요약": "투나여행 현장 11/14 → 11/16 요청", "급함": True}, msgs)
        self.assertEqual(r, "[카톡] ⚠ pk디자인 대리님 · 일정 변경\n투나여행 현장 11/14 → 11/16 요청\n(새 글 2개 · 사진 2장)")

    def test_title_check(self):
        self.assertTrue(chatlist._title_ok("pk디자인", "pk디자인 대리님"))
        self.assertTrue(chatlist._title_ok("류춘화", "류춘화"))
        self.assertFalse(chatlist._title_ok("류춘화", "엄마"))
        self.assertFalse(chatlist._title_ok("류춘화", None))


class CheckFlowTest(unittest.TestCase):
    """check(): 처음엔 기억만, 배지가 생기면 since, 조용하면 read_and_report 한 번."""

    def setUp(self):
        self.calls, self.sent = [], []
        self.orig = (chatlist.read_badges, chatlist.read_and_report, chatlist.time.time)
        chatlist.read_and_report = lambda cfg, state, room, notify, log, classify: self.calls.append(room)
        self.t = 1000
        chatlist.time.time = lambda: self.t

    def tearDown(self):
        chatlist.read_badges, chatlist.read_and_report, chatlist.time.time = self.orig

    def run_check(self, badges, state, cfg):
        chatlist.read_badges = lambda known=(): badges
        chatlist.check(cfg, state, lambda text: self.sent.append(text) or True, lambda m: None, classify=lambda r, m: {})

    def test_flow(self):
        cfg = {"watch_rooms": ["류춘화"], "auto_read": True, "read_quiet_seconds": 60}
        state = {}
        self.run_check({"류춘화": B(1, "a")}, state, cfg)          # 처음: 기억만
        self.assertIsNone(state["badges"]["류춘화"]["since"])
        self.run_check({"류춘화": B(2, "b"), "엄마": B(1, "x")}, state, cfg)  # 늘어남 → since
        self.assertEqual(state["badges"]["류춘화"]["since"], 1000)
        self.assertNotIn("엄마", state["badges"])
        self.assertEqual(self.sent, [])                                # B안이면 바로 알리지 않음
        self.t = 1030
        self.run_check(None, state, cfg)                               # 그대로, 아직 30초
        self.assertEqual(self.calls, [])
        self.t = 1061
        self.run_check(None, state, cfg)                               # 1분 조용 → 연다
        self.assertEqual(self.calls, ["류춘화"])

    def test_owner_read_on_phone_still_reported(self):
        # 사장님이 폰으로 먼저 봐서 배지가 사라져도, 노트북이 아직 안 읽었으면 그래도 연다 (사장님 10/30)
        cfg = {"watch_rooms": ["류춘화"], "auto_read": True, "read_quiet_seconds": 60}
        state = {}
        self.run_check({}, state, cfg)
        self.run_check({"류춘화": B(1, "a")}, state, cfg)
        self.t = 1020
        self.run_check({}, state, cfg)                                 # 배지 사라짐
        self.assertTrue(state["badges"]["류춘화"]["gone"])
        self.assertIsNone(state["badges"]["류춘화"]["box"])
        self.t = 1061
        self.run_check(None, state, cfg)
        self.assertEqual(self.calls, ["류춘화"])

    def test_old_badge_gone_is_forgotten(self):
        cfg = {"watch_rooms": ["류춘화"], "auto_read": True}
        state = {}
        self.run_check({"류춘화": B(1, "a")}, state, cfg)              # 켜기 전부터 있던 배지 (since 없음)
        self.run_check({}, state, cfg)
        self.assertEqual(state["badges"], {})

    def test_auto_read_off_notifies_at_once(self):
        cfg = {"watch_rooms": ["류춘화"], "auto_read": False}
        state = {}
        self.run_check({}, state, cfg)
        self.run_check({"류춘화": B(1, "a")}, state, cfg)
        self.assertEqual(self.sent, ["[카톡] 새 글\n류춘화 방에 새 글 1개"])


if __name__ == "__main__":
    unittest.main()
