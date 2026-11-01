"""현장 빈칸 채우기 (4단계) — 윈도우 없이 되는 부분."""
import time
import unittest

import gaps
import jobs

SITE = {"id": "s1", "client": "봄애", "name": "그린워크1차 1104동 604호", "date": "2026-11-25",
        "missing": ["pwLobby", "pwUnit", "toilet", "films"]}
CFG = {"client_rooms": {"봄애": "봄애실장님"}}
CHECKS = [{"id": "door", "text": "방문이 상하좌우 문틀에 닿는지", "ok": False},
          {"id": "overlap", "text": "{날짜}에 겹치는 다른 공정", "ok": False},
          {"id": "xmark", "text": "현관문 X 표시 부탁드려요", "ok": True}]


def at_hour(h, ymd=(2026, 11, 2)):  # 기본은 평일(월)
    return time.mktime(ymd + (h, 30, 0, 0, 0, -1))


class TextTest(unittest.TestCase):
    def test_question(self):
        # 번호를 매겨 번호로 답하게 (11/1) — 빈칸 먼저, 그다음 업체 확인 질문, {날짜} 는 시공날짜
        self.assertEqual(gaps.question(dict(SITE, checks=CHECKS)),
                         "안녕하세요. 실장님~\n그린워크1차 1104동 604호 (11/25 시공) 확인 부탁드려요.\n번호로 짧게 답 주시면 됩니다 🙏\n"
                         "1. 공동현관 비번\n2. 세대 비번\n3. 화장실 위치\n4. 필름 번호 (위치별)\n"
                         "5. 방문이 상하좌우 문틀에 닿는지\n6. 11/25에 겹치는 다른 공정\n7. 현관문 X 표시 부탁드려요")
        self.assertEqual(gaps.question(dict(SITE, missing=[], checks=CHECKS[1:2])).splitlines()[3:], ["1. 11/25에 겹치는 다른 공정"])

    def test_ask_text(self):
        self.assertEqual(gaps.ask_text(SITE, "업체(봄애실장님 방)에 물어볼까요?"),
                         "🏠 <b>그린워크1차 1104동 604호</b>\n봄애 · 11/25 시작\n"
                         "공동현관 비번·세대 비번·화장실 위치·필름 정보가 비어 있습니다.\n업체(봄애실장님 방)에 물어볼까요?")
        self.assertTrue(gaps.ask_text(dict(SITE, missing=["pwUnit"])).endswith("세대 비번이 비어 있습니다."))
        self.assertEqual(gaps.ask_text(dict(SITE, missing=[], checks=CHECKS)).splitlines()[2:], ["📋 업체 확인 질문 3개"])

    def test_rooms_for(self):
        self.assertEqual(gaps.rooms_for(CFG, "봄 애"), ["봄애실장님"])
        self.assertEqual(gaps.rooms_for({"client_rooms": {"보람인테리어": "보람"}}, "보람인테리어(인천)"), ["보람"])
        self.assertEqual(gaps.rooms_for({"client_rooms": {"봄애": ["봄애실장님", "봄애대리님"]}}, "봄애"), ["봄애실장님", "봄애대리님"])
        self.assertEqual(gaps.rooms_for(CFG, "pk디자인"), [])
        self.assertEqual(gaps.rooms_for(CFG, ""), [])


class HoursTest(unittest.TestCase):
    def test_weekday_saturday_9_to_20(self):
        self.assertEqual([gaps.in_hours(at_hour(h)) for h in (8, 9, 19, 20)], [False, True, True, False])
        self.assertTrue(gaps.in_hours(at_hour(9, (2026, 11, 7))))               # 토요일도 9시부터

    def test_sunday_holiday_from_13(self):
        for ymd in ((2026, 11, 1), (2026, 12, 25), (2027, 2, 9)):               # 일요일, 성탄절, 설 대체공휴일
            self.assertEqual([gaps.in_hours(at_hour(h, ymd)) for h in (12, 13)], [False, True], ymd)
        self.assertFalse(gaps.in_hours(at_hour(10, (2026, 12, 31)), {"holidays": ["2026-12-31"]}))  # config 임시공휴일
        self.assertTrue(gaps.in_hours(at_hour(10, (2026, 12, 31))))

    def test_config_each_kind(self):
        # config.json alert_hours — 평일·토요일·일요일·공휴일 따로 (사장님 11/1: 시험할 때 일요일 8시부터)
        cfg = {"alert_hours": {"일요일": [8, 20], "토요일": [10, 17]}}
        self.assertTrue(gaps.in_hours(at_hour(8, (2026, 11, 1)), cfg))               # 일요일 8시
        self.assertEqual([gaps.in_hours(at_hour(h, (2026, 11, 7)), cfg) for h in (9, 10, 16, 17)], [False, True, True, False])
        self.assertFalse(gaps.in_hours(at_hour(8, (2026, 11, 2)), cfg))              # 평일은 그대로 9시
        self.assertFalse(gaps.in_hours(at_hour(12, (2026, 12, 25)), cfg))            # 공휴일도 그대로 13시
        self.assertEqual(gaps.alert_hours(at_hour(10), {"alert_hours": {"평일": ["x"]}}), (9, 20))   # 잘못 적으면 기본값
        self.assertEqual([gaps.day_kind(at_hour(10, d)) for d in ((2026, 11, 2), (2026, 11, 7), (2026, 11, 1), (2026, 12, 25))],
                         ["평일", "토요일", "일요일", "공휴일"])


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
        self.assertEqual(buttons, gaps.ask_buttons([("봄애실장님", job)]))
        self.assertEqual([b["text"] for b in buttons[0]], ["시작해", "나중에"])
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

    def test_two_rooms_button_each(self):
        st = {}
        cfg = {"client_rooms": {"봄애": ["봄애실장님", "봄애대리님"]}}
        gaps.check(cfg, st, at_hour(9), lambda: [SITE], self.notify, lambda m: None)
        text, buttons = self.sent[0]
        self.assertIn("어느 방에 물어볼까요?", text)
        self.assertEqual(len(buttons), 1)                                   # 카톡_알림 은 한 줄만
        self.assertEqual([b["text"] for b in buttons[0]], ["봄애실장님", "봄애대리님", "나중에"])
        rooms = [st["jobs"][b["data"].split("|")[1]]["title"] for b in buttons[0][:2]]
        self.assertEqual(rooms, ["봄애실장님", "봄애대리님"])                  # 누른 방에 묻는다

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
        def digest(r, today, sites, msgs, asked=""):
            self.asked = (r, sites, msgs, asked)
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
        self.assertIn("아직 못 받음: 화장실 위치 · 필름 정보", self.sent[0])
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

    def test_check_answers_and_same_numbers(self):
        # 업체 확인 질문의 답 (11/1): 물어본 질문만, 업체가 본 번호 그대로(q) AI 에 보냄, 다 받으면 끝
        site = dict(SITE, missing=["toilet"], checks=CHECKS)
        st = self.st(dict(site, q=gaps.question(site)))
        self.run_answer(st, [
            {"siteId": "s1", "kind": "check", "checkId": "door", "value": "안 닿음"},
            {"siteId": "s1", "kind": "check", "checkId": "nope", "value": "?"},          # 안 물어본 질문은 버림
            {"siteId": "s1", "kind": "check", "checkId": "xmark", "value": " "},
        ])
        self.assertIn("2. 방문이 상하좌우 문틀에 닿는지", self.asked[3])
        self.assertEqual(self.asked[1][0]["checks"][1]["text"], "11/25에 겹치는 다른 공정")
        self.assertEqual([(f["kind"], f["checkId"], f["value"]) for f in self.put[0]], [("check", "door", "안 닿음")])
        self.assertIn("📋 방문이 상하좌우 문틀에 닿는지: 안 닿음", self.sent[0])
        self.assertIn("아직 못 받음: 화장실 위치 · 11/25에 겹치는 다른 공정 · 현관문 X 표시 부탁드려요", self.sent[0])
        left = st["asks"]["봄애실장님"][0]
        self.assertEqual(([c["id"] for c in left["checks"]], left["missing"]), (["overlap", "xmark"], ["toilet"]))
        self.run_answer(st, [{"siteId": "s1", "kind": "check", "checkId": "overlap", "value": "도배 24일까지"}])
        self.assertIn("2. 방문이 상하좌우 문틀에 닿는지", self.asked[3])                 # 남은 질문이 줄어도 번호는 처음 그대로
        self.run_answer(st, [{"siteId": "s1", "kind": "check", "checkId": "xmark", "value": "확답 받음"},
                             {"siteId": "s1", "kind": "field", "field": "toilet", "value": "1층"}])
        self.assertNotIn("봄애실장님", st["asks"])

    def test_check_only_site_is_asked(self):
        sent = []
        gaps.check(CFG, {}, at_hour(10), lambda: [dict(SITE, missing=[], checks=CHECKS)], lambda t, b=None: sent.append(t) or True, lambda m: None)
        self.assertEqual(len(sent), 1)                                                  # 빈칸이 없어도 확인 질문이 있으면 묻는다
        sent.clear()
        gaps.check(CFG, {}, at_hour(10), lambda: [dict(SITE, missing=[], checks=[])], lambda t, b=None: sent.append(t) or True, lambda m: None)
        self.assertEqual(sent, [])

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

