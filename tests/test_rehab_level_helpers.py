import unittest

from rehab_platform.core.rehab_levels import (
    RAW_SCORE_MAPPING_HIGH,
    RAW_SCORE_MAPPING_LOW,
    build_rehab_level_payload,
    clamp_score,
    get_exercises_for_level,
    get_rehab_level,
    map_raw_rehab_score_to_100,
    rehab_level_from_score,
    rehab_meaning_from_score,
)


class RehabLevelHelperTests(unittest.TestCase):
    def test_raw_score_mapping_uses_calibrated_inverted_range(self):
        self.assertEqual(map_raw_rehab_score_to_100(RAW_SCORE_MAPPING_HIGH), 0.0)
        self.assertEqual(map_raw_rehab_score_to_100(RAW_SCORE_MAPPING_LOW), 100.0)
        self.assertEqual(map_raw_rehab_score_to_100((RAW_SCORE_MAPPING_LOW + RAW_SCORE_MAPPING_HIGH) / 2), 50.0)
        self.assertEqual(clamp_score(-4), 0.0)
        self.assertEqual(clamp_score(104), 100.0)

    def test_get_rehab_level_maps_scores_to_expected_levels(self):
        self.assertEqual(get_rehab_level(90)["level"], 5)
        self.assertEqual(get_rehab_level(45)["level"], 3)
        self.assertEqual(get_rehab_level(20)["level"], 1)
        self.assertEqual(get_rehab_level(21)["level"], 2)
        self.assertEqual(rehab_level_from_score(61), 4)
        self.assertIn("strong", rehab_meaning_from_score(90))

    def test_get_exercises_for_level_returns_three_items_for_level(self):
        exercises = get_exercises_for_level(4)
        self.assertEqual(len(exercises), 3)
        self.assertEqual([item["name"] for item in exercises], ["Step-Ups", "Lunges", "Single-Leg Balance"])

    def test_build_rehab_level_payload_includes_label_and_video_links(self):
        payload = build_rehab_level_payload(90)
        self.assertEqual(payload["final_rehab_score"], 90.0)
        self.assertEqual(payload["rehab_level"], 5)
        self.assertEqual(payload["rehab_level_label"], "Level 5")
        self.assertIn("harder exercise plan", payload["rehab_level_meaning"])
        self.assertEqual(len(payload["recommended_exercises"]), 3)
        self.assertEqual(payload["recommended_exercises"][0]["name"], "Advanced Squats")
        self.assertIn("youtube_url", payload["recommended_exercises"][0])


if __name__ == "__main__":
    unittest.main()
