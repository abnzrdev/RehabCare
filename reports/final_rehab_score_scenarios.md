# Final Rehab Formula Scenario Check

## Formula

```text
predicted_delta_KOOS = 139.95 - 0.93*KOOS_pre - 0.785*Delta_ROM + beta3_KL
```

## Delta ROM source

- Read from: `reports/realistic_imu_rom_score_range_table.csv`
- Realistic signed Delta ROM range: **-10.17° to +16.95°**

## Important note

This formula output is a regression-style predicted Delta KOOS value. It is not automatically the same as a 0–100 health score. For UI display, use `clamp(raw_score, 0, 100)` if needed.

## Example scenarios

| Scenario | KOOS_pre | Signed Delta ROM | KL grade | Raw formula output | Display 0–100 |
|---|---:|---:|---:|---:|---:|
| Clinically good / small rehab gap | 90 | +10.00° | 0 | 49.40 | 49.40 |
| Moderate patient | 60 | +5.00° | 2 | 72.29 | 72.29 |
| Poor patient / bigger rehab gap | 20 | -10.00° | 4 | 129.20 | 100.00 |
| Best KOOS but no ROM improvement | 100 | +0.00° | 0 | 47.95 | 47.95 |
| Low KOOS with ROM drop | 20 | -10.17° | 4 | 129.33 | 100.00 |
| High KOOS with ROM improvement | 100 | +16.95° | 0 | 34.64 | 34.64 |

## Range from all generated realistic scenarios

- Minimum raw formula output: **10.35**
  - KOOS=100, Delta ROM=+16.95°, KL=1
- Maximum raw formula output: **130.33**
  - KOOS=20, Delta ROM=-10.17°, KL=0