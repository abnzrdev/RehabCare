#!/usr/bin/env python3
from __future__ import annotations

import csv
import math
import random
from pathlib import Path
from dataclasses import dataclass

OUT_DIR = Path("test_data/imu_realistic_sessions")
REPORT_MD = Path("reports/realistic_imu_rom_score_range_report.md")
REPORT_CSV = Path("reports/realistic_imu_rom_score_range_table.csv")

G = 9.81

# Rehab formula from project/boss
BETA0 = 139.95
BETA1_KOOS = -0.93
BETA2_DELTA_ROM = -0.785
KL_BETA3 = {
    0: 1.0,
    1: -23.29,
    2: -7.93,
    3: -0.81,
    4: 0.0,
}

# Realistic synthetic patient progressions.
# Values are target session ROM in degrees.
PATIENT_SERIES = {
    "poor_progress": [30, 38, 45, 55, 65],
    "moderate_progress": [70, 82, 95, 105, 115],
    "good_progress": [115, 125, 135, 142, 148],
    "temporary_drop": [145, 135, 125, 118, 130],
    "stable_patient": [118, 121, 120, 123, 122],
    "mixed_recovery": [85, 100, 95, 112, 125],
}

KOOS_TEST_VALUES = [20, 40, 60, 80, 100]


@dataclass
class SessionResult:
    patient: str
    file: str
    expected_rom: float
    min_angle: float
    max_angle: float
    rom: float
    previous_rom: float | None
    delta_signed: float | None
    delta_abs: float | None


def angle_curve(t: float, rep_duration: float, target_rom: float, quality: str) -> float:
    phase = (t % rep_duration) / rep_duration
    base = (target_rom / 2.0) * (1.0 - math.cos(2.0 * math.pi * phase))

    # Incorrect/unstable movement has small form variation.
    if quality == "unstable":
        base += 2.0 * math.sin(8.0 * math.pi * phase)

    return max(0.0, base)


def generate_csv(patient: str, session_no: int, target_rom: float, quality: str = "correct") -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    filename = f"{patient}_session_{session_no:02d}_rom_{int(round(target_rom)):03d}.csv"
    path = OUT_DIR / filename

    seed = hash((patient, session_no, int(target_rom))) & 0xFFFFFFFF
    random.seed(seed)

    duration = 16.0
    sample_rate = 50.0
    reps = 8
    rep_duration = duration / reps
    dt = 1.0 / sample_rate
    n = int(duration * sample_rate)

    rows = []
    prev_angle = angle_curve(0.0, rep_duration, target_rom, quality)

    noise_std = 0.35 if quality == "correct" else 1.2
    gyro_noise = 0.25 if quality == "correct" else 1.0

    for i in range(n):
        t = i * dt
        true_angle = angle_curve(t, rep_duration, target_rom, quality)
        noisy_angle = max(0.0, true_angle + random.gauss(0, noise_std))

        gyro_x = (noisy_angle - prev_angle) / dt if i > 0 else 0.0
        gyro_x += random.gauss(0, gyro_noise)
        prev_angle = noisy_angle

        rad = math.radians(noisy_angle)

        rows.append({
            "timestamp": round(t, 4),
            "acc_x": random.gauss(0, 0.03),
            "acc_y": G * math.sin(rad) + random.gauss(0, 0.04),
            "acc_z": G * math.cos(rad) + random.gauss(0, 0.04),
            "gyro_x": gyro_x,
            "gyro_y": random.gauss(0, 0.25),
            "gyro_z": random.gauss(0, 0.25),
            "label": quality,
        })

    with path.open("w", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["timestamp", "acc_x", "acc_y", "acc_z", "gyro_x", "gyro_y", "gyro_z", "label"],
        )
        writer.writeheader()
        writer.writerows(rows)

    return path


def estimate_rom_from_csv(path: Path) -> tuple[float, float, float]:
    rows = []
    with path.open() as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    if len(rows) < 2:
        return 0.0, 0.0, 0.0

    angles = [0.0]

    for i in range(1, len(rows)):
        t_prev = float(rows[i - 1]["timestamp"])
        t_now = float(rows[i]["timestamp"])
        dt = max(0.0, t_now - t_prev)
        gyro_x = float(rows[i]["gyro_x"])
        angles.append(angles[-1] + gyro_x * dt)

    # Recenter because gyro integration can drift.
    min_raw = min(angles)
    angles = [a - min_raw for a in angles]

    min_angle = min(angles)
    max_angle = max(angles)
    rom = max_angle - min_angle

    return min_angle, max_angle, rom


def rehab_formula(koos_pre: float, delta_rom: float, kl_grade: int) -> float:
    return (
        BETA0
        + BETA1_KOOS * koos_pre
        + BETA2_DELTA_ROM * delta_rom
        + KL_BETA3[kl_grade]
    )


