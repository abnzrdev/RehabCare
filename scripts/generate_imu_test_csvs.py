#!/usr/bin/env python3
from __future__ import annotations

import csv
import math
import random
from pathlib import Path


OUTPUT_DIR = Path("test_data/imu_sessions")
SAMPLE_RATE_HZ = 100
REPS = 8
SECONDS_PER_REP = 3.0
NOISE_PITCH_DEG = 0.35
NOISE_GYRO_DPS = 0.8
NOISE_ACCEL_G = 0.01
GRAVITY_G = 1.0

SESSIONS = [
    ("session_01_rom_90.csv", 90.0),
    ("session_02_rom_120.csv", 120.0),
    ("session_03_rom_135.csv", 135.0),
    ("session_04_rom_150.csv", 150.0),
    ("session_05_rom_135_delta_from_150.csv", 135.0),
]


def _wave_and_derivative(phase: float, max_angle_deg: float) -> tuple[float, float]:
    rise_end = 0.45
    hold_end = 0.55
    fall_end = 1.0

    if phase < rise_end:
        local = phase / rise_end
        angle = max_angle_deg * 0.5 * (1.0 - math.cos(math.pi * local))
        derivative = max_angle_deg * 0.5 * math.pi * math.sin(math.pi * local) / rise_end
        return angle, derivative

    if phase < hold_end:
        return max_angle_deg, 0.0

    local = (phase - hold_end) / (fall_end - hold_end)
    angle = max_angle_deg * 0.5 * (1.0 + math.cos(math.pi * local))
    derivative = -max_angle_deg * 0.5 * math.pi * math.sin(math.pi * local) / (fall_end - hold_end)
    return angle, derivative


def build_rows(max_angle_deg: float, seed: int) -> list[dict[str, float]]:
    random.seed(seed)
    dt = 1.0 / SAMPLE_RATE_HZ
    total_duration = REPS * SECONDS_PER_REP
    total_samples = int(total_duration * SAMPLE_RATE_HZ)
    rows: list[dict[str, float]] = []

    for index in range(total_samples):
        t = index * dt
        rep_time = t % SECONDS_PER_REP
        phase = rep_time / SECONDS_PER_REP
        base_angle, derivative_per_phase = _wave_and_derivative(phase, max_angle_deg)
        angular_velocity = derivative_per_phase / SECONDS_PER_REP

        pitch = max(0.0, base_angle + random.uniform(-NOISE_PITCH_DEG, NOISE_PITCH_DEG))
        pitch_rad = math.radians(pitch)

        acc_x = math.sin(pitch_rad) * GRAVITY_G + random.uniform(-NOISE_ACCEL_G, NOISE_ACCEL_G)
        acc_y = random.uniform(-NOISE_ACCEL_G / 2.0, NOISE_ACCEL_G / 2.0)
        acc_z = math.cos(pitch_rad) * GRAVITY_G + random.uniform(-NOISE_ACCEL_G, NOISE_ACCEL_G)
        gyro_x = angular_velocity + random.uniform(-NOISE_GYRO_DPS, NOISE_GYRO_DPS)
        gyro_y = random.uniform(-0.25, 0.25)
        gyro_z = random.uniform(-0.25, 0.25)

        rows.append(
            {
                "timestamp_sec": round(t, 4),
                "pitch": round(pitch, 4),
                "gyro_x": round(gyro_x, 4),
                "gyro_y": round(gyro_y, 4),
                "gyro_z": round(gyro_z, 4),
                "acc_x": round(acc_x, 6),
                "acc_y": round(acc_y, 6),
                "acc_z": round(acc_z, 6),
            }
        )

    return rows


def write_session(path: Path, max_angle_deg: float, seed: int) -> tuple[float, float, float]:
    rows = build_rows(max_angle_deg=max_angle_deg, seed=seed)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["timestamp_sec", "pitch", "gyro_x", "gyro_y", "gyro_z", "acc_x", "acc_y", "acc_z"],
        )
        writer.writeheader()
        writer.writerows(rows)

    pitches = [row["pitch"] for row in rows]
    min_angle = min(pitches)
    max_angle = max(pitches)
    rom = max_angle - min_angle
    return min_angle, max_angle, rom


def main() -> None:
    print(f"Generating IMU CSVs in {OUTPUT_DIR}")
    for index, (filename, max_angle_deg) in enumerate(SESSIONS, start=1):
        path = OUTPUT_DIR / filename
        min_angle, max_angle, rom = write_session(path, max_angle_deg=max_angle_deg, seed=100 + index)
        print(
            f"{path}: min={min_angle:.2f}° max={max_angle:.2f}° rom={rom:.2f}° "
            f"target_max={max_angle_deg:.1f}° reps={REPS}"
        )


if __name__ == "__main__":
    main()
