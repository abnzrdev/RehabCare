# IMU ROM and Delta ROM Audit

## Summary

ROM is the range of motion inside one session: `max_angle - min_angle`.
Delta ROM is the change between sessions: `current_session_ROM - previous_session_ROM`.
Delta ROM is not the whole knee angle. It is the session-to-session difference in ROM.

Example used for boss review:

- Previous session ROM = 150°
- Current session ROM = 135°
- Signed Delta ROM = 135 - 150 = -15°
- Absolute Delta ROM = abs(-15) = 15°

## Generated Test Sessions

- Session 01: min 0°, max 90°, target ROM 90°
- Session 02: min 0°, max 120°, target ROM 120°
- Session 03: min 0°, max 135°, target ROM 135°
- Session 04: min 0°, max 150°, target ROM 150°
- Session 05: min 0°, max 135°, target ROM 135°, previous ROM 150°
- Note: the real IMU scorer detrends and recenters the internal angle trace, so pipeline min/max can be negative/positive while ROM remains correct.

## Results

| File | Min angle | Max angle | ROM | Previous ROM | Signed Delta ROM | Absolute Delta ROM | Pass |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | :---: |
| session_01_rom_90.csv | 0.0° | 90.3° | 90.3° | -° | -° | -° | PASS |
| session_02_rom_120.csv | 0.0° | 120.3° | 120.3° | 90.0° | 30.3° | 30.3° | PASS |
| session_03_rom_135.csv | 0.0° | 135.3° | 135.3° | 120.0° | 15.3° | 15.3° | PASS |
| session_04_rom_150.csv | 0.0° | 150.3° | 150.3° | 135.0° | 15.3° | 15.3° | PASS |
| session_05_rom_135_delta_from_150.csv | 0.0° | 135.3° | 135.3° | 150.0° | -14.7° | 14.7° | PASS |

## Real Pipeline Check

The audit script also ran each generated CSV through the real project IMU scorer via `.venv/bin/python`.
Pass/fail uses the generated ROM magnitude, expected session-to-session delta, and the real pipeline ROM output.

| File | Pipeline min | Pipeline max | Pipeline ROM |
| --- | ---: | ---: | ---: |
| session_01_rom_90.csv | -49.6° | 40.9° | 90.4° |
| session_02_rom_120.csv | -66.1° | 54.4° | 120.5° |
| session_03_rom_135.csv | -74.3° | 61.1° | 135.5° |
| session_04_rom_150.csv | -82.6° | 67.9° | 150.5° |
| session_05_rom_135_delta_from_150.csv | -74.3° | 61.1° | 135.5° |

## Limitation

- These CSVs are synthetic but pipeline-compatible. They simulate smooth repeated knee flexion and extension with small noise.
- The real scorer detrends/recenters the angle signal, so absolute min/max values from the scorer are not expected to stay at exactly 0° and target max°.
- The generated files are suitable for validating ROM and Delta ROM logic, not for claiming clinical model performance on real patients.
