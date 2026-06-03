#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import math
from pathlib import Path

import numpy as np

REPORT_MD = Path("reports/rehab_score_calibration_report.md")
SUMMARY_CSV = Path("reports/rehab_score_calibration_summary.csv")
SAMPLE_CSV = Path("reports/rehab_score_calibration_sample.csv")

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

KL_WEIGHTS = np.array([0.15, 0.20, 0.30, 0.25, 0.10])


def clamp_0_100(x):
    return np.clip(x, 0.0, 100.0)


def level_from_score(score: float) -> int:
    if score <= 20:
        return 1
    if score <= 40:
        return 2
    if score <= 60:
        return 3
    if score <= 80:
        return 4
    return 5


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=500_000)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    rng = np.random.default_rng(args.seed)

    # Synthetic but realistic patient coverage:
    # KOOS covers full possible questionnaire range.
    koos_pre = rng.uniform(0, 100, args.n)

    # KL grade 0-4, weighted toward mild/moderate cases.
    kl_grade = rng.choice(np.arange(5), size=args.n, p=KL_WEIGHTS)
    kl_beta = np.array([KL_BETA3[int(k)] for k in kl_grade])

    # Knee session ROM range:
    # 20-150 gives weak to strong realistic/stress-test movement.
    previous_rom = rng.uniform(20, 150, args.n)

    # Realistic session-to-session change:
    # Most changes are small/moderate, but drops and improvements can happen.
    delta_rom = rng.normal(loc=6, scale=12, size=args.n)
    delta_rom = np.clip(delta_rom, -35, 35)

    current_rom = np.clip(previous_rom + delta_rom, 0, 150)
    delta_rom = current_rom - previous_rom

    raw_score = (
        BETA0
        + BETA1_KOOS * koos_pre
        + BETA2_DELTA_ROM * delta_rom
        + kl_beta
    )

    # Use percentiles for stable UI mapping, not absolute min/max outliers.
    raw_low = float(np.percentile(raw_score, 1))
    raw_high = float(np.percentile(raw_score, 99))

    # Inverted because lower raw score = smaller rehab gap / better patient.
    final_score = 100 * (raw_high - raw_score) / (raw_high - raw_low)
    final_score = clamp_0_100(final_score)

    levels = np.array([level_from_score(float(s)) for s in final_score])

    def pct(values):
        return np.percentile(values, [0, 1, 5, 25, 50, 75, 95, 99, 100])

    raw_pct = pct(raw_score)
    final_pct = pct(final_score)
    delta_pct = pct(delta_rom)

    REPORT_MD.parent.mkdir(parents=True, exist_ok=True)

    level_counts = {i: int(np.sum(levels == i)) for i in range(1, 6)}

    with SUMMARY_CSV.open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["metric", "value"])
        writer.writerow(["scenarios", args.n])
        writer.writerow(["raw_min", raw_pct[0]])
        writer.writerow(["raw_p01_used_as_raw_low", raw_low])
        writer.writerow(["raw_p99_used_as_raw_high", raw_high])
        writer.writerow(["raw_max", raw_pct[-1]])
        writer.writerow(["delta_rom_min", delta_pct[0]])
        writer.writerow(["delta_rom_max", delta_pct[-1]])
        for level, count in level_counts.items():
            writer.writerow([f"level_{level}_count", count])

    sample_size = min(10_000, args.n)
    idx = rng.choice(np.arange(args.n), size=sample_size, replace=False)
    with SAMPLE_CSV.open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "koos_pre",
            "previous_rom",
            "current_rom",
            "delta_rom",
            "kl_grade",
            "kl_beta3",
            "raw_formula_output",
            "final_rehab_score_0_100",
            "level",
        ])
        for i in idx:
            writer.writerow([
                round(float(koos_pre[i]), 2),
                round(float(previous_rom[i]), 2),
                round(float(current_rom[i]), 2),
                round(float(delta_rom[i]), 2),
                int(kl_grade[i]),
                round(float(kl_beta[i]), 2),
                round(float(raw_score[i]), 2),
                round(float(final_score[i]), 2),
                int(levels[i]),
            ])

    lines = []
    lines.append("# Rehab Score Calibration Report\n")
    lines.append("## Original formula was not changed\n")
    lines.append("```text")
    lines.append("raw_score = 139.95 - 0.93*KOOS_pre - 0.785*Delta_ROM + beta3_KL")
    lines.append("```\n")

    lines.append("## Mapping to 0-100\n")
    lines.append("Because lower raw output means smaller rehab gap / better patient, we invert it:\n")
    lines.append("```text")
    lines.append(f"raw_low  = P01(raw_score) = {raw_low:.2f}")
    lines.append(f"raw_high = P99(raw_score) = {raw_high:.2f}")
    lines.append("final_rehab_score = 100 * (raw_high - raw_score) / (raw_high - raw_low)")
    lines.append("final_rehab_score = clamp(final_rehab_score, 0, 100)")
    lines.append("```\n")

    lines.append("## 5 levels\n")
    lines.append("- Level 1: 0-20, weakest / easiest plan")
    lines.append("- Level 2: 21-40")
    lines.append("- Level 3: 41-60")
    lines.append("- Level 4: 61-80")
    lines.append("- Level 5: 81-100, strongest / harder plan\n")

    lines.append("## Simulation assumptions\n")
    lines.append(f"- Scenarios generated: **{args.n:,}**")
    lines.append("- KOOS_pre: 0-100")
    lines.append("- Previous ROM: 20-150 degrees")
    lines.append("- Delta ROM: realistic session-to-session change, clipped to -35 to +35 degrees")
    lines.append("- KL grade: 0-4")
    lines.append("- This is calibration/simulation, not clinical validation.\n")

    lines.append("## Raw formula output percentiles\n")
    labels = ["min", "p01", "p05", "p25", "p50", "p75", "p95", "p99", "max"]
    lines.append("| Percentile | Raw output |")
    lines.append("|---|---:|")
    for label, value in zip(labels, raw_pct):
        lines.append(f"| {label} | {value:.2f} |")

    lines.append("\n## Final rehab score percentiles after mapping\n")
    lines.append("| Percentile | Final 0-100 score |")
    lines.append("|---|---:|")
    for label, value in zip(labels, final_pct):
        lines.append(f"| {label} | {value:.2f} |")

    lines.append("\n## Delta ROM percentiles\n")
    lines.append("| Percentile | Delta ROM |")
    lines.append("|---|---:|")
    for label, value in zip(labels, delta_pct):
        lines.append(f"| {label} | {value:.2f}° |")

    lines.append("\n## Level distribution\n")
    lines.append("| Level | Count | Percent |")
    lines.append("|---:|---:|---:|")
    for level, count in level_counts.items():
        lines.append(f"| {level} | {count:,} | {(count / args.n) * 100:.2f}% |")

    lines.append("\n## Meaning\n")
    lines.append("- Low raw formula output = smaller rehab gap / better condition")
    lines.append("- High raw formula output = bigger rehab gap / more rehab need")
    lines.append("- High final rehab score = better readiness")
    lines.append("- Low final rehab score = easier exercise level needed\n")

    REPORT_MD.write_text("\n".join(lines), encoding="utf-8")

    print("✅ Calibration complete")
    print(f"Scenarios: {args.n:,}")
    print(f"Raw range full: {raw_pct[0]:.2f} to {raw_pct[-1]:.2f}")
    print(f"Recommended mapping range: raw_low={raw_low:.2f}, raw_high={raw_high:.2f}")
    print("Mapping formula:")
    print(f"final_rehab_score = 100 * ({raw_high:.2f} - raw_score) / ({raw_high:.2f} - {raw_low:.2f})")
    print("Level counts:")
    for level, count in level_counts.items():
        print(f"  Level {level}: {count:,} ({(count / args.n) * 100:.2f}%)")
    print(f"Report: {REPORT_MD}")
    print(f"Summary CSV: {SUMMARY_CSV}")
    print(f"Sample CSV: {SAMPLE_CSV}")


if __name__ == "__main__":
    main()
