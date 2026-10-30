"""텔레그램 버튼 (3단계) — 윈도우 없이 되는 부분."""
import unittest

import jobs


def M(text, key):
    return {"time": "06:20", "sender": "류춘화", "text": text, "key": key}


class ButtonsTest(unittest.TestCase):
    def test_kinds(self):
        self.assertEqual(jobs.buttons_for("견적 문의", "ab12cd"),
                         [[{"text": "가견적 발행", "data": "k|ab12cd|pub"}, {"text": "나중에", "data": "k|ab12cd|later"}]])
        self.assertEqual(jobs.buttons_for("일정 변경", "ab12cd"), [[{"text": "확인함", "data": "k|ab12cd|ok"}]])
        self.assertEqual(jobs.buttons_for("분류 실패", "ab12cd"), [[{"text": "확인함", "data": "k|ab12cd|ok"}]])


class NewJobTest(unittest.TestCase):
    def test_keys_only_and_prune(self):
        st = {"jobs": {"old001": {"at": 0}, "new001": {"at": 900000}}}
        job, buttons = jobs.new_job(st, "류춘화", "견적 문의", [M("방문 3개", "a"), M("사진 2장", "b")], 1000000)
        self.assertRegex(job, r"^[a-z0-9]{6}$")
        self.assertEqual(st["jobs"][job], {"title": "류춘화", "kind": "견적 문의", "keys": ["a", "b"], "photos": 2, "at": 1000000})
        self.assertNotIn("old001", st["jobs"])                     # 7일 지난 것은 지움
        self.assertIn("new001", st["jobs"])
        self.assertNotIn("방문", repr(st))                          # 글 내용은 남기지 않는다
        self.assertEqual(buttons[0][0]["data"], "k|%s|pub" % job)

    def test_pick_by_keys(self):
        msgs = [M("옛 글", "x"), M("방문 3개", "a"), M("새 글", "z"), M("사진 2장", "b")]
        self.assertEqual([m["key"] for m in jobs.pick_by_keys(msgs, ["a", "b"])], ["a", "b"])


class PollTest(unittest.TestCase):
    def setUp(self):
        self.ran, self.sent, self.logs = [], [], []

    def poll(self, st, todo):
        jobs.poll({}, st, self.sent.append, self.logs.append, lambda: todo,
                  lambda cfg, state, job, info, notify, log: self.ran.append(job))

    def test_pub_once_and_unknown(self):
        st = {"jobs": {"ab12cd": {"title": "류춘화", "keys": ["a"], "photos": 0, "at": 1}}}
        self.poll(st, [{"job": "ab12cd", "action": "pub"}, {"job": "ab12cd", "action": "pub"}, {"job": "zz99zz", "action": "ok"}])
        self.assertEqual(self.ran, ["ab12cd"])                     # 같은 번호는 한 번만, 확인함은 노트북 일 아님
        self.poll(st, [{"job": "ab12cd", "action": "pub"}])
        self.assertEqual(self.ran, ["ab12cd"])                     # 다음 확인 때도 다시 안 함
        self.poll(st, [{"job": "qq11qq", "action": "pub"}])
        self.assertEqual(len(self.sent), 1)                        # 모르는 번호 → 알림

    def test_fetch_error_logged_once(self):
        def bad():
            raise OSError("down")
        for _ in range(3):
            jobs.poll({}, {}, self.sent.append, self.logs.append, bad, None)
        self.assertEqual(len(self.logs), 1)
        jobs.WARNED["fetch"] = False

    def test_run_error_notified(self):
        st = {"jobs": {"ab12cd": {"title": "류춘화", "keys": ["a"], "photos": 0, "at": 1}}}

        def boom(*a):
            raise RuntimeError("거래처 못 찾음")
        jobs.poll({}, st, self.sent.append, self.logs.append, lambda: [{"job": "ab12cd", "action": "pub"}], boom)
        self.assertIn("거래처 못 찾음", self.sent[0])


if __name__ == "__main__":
    unittest.main()
