#!/usr/bin/env python3
import csv
from pathlib import Path

IN_FILE = Path("reports/final_rehab_score_scenarios.csv")
OUT_FILE = Path("reports/final_rehab_score_mapped_0_100.csv")

rows = []
with IN_FILE.open() as f:
    reader = csv.DictReader(f)
    for row in reader:
        row["raw_formula_score"] = float(row["raw_formula_score"])
        rows.append(row)

raw_values = [r["raw_formula_score"] for r in rows]
raw_min = min(raw_values)
raw_max = max(raw_values)

def clamp(x):
    return max(0.0, min(100.0, x))

for r in rows:
    raw = r["raw_formula_score"]

    # Inverted because lower raw formula output means better patient state.
    mapped = 100 * (raw_max - raw) / (raw_max - raw_min)

    r["mapped_health_score_0_100"] = round(clamp(mapped), 2)
    r["raw_min_used"] = round(raw_min, 2)
    r["raw_max_used"] = round(raw_max, 2)

with OUT_FILE.open("w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)

print("✅ Mapping complete")
print(f"Raw range used: {raw_min:.2f} to {raw_max:.2f}")
print(f"Output: {OUT_FILE}")
print()
print("Formula:")
print("mapped_score = 100 * (raw_max - raw_score) / (raw_max - raw_min)")
