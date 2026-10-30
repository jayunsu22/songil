import unittest

import reader


def msgs(*texts):
    return [{"text": t} for t in texts]


class CollectTest(unittest.TestCase):
    def setUp(self):
        reader.PENDING.clear()
        reader.READY.clear()
        reader.PHOTO_RETRY.clear()

    def test_trigger_takes_batch_before_it(self):
        reader.collect("김정헌", msgs("방문3개 부평", "사진 2장"), ["a.jpg", "b.jpg"])
        reader.collect("김정헌", msgs("샤시 1개도요", "견적발행시작 pk디자인", "다음 문의"), [])
        self.assertEqual(len(reader.READY), 1)
        job = reader.READY[0]
        self.assertEqual(job["client"], "pk디자인")
        self.assertEqual(job["texts"], ["방문3개 부평", "샤시 1개도요"])
        self.assertEqual(job["photos"], ["a.jpg", "b.jpg"])
        self.assertEqual(reader.PENDING["김정헌"]["texts"], ["다음 문의"])

    def test_no_trigger_no_job(self):
        reader.collect("김정헌", msgs("방문3개 부평"), [])
        self.assertEqual(reader.READY, [])

    def test_published_link_ends_batch(self):
        reader.collect("김정헌", msgs("옛 문의", "https://songil.netlify.app/q/ABC", "새 문의", "견적발행시작"), [])
        self.assertEqual(reader.READY[0]["texts"], ["새 문의"])
        self.assertEqual(reader.READY[0]["client"], "")

    def test_late_photos_join_waiting_job(self):
        reader.collect("김정헌", msgs("방문3개", "견적발행시작 투나"), [])
        reader.collect("김정헌", [], ["late.jpg"])  # 다시 저장한 사진은 기다리는 묶음으로
        self.assertEqual(reader.READY[0]["photos"], ["late.jpg"])


if __name__ == "__main__":
    unittest.main()
