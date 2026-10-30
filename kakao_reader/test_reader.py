import unittest

import reader


def msgs(*texts):
    return [{"text": t} for t in texts]


class CollectTest(unittest.TestCase):
    def setUp(self):
        reader.PENDING.clear()
        reader.READY.clear()

    def test_trigger_takes_batch_before_it(self):
        reader.collect("김정헌", msgs("방문3개 부평", "사진 2장"))
        self.assertEqual(reader.READY, [])  # 신호 전에는 아무것도 안 한다
        reader.collect("김정헌", msgs("샤시 1개도요", "견적발행 시작", "다음 문의"))
        self.assertEqual(len(reader.READY), 1)
        job = reader.READY[0]
        self.assertEqual(job["client"], "")
        self.assertEqual(job["texts"], ["방문3개 부평", "샤시 1개도요"])
        self.assertEqual(job["need"], 2)
        self.assertEqual(reader.PENDING["김정헌"]["texts"], ["다음 문의"])

    def test_no_trigger_no_job(self):
        reader.collect("김정헌", msgs("방문3개 부평", "사진"))
        self.assertEqual(reader.READY, [])

    def test_published_link_ends_batch(self):
        reader.collect("김정헌", msgs("옛 문의", "https://songil.netlify.app/q/ABC", "새 문의", "견적발행시작"))
        self.assertEqual(reader.READY[0]["texts"], ["새 문의"])
        self.assertEqual(reader.READY[0]["client"], "")

class LoadJsonTest(unittest.TestCase):
    def test_trailing_comma_and_bom(self):
        import os
        import tempfile
        p = os.path.join(tempfile.mkdtemp(), "c.json")
        with open(p, "w", encoding="utf-8-sig") as f:
            f.write('{"exclude_rooms": ["탁구", "소프트시티", ],\n "interval": 30,\n}')
        self.assertEqual(reader.load_json(p, {}), {"exclude_rooms": ["탁구", "소프트시티"], "interval": 30})


if __name__ == "__main__":
    unittest.main()