def clamp_0_100(value: float) -> float:
    return max(0.0, min(100.0, value))


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_MD.parent.mkdir(parents=True, exist_ok=True)

    print("Generating realistic IMU CSV files...")

    results: list[SessionResult] = []

    for patient, rom_targets in PATIENT_SERIES.items():
        previous_rom = None

        for idx, target_rom in enumerate(rom_targets, start=1):
            quality = "unstable" if "drop" in patient and idx in (2, 3) else "correct"
            path = generate_csv(patient, idx, target_rom, quality)

            min_angle, max_angle, rom = estimate_rom_from_csv(path)

            if previous_rom is None:
                delta_signed = None
                delta_abs = None
            else:
                delta_signed = rom - previous_rom
                delta_abs = abs(delta_signed)

            results.append(SessionResult(
                patient=patient,
                file=path.name,
                expected_rom=target_rom,
                min_angle=min_angle,
                max_angle=max_angle,
                rom=rom,
                previous_rom=previous_rom,
                delta_signed=delta_signed,
                delta_abs=delta_abs,
            ))

            previous_rom = rom

    usable_deltas = [r.delta_signed for r in results if r.delta_signed is not None]
    rom_values = [r.rom for r in results]

    formula_values = []
    for r in results:
        if r.delta_signed is None:
            continue

        for koos in KOOS_TEST_VALUES:
            for kl in KL_BETA3:
                raw = rehab_formula(koos, r.delta_signed, kl)
                formula_values.append((raw, clamp_0_100(raw), koos, kl, r))

    min_raw = min(formula_values, key=lambda x: x[0])
    max_raw = max(formula_values, key=lambda x: x[0])

    with REPORT_CSV.open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "patient", "file", "expected_rom", "min_angle", "max_angle", "rom",
            "previous_rom", "delta_signed", "delta_abs"
        ])

        for r in results:
            writer.writerow([
                r.patient,
                r.file,
                round(r.expected_rom, 2),
                round(r.min_angle, 2),
                round(r.max_angle, 2),
                round(r.rom, 2),
                "" if r.previous_rom is None else round(r.previous_rom, 2),
                "" if r.delta_signed is None else round(r.delta_signed, 2),
                "" if r.delta_abs is None else round(r.delta_abs, 2),
            ])

    lines = []
    lines.append("# Realistic IMU ROM / Delta ROM / Rehab Formula Range Report\n")

    lines.append("## What was generated\n")
    lines.append(f"- Generated CSV files: **{len(results)}**")
    lines.append("- Folder: `test_data/imu_realistic_sessions/`")
    lines.append("- CSV columns: `timestamp, acc_x, acc_y, acc_z, gyro_x, gyro_y, gyro_z, label`")
    lines.append("- Each file simulates 8 repetitions with smooth movement and small sensor noise.\n")

    lines.append("## ROM formula\n")
    lines.append("```text")
    lines.append("Session ROM = max angle - min angle")
    lines.append("Delta ROM signed = current session ROM - previous session ROM")
    lines.append("Delta ROM absolute = abs(current session ROM - previous session ROM)")
    lines.append("```\n")

    lines.append("## Realistic generated ROM range\n")
    lines.append(f"- Minimum generated ROM: **{min(rom_values):.1f}°**")
    lines.append(f"- Maximum generated ROM: **{max(rom_values):.1f}°**")
    lines.append(f"- Minimum signed Delta ROM in generated realistic sessions: **{min(usable_deltas):.1f}°**")
    lines.append(f"- Maximum signed Delta ROM in generated realistic sessions: **+{max(usable_deltas):.1f}°**\n")

    lines.append("## Rehab formula used\n")
    lines.append("```text")
    lines.append("predicted_delta_KOOS = 139.95 - 0.93*KOOS_pre - 0.785*Delta_ROM + beta3_KL")
    lines.append("```\n")

    lines.append("## Rehab formula output range from these realistic generated sessions\n")
    lines.append(
        f"- Minimum raw formula output: **{min_raw[0]:.1f}** "
        f"(KOOS={min_raw[2]}, KL={min_raw[3]}, Delta ROM={min_raw[4].delta_signed:.1f}°)"
    )
    lines.append(
        f"- Maximum raw formula output: **{max_raw[0]:.1f}** "
        f"(KOOS={max_raw[2]}, KL={max_raw[3]}, Delta ROM={max_raw[4].delta_signed:.1f}°)"
    )
    lines.append("- If displayed as a 0–100 UI score, clamp the raw value to 0–100.\n")

    lines.append("## Session table\n")
    lines.append("| Patient | File | Expected ROM | Min angle | Max angle | ROM | Previous ROM | Signed Delta | Absolute Delta |")
    lines.append("|---|---|---:|---:|---:|---:|---:|---:|---:|")

    for r in results:
        lines.append(
            f"| {r.patient} | {r.file} | {r.expected_rom:.1f}° | "
            f"{r.min_angle:.1f}° | {r.max_angle:.1f}° | {r.rom:.1f}° | "
            f"{'-' if r.previous_rom is None else f'{r.previous_rom:.1f}°'} | "
            f"{'-' if r.delta_signed is None else f'{r.delta_signed:+.1f}°'} | "
            f"{'-' if r.delta_abs is None else f'{r.delta_abs:.1f}°'} |"
        )

    lines.append("\n## Short explanation for boss\n")
    lines.append(
        "We generated realistic IMU CSV sessions with knee ROM values from low rehab range to high rehab range. "
        "Each session ROM is calculated as max angle minus min angle. Delta ROM is calculated only by comparing "
        "the current session ROM with the previous session ROM. The generated report shows the realistic ROM range, "
        "signed Delta ROM range, and the rehab formula output range using the project formula."
    )

    REPORT_MD.write_text("\n".join(lines), encoding="utf-8")

    print("")
    print("✅ Generated realistic IMU test package")
    print(f"CSV files: {len(results)}")
    print(f"CSV folder: {OUT_DIR}")
    print(f"ROM range: {min(rom_values):.1f}° to {max(rom_values):.1f}°")
    print(f"Signed Delta ROM range: {min(usable_deltas):.1f}° to +{max(usable_deltas):.1f}°")
    print(f"Report: {REPORT_MD}")
    print(f"Table CSV: {REPORT_CSV}")


if __name__ == "__main__":
    main()
