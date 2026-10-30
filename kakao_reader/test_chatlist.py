import unittest

from PIL import Image, ImageDraw

import chatlist

RED = (255, 80, 60)


class ParseOcrTest(unittest.TestCase):
    def test_files_and_lines(self):
        out = "#FILE a.png\n10 20 100 18\tpk디자인\n200 20 50 14\t오후 3:12\n#FILE b.png\n5 5 10 12\t3\n"
        got = chatlist.parse_ocr(out)
        self.assertEqual(got["a.png"][0], (10, 20, 100, 18, "pk디자인"))
        self.assertEqual(len(got["a.png"]), 2)
        self.assertEqual(got["b.png"], [(5, 5, 10, 12, "3")])


class CountTest(unittest.TestCase):
    def test_digits(self):
        self.assertEqual(chatlist.parse_count("3"), 3)
        self.assertEqual(chatlist.parse_count("1 2"), 12)
        self.assertEqual(chatlist.parse_count("l"), 1)  # OCR 이 1 을 l 로 읽음
        self.assertEqual(chatlist.parse_count("999+"), 999)
        self.assertIsNone(chatlist.parse_count(""))
        self.assertIsNone(chatlist.parse_count("가"))


class BadgeTest(unittest.TestCase):
    def test_finds_red_circle_only_badge_sized(self):
        img = Image.new("RGB", (400, 300), "white")
        d = ImageDraw.Draw(img)
        d.ellipse((350, 40, 370, 60), fill=RED)       # 배지
        d.rectangle((0, 200, 399, 299), fill=RED)     # 큰 빨간 띠 (배지 아님)
        d.ellipse((350, 120, 352, 122), fill=RED)     # 점 (배지 아님)
        self.assertEqual(chatlist.find_badges(img, (0, 0, 400, 190)), [(350, 40, 370, 60)])


class RowNameTest(unittest.TestCase):
    def test_name_is_top_left_line_of_row(self):
        lines = [
            (60, 10, 120, 18, "pk디자인"),
            (60, 34, 200, 16, "내일 시공 가능할까요"),
            (330, 10, 60, 14, "오후 3:12"),          # 시간 (오른쪽)
            (60, 80, 100, 18, "엄마"),
            (60, 104, 100, 16, "밥 먹었니"),
        ]
        self.assertEqual(chatlist.row_name(lines, (350, 34, 366, 50), list_w=400), "pk디자인")
        self.assertEqual(chatlist.row_name(lines, (350, 104, 366, 120), list_w=400), "엄마")
        self.assertIsNone(chatlist.row_name(lines, (350, 200, 366, 216), list_w=400))


class CleanNameTest(unittest.TestCase):
    def test_icons_and_member_count(self):
        # 10/30 노트북 실제 OCR 결과
        self.assertEqual(chatlist.clean_name("류춘화 ' ,"), "류춘화")
        self.assertEqual(chatlist.clean_name("0 매드센스 티스토리 구글블로그 정보공유 2..."), "매드센스 티스토리 구글블로그 정보공유 2...")
        self.assertEqual(chatlist.clean_name("0삼산미래Et운3단지(2 169 %"), "삼산미래Et운3단지(2")
        self.assertEqual(chatlist.clean_name("개시노트 %"), "개시노트")
        self.assertEqual(chatlist.clean_name("0 [네이터팝콘1 Agentic 시 자동화 거유니El 928 %"), "[네이터팝콘1 Agentic 시 자동화 거유니El")
        self.assertEqual(chatlist.clean_name("쿠팡이츠"), "쿠팡이츠")
        self.assertEqual(chatlist.clean_name("pk디자인2"), "pk디자인2")


class ExcludeTest(unittest.TestCase):
    def test_space_case_and_truncation(self):
        ex = ["가족 방", "PK디자인"]
        self.assertTrue(chatlist.excluded("가족방", ex))
        self.assertTrue(chatlist.excluded("pk 디자인", ex))
        self.assertTrue(chatlist.excluded("가족 방 단톡…", ex))
        self.assertFalse(chatlist.excluded("가구점", ex))
        self.assertFalse(chatlist.excluded(None, ex))
        self.assertTrue(chatlist.excluded("한솔인테리어 김싷장", ["한솔인테리어 김실장"]))  # OCR 한 글자 틀림

    def test_watch_list_contains(self):
        w = ["pk디자인", "한솔"]
        self.assertTrue(chatlist.watched("PK 디자인", w))
        self.assertTrue(chatlist.watched("한솔인테리어 김실장", w))
        self.assertTrue(chatlist.watched("부평 한솔", w))       # 중간에 들어 있어도
        self.assertFalse(chatlist.watched("엄마", w))
        self.assertFalse(chatlist.watched(None, w))
        self.assertTrue(chatlist.watched("엄마", []))           # 비어 있으면 모든 방

    def test_match_names(self):
        prev = {"한솔인테리어 김실장": 1}
        self.assertEqual(list(chatlist.match_names(prev, {"한솔인테리어 김싷장": 2, "엄마": 1})), ["한솔인테리어 김실장", "엄마"])


def B(n, fp):
    return {"n": n, "fp": fp}


