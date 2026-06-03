#!/usr/bin/env python3
"""
IMU ROM + Delta ROM test generator/auditor.

Formulas:
1. Session ROM = max_angle - min_angle
2. Signed Delta ROM = current_session_ROM - previous_session_ROM
3. Absolute Delta ROM = abs(current_session_ROM - previous_session_ROM)

Boss example:
Previous ROM = 150°
Current ROM = 135°
Signed Delta ROM = 135 - 150 = -15°
Absolute Delta ROM = abs(-15) = 15°
"""

from __future__ import annotations

import csv
import math
import random
from pathlib import Path
from dataclasses import dataclass

G = 9.81
OUT_DIR = Path("test_data/imu_range_tests")
REPORT_PATH = Path("reports/imu_range_delta_report.md")

# Generate 4 sessions as requested
SESSIONS = [
    ("session_01_rom_90.csv", 90.0, "correct"),
    ("session_02_rom_120.csv", 120.0, "correct"),
    ("session_03_previous_rom_150.csv", 150.0, "correct"),
    ("session_04_current_rom_135_delta_from_150.csv", 135.0, "correct"),
]


@dataclass
class AuditResult:
    file: str
    expected_rom: float
    min_angle: float
    max_angle: float
    rom: float
    previous_rom: float | None
    delta_signed: float | None
    delta_abs: float | None
    passed: bool


def angle_curve(t: float, rep_duration: float, target_rom: float) -> float:
    """
    Smooth knee movement:
    angle goes 0 → target_rom → 0 in each repetition.
    """
    phase = (t % rep_duration) / rep_duration
    return (target_rom / 2.0) * (1.0 - math.cos(2.0 * math.pi * phase))


def generate_csv(path: Path, target_rom: float, label: str) -> None:
    random.seed(int(target_rom * 100))

    duration = 16.0      # seconds
    sample_rate = 50.0   # Hz
    reps = 8
    rep_duration = duration / reps
    dt = 1.0 / sample_rate
    n = int(duration * sample_rate)

    rows = []
    prev_angle = angle_curve(0.0, rep_duration, target_rom)

    for i in range(n):
        t = i * dt
        true_angle = angle_curve(t, rep_duration, target_rom)

        # Small realistic noise, but not crazy jumps
        noisy_angle = true_angle + random.gauss(0, 0.35)

        # Gyro is angular velocity in deg/s
        gyro_x = (noisy_angle - prev_angle) / dt if i > 0 else 0.0
        prev_angle = noisy_angle

        rad = math.radians(noisy_angle)

        # Simulated accelerometer from gravity rotation
        acc_x = random.gauss(0, 0.03)
        acc_y = G * math.sin(rad) + random.gauss(0, 0.04)
        acc_z = G * math.cos(rad) + random.gauss(0, 0.04)

        rows.append({
            "timestamp": round(t, 4),
            "acc_x": acc_x,
            "acc_y": acc_y,
            "acc_z": acc_z,
            "gyro_x": gyro_x,
            "gyro_y": random.gauss(0, 0.25),
            "gyro_z": random.gauss(0, 0.25),
            "label": label,
        })

    with path.open("w", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["timestamp", "acc_x", "acc_y", "acc_z", "gyro_x", "gyro_y", "gyro_z", "label"],
        )
        writer.writeheader()
        writer.writerows(rows)


def estimate_angles_from_csv(path: Path) -> list[float]:
    """
    Reconstruct knee angle from gyro_x integration.
    This matches the idea:
    angle_now = angle_previous + gyro_x * dt
    """
    rows = []
    with path.open() as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)

    if len(rows) < 2:
        return [0.0]

    angles = [0.0]

    for i in range(1, len(rows)):
        t_prev = float(rows[i - 1]["timestamp"])
        t_now = float(rows[i]["timestamp"])
        dt = max(0.0, t_now - t_prev)
        gyro_x = float(rows[i]["gyro_x"])
        angles.append(angles[-1] + gyro_x * dt)

    # Normalize baseline so minimum starts close to 0
    min_a = min(angles)
    angles = [a - min_a for a in angles]
    return angles