class FilmOrderTest(unittest.TestCase):
    """필름 주문 알림 (사장님 11/1): 시공 5일 전, 현장마다 한 번, 앱 필름 탭 링크."""
    O = {"id": "s1", "client": "봄애", "name": "평창팬션작업", "date": "2026-11-08", "stage": 1,
         "films": [{"code": "pwt1200", "qty": "1롤"}, {"code": "pwe1501-2", "qty": ""}]}

    def test_text(self):
        r = gaps.order_text(self.O, {}, at_hour(10, (2026, 11, 3)))
        self.assertEqual(r.splitlines(), [
            "🎞 <b>필름 주문할 때입니다 · 평창팬션작업</b>", "봄애 · 11/8 시작 (D-5)",
            "pwt1200 1롤", "pwe1501-2 (필요량 미정)", "❓ 필요량을 골라 주세요",
            '<a href="https://jayunsu22.github.io/sitenote/#site/s1/film">👉 앱에서 문자 보내기</a>'])
        self.assertIn("필름 번호가 아직 없습니다", gaps.order_text(dict(self.O, films=[]), {}, at_hour(10)))

    def test_once_per_site_with_check(self):
        sent, st = [], {}
        fetch = lambda: {"sites": [], "orders": [self.O]}
        gaps.check({}, st, at_hour(10), fetch, lambda t, b=None: sent.append(t) or True, lambda m: None)
        gaps.check({}, st, at_hour(12), fetch, lambda t, b=None: sent.append(t) or True, lambda m: None)
        self.assertEqual(len(sent), 1)
        self.assertIn("필름 주문할 때입니다", sent[0])
        gaps.check({}, {}, at_hour(10), lambda: [], lambda t, b=None: sent.append(t) or True, lambda m: None)   # 옛 모양(목록)도 됨


