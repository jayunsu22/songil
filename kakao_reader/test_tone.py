"""python -m unittest test_tone — 사장님 말투 모으기 (이름·번호는 지어낸 것)"""
import unittest

import tone

CFG = {"tone": True, "tone_url": "http://x", "my_names": ["김정헌"]}


def M(sender, text, key, t="10:00"):
    return {"date": "2026-11-12", "time": t, "sender": sender, "text": text, "key": key}


class ToneTest(unittest.TestCase):
    def setUp(self):
        self.posted, self.logs = [], []

    def run_h(self, state, msgs, fail=False):
        def post(body):
            if fail:
                raise RuntimeError("down")
            self.posted.append(body)
        return tone.harvest(CFG, state, "가나실장님", msgs, post, self.logs.append)

    def test_pairs_owner_lines_with_previous_vendor_line(self):
        msgs = [M("가실장", "내일 몇시에 오세요?", "a"), M("김정헌", "넵! 8시까지 갈게요 실장님~", "b"),
                M("김정헌", "주차는 어디에 하면 될까요?", "c"), M("가실장", "지하 2층이요", "d")]
        st = {}
        self.assertEqual(self.run_h(st, msgs), 2)
        items = self.posted[0]["items"]
        self.assertEqual([(x["prev"], x["text"]) for x in items],
                         [("내일 몇시에 오세요?", "넵! 8시까지 갈게요 실장님~"), ("내일 몇시에 오세요?", "주차는 어디에 하면 될까요?")])
        self.assertEqual(items[0]["prevWho"], "가실장")
        self.assertEqual(st["tone_sent"], ["b", "c"])
        # 다시 읽어도 두 번 보내지 않는다
        self.assertEqual(self.run_h(st, msgs), 0)

    def test_hides_codes_keeps_short_numbers(self):
        msgs = [M("가실장", "비번 알려주세요", "a"), M("김정헌", "공동현관 비번 *1234# 이에요", "b"),
                M("김정헌", "제 번호 010-0000-0000 으로 주세요", "c"), M("김정헌", "11/14 방문 3짝 ps170", "d")]
        self.run_h({}, msgs)
        texts = [x["text"] for x in self.posted[0]["items"]]
        self.assertNotIn("1234", texts[0])
        self.assertNotIn("0000-0000", texts[1])
        self.assertEqual(texts[2], "11/14 방문 3짝 ps170")

    def test_failure_keeps_nothing_so_it_retries(self):
        st = {}
        self.assertEqual(self.run_h(st, [M("김정헌", "네 감사합니다~", "a")], fail=True), 0)
        self.assertEqual(st.get("tone_sent"), [])
        self.assertEqual(self.run_h(st, [M("김정헌", "네 감사합니다~", "a")]), 1)

    def test_skips_links_one_letter_and_off(self):
        msgs = [M("김정헌", "ㅇ", "a"), M("김정헌", "ㅋㅋㅋ", "c"), M("김정헌", "견적서 https://x/q/abc", "b")]
        self.assertEqual(self.run_h({}, msgs), 0)
        self.assertEqual(tone.harvest(dict(CFG, tone=False), {}, "방", [M("김정헌", "넵 알겠습니다", "z")], self.posted.append, self.logs.append), 0)


EXPORT = """봄애실장님 님과 카카오톡 대화
저장한 날짜 : 2026-11-12 17:32:10

--------------- 2026년 11월 10일 월요일 ---------------
[봄애실장님] [오후 2:53] 내일 몇시에 오세요?
[김정헌] [오후 3:01] 넵! 8시까지 갈게요 실장님~
주차는 지하에 할게요
[김정헌] [오후 3:02] 공동현관 비번 *1234# 맞죠?
--------------- 2026년 11월 11일 화요일 ---------------
[봄애실장님] [오전 9:10] 네~ 확인했어요!
[김정헌] [오전 9:11] 감사합니다 ^^
"""


class ImportTest(unittest.TestCase):
    def test_export_file_owner_lines(self):
        import os
        import tempfile
        d = tempfile.mkdtemp()
        for name, enc in (("봄애실장님.txt", "utf-8-sig"), ("가나실장님.txt", "utf-16")):
            with open(os.path.join(d, name), "w", encoding=enc) as f:
                f.write(EXPORT)
        posted, logs = [], []
        n = tone.import_folder(CFG, d, posted.append, logs.append)
        self.assertEqual(n, 6)
        items = [x for b in posted for x in b["items"] if x["room"] == "봄애실장님"]
        self.assertEqual([x["text"] for x in items][:1], ["넵! 8시까지 갈게요 실장님~\n주차는 지하에 할게요"])
        self.assertEqual(items[0]["prev"], "내일 몇시에 오세요?")
        self.assertEqual(items[0]["d"], "2026-11-10")
        self.assertNotIn("1234", items[1]["text"])
        self.assertEqual(items[2]["prev"], "네~ 확인했어요!")
        # 실시간으로 읽은 같은 글과 지문이 같다 (n8n 이 두 번 안 쌓게)
        import kakao_text
        live = kakao_text.with_keys(kakao_text.parse(EXPORT))
        self.assertIn(items[0]["k"], {m["key"] for m in live})

    def test_empty_folder(self):
        import tempfile
        logs = []
        self.assertEqual(tone.import_folder(CFG, tempfile.mkdtemp(), lambda b: None, logs.append), 0)
        self.assertIn("txt 가 없음", logs[0])


if __name__ == "__main__":
    unittest.main()
