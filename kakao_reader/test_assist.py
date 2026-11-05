"""🤖 능동 비서 (11/4) — 윈도우 없이 되는 부분. 현장·비번은 지어낸 것."""
import time
import unittest

import assist

CFG = {"client_rooms": {"가인테리어": ["가인테리어 실장님"]}, "my_names": ["김정헌"]}
NEW = [{"date": "11/4", "time": "14:10", "sender": "가실장", "text": "하늘마을 공현 *1234#"}]


def at_hour(h):
    return time.mktime((2026, 11, 4, h, 30, 0, 0, 0, -1))


class Box:
    def __init__(self, res):
        self.res, self.calls, self.puts, self.inbox, self.notes, self.queued, self.logs = res, [], [], [], [], [], []

    def run(self, state=None, msgs=None, h=14, cfg=CFG, room="가인테리어 실장님"):
        state = state if state is not None else {}
        assist.handle(cfg, state, room, NEW, msgs if msgs is not None else NEW,
                      lambda b: (self.calls.append(b), self.res)[1], self.puts.append, self.inbox.append,
                      lambda t, buttons=None: self.notes.append((str(t), buttons)), self.logs.append,
                      now=at_hour(h), queue=lambda st, r, t, n: self.queued.append((r, t)))
        return state


FILL = {"siteId": "s1", "name": "하늘마을 3단지", "date": "2026-11-25", "kind": "field", "field": "pwLobby",
        "value": "*1234#", "label": "공동현관 비번", "update": False}


class HandleTest(unittest.TestCase):
    def test_client_of(self):
        self.assertEqual(assist.client_of(CFG, "가인테리어 실장님"), "가인테리어")
        self.assertEqual(assist.client_of(CFG, "모르는 방"), "")

    def test_sure_fill_and_auto_reply(self):
        b = Box({"ok": True, "fills": [FILL], "reply": {"text": "네~ 받았어요👍", "type": "ack", "auto": True}})
        b.run()
        self.assertEqual(b.calls[0]["client"], "가인테리어")
        self.assertEqual(b.puts, [[{"siteId": "s1", "kind": "field", "room": "가인테리어 실장님", "at": "2026-11-04",
                                    "field": "pwLobby", "value": "*1234#"}]])
        self.assertIn("하늘마을 3단지 앱에 넣었어요", b.notes[0][0])
        self.assertEqual(b.queued, [("가인테리어 실장님", "네~ 받았어요👍")])

    def test_film_change_only_notifies(self):
        f = dict(FILL, kind="films", films=[{"place": "거실", "code": "BB2"}], update=True)
        b = Box({"ok": True, "fills": [f]})
        b.run()
        self.assertEqual(b.puts, [])
        self.assertIn("필름 번호 변경 요청", b.notes[0][0])

    def test_unsure_and_pay_go_to_inbox(self):
        pick = {"kind": "field", "field": "pwLobby", "value": "#4321", "label": "공동현관 비번", "quote": "공현 #4321",
                "cands": [{"id": "s2", "name": "푸른숲", "date": "2026-11-05"}]}
        b = Box({"ok": True, "picks": [pick], "pays": [{"siteId": "s4", "name": "끝난현장", "quote": "잔금 넣었어요"}]})
        b.run()
        items = b.inbox[0]
        self.assertEqual([i["kind"] for i in items], ["pick", "pay"])
        self.assertEqual(items[0]["fills"], [{"siteId": "", "kind": "field", "room": "가인테리어 실장님", "at": "2026-11-04",
                                             "field": "pwLobby", "value": "#4321"}])
        self.assertIn("결재함에 올렸어요", b.notes[0][0])

    def test_risky_reply_becomes_draft(self):
        b = Box({"ok": True, "reply": {"text": "오전에 끝나요", "type": "commit", "auto": False, "why": "AI 가 확인 필요로 봄"}})
        st = b.run()
        self.assertEqual(b.queued, [])
        text, buttons = b.notes[0]
        self.assertIn("「오전에 끝나요」", text)
        job = buttons[0][0]["data"].split("|")[1]
        self.assertEqual(st["jobs"][job]["kind"], "답장")
        self.assertNotIn("text", st["jobs"][job])   # 글 내용은 state 에 안 남김
        sent = []
        assist.run_send({}, st, job, st["jobs"][job], lambda t: sent.append(t), lambda m: None,
                        send=lambda r, t, log: (sent.append((r, t)), (r, ""))[1])
        self.assertEqual(sent[0], ("가인테리어 실장님", "오전에 끝나요"))
        notes = []
        assist.run_send({}, st, job, st["jobs"][job], notes.append, lambda m: None, send=lambda r, t, log: (r, ""))
        self.assertIn("초안이 없습니다", notes[0])

    def test_night_auto_reply_is_draft(self):
        b = Box({"ok": True, "reply": {"text": "네~ 받았어요", "type": "ack", "auto": True}})
        b.run(h=23)
        self.assertEqual(b.queued, [])
        self.assertIn("밤이라", b.notes[0][0])

    def test_owner_already_answered(self):
        b = Box({"ok": True, "reply": {"text": "네~", "type": "ack", "auto": True}})
        b.run(msgs=NEW + [{"date": "11/4", "time": "14:11", "sender": "김정헌", "text": "네 감사해요"}])
        self.assertEqual((b.queued, b.notes), ([], []))

    def test_asked_room_is_left_to_gaps(self):
        b = Box({"ok": True})
        b.run(state={"asks": {"가인테리어 실장님": [{"id": "s1"}]}})
        self.assertEqual(b.calls, [])
        b.run(cfg=dict(CFG, assist=False))
        self.assertEqual(b.calls, [])

    def test_ai_failure_is_quiet(self):
        b = Box({"ok": False})
        b.run()
        self.assertEqual((b.puts, b.notes), ([], []))