class ReaskTest(unittest.TestCase):
    """못 받은 답 다시 묻기 (사장님 11/1): 3시간 뒤, 18시 넘으면 다음 날 9시(일·공휴일 13시), 남은 것만 1번부터, 3번까지."""

    def test_reask_at(self):
        T = lambda h, ymd=(2026, 11, 2), m=0: time.mktime(ymd + (h, m, 0, 0, 0, -1))
        self.assertEqual(gaps.reask_at(T(10)), T(13))                              # 월 10시 → 13시
        self.assertEqual(gaps.reask_at(T(14, m=30)), T(17, m=30))                  # 17:30 은 아직 됨
        self.assertEqual(gaps.reask_at(T(15)), T(9, (2026, 11, 3)))               # 18시 → 다음 날 9시
        self.assertEqual(gaps.reask_at(T(17)), T(9, (2026, 11, 3)))               # 20시 → 다음 날 9시
        self.assertEqual(gaps.reask_at(T(17, (2026, 11, 7))), T(13, (2026, 11, 8)))  # 토 → 일요일은 13시
        self.assertEqual(gaps.reask_at(T(6)), T(9))                                # 새벽 → 9시
        cfg = {"reask": {"간격": 1, "끝": 20}, "alert_hours": {"일요일": [8, 20]}}     # config 로 간격·끝·시작 바꿈
        self.assertEqual(gaps.reask_at(T(18), cfg), T(19))
        self.assertEqual(gaps.reask_at(T(19, (2026, 11, 7)), cfg), T(8, (2026, 11, 8)))

    def entry(self, **kw):
        site = dict(SITE, checks=CHECKS)
        e = dict(site, at=0, q=gaps.question(site), items=gaps.item_numbers(site), last=0, tries=0)
        e.update(missing=["toilet"], checks=CHECKS[1:2])           # 3번·6번만 남음
        e.update(kw)
        return e

    def test_text_renumbers_from_one(self):
        # 사장님 11/1: 남은 것만 1번부터, 부탁하는 말로
        self.assertEqual(gaps.reask_text(self.entry(checks=CHECKS[1:])),
                         "실장님.. 궁금한거 있어서 연락드려요\n그린워크1차 1104동 604호 (11/25 시공)\n"
                         "1. 화장실 위치 부탁드려요\n2. 11/25에 겹치는 다른 공정 부탁드려요\n3. 현관문 X 표시 부탁드려요")

    def run_reask(self, st, now, ok=True):
        self.sends, self.sent = getattr(self, "sends", []), getattr(self, "sent", [])
        gaps.reask({}, st, now, lambda room, text, log: (self.sends.append((room, text)) or room, "" if ok else "send"),
                   self.sent.append, lambda m: None)

    def test_flow_three_times_then_tell_owner(self):
        mon = lambda h: time.mktime((2026, 11, 2, h, 0, 0, 0, 0, -1))
        st = {"asks": {"봄애실장님": [self.entry(last=mon(9))]}}
        self.run_reask(st, mon(11))
        self.assertEqual(self.sends, [])                                            # 3시간 안 됨
        self.run_reask(st, mon(12))
        self.assertEqual(len(self.sends), 1)
        self.assertIn("1. 화장실 위치 부탁드려요", self.sends[0][1])
        e = st["asks"]["봄애실장님"][0]
        self.assertEqual((e["tries"], e["last"], e["q"], e["thanked"]), (1, mon(12), self.sends[0][1], False))   # 새 번호를 AI 에
        self.run_reask(st, mon(15))
        self.run_reask(st, mon(17))                                                 # 15+3=18시 → 다음 날 9시
        self.assertEqual(len(self.sends), 2)
        self.run_reask(st, mon(9) + 86400)
        self.assertEqual(len(self.sends), 3)
        self.run_reask(st, mon(12) + 86400)
        self.assertEqual(len(self.sends), 3)                                        # 3번 넘으면 안 보냄
        self.assertIn("업체 답이 없습니다", self.sent[0])
        self.run_reask(st, mon(16) + 86400)
        self.assertEqual(len(self.sent), 1)                                         # 알림도 한 번만

    def test_skip_past_or_failed_send(self):
        mon = lambda h: time.mktime((2026, 11, 2, h, 0, 0, 0, 0, -1))
        st = {"asks": {"봄애실장님": [self.entry(date="2026-11-01")]}}
        self.run_reask(st, mon(11))
        self.assertEqual(self.sends, [])                                            # 시공일 지난 현장
        st = {"asks": {"봄애실장님": [self.entry(last=mon(9))]}}
        self.run_reask(st, mon(12), ok=False)
        e = st["asks"]["봄애실장님"][0]
        self.assertEqual((e["tries"], e["last"]), (0, mon(12)))                     # 못 보내도 3시간 뒤 다시
        st = {"asks": {"봄애실장님": [dict(self.entry(), missing=[], checks=[])]}}
        self.sends = []
        self.run_reask(st, mon(11))
        self.assertEqual(self.sends, [])                                            # 남은 게 없음

    def test_answer_resets_timer(self):
        st = {"asks": {"봄애실장님": [self.entry(last=0)]}}
        gaps.on_answer(CFG, st, "봄애실장님", [M("잠시만요")], lambda *a: {"items": []}, lambda f: None, lambda t: None, lambda m: None)
        self.assertGreater(st["asks"]["봄애실장님"][0]["last"], time.time() - 5)

    def test_thanks_once_per_round(self):
        # 업체가 답하면 바로 '감사합니다~' (사장님 11/1) — 묻기 한 번에 한 번, 다시 물으면 또 한 번
        st, sends = {"asks": {"봄애실장님": [self.entry()]}}, []
        send = lambda room, text, log: (sends.append((room, text)) or room, "")
        ans = lambda: gaps.on_answer(CFG, st, "봄애실장님", [M("잠시만요")], lambda *a: {"items": []}, lambda f: None,
                                     lambda t: None, lambda m: None, send)
        ans(); ans()
        self.assertEqual(sends, [("봄애실장님", gaps.THANKS)])
        st["asks"]["봄애실장님"][0]["thanked"] = False                               # 다시 물은 뒤
        ans()
        self.assertEqual(len(sends), 2)

    def test_film_confirmed_message(self):
        # 업체 답으로 필름 번호가 들어오면 '필름 넘버가 확정되었습니다' (사장님 11/1)
        st, sent = {"asks": {"봄애실장님": [self.entry(missing=["films"], checks=[])]}}, []
        items = [{"siteId": "s1", "kind": "films", "films": [{"place": "전체", "code": "ps170"}, {"place": "현관문", "code": "px450"}]}]
        gaps.on_answer(CFG, st, "봄애실장님", [M("4번 전체 ps170")], lambda *a: {"items": items}, lambda f: None,
                       sent.append, lambda m: None)
        film = [t for t in sent if "필름 넘버가 확정되었습니다" in t]
        self.assertEqual(len(film), 1)
        self.assertIn("전체 ps170 / 현관문 px450", film[0])
        self.assertIn("수량을 표시해주시면 주문을 넣도록 하겠습니다.", film[0])
        self.assertIn("#site/s1/film", film[0])


if __name__ == "__main__":
    unittest.main()
