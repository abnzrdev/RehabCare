import math
import unittest

from rehab_platform.core.imu_pipeline import score_rehab_exercise


def _csv_bytes(header, rows):
    lines = [",".join(header)]
    for row in rows:
        lines.append(",".join(str(value) for value in row))
    return ("\n".join(lines)).encode("utf-8")


def _sin_rows(count, fn):
    return [fn(i) for i in range(count)]


class RehabImuPipelineScoreTests(unittest.TestCase):
    def test_simple_pitch_csv_valid_rom_works(self):
        csv_bytes = _csv_bytes(
            ["pitch"],
            [[0], [8], [18], [27], [16], [4], [-3], [7]],
        )

        result = score_rehab_exercise(csv_bytes)

        summary = result["session_summary"]
        self.assertEqual(summary["sensor_format"], "simple_single_sensor")
        self.assertEqual(summary["rom_method_used"], "pitch_detrended")
        self.assertTrue(summary["rom_valid"])
        self.assertLessEqual(summary["rom_deg"], 180)
        self.assertGreater(summary["rom_deg"], 0)

    def test_simple_gyro_csv_with_realistic_values_works(self):
        rows = _sin_rows(
            120,
            lambda i: [18 * math.sin(i / 12), 0, 0],
        )
        csv_bytes = _csv_bytes(["gyro_x", "gyro_y", "gyro_z"], rows)

        result = score_rehab_exercise(csv_bytes)

        summary = result["session_summary"]
        self.assertEqual(summary["rom_method_used"], "gyro_integrated_detrended")
        self.assertTrue(summary["rom_valid"])
        self.assertLessEqual(summary["rom_deg"], 180)
        self.assertGreater(summary["rom_deg"], 0)

    def test_hugadb_raw_gyro_explosion_is_rejected_and_accel_fallback_is_used(self):
        rows = _sin_rows(
            90,
            lambda i: [
                0.25 * math.sin(i / 10), 0.95, 8000 if i % 2 == 0 else -8000,
                0.12 * math.sin(i / 10 + 0.4), 0.98, 7000 if i % 2 == 0 else -7000,
            ],
        )
        csv_bytes = _csv_bytes(
            ["RT_acc_x", "RT_acc_z", "RT_gyro_x", "RS_acc_x", "RS_acc_z", "RS_gyro_x"],
            rows,
        )

        result = score_rehab_exercise(csv_bytes)

        summary = result["session_summary"]
        diagnostics = {item["name"]: item for item in summary["rom_candidate_diagnostics"]}
        self.assertEqual(summary["sensor_format"], "hugadb_6imu_2emg")
        self.assertEqual(summary["rom_method_used"], "accelerometer_relative_tilt")
        self.assertTrue(summary["rom_valid"])
        self.assertFalse(diagnostics["gyro_integrated_detrended"]["valid"])
        self.assertTrue(
            "physiological range" in diagnostics["gyro_integrated_detrended"]["reason"].lower()
            or "unrealistic jumps" in diagnostics["gyro_integrated_detrended"]["reason"].lower()
        )
        self.assertLessEqual(summary["rom_deg"], 180)

    def test_hugadb_good_and_poor_files_return_rom_within_physiological_range(self):
        good_rows = _sin_rows(
            100,
            lambda i: [
                0.45 * math.sin(i / 11), 0.82, 10,
                0.15 * math.sin(i / 11 + 0.3), 0.95, 8,
            ],
        )
        poor_rows = _sin_rows(
            100,
            lambda i: [
                0.12 * math.sin(i / 11), 0.98, 6,
                0.08 * math.sin(i / 11 + 0.3), 0.99, 4,
            ],
        )
        header = ["RT_acc_x", "RT_acc_z", "RT_gyro_x", "RS_acc_x", "RS_acc_z", "RS_gyro_x"]

        good = score_rehab_exercise(_csv_bytes(header, good_rows))
        poor = score_rehab_exercise(_csv_bytes(header, poor_rows))

        self.assertLessEqual(good["session_summary"]["rom_deg"], 180)
        self.assertLessEqual(poor["session_summary"]["rom_deg"], 180)
        self.assertTrue(good["session_summary"]["rom_valid"])
        self.assertTrue(poor["session_summary"]["rom_valid"])
        self.assertGreater(good["session_summary"]["rom_deg"], poor["session_summary"]["rom_deg"])

    def test_no_valid_rom_returns_controlled_warning(self):
        csv_bytes = _csv_bytes(
            ["pitch", "gyro_x"],
            [[0, 9000], [1000, -9000], [-1000, 9000], [1500, -9000], [-1500, 9000]],
        )

        result = score_rehab_exercise(csv_bytes)

        summary = result["session_summary"]
        self.assertEqual(summary["rom_method_used"], "invalid")
        self.assertFalse(summary["rom_valid"])
        self.assertIsNone(summary["rom_deg"])
        self.assertIn("outside physiological range", summary["rom_warning"])
        self.assertIsNone(result["rom_deg"])

    def test_emg_detection_still_works(self):
        rows = _sin_rows(
            60,
            lambda i: [
                0.30 * math.sin(i / 9), 0.90, 12,
                0.14 * math.sin(i / 9 + 0.2), 0.97, 9,
                0.2 + 0.03 * math.sin(i / 8),
                0.18 + 0.02 * math.cos(i / 8),
            ],
        )
        csv_bytes = _csv_bytes(
            ["RT_acc_x", "RT_acc_z", "RT_gyro_x", "RS_acc_x", "RS_acc_z", "RS_gyro_x", "r_EMG", "l_EMG"],
            rows,
        )

        result = score_rehab_exercise(csv_bytes)

        summary = result["session_summary"]
        self.assertTrue(summary["emg_detected"])
        self.assertEqual(summary["emg_channels"], ["r_EMG", "l_EMG"])
        self.assertEqual(summary["EMG_right"]["source_column"], "r_EMG")
        self.assertEqual(summary["EMG_left"]["source_column"], "l_EMG")

    def test_wrong_csv_gets_improved_error_message(self):
        csv_bytes = _csv_bytes(
            ["foo", "bar"],
            [[1, 2], [3, 4]],
        )

        with self.assertRaisesRegex(
            ValueError,
            "Expected either simple columns gyro_x/gyro_y/gyro_z, full 38-channel OrthoScan columns, or HuGaDB-style columns like RT_gyro_x / RS_gyro_x.",
        ):
            score_rehab_exercise(csv_bytes)


if __name__ == "__main__":
    unittest.main()