class CustomerRoomTest(unittest.TestCase):
    WATCH = {"siteId": "s1", "name": "하늘마을", "until": "2026-11-08", "keys": ["pwLobby", "pwUnit", "parking"]}

    def test_watch_lasts_until_date(self):
        st = {}
        assist.watch_room(st, "이다라", self.WATCH, at_hour(14))
        self.assertEqual(st["cust_watch"]["이다라"]["keys"], ["pwLobby", "pwUnit"])  # 비서가 못 넣는 칸은 안 셈
        self.assertEqual(assist.watch_rooms(st, at_hour(14)), ["이다라"])
        st["cust_watch"]["이다라"]["until"] = "2026-11-03"
        self.assertEqual(assist.watch_rooms(st, at_hour(14)), [])

    def test_site_hint_and_remaining(self):
        st = {}
        assist.watch_room(st, "가인테리어 실장님", self.WATCH, at_hour(14))
        b = Box({"ok": True, "fills": [FILL]})
        b.run(state=st)
        self.assertEqual((b.calls[0]["client"], b.calls[0]["siteId"]), ("개인고객", "s1"))
        text, buttons = b.notes[-1]
        self.assertIn("아직 못 받음", text)
        self.assertIn("세대 비번", text)
        self.assertTrue(buttons[0][0]["data"].endswith("|ra"))
        self.assertEqual(st["cust_watch"]["가인테리어 실장님"]["keys"], ["pwUnit"])
        # 값이 없는 글에는 안 조른다
        b2 = Box({"ok": True})
        b2.run(state=st)
        self.assertEqual(b2.notes, [])

    def test_reask(self):
        st = {}
        assist.watch_room(st, "이다라", self.WATCH, at_hour(14))
        assist.run_reask({}, st, "j", {"title": "이다라"}, None, None)
        cw = st["cust_watch"]["이다라"]
        sent = []
        send = lambda r, t, log: (sent.append((r, t)), (r, ""))[1]
        cw["reask_at"] = at_hour(15)
        assist.reask_due(st, at_hour(14), send, lambda t: None, lambda m: None)
        self.assertEqual(sent, [])          # 아직
        cw["reask_at"] = at_hour(14)
        assist.reask_due(st, at_hour(23), send, lambda t: None, lambda m: None)
        self.assertEqual(sent, [])          # 밤엔 미룸
        assist.reask_due(st, at_hour(14), send, lambda t: None, lambda m: None)
        self.assertEqual(sent[0][0], "이다라")
        self.assertIn("공동현관 비번 알려주세요", sent[0][1])
        assist.reask_due(st, at_hour(14), send, lambda t: None, lambda m: None)
        self.assertEqual(len(sent), 1)      # 한 번만


class FeedTest(unittest.TestCase):
    def setUp(self):
        self.sent = []
        self.saved = assist.worklog.feed
        assist.worklog.feed = lambda *a: self.sent.append(a)

    def tearDown(self):
        assist.worklog.feed = self.saved

    def test_fill_goes_to_chat_without_value(self):
        Box({"ok": True, "fills": [FILL]}).run()
        room, site, name, msgs, lines, left = self.sent[0]
        self.assertEqual((room, site, name, lines), ("가인테리어 실장님", "s1", "하늘마을 3단지", ["공동현관 비번 넣음"]))
        self.assertNotIn("*1234#", " ".join(lines))

    def test_small_talk_stays_out(self):
        Box({"ok": True, "reply": {"text": "네~", "type": "ack", "auto": True}}).run()
        self.assertEqual(self.sent, [])

    def test_watched_customer_room_always_shows(self):
        st = {}
        assist.watch_room(st, "가인테리어 실장님", {"siteId": "s1", "name": "하늘", "until": "2026-11-08", "keys": ["pwUnit"]}, at_hour(14))
        Box({"ok": True}).run(state=st)
        self.assertEqual(self.sent[0][5], ["세대 비번"])


class ExactSendTest(unittest.TestCase):
    def setUp(self):
        import chatlist
        import kakao_window
        self.saved = (kakao_window.find_room, kakao_window.send_text, kakao_window.close_window, chatlist.refresh_geom, chatlist.open_room, chatlist.search_open)
        self.sent, self.closed = [], []
        kakao_window.find_room = lambda r: (0, 0)
        kakao_window.send_text = lambda r, t: (self.sent.append(r), True)[1]
        kakao_window.close_window = lambda h: self.closed.append(h)
        chatlist.refresh_geom = lambda: None
        self.cl, self.kw = chatlist, kakao_window

    def tearDown(self):
        self.kw.find_room, self.kw.send_text, self.kw.close_window, self.cl.refresh_geom, self.cl.open_room, self.cl.search_open = self.saved

    def test_similar_room_is_not_used(self):
        import report
        self.cl.open_room = lambda r, b, log: (7, "이다라 어머니")   # 비슷한 방
        self.cl.search_open = lambda r, log: 0
        self.assertEqual(report.send_exact("이다라", "글", lambda m: None), ("이다라", "no-room"))
        self.assertEqual((self.sent, self.closed), ([], [7]))

    def test_list_then_search(self):
        import report
        self.cl.open_room = lambda r, b, log: (0, None)
        self.cl.search_open = lambda r, log: 9
        self.assertEqual(report.send_exact("이다라", "글", lambda m: None), ("이다라", ""))
        self.assertEqual((self.sent, self.closed), (["이다라"], [9]))


if __name__ == "__main__":
    unittest.main()
