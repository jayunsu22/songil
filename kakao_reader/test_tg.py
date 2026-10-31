"""텔레그램 글 꾸미기 (11/1)."""
import unittest

import tg


class TgTest(unittest.TestCase):
    def test_published(self):
        r = tg.published("류춘화", "미래타운4단지 가견적 10월31일 오후6시(류춘화)", 5, 0,
                         "https://songil.netlify.app/q/XW2?d=1&n=66", warn=["사진 2장 중 1장만 저장됨 (<창>)"],
                         missing=["필름", "날짜"])
        self.assertIsInstance(r, tg.Html)
        self.assertEqual(r.splitlines(), [
            "📄 <b>가견적 발행 · 류춘화</b>",
            "미래타운4단지 · 품목 5개 · 사진 0장",
            "⚠ 사진 2장 중 1장만 저장됨 (&lt;창&gt;)",
            "❓ 빠진 정보: 필름, 날짜",
            '<a href="https://songil.netlify.app/q/XW2?d=1&amp;n=66">👉 견적서 열기</a>',   # 긴 주소는 숨김
        ])

    def test_emoji_and_plain(self):
        self.assertEqual([tg.emoji(k) for k in ("견적 문의", "하자보수", "기타")], ["💬", "🛠", "📌"])
        self.assertEqual(tg.place("이름만"), "이름만")
        self.assertNotIsInstance("그냥 글", tg.Html)


if __name__ == "__main__":
    unittest.main()
