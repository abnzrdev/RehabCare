import unittest

from rehab_platform.core.kl_grade import (
    KL_CLASS_LABELS,
    _build_demo_kl_response,
    _format_kl_prediction,
)


class KlPredictTests(unittest.TestCase):
    def test_format_kl_prediction_contract(self):
        probs = [0.05, 0.1, 0.65, 0.15, 0.05]

        result = _format_kl_prediction(
            class_probs=probs,
            source="real_kl",
        )

        self.assertEqual(result["kl_grade"], 2)
        self.assertEqual(result["display_grade"], 3)
        self.assertEqual(result["grade_scale"], "0-4_internal_1-5_display")
        self.assertEqual(result["source"], "real_kl")
        self.assertEqual(result["label"], KL_CLASS_LABELS[2])
        self.assertEqual(set(result["grade_probs"].keys()), {"0", "1", "2", "3", "4"})
        self.assertAlmostEqual(result["confidence"], 0.65, places=6)

    def test_demo_kl_response_uses_demo_source(self):
        result = _build_demo_kl_response(oa_prob=0.84)

        self.assertEqual(result["source"], "demo_kl")
        self.assertEqual(result["display_grade"], result["kl_grade"] + 1)
        self.assertEqual(result["grade_scale"], "0-4_internal_1-5_display")
        self.assertIn(str(result["kl_grade"]), result["grade_probs"])


if __name__ == "__main__":
    unittest.main()
