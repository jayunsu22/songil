# -*- coding: utf-8 -*-
import unittest

import report


class ReportTest(unittest.TestCase):
    def setUp(self):
        self.sent, self.notes, self.logs = [], [], []

    def send_ok(self, room, text, log):
        self.sent.append((room, text))
        return room, ""

    def test_sends_to_room_every_5_minutes(self):
        st = {}
        fetch = lambda: {"texts": [{"id": "r1", "text": "📋 11/4(화) 업무일정표"}]}
        report.poll({}, st, 1000, fetch, self.send_ok, self.notes.append, self.logs.append)
        self.assertEqual(self.sent, [("김정헌", "📋 11/4(화) 업무일정표")])
        report.poll({}, st, 1100, fetch, self.send_ok, self.notes.append, self.logs.append)   # 5분 안 → 안 가져감
        self.assertEqual(len(self.sent), 1)
        report.poll({"report_room": "나"}, st, 1400, fetch, self.send_ok, self.notes.append, self.logs.append)
        self.assertEqual(self.sent[-1][0], "나")

    def test_failed_send_goes_to_telegram(self):
        report.poll({}, {}, 1000, lambda: {"texts": [{"text": "글"}]}, lambda r, t, l: (r, "no-room"), self.notes.append, self.logs.append)
        self.assertIn("못 올렸습니다", self.notes[0])
        self.assertTrue(self.notes[0].endswith("글"))

    def test_fetch_error_is_quiet(self):
        def boom():
            raise IOError("down")
        report.poll({}, {}, 1000, boom, self.send_ok, self.notes.append, self.logs.append)
        self.assertEqual(self.sent + self.notes, [])


if __name__ == "__main__":
    unittest.main()
