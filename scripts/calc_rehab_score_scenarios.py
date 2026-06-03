#!/usr/bin/env python3
from __future__ import annotations

import csv
from pathlib import Path

INPUT_CSV = Path("reports/realistic_imu_rom_score_range_table.csv")
OUT_CSV = Path("reports/final_rehab_score_scenarios.csv")
OUT_MD = Path("reports/final_rehab_score_scenarios.md")

# Real formula
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

KOOS_VALUES = [20, 40, 60, 80, 100]


def raw_score(koos_pre: float, delta_rom: float, kl_grade: int) -> float:
    return BETA0 + (BETA1_KOOS * koos_pre) + (BETA2_DELTA_ROM * delta_rom) + KL_BETA3[kl_grade]


def clamp_0_100(x: float) -> float:
    return max(0.0, min(100.0, x))


def load_realistic_deltas() -> list[float]:
    if not INPUT_CSV.exists():
        print(f"⚠️ Missing {INPUT_CSV}. Using fallback deltas.")
        return [-10, -5, 0, 5, 10, 15]

    deltas = []
    with INPUT_CSV.open() as f:
        reader = csv.DictReader(f)
        for row in reader:
            value = row.get("delta_signed", "").strip()
            if value:
                deltas.append(round(float(value), 2))

    return sorted(set(deltas))


def main() -> None:
    deltas = load_realistic_deltas()

    rows = []
    for delta in deltas:
        for koos in KOOS_VALUES:
            for kl in KL_BETA3:
                raw = raw_score(koos, delta, kl)
                rows.append({
                    "koos_pre": koos,
                    "delta_rom_signed": delta,
                    "kl_grade": kl,
                    "kl_beta3": KL_BETA3[kl],
                    "raw_formula_score": raw,
                    "display_score_0_100": clamp_0_100(raw),
                })

    min_row = min(rows, key=lambda r: r["raw_formula_score"])
    max_row = max(rows, key=lambda r: r["raw_formula_score"])

    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUT_CSV.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    manual_examples = [
        ("Clinically good / small rehab gap", 90, 10, 0),
        ("Moderate patient", 60, 5, 2),
        ("Poor patient / bigger rehab gap", 20, -10, 4),
        ("Best KOOS but no ROM improvement", 100, 0, 0),
        ("Low KOOS with ROM drop", 20, min(deltas), 4),
        ("High KOOS with ROM improvement", 100, max(deltas), 0),
    ]

    print("\nFormula:")
    print("predicted_delta_KOOS = 139.95 - 0.93*KOOS_pre - 0.785*Delta_ROM + beta3_KL")

    print(f"\nRealistic Delta ROM range from generated CSVs: {min(deltas):+.2f}° to {max(deltas):+.2f}°")

    print("\nScenario examples:")
    print(f"{'scenario':38} {'KOOS':>6} {'ΔROM':>8} {'KL':>4} {'raw':>10} {'display':>10}")
    print("-" * 84)

    for name, koos, delta, kl in manual_examples:
        raw = raw_score(koos, delta, kl)
        display = clamp_0_100(raw)
        print(f"{name:38} {koos:6.1f} {delta:8.2f} {kl:4d} {raw:10.2f} {display:10.2f}")

    print("\nRange from all generated realistic scenarios:")
    print(f"MIN raw score = {min_row['raw_formula_score']:.2f}")
    print(f"  KOOS={min_row['koos_pre']}, ΔROM={min_row['delta_rom_signed']:+.2f}°, KL={min_row['kl_grade']}")
    print(f"MAX raw score = {max_row['raw_formula_score']:.2f}")
    print(f"  KOOS={max_row['koos_pre']}, ΔROM={max_row['delta_rom_signed']:+.2f}°, KL={max_row['kl_grade']}")

    lines = []
    lines.append("# Final Rehab Formula Scenario Check\n")
    lines.append("## Formula\n")
    lines.append("```text")
    lines.append("predicted_delta_KOOS = 139.95 - 0.93*KOOS_pre - 0.785*Delta_ROM + beta3_KL")
    lines.append("```\n")

    lines.append("## Delta ROM source\n")
    lines.append(f"- Read from: `{INPUT_CSV}`")
    lines.append(f"- Realistic signed Delta ROM range: **{min(deltas):+.2f}° to {max(deltas):+.2f}°**\n")

    lines.append("## Important note\n")
    lines.append(
        "This formula output is a regression-style predicted Delta KOOS value. "
        "It is not automatically the same as a 0–100 health score. "
        "For UI display, use `clamp(raw_score, 0, 100)` if needed.\n"
    )

    lines.append("## Example scenarios\n")
    lines.append("| Scenario | KOOS_pre | Signed Delta ROM | KL grade | Raw formula output | Display 0–100 |")
    lines.append("|---|---:|---:|---:|---:|---:|")

    for name, koos, delta, kl in manual_examples:
        raw = raw_score(koos, delta, kl)
        display = clamp_0_100(raw)
        lines.append(f"| {name} | {koos} | {delta:+.2f}° | {kl} | {raw:.2f} | {display:.2f} |")

    lines.append("\n## Range from all generated realistic scenarios\n")
    lines.append(f"- Minimum raw formula output: **{min_row['raw_formula_score']:.2f}**")
    lines.append(
        f"  - KOOS={min_row['koos_pre']}, "
        f"Delta ROM={min_row['delta_rom_signed']:+.2f}°, "
        f"KL={min_row['kl_grade']}"
    )
    lines.append(f"- Maximum raw formula output: **{max_row['raw_formula_score']:.2f}**")
    lines.append(
        f"  - KOOS={max_row['koos_pre']}, "
        f"Delta ROM={max_row['delta_rom_signed']:+.2f}°, "
        f"KL={max_row['kl_grade']}"
    )

    OUT_MD.write_text("\n".join(lines), encoding="utf-8")

    print(f"\n✅ CSV saved: {OUT_CSV}")
    print(f"✅ Report saved: {OUT_MD}")


if __name__ == "__main__":
    main()
