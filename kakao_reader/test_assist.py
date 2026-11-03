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


if __name__ == "__main__":
    unittest.main()
