# IMU ROM and Delta ROM Audit Report

## Main formulas

- **Session ROM = max angle - min angle**
- **Signed Delta ROM = current session ROM - previous session ROM**
- **Absolute Delta ROM = abs(current session ROM - previous session ROM)**

## Important correction

Delta ROM is **not** the whole knee angle. Delta ROM is the difference between two session ROM values.

## Boss example

- Previous session ROM = 150°
- Current session ROM = 135°
- Signed Delta ROM = 135 - 150 = -15°
- Absolute Delta ROM = abs(-15) = 15°

## Generated realistic ranges

| File | Expected ROM | Min angle | Max angle | Calculated ROM | Previous ROM | Signed Delta | Absolute Delta | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| session_01_rom_90.csv | 90.0° | 0.0° | 91.1° | 91.1° | - | - | - | PASS |
| session_02_rom_120.csv | 120.0° | 0.0° | 121.2° | 121.2° | 91.1° | 30.2° | 30.2° | PASS |
| session_03_previous_rom_150.csv | 150.0° | 0.0° | 151.0° | 151.0° | 121.2° | 29.8° | 29.8° | PASS |
| session_04_current_rom_135_delta_from_150.csv | 135.0° | 0.0° | 136.3° | 136.3° | 151.0° | -14.7° | 14.7° | PASS |

## Final short answer for boss

You are correct. Delta ROM should be calculated from the difference between the previous session ROM and the current session ROM. For example, if the previous ROM is 150° and the current ROM is 135°, the signed delta is -15° and the absolute ROM difference is 15°. The rehab formula should use Delta ROM, not the whole knee angle.