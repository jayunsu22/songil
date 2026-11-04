"""💬 비서 카톡 보내기 (11/4) — 윈도우 없이 되는 부분."""
import unittest

import kakao_send
import worklog


class KakaoSendTest(unittest.TestCase):
    def setUp(self):
        self.logged = []
        worklog.add = lambda *a, **k: self.logged.append(a)

    def test_room_of(self):
        cfg = {"client_rooms": {"봄애": "봄애실장님", "류춘화": ["류춘화 사장님"]}}
        self.assertEqual(kakao_send.room_of(cfg, {"room": "김정헌", "client": "봄애"}), "김정헌")
        self.assertEqual(kakao_send.room_of(cfg, {"client": "봄애"}), "봄애실장님")
        self.assertEqual(kakao_send.room_of(cfg, {"client": "류춘화"}), "류춘화 사장님")
        self.assertEqual(kakao_send.room_of(cfg, {"client": "지인인테리어"}), "지인인테리어")

    def test_poll_sends_and_reports(self):
        calls, sent, notes = [], [], []

        def call(body):
            calls.append(body)
            if body["action"] == "take":
                return {"jobs": [{"id": "k1", "client": "류춘화", "text": "좋은 하루 되세요"}, {"id": "k2", "client": "없는방", "text": "안녕"}]}
            return {"ok": True}

        def send(room, text, log):
            sent.append((room, text))
            return (room, "" if room == "류춘화" else "no-room")

        state = {}
        kakao_send.poll({}, state, 1000, call, send, notes.append, lambda m: None)
        self.assertEqual(sent, [("류춘화", "좋은 하루 되세요"), ("없는방", "안녕")])
        results = [c for c in calls if c["action"] == "result"]
        self.assertEqual([(r["id"], r["ok"]) for r in results], [("k1", True), ("k2", False)])
        self.assertIn("못 찾음", results[1]["why"])
        self.assertEqual(len(notes), 1, "실패만 텔레그램")
        kakao_send.poll({}, state, 1010, call, send, notes.append, lambda m: None)
        self.assertEqual(len([c for c in calls if c["action"] == "take"]), 1, "30초 안에는 다시 안 가져감")
