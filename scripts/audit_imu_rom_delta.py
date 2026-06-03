#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import math
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "test_data" / "imu_sessions"
REPORT_PATH = ROOT / "reports" / "imu_rom_delta_audit.md"
VENV_PYTHON = ROOT / ".venv" / "bin" / "python"

SESSIONS = [
    {"filename": "session_01_rom_90.csv", "target_rom": 90.0, "previous_rom": None},
    {"filename": "session_02_rom_120.csv", "target_rom": 120.0, "previous_rom": 90.0},
    {"filename": "session_03_rom_135.csv", "target_rom": 135.0, "previous_rom": 120.0},
    {"filename": "session_04_rom_150.csv", "target_rom": 150.0, "previous_rom": 135.0},
    {"filename": "session_05_rom_135_delta_from_150.csv", "target_rom": 135.0, "previous_rom": 150.0},
]

ROM_TOLERANCE_DEG = 3.0
DELTA_TOLERANCE_DEG = 1.5


def read_pitch_metrics(path: Path) -> tuple[float, float, float]:
    pitches: list[float] = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            pitches.append(float(row["pitch"]))

    if not pitches:
        raise ValueError(f"No pitch rows found in {path}")

    min_angle = min(pitches)
    max_angle = max(pitches)
    rom = max_angle - min_angle
    return min_angle, max_angle, rom


def run_real_pipeline(path: Path) -> dict[str, object] | None:
    if not VENV_PYTHON.exists():
        return None

    child_code = """
import json
import sys
from pathlib import Path

csv_path = Path(sys.argv[1]).resolve()
root = Path(sys.argv[2]).resolve()
sys.path.insert(0, str(root / "rehab_platform"))
from core.imu_pipeline import score_rehab_exercise

with csv_path.open("rb") as handle:
    result = score_rehab_exercise(handle.read(), sensor_location="right_thigh")

payload = {
    "min_angle_deg": result.get("min_angle_deg"),
    "max_angle_deg": result.get("max_angle_deg"),
    "rom_deg": result.get("rom_deg"),
    "overall_score": result.get("overall_score"),
    "session_summary": result.get("session_summary", {}),
}
print(json.dumps(payload))
""".strip()

    env = dict(os.environ)
    completed = subprocess.run(
        [str(VENV_PYTHON), "-c", child_code, str(path), str(ROOT)],
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            f"Real IMU pipeline failed for {path.name}: {completed.stderr.strip() or completed.stdout.strip()}"
        )
    return json.loads(completed.stdout)


def fmt(value: float | None) -> str:
    if value is None:
        return "-"
    return f"{value:.1f}"


def audit() -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []

    for session in SESSIONS:
        path = DATA_DIR / session["filename"]
        min_angle, max_angle, rom = read_pitch_metrics(path)
        previous_rom = session["previous_rom"]
        signed_delta = None if previous_rom is None else rom - float(previous_rom)
        absolute_delta = None if signed_delta is None else abs(signed_delta)
        pipeline = run_real_pipeline(path)
        pipeline_rom = None if not pipeline else float(pipeline["rom_deg"])
        pipeline_min = None if not pipeline else float(pipeline["min_angle_deg"])
        pipeline_max = None if not pipeline else float(pipeline["max_angle_deg"])

        rom_ok = abs(rom - float(session["target_rom"])) <= ROM_TOLERANCE_DEG
        delta_ok = True
        if previous_rom is not None:
            expected_delta = float(session["target_rom"]) - float(previous_rom)
            delta_ok = abs((signed_delta or 0.0) - expected_delta) <= DELTA_TOLERANCE_DEG
        pipeline_ok = True
        if pipeline_rom is not None:
            pipeline_ok = abs(pipeline_rom - rom) <= 2.0

        rows.append(
            {
                "file": path.name,
                "target_rom": float(session["target_rom"]),
                "min_angle": min_angle,
                "max_angle": max_angle,
                "rom": rom,
                "previous_rom": previous_rom,
                "signed_delta": signed_delta,
                "absolute_delta": absolute_delta,
                "pipeline_min": pipeline_min,
                "pipeline_max": pipeline_max,
                "pipeline_rom": pipeline_rom,
                "pass": rom_ok and delta_ok and pipeline_ok,
            }
        )

    return rows


