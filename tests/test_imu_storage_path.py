import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from rehab_platform.core.storage import get_imu_csv_path


class ImuStoragePathTests(unittest.TestCase):
    def test_imu_csv_path_env_overrides_default_location(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            csv_path = Path(tmpdir) / "custom" / "imu_data.csv"

            with patch.dict(os.environ, {"REHAB_IMU_CSV_PATH": str(csv_path)}, clear=False):
                self.assertEqual(get_imu_csv_path(), csv_path)


if __name__ == "__main__":
    unittest.main()
