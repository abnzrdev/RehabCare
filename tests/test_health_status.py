import unittest
import asyncio

from api.main import health


class HealthStatusTests(unittest.TestCase):
    def test_health_exposes_separate_binary_and_kl_model_statuses(self):
        data = asyncio.run(health())

        self.assertEqual(data["status"], "ok")
        self.assertIn(data["binary_model"], {"real", "demo", "missing"})
        self.assertIn(data["kl_model"], {"real_kl", "demo_kl"})
        self.assertIn(data["imu"], {"real", "demo"})
        self.assertNotIn("model", data)


if __name__ == "__main__":
    unittest.main()
