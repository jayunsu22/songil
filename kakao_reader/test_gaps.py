"""현장 빈칸 채우기 (4단계) — 윈도우 없이 되는 부분."""
import time
import unittest

import gaps
import jobs

SITE = {"id": "s1", "client": "봄애", "name": "그린워크1차 1104동 604호", "date": "2026-11-25",
        "missing": ["pwLobby", "pwUnit", "toilet", "films"]}
CFG = {"client_rooms": {"봄애": "봄애실장님"}}


def at_hour(h):
    lt = time.localtime()
    return time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, h, 30, 0, 0, 0, -1))


class TextTest(unittest.TestCase):
    def test_question(self):
        self.assertEqual(gaps.question(SITE),
                         "안녕하세요. 실장님~\n그린워크1차 1104동 604호 (11/25 시공)\n"
                         "공동현관 비번, 세대 비번, 화장실 위치, 필름 정보(위치별 번호) 알려주세요.")
        self.assertEqual(gaps.question(dict(SITE, missing=["toilet"])).splitlines()[-1], "화장실 위치 알려주세요.")

    def test_ask_text(self):
        self.assertEqual(gaps.ask_text(SITE), "[현장] 그린워크1차 1104동 604호 (봄애, 11/25 시작)\n"
                                              "공동현관 비번·세대 비번·화장실 위치·필름 정보가 비어 있습니다.")
        self.assertTrue(gaps.ask_text(dict(SITE, missing=["pwUnit"])).endswith("세대 비번이 비어 있습니다."))

    def test_room_for(self):
        self.assertEqual(gaps.room_for(CFG, "봄 애"), "봄애실장님")
        self.assertEqual(gaps.room_for({"client_rooms": {"보람인테리어": "보람"}}, "보람인테리어(인천)"), "보람")
        self.assertIsNone(gaps.room_for(CFG, "pk디자인"))
        self.assertIsNone(gaps.room_for(CFG, ""))


class CheckTest(unittest.TestCase):
    def setUp(self):
        self.sent, self.fetched = [], 0

    def fetch(self):
        self.fetched += 1
        return [SITE, dict(SITE, id="s2", client="모르는업체", name="투나여행")]

    def notify(self, text, buttons=None):
        self.sent.append((text, buttons))
        return True

    def test_once_per_site_and_hours(self):
        st = {}
        gaps.check(CFG, st, at_hour(7), self.fetch, self.notify, lambda m: None)
        self.assertEqual(self.fetched, 0)                                   # 8시 전엔 안 봄
        gaps.check(CFG, st, at_hour(9), self.fetch, self.notify, lambda m: None)
        self.assertEqual(len(self.sent), 2)
        text, buttons = self.sent[0]
        self.assertIn("봄애실장님 방", text)
        job = buttons[0][0]["data"].split("|")[1]
        self.assertEqual(buttons, gaps.ask_buttons(job))
        self.assertEqual(st["jobs"][job]["kind"], "빈칸")
        self.assertEqual(st["jobs"][job]["title"], "봄애실장님")
        self.assertIsNone(self.sent[1][1])                                  # 방 짝 없음 → 버튼 없이
        self.assertIn("client_rooms", self.sent[1][0])
        gaps.check(CFG, st, at_hour(9) + 100, self.fetch, self.notify, lambda m: None)
        self.assertEqual(self.fetched, 1)                                   # 1시간마다
        gaps.check(CFG, st, at_hour(11), self.fetch, self.notify, lambda m: None)
        self.assertEqual(self.fetched, 2)
        self.assertEqual(len(self.sent), 2)                                 # 현장당 한 번만
        gaps.check(CFG, st, at_hour(21), self.fetch, self.notify, lambda m: None)
        self.assertEqual(self.fetched, 2)                                   # 20시 뒤엔 안 봄

    def test_failed_notify_retries(self):
        st = {}
        gaps.check(CFG, st, at_hour(9), self.fetch, lambda t, b=None: False, lambda m: None)
        gaps.check(CFG, st, at_hour(11), self.fetch, self.notify, lambda m: None)
        self.assertEqual(len(self.sent), 2)

    def test_fetch_error(self):
        logs = []

        def bad():
            raise OSError("down")
        gaps.check(CFG, {}, at_hour(9), bad, self.notify, logs.append)
        self.assertIn("빈칸 확인 실패", logs[0])


