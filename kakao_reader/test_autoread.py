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