class DiffTest(unittest.TestCase):
    def test_only_new_or_more(self):
        prev = {"pk디자인": B(2, "a"), "한솔": B(1, "b")}
        now = {"pk디자인": B(3, "c"), "한솔": B(1, "b"), "투나": B(5, "d")}
        self.assertEqual(chatlist.news(prev, now), [("pk디자인", 1, 3), ("투나", 5, 5)])

    def test_unknown_count_uses_badge_shape(self):
        self.assertEqual(chatlist.news({}, {"pk": B(None, "a")}), [("pk", None, None)])
        self.assertEqual(chatlist.news({"pk": B(None, "a")}, {"pk": B(None, "a")}), [])
        self.assertEqual(chatlist.news({"pk": B(None, "a")}, {"pk": B(4, "b")}), [("pk", None, 4)])

    def test_fewer_is_not_news(self):
        self.assertEqual(chatlist.news({"pk": B(5, "a")}, {"pk": B(2, "b")}), [])

    def test_message(self):
        msg = chatlist.message([("pk디자인", 1, 3), ("투나", 5, 5), ("한솔", None, None), ("공지", None, 4)])
        self.assertEqual(msg, "[카톡] 새 글\npk디자인 방에 새 글 1개 (안 읽은 글 3개)\n투나 방에 새 글 5개\n"
                              "한솔 방에 새 글\n공지 방에 새 글 (안 읽은 글 4개)")


def draw_badge(d, x, y, text, size=11):
    from PIL import ImageFont
    font = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", size)
    bh = int(18 * size / 11)
    bw = bh + int(6 * size / 11) * (len(text) - 1)
    d.rounded_rectangle((x, y, x + bw, y + bh), bh // 2, fill=(255, 78, 62))
    d.text((x + bw / 2, y + bh / 2), text, font=font, fill="white", anchor="mm")


class DigitTest(unittest.TestCase):
    def test_reads_badge_numbers(self):
        wrong, missed = [], []
        for size in (11, 12, 13, 16, 18):
            for text in ["1", "3", "5", "7", "8", "12", "40", "69", "300+"]:
                img = Image.new("RGB", (120, 60), "white")
                draw_badge(ImageDraw.Draw(img), 20, 15, text, size)
                b = chatlist.find_badges(img, (-200, 0, 120, 60))[0]
                got = chatlist.read_digits(chatlist.badge_digits(img, b))
                if got is None:
                    missed.append((size, text))
                elif got != int(text.rstrip("+")):
                    wrong.append((size, text, got))
        self.assertEqual(wrong, [])  # 틀린 숫자는 안 된다 (못 읽는 건 괜찮음 — 배지 모양으로 알림)
        self.assertLessEqual(len(missed), 5, missed)


def fake_list(scale=1.0):
    """카톡 채팅 목록 비슷한 그림 (왼쪽 메뉴 + 방 5칸, 그중 4칸에 배지)."""
    from PIL import ImageFont
    s = lambda v: int(v * scale)
    W, H = s(380), s(400)
    img = Image.new("RGB", (W + s(70), H + s(90)), "white")
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, s(70), H + s(90)), fill=(236, 236, 237))
    fb = ImageFont.truetype("C:/Windows/Fonts/malgunbd.ttf", s(13))
    f = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", s(12))
    ft = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", s(11))
    rows = [("PK디자인", "내일 오전 시공 가능할까요?", "3"), ("엄마", "밥은 먹었니", "1"),
            ("한솔인테리어 김실장", "견적서 확인했습니다", "12"), ("투나여행 현장", "일정 16일로 미뤄주세요", "5"),
            ("공지방", "보통 글", None)]
    x0, y0 = s(70), s(90)
    for i, (name, preview, badge) in enumerate(rows):
        y = y0 + i * s(68)
        d.rounded_rectangle((x0 + s(15), y + s(12), x0 + s(60), y + s(57)), s(16), fill=(170, 200, 230))
        d.text((x0 + s(72), y + s(14)), name, font=fb, fill=(25, 25, 25))
        d.text((x0 + s(72), y + s(36)), preview, font=f, fill=(130, 130, 130))
        d.text((x0 + W - s(60), y + s(15)), "오후 3:12", font=ft, fill=(150, 150, 150))
        if badge:
            bw = s(18) + s(6) * (len(badge) - 1)
            draw_badge(d, x0 + W - s(18) - bw, y + s(36), badge, s(11))
    return img, (x0, y0, x0 + W, y0 + H)


class AnalyzeTest(unittest.TestCase):
    """윈도우 한국어 OCR 까지 한 번에 (이 PC 에 OCR 이 있을 때)."""

    def test_names_and_counts(self):
        for scale in (1.0, 1.5):
            chatlist.LAST["sig"] = None
            img, region = fake_list(scale)
            try:
                got = chatlist.analyze(img, region)
            except RuntimeError as e:
                self.skipTest(str(e))
            want = {"PK디자인": 3, "엄마": 1, "한솔인테리어 김실장": 12, "투나여행 현장": 5}
            self.assertEqual(chatlist.match_names(want, got).keys(), want.keys(), (scale, list(got)))
            self.assertEqual({k: v["n"] for k, v in chatlist.match_names(want, got).items()}, want)
            self.assertIsNone(chatlist.analyze(img, region))  # 배지 그대로면 OCR 안 함


if __name__ == "__main__":
    unittest.main()
