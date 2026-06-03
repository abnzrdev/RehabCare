from __future__ import annotations

from typing import Any

RAW_SCORE_MAPPING_LOW = 20.60
RAW_SCORE_MAPPING_HIGH = 140.55

LEVEL_INTERPRETATIONS: dict[int, str] = {
    1: "weak / high rehab need / easiest exercise plan",
    2: "below average / needs careful rehab",
    3: "moderate",
    4: "good progress",
    5: "strong / lower rehab gap / harder exercise plan",
}

LEVEL_EXERCISES: dict[int, list[dict[str, str]]] = {
    1: [
        {
            "name": "Quad Sets",
            "description": "Tighten the front thigh muscle with the knee straight and hold briefly.",
            "youtube_url": "https://www.youtube.com/watch?v=IF5eDfb8afM",
        },
        {
            "name": "Ankle Pumps",
            "description": "Move the ankle up and down to support circulation and gentle lower-leg activation.",
            "youtube_url": "https://www.youtube.com/watch?v=KxfFzSOAT7g",
        },
        {
            "name": "Heel Slides",
            "description": "Slide the heel toward the body to practice controlled knee bending.",
            "youtube_url": "https://www.youtube.com/watch?v=Bz0wSFRjH2c",
        },
    ],
    2: [
        {
            "name": "Seated Knee Extension",
            "description": "Straighten the knee from a seated position to build early quadriceps control.",
            "youtube_url": "https://www.youtube.com/watch?v=VuJZ6dqMf8M",
        },
        {
            "name": "Straight Leg Raise",
            "description": "Lift the straight leg slowly while keeping the knee locked and controlled.",
            "youtube_url": "https://www.youtube.com/watch?v=4rFn8Z6iDRY",
        },
        {
            "name": "Hamstring Curl",
            "description": "Bend the knee under control to strengthen the back of the thigh.",
            "youtube_url": "https://www.youtube.com/watch?v=Fadu_1dGVbE",
        },
    ],
    3: [
        {
            "name": "Mini Squats",
            "description": "Perform short-range squats with steady knee alignment and even weight bearing.",
            "youtube_url": "https://www.youtube.com/watch?v=w2arL8LK_6E",
        },
        {
            "name": "Wall Squats",
            "description": "Use a wall-supported squat hold to improve quadriceps endurance and confidence.",
            "youtube_url": "https://www.youtube.com/watch?v=hAvVXAE9Bgs",
        },
        {
            "name": "Calf Raises",
            "description": "Rise onto the toes slowly to improve lower-leg strength and push-off control.",
            "youtube_url": "https://www.youtube.com/watch?v=3tJCtytFe9A",
        },
    ],
    4: [
        {
            "name": "Step-Ups",
            "description": "Step onto a low platform with slow control through the knee and hip.",
            "youtube_url": "https://www.youtube.com/watch?v=wfhXnLILqdk",
        },
        {
            "name": "Lunges",
            "description": "Practice split-stance lowering with attention to knee tracking and balance.",
            "youtube_url": "https://www.youtube.com/watch?v=aY_Qht1Q3CQ",
        },
        {
            "name": "Single-Leg Balance",
            "description": "Stand on one leg to improve balance, hip control, and proprioception.",
            "youtube_url": "https://www.youtube.com/watch?v=7SF7AYh2_Yw",
        },
    ],
    5: [
        {
            "name": "Advanced Squats",
            "description": "Progress squat depth and control only when pain stays settled and movement is stable.",
            "youtube_url": "https://www.youtube.com/shorts/ucT9G2-ScAI",
        },
        {
            "name": "Lateral Step-Downs",
            "description": "Lower from a step with controlled eccentric knee loading and pelvic stability.",
            "youtube_url": "https://www.youtube.com/watch?v=rvI7OxBQqS4",
        },
        {
            "name": "Return-to-Running Drills",
            "description": "Use graded running drills only after strength, balance, and landing control are ready.",
            "youtube_url": "https://www.youtube.com/watch?v=WkZr17HycfE",
        },
    ],
}


def clamp_score(value: float | int | None) -> float | None:
    if value is None:
        return None
    return max(0.0, min(100.0, float(value)))


def map_raw_rehab_score_to_100(raw_score: float | int | None) -> float | None:
    if raw_score is None:
        return None

    mapped = 100.0 * (RAW_SCORE_MAPPING_HIGH - float(raw_score)) / (
        RAW_SCORE_MAPPING_HIGH - RAW_SCORE_MAPPING_LOW
    )
    return round(clamp_score(mapped), 2)


def rehab_level_from_score(score: float | int | None) -> int | None:
    value = clamp_score(score)
    if value is None:
        return None
    if value <= 20:
        return 1
    if value <= 40:
        return 2
    if value <= 60:
        return 3
    if value <= 80:
        return 4
    return 5


def rehab_meaning_from_score(score: float | int | None) -> str | None:
    level = rehab_level_from_score(score)
    if level is None:
        return None
    return LEVEL_INTERPRETATIONS[level]


def get_rehab_level(score: float | int | None) -> dict[str, Any]:
    level = rehab_level_from_score(score)
    if level is None:
        return {"level": None, "label": None, "meaning": None}
    return {
        "level": level,
        "label": f"Level {level}",
        "meaning": rehab_meaning_from_score(score),
    }


def get_exercises_for_level(level: int | None) -> list[dict[str, str]]:
    if level is None:
        return []
    exercises = LEVEL_EXERCISES.get(int(level), [])
    return [{**item, "level": f"Level {int(level)}"} for item in exercises]


def build_rehab_level_payload(score: float | int | None) -> dict[str, Any]:
    info = get_rehab_level(score)
    level = info["level"]
    return {
        "final_rehab_score": clamp_score(score),
        "rehab_level": level,
        "rehab_level_label": info["label"],
        "rehab_level_meaning": info["meaning"],
        "recommended_exercises": get_exercises_for_level(level),
    }
