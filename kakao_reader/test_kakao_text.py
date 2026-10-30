import unittest

import kakao_text as kt

SAMPLE = "\r\n".join([
    "[김정헌] [오후 11:58] 날짜 줄 앞이라 날짜를 모름",
    "2026년 10월 29일 목요일",
    "[김정헌] [오후 8:43] 방문3개",
    "부평 삼산동 미래타운 3단지",
    "[김정헌] [오후 8:43] 사진 3장",
    "[고객] [오후 8:44] 네",
    "[고객] [오후 8:44] 네",
    "2026년 10월 30일 금요일",
    "[김정헌] [오전 9:05] 사진",
    "",
])


class ParseTest(unittest.TestCase):
    def test_parse_messages(self):
        msgs = kt.parse(SAMPLE)
        self.assertEqual(len(msgs), 5)
        self.assertEqual(msgs[0], {"date": "2026-10-29", "time": "20:43", "sender": "김정헌",
                                   "text": "방문3개\n부평 삼산동 미래타운 3단지"})
        self.assertEqual(msgs[-1]["date"], "2026-10-30")
        self.assertEqual(msgs[-1]["time"], "09:05")

    def test_midnight_and_noon(self):
        msgs = kt.parse("2026년 1월 2일 금요일\n[a] [오전 12:05] x\n[a] [오후 12:30] y")
        self.assertEqual([m["time"] for m in msgs], ["00:05", "12:30"])
        self.assertEqual(msgs[0]["date"], "2026-01-02")

    def test_photo_count(self):
        self.assertEqual(kt.photo_count("사진 3장"), 3)
        self.assertEqual(kt.photo_count("사진"), 1)
        self.assertEqual(kt.photo_count("사진 찍어 보낼게요"), 0)


class KeyTest(unittest.TestCase):
    def test_same_minute_duplicates_get_different_keys(self):
        msgs = kt.with_keys(kt.parse(SAMPLE))
        keys = [m["key"] for m in msgs]
        self.assertEqual(len(set(keys)), len(keys))

    def test_keys_stable_when_older_history_scrolls_in(self):
        a = kt.with_keys(kt.parse(SAMPLE))
        more = "2026년 10월 28일 수요일\r\n[x] [오후 1:00] 예전 글\r\n" + SAMPLE
        b = kt.with_keys(kt.parse(more))
        self.assertTrue({m["key"] for m in a} <= {m["key"] for m in b})

    def test_key_does_not_contain_text(self):
        m = kt.with_keys(kt.parse(SAMPLE))[0]
        self.assertNotIn("방문", m["key"])
        self.assertEqual(len(m["key"]), 16)


class NewTest(unittest.TestCase):
    def test_new_messages_only(self):
        msgs = kt.with_keys(kt.parse(SAMPLE))
        seen = {m["key"] for m in msgs[:4]}
        self.assertEqual([m["key"] for m in kt.new_messages(msgs, seen)], [m["key"] for m in msgs[4:]])


class MaskTest(unittest.TestCase):
    def test_masks_door_codes(self):
        self.assertEqual(kt.mask("공동현관 비번 1234* 세대 #5678"), "공동현관 비번 ●●●●* 세대 #●●●●")
        self.assertEqual(kt.mask("비밀번호는 0909입니다"), "비밀번호는 ●●●●입니다")

    def test_keeps_ordinary_numbers(self):
        s = "방문3개, 3단지 101동 1203호, 010-1234-5678"
        self.assertEqual(kt.mask(s), s)


class TriggerTest(unittest.TestCase):
    def test_trigger_with_client(self):
        self.assertEqual(kt.trigger_client("견적발행시작 pk디자인"), "pk디자인")
        self.assertEqual(kt.trigger_client(" 견적 발행 시작: 투나 여행 "), "투나 여행")

    def test_trigger_without_client(self):
        self.assertEqual(kt.trigger_client("견적발행시작"), "")

    def test_not_trigger(self):
        self.assertIsNone(kt.trigger_client("방문3개 견적발행시작 해주세요"))
        self.assertIsNone(kt.trigger_client("견적 부탁드려요"))


class ClientTest(unittest.TestCase):
    NAMES = ["PK디자인", "PH인테리어", "투나여행", "업체미확인", "김정헌"]

    def test_ignores_spaces_and_case(self):
        self.assertEqual(kt.match_client("pk 디자인", self.NAMES), ("PK디자인", "같은 이름"))

    def test_alias(self):
        self.assertEqual(kt.match_client("피케이디자인", self.NAMES, {"피케이 디자인": "PK디자인"}), ("PK디자인", "별명"))

    def test_unique_part(self):
        self.assertEqual(kt.match_client("투나", self.NAMES), ("투나여행", "이름 일부"))

    def test_no_guess_on_similar_name(self):
        # ph디자인 은 PK디자인·PH인테리어 어느 쪽인지 모른다 - 짐작하지 않는다
        self.assertEqual(kt.match_client("ph디자인", self.NAMES), ("업체미확인", "못 찾음"))

    def test_empty_goes_to_unknown(self):
        self.assertEqual(kt.match_client("", self.NAMES), ("업체미확인", "이름 없음"))

    def test_client_in_text(self):
        t = "미래타운 3단지 견적 업체는 pk 디자인\n사진 순서대로 1번 방문"
        self.assertEqual(kt.client_in_text(t, self.NAMES), "PK디자인")
        self.assertEqual(kt.client_in_text("방문 3개", self.NAMES), "")
        self.assertEqual(kt.client_in_text("피케이디자인 현장", self.NAMES, {"피케이디자인": "PK디자인"}), "PK디자인")

    def test_no_unknown_vendor(self):
        self.assertEqual(kt.match_client("없는업체", ["PK디자인"]), (None, "못 찾음"))


if __name__ == "__main__":
    unittest.main()
