import unittest
from unittest.mock import patch

from PIL import Image

import api.main as api_main


class PredictStatusTests(unittest.TestCase):
    def test_predict_response_uses_binary_model_status_field(self):
        image = Image.new("RGB", (8, 8), color="white")

        with patch.object(api_main, "_model", None), patch.object(api_main, "_mode", "demo"), patch.object(api_main, "_infer_demo", return_value=0.2):
            result = api_main._build_response(image, lang="en")

        self.assertEqual(result["binary_model"], "demo")
        self.assertEqual(result["source"], "demo")


if __name__ == "__main__":
    unittest.main()
