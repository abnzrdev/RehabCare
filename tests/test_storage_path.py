import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from rehab_platform.core.storage import get_db_path, init_db


class StoragePathTests(unittest.TestCase):
    def test_rehab_db_path_env_overrides_default_location(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "custom" / "rehab.db"

            with patch.dict(os.environ, {"REHAB_DB_PATH": str(db_path)}, clear=False):
                self.assertEqual(get_db_path(), db_path)
                init_db()

            self.assertTrue(db_path.exists())
            self.assertTrue(db_path.parent.exists())


if __name__ == "__main__":
    unittest.main()
