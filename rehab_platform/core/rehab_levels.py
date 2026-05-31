from __future__ import annotations

from typing import Any

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


def get_rehab_level(score: float | int | None) -> dict[str, Any]:
    if score is None:
        return {"level": None, "label": None}

    value = max(0.0, min(100.0, float(score)))
    if value <= 20:
        level = 1
    elif value <= 40:
        level = 2
    elif value <= 60:
        level = 3
    elif value <= 80:
        level = 4
    else:
        level = 5
    return {"level": level, "label": f"Level {level}"}


def get_exercises_for_level(level: int | None) -> list[dict[str, str]]:
    if level is None:
        return []
    exercises = LEVEL_EXERCISES.get(int(level), [])
    return [{**item, "level": f"Level {int(level)}"} for item in exercises]


def build_rehab_level_payload(score: float | int | None) -> dict[str, Any]:
    info = get_rehab_level(score)
    level = info["level"]
    return {
        "rehab_level": level,
        "rehab_level_label": info["label"],
        "recommended_exercises": get_exercises_for_level(level),
    }
