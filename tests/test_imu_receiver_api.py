import csv
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from api.main import app


class ImuReceiverApiTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)
        self.csv_path = Path(self.tmpdir.name) / "data" / "imu_data.csv"
        self.db_path = Path(self.tmpdir.name) / "data" / "rehab.db"
        self.env = patch.dict(
            os.environ,
            {
                "REHAB_IMU_CSV_PATH": str(self.csv_path),
                "REHAB_DB_PATH": str(self.db_path),
            },
            clear=False,
        )
        self.env.start()
        self.addCleanup(self.env.stop)
        self.client_ctx = TestClient(app)
        self.client = self.client_ctx.__enter__()
        self.addCleanup(self.client_ctx.__exit__, None, None, None)

    def test_post_api_imu_persists_row_and_sets_server_timestamp_when_missing(self):
        response = self.client.post(
            "/api/imu",
            json={
                "device_id": "pi1",
                "leg": "left",
                "body_part": "hip",
                "acc_x": 0.12,
                "acc_y": 0.03,
                "acc_z": 0.98,
                "gyro_x": 1.2,
                "gyro_y": 0.5,
                "gyro_z": -0.1,
                "pitch": 10.4,
                "roll": 3.2,
                "temperature": 35.8,
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["row"]["device_id"], "pi1")
        self.assertTrue(payload["row"]["timestamp"])
        self.assertTrue(self.csv_path.exists())

        with self.csv_path.open(newline="", encoding="utf-8") as fh:
            rows = list(csv.DictReader(fh))

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["device_id"], "pi1")
        self.assertEqual(rows[0]["leg"], "left")
        self.assertEqual(rows[0]["body_part"], "hip")
        self.assertEqual(rows[0]["timestamp"], payload["row"]["timestamp"])

    def test_post_api_imu_rejects_missing_required_fields_with_clear_error(self):
        response = self.client.post(
            "/api/imu",
            json={
                "device_id": "pi1",
                "leg": "left",
                "body_part": "hip",
                "acc_x": 0.12,
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "Invalid IMU payload.")
        self.assertTrue(any("acc_y" in item for item in response.json()["details"]))

    def test_get_api_imu_latest_returns_latest_row_per_device(self):
        first = {
            "device_id": "pi1",
            "leg": "left",
            "body_part": "hip",
            "acc_x": 0.12,
            "acc_y": 0.03,
            "acc_z": 0.98,
            "gyro_x": 1.2,
            "gyro_y": 0.5,
            "gyro_z": -0.1,
            "pitch": 10.4,
            "roll": 3.2,
            "temperature": 35.8,
            "timestamp": "2026-06-05T17:20:00",
        }
        second = {
            **first,
            "pitch": 18.7,
            "roll": 4.6,
            "timestamp": "2026-06-05T17:21:00",
        }
        third = {
            **first,
            "device_id": "pi2",
            "leg": "right",
            "body_part": "shin",
            "timestamp": "2026-06-05T17:22:00",
        }

        self.client.post("/api/imu", json=first)
        self.client.post("/api/imu", json=second)
        self.client.post("/api/imu", json=third)

        response = self.client.get("/api/imu/latest")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["count"], 2)
        rows = {item["device_id"]: item for item in payload["items"]}
        self.assertEqual(rows["pi1"]["pitch"], 18.7)
        self.assertEqual(rows["pi2"]["body_part"], "shin")

    def test_get_api_imu_data_returns_recent_rows_with_limit(self):
        for index in range(3):
            self.client.post(
                "/api/imu",
                json={
                    "device_id": "pi1",
                    "leg": "left",
                    "body_part": "hip",
                    "acc_x": 0.12 + index,
                    "acc_y": 0.03,
                    "acc_z": 0.98,
                    "gyro_x": 1.2,
                    "gyro_y": 0.5,
                    "gyro_z": -0.1,
                    "pitch": 10.4 + index,
                    "roll": 3.2,
                    "temperature": 35.8,
                    "timestamp": f"2026-06-05T17:2{index}:00",
                },
            )

        response = self.client.get("/api/imu/data?limit=2")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["count"], 2)
        self.assertEqual(payload["limit"], 2)
        self.assertEqual(payload["items"][0]["pitch"], 12.4)
        self.assertEqual(payload["items"][1]["pitch"], 11.4)


if __name__ == "__main__":
    unittest.main()
