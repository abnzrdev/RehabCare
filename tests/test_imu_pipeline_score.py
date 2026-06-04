import unittest

from rehab_platform.core.imu_pipeline import score_rehab_exercise


def _csv_bytes(header, rows):
    lines = [",".join(header)]
    for row in rows:
        lines.append(",".join(str(value) for value in row))
    return ("\n".join(lines)).encode("utf-8")


class RehabImuPipelineScoreTests(unittest.TestCase):
    def test_simple_single_sensor_csv_still_works(self):
        csv_bytes = _csv_bytes(
            ["gyro_x", "gyro_y", "gyro_z", "acc_x", "acc_z", "pitch"],
            [
                [1, 0, 0, -0.2, 0.9, 0],
                [2, 0, 0, 0.1, 0.95, 10],
                [1, 0, 0, 0.3, 0.92, 25],
                [2, 0, 0, -0.1, 0.9, 10],
                [1, 0, 0, -0.3, 0.88, 0],
            ],
        )

        result = score_rehab_exercise(csv_bytes)

        summary = result["session_summary"]
        self.assertEqual(summary["sensor_format"], "simple_single_sensor")
        self.assertFalse(summary["emg_detected"])
        self.assertEqual(summary["real_channel_names"], ["gyro_x", "gyro_y", "gyro_z", "pitch", "acc_x", "acc_z"])
        self.assertGreater(summary["rom_deg"], 0.0)

    def test_hugadb_rt_rs_csv_works(self):
        csv_bytes = _csv_bytes(
            ["RT_acc_x", "RT_acc_z", "RT_gyro_x", "RT_gyro_y", "RT_gyro_z", "RS_acc_x", "RS_acc_z", "RS_gyro_x", "RS_gyro_y", "RS_gyro_z"],
            [
                [0.10, 0.95, 1.5, 0.4, 0.2, 0.05, 0.98, 0.7, 0.1, 0.1],
                [0.25, 0.91, 2.0, 0.5, 0.3, 0.08, 0.97, 0.8, 0.1, 0.1],
                [0.40, 0.86, 1.8, 0.4, 0.2, 0.15, 0.95, 0.9, 0.2, 0.1],
                [0.18, 0.93, 1.6, 0.3, 0.2, 0.06, 0.98, 0.7, 0.1, 0.1],
                [-0.05, 0.99, 1.1, 0.2, 0.1, -0.02, 1.00, 0.5, 0.1, 0.1],
            ],
        )

        result = score_rehab_exercise(csv_bytes)

        summary = result["session_summary"]
        self.assertEqual(summary["sensor_format"], "hugadb_6imu_2emg")
        self.assertGreater(summary["rom_deg"], 0.0)
        self.assertIn("RT_gyro_x", summary["real_channel_names"])
        self.assertIn("RS_gyro_x", summary["real_channel_names"])

    def test_hugadb_emg_columns_are_detected(self):
        csv_bytes = _csv_bytes(
            ["RT_acc_x", "RT_acc_z", "RT_gyro_x", "RS_acc_x", "RS_acc_z", "RS_gyro_x", "r_EMG", "l_EMG"],
            [
                [0.10, 0.95, 1.5, 0.05, 0.98, 0.7, 0.11, 0.09],
                [0.22, 0.91, 2.0, 0.10, 0.96, 0.8, 0.13, 0.10],
                [0.36, 0.87, 1.8, 0.14, 0.95, 0.9, 0.12, 0.11],
                [0.18, 0.93, 1.4, 0.07, 0.97, 0.7, 0.10, 0.08],
            ],
        )

        result = score_rehab_exercise(csv_bytes)

        summary = result["session_summary"]
        self.assertTrue(summary["emg_detected"])
        self.assertEqual(summary["emg_channels"], ["r_EMG", "l_EMG"])
        self.assertIn("EMG channels detected and stored", summary["sensor_setup_note"])
        self.assertEqual(summary["EMG_right"]["source_column"], "r_EMG")
        self.assertEqual(summary["EMG_left"]["source_column"], "l_EMG")

    def test_wrong_csv_gets_improved_error_message(self):
        csv_bytes = _csv_bytes(
            ["foo", "bar"],
            [
                [1, 2],
                [3, 4],
            ],
        )

        with self.assertRaisesRegex(
            ValueError,
            "Expected either simple columns gyro_x/gyro_y/gyro_z, full 38-channel OrthoScan columns, or HuGaDB-style columns like RT_gyro_x / RS_gyro_x.",
        ):
            score_rehab_exercise(csv_bytes)


if __name__ == "__main__":
    unittest.main()