class PollAskTest(unittest.TestCase):
    def test_ask_dispatched(self):
        st = {}
        job = jobs.new_ask_job(st, "봄애실장님", SITE, time.time())
        ran = []
        jobs.poll({}, st, lambda t: None, lambda m: None, lambda: [{"job": job, "action": "ask"}, {"job": job, "action": "ask"}],
                  {"pub": None, "ask": lambda cfg, state, j, info, notify, log: ran.append(info["site"]["id"])})
        self.assertEqual(ran, ["s1"])


def M(text, sender="봄애실장님"):
    return {"date": "2026-11-01", "time": "10:00", "sender": sender, "text": text, "key": text}


class AnswerTest(unittest.TestCase):
    def setUp(self):
        self.sent, self.put, self.asked = [], [], None

    def run_answer(self, st, items, room="봄애실장님"):
        def digest(r, today, sites, msgs):
            self.asked = (r, sites, msgs)
            return {"ok": True, "items": items}
        gaps.on_answer(CFG, st, room, [M("공동현관 #1234* 세대 5678")], digest, self.put.append, self.sent.append, lambda m: None)

    def st(self, *sites):
        return {"asks": {"봄애실장님": [dict(s, at=time.time()) for s in sites]}}

    def test_fill_and_keep_rest(self):
        st = self.st(SITE)
        self.run_answer(st, [
            {"siteId": "s1", "kind": "field", "field": "pwLobby", "value": "#1234*"},
            {"siteId": "", "kind": "field", "field": "pwUnit", "value": "5678"},         # 현장 하나면 그 현장
            {"siteId": "s1", "kind": "field", "field": "parking", "value": "지하"},       # 안 물어본 칸은 안 넣음
            {"siteId": "s1", "kind": "as", "value": "문 찍힘"},
        ])
        self.assertEqual([(f["field"], f["value"]) for f in self.put[0]], [("pwLobby", "#1234*"), ("pwUnit", "5678")])
        self.assertEqual(self.asked[2][0]["text"], "공동현관 #1234* 세대 5678")          # 이 경우 비번 안 가림
        self.assertIn("공동현관 비번: #1234*", self.sent[0])
        self.assertIn("아직 못 받음: 화장실 위치·필름 정보", self.sent[0])
        self.assertEqual(st["asks"]["봄애실장님"][0]["missing"], ["toilet", "films"])
        self.assertNotIn("1234", repr(st))                                             # 비번은 state 에 안 남음

    def test_two_sites_match_by_id_and_finish(self):
        other = dict(SITE, id="s2", name="그린워크1차 1102동 101호", missing=["films"])
        st = self.st(dict(SITE, missing=["toilet"]), other)
        self.run_answer(st, [
            {"siteId": "", "kind": "field", "field": "toilet", "value": "1층"},           # 현장 둘인데 모름 → 버림
            {"siteId": "s2", "kind": "films", "films": [{"place": "방문", "code": "PS010"}, {"place": "몰딩", "code": ""}]},
        ])
        self.assertEqual(self.put[0], [{"siteId": "s2", "kind": "films", "films": [{"place": "방문", "code": "PS010"}],
                                        "room": "봄애실장님", "at": time.strftime("%Y-%m-%d")}])
        self.assertEqual([s["id"] for s in st["asks"]["봄애실장님"]], ["s1"])
        self.run_answer(st, [{"siteId": "s1", "kind": "field", "field": "toilet", "value": "1층"}])
        self.assertNotIn("봄애실장님", st["asks"])                                      # 다 받으면 끝

    def test_not_asked_room_or_nothing(self):
        st = self.st(SITE)
        self.run_answer(st, [{"siteId": "s1", "kind": "field", "field": "toilet", "value": "1층"}], room="pk디자인")
        self.assertIsNone(self.asked)
        self.run_answer(st, [])
        self.assertEqual(self.put, [])
        self.assertEqual(self.sent, [])

    def test_put_error_notified(self):
        st = self.st(SITE)

        def bad(f):
            raise OSError("down")
        gaps.on_answer(CFG, st, "봄애실장님", [M("화장실 1층")], lambda *a: {"items": [{"siteId": "s1", "kind": "field", "field": "toilet", "value": "1층"}]},
                       bad, self.sent.append, lambda m: None)
        self.assertIn("못 넣었습니다", self.sent[0])
        self.assertEqual(st["asks"]["봄애실장님"][0]["missing"], SITE["missing"])        # 다음 답 때 다시

    def test_watch_extra_prunes(self):
        st = {"asks": {"봄애실장님": [dict(SITE, at=0)], "pk": [dict(SITE, at=time.time())]}}
        self.assertEqual(gaps.watch_extra(st, time.time()), ["pk"])
        self.assertNotIn("봄애실장님", st["asks"])


if __name__ == "__main__":
    unittest.main()