def audit_file(path: Path, expected_rom: float, previous_rom: float | None) -> AuditResult:
    angles = estimate_angles_from_csv(path)

    min_angle = min(angles)
    max_angle = max(angles)
    rom = max_angle - min_angle

    if previous_rom is None:
        delta_signed = None
        delta_abs = None
    else:
        delta_signed = rom - previous_rom
        delta_abs = abs(delta_signed)

    # Allow small tolerance because generated IMU has noise
    passed = abs(rom - expected_rom) <= 3.0

    return AuditResult(
        file=path.name,
        expected_rom=expected_rom,
        min_angle=min_angle,
        max_angle=max_angle,
        rom=rom,
        previous_rom=previous_rom,
        delta_signed=delta_signed,
        delta_abs=delta_abs,
        passed=passed,
    )


def fmt(value: float | None) -> str:
    if value is None:
        return "-"
    return f"{value:.1f}°"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)

    print("Generating IMU CSV files...")
    for filename, target_rom, label in SESSIONS:
        generate_csv(OUT_DIR / filename, target_rom, label)
        print(f"  created: {OUT_DIR / filename}")

    print("\nAuditing ROM and Delta ROM...")
    results: list[AuditResult] = []
    previous_rom = None

    for filename, target_rom, _label in SESSIONS:
        result = audit_file(OUT_DIR / filename, target_rom, previous_rom)
        results.append(result)
        previous_rom = result.rom

    header = (
        f"{'file':45} {'expected':>9} {'min':>8} {'max':>8} "
        f"{'ROM':>8} {'prev ROM':>10} {'signed Δ':>10} {'abs Δ':>8} {'status':>8}"
    )
    print(header)
    print("-" * len(header))

    for r in results:
        print(
            f"{r.file:45} "
            f"{fmt(r.expected_rom):>9} "
            f"{fmt(r.min_angle):>8} "
            f"{fmt(r.max_angle):>8} "
            f"{fmt(r.rom):>8} "
            f"{fmt(r.previous_rom):>10} "
            f"{fmt(r.delta_signed):>10} "
            f"{fmt(r.delta_abs):>8} "
            f"{'PASS' if r.passed else 'FAIL':>8}"
        )

    # Boss-ready markdown report
    lines = []
    lines.append("# IMU ROM and Delta ROM Audit Report\n")
    lines.append("## Main formulas\n")
    lines.append("- **Session ROM = max angle - min angle**")
    lines.append("- **Signed Delta ROM = current session ROM - previous session ROM**")
    lines.append("- **Absolute Delta ROM = abs(current session ROM - previous session ROM)**\n")

    lines.append("## Important correction\n")
    lines.append(
        "Delta ROM is **not** the whole knee angle. "
        "Delta ROM is the difference between two session ROM values.\n"
    )

    lines.append("## Boss example\n")
    lines.append("- Previous session ROM = 150°")
    lines.append("- Current session ROM = 135°")
    lines.append("- Signed Delta ROM = 135 - 150 = -15°")
    lines.append("- Absolute Delta ROM = abs(-15) = 15°\n")

    lines.append("## Generated realistic ranges\n")
    lines.append("| File | Expected ROM | Min angle | Max angle | Calculated ROM | Previous ROM | Signed Delta | Absolute Delta | Status |")
    lines.append("|---|---:|---:|---:|---:|---:|---:|---:|---|")

    for r in results:
        lines.append(
            f"| {r.file} | {fmt(r.expected_rom)} | {fmt(r.min_angle)} | "
            f"{fmt(r.max_angle)} | {fmt(r.rom)} | {fmt(r.previous_rom)} | "
            f"{fmt(r.delta_signed)} | {fmt(r.delta_abs)} | {'PASS' if r.passed else 'FAIL'} |"
        )

    lines.append("\n## Final short answer for boss\n")
    lines.append(
        "You are correct. Delta ROM should be calculated from the difference between "
        "the previous session ROM and the current session ROM. For example, if the "
        "previous ROM is 150° and the current ROM is 135°, the signed delta is -15° "
        "and the absolute ROM difference is 15°. The rehab formula should use Delta ROM, "
        "not the whole knee angle."
    )

    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")

    print(f"\nReport created: {REPORT_PATH}")
    print("\n✅ Final answer for boss:")
    print(
        "You are correct. Delta ROM is the difference between previous session ROM "
        "and current session ROM. Example: previous 150°, current 135° → signed delta -15°, "
        "absolute difference 15°. It is not the whole knee angle."
    )


if __name__ == "__main__":
    main()
