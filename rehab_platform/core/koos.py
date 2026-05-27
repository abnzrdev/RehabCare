from __future__ import annotations

from typing import Any

# KOOS items are expected on a 0..4 Likert scale (0=no problem, 4=extreme problem).
# Subscale score is converted to 0..100 where 100 means best knee status.
# score = 100 - (mean_item / 4) * 100

KOOS_SUBSCALES: dict[str, list[str]] = {
    "pain": [f"q{i}" for i in range(1, 10)],
    "symptoms": [f"q{i}" for i in range(10, 17)],
    "adl": [f"q{i}" for i in range(17, 34)],
    "sport_rec": [f"q{i}" for i in range(34, 39)],
    "qol": [f"q{i}" for i in range(39, 43)],
}


def _normalize_answers(answers: dict[str, Any]) -> dict[str, float]:
    out: dict[str, float] = {}
    for k, v in answers.items():
        key = str(k).strip().lower()
        try:
            val = float(v)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid KOOS answer for {k}: {v}") from exc
        if val < 0 or val > 4:
            raise ValueError(f"KOOS answer for {k} must be in range 0..4")
        out[key] = val
    return out


def calculate_koos(answers: dict[str, Any]) -> dict[str, Any]:
    data = _normalize_answers(answers)
    subscales: dict[str, float] = {}
    missing: dict[str, list[str]] = {}

    for name, keys in KOOS_SUBSCALES.items():
        vals = [data[k] for k in keys if k in data]
        if not vals:
            missing[name] = keys
            continue
        mean_item = sum(vals) / len(vals)
        score = 100.0 - (mean_item / 4.0) * 100.0
        subscales[name] = round(score, 2)
        if len(vals) != len(keys):
            missing[name] = [k for k in keys if k not in data]

    if not subscales:
        raise ValueError("No valid KOOS answers found.")

    total = round(sum(subscales.values()) / len(subscales), 2)
    return {
        "koos_total": total,
        "subscales": subscales,
        "missing_items": missing,
    }
