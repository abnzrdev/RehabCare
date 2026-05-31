import unittest
from unittest.mock import patch

from api.main import RehabReportInput, _build_rehab_report


class RehabReportFormulaTests(unittest.TestCase):
    def test_supervisor_formula_is_returned_by_rehab_report_endpoint(self):
        payload = {
            "patient_id": "P_FORMULA",
            "exercise": "knee_extension",
            "koos_pre": 62.5,
            "kl_grade": 2,
            "current_rom": 108.2,
            "previous_rom": 100.0,
            "imu_result": {"overall_score": 80.0},
        }
        expected = 139.95 + (-0.93 * 62.5) + (-0.785 * 8.2) + (-7.93)

        with patch("api.main.get_last_session", return_value=None), patch(
            "api.main.save_session",
            return_value={"session_id": "sess_formula", "created_at": "2026-05-28T00:00:00+00:00"},
        ):
            result = _build_rehab_report(RehabReportInput(**payload))

        self.assertEqual(result["KOOS_pre"], 62.5)
        self.assertEqual(result["delta_ROM"], 8.2)
        self.assertEqual(result["KL_grade"], 2)
        self.assertEqual(result["beta0"], 139.95)
        self.assertEqual(result["beta1"], -0.93)
        self.assertEqual(result["beta2"], -0.785)
        self.assertEqual(result["beta3_KL"], -7.93)
        self.assertAlmostEqual(result["predicted_delta_KOOS"], expected, places=3)
        self.assertIn("beta0 + beta1 * KOOS_pre + beta2 * delta_ROM + beta3_KL", result["formula_text"])


if __name__ == "__main__":
    unittest.main()