def write_report(rows: list[dict[str, object]]) -> None:
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)

    lines = [
        "# IMU ROM and Delta ROM Audit",
        "",
        "## Summary",
        "",
        "ROM is the range of motion inside one session: `max_angle - min_angle`.",
        "Delta ROM is the change between sessions: `current_session_ROM - previous_session_ROM`.",
        "Delta ROM is not the whole knee angle. It is the session-to-session difference in ROM.",
        "",
        "Example used for boss review:",
        "",
        "- Previous session ROM = 150°",
        "- Current session ROM = 135°",
        "- Signed Delta ROM = 135 - 150 = -15°",
        "- Absolute Delta ROM = abs(-15) = 15°",
        "",
        "## Generated Test Sessions",
        "",
        "- Session 01: min 0°, max 90°, target ROM 90°",
        "- Session 02: min 0°, max 120°, target ROM 120°",
        "- Session 03: min 0°, max 135°, target ROM 135°",
        "- Session 04: min 0°, max 150°, target ROM 150°",
            "- Session 05: min 0°, max 135°, target ROM 135°, previous ROM 150°",
            "- Note: the real IMU scorer detrends and recenters the internal angle trace, so pipeline min/max can be negative/positive while ROM remains correct.",
        "",
        "## Results",
        "",
        "| File | Min angle | Max angle | ROM | Previous ROM | Signed Delta ROM | Absolute Delta ROM | Pass |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | :---: |",
    ]

    for row in rows:
        lines.append(
            f"| {row['file']} | {fmt(row['min_angle'])}° | {fmt(row['max_angle'])}° | "
            f"{fmt(row['rom'])}° | {fmt(row['previous_rom'])}° | {fmt(row['signed_delta'])}° | "
            f"{fmt(row['absolute_delta'])}° | {'PASS' if row['pass'] else 'FAIL'} |"
        )

    lines.extend(
        [
            "",
            "## Real Pipeline Check",
            "",
            "The audit script also ran each generated CSV through the real project IMU scorer via `.venv/bin/python`.",
            "Pass/fail uses the generated ROM magnitude, expected session-to-session delta, and the real pipeline ROM output.",
            "",
            "| File | Pipeline min | Pipeline max | Pipeline ROM |",
            "| --- | ---: | ---: | ---: |",
        ]
    )

    for row in rows:
        lines.append(
            f"| {row['file']} | {fmt(row['pipeline_min'])}° | {fmt(row['pipeline_max'])}° | {fmt(row['pipeline_rom'])}° |"
        )

    lines.extend(
        [
            "",
            "## Limitation",
            "",
            "- These CSVs are synthetic but pipeline-compatible. They simulate smooth repeated knee flexion and extension with small noise.",
            "- The real scorer detrends/recenters the angle signal, so absolute min/max values from the scorer are not expected to stay at exactly 0° and target max°.",
            "- The generated files are suitable for validating ROM and Delta ROM logic, not for claiming clinical model performance on real patients.",
        ]
    )

    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def print_table(rows: list[dict[str, object]]) -> None:
    headers = [
        ("file", 40),
        ("min", 8),
        ("max", 8),
        ("rom", 8),
        ("prev", 8),
        ("signed", 10),
        ("abs", 8),
        ("pass", 6),
    ]
    header_line = " ".join(name.ljust(width) for name, width in headers)
    print(header_line)
    print("-" * len(header_line))
    for row in rows:
        print(
            f"{row['file']:<40} "
            f"{fmt(row['min_angle']):>8} "
            f"{fmt(row['max_angle']):>8} "
            f"{fmt(row['rom']):>8} "
            f"{fmt(row['previous_rom']):>8} "
            f"{fmt(row['signed_delta']):>10} "
            f"{fmt(row['absolute_delta']):>8} "
            f"{('PASS' if row['pass'] else 'FAIL'):>6}"
        )


def main() -> None:
    rows = audit()
    print_table(rows)
    write_report(rows)
    print(f"\nMarkdown report written to {REPORT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
