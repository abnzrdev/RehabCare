# Realistic IMU ROM / Delta ROM / Rehab Formula Range Report

## What was generated

- Generated CSV files: **30**
- Folder: `test_data/imu_realistic_sessions/`
- CSV columns: `timestamp, acc_x, acc_y, acc_z, gyro_x, gyro_y, gyro_z, label`
- Each file simulates 8 repetitions with smooth movement and small sensor noise.

## ROM formula

```text
Session ROM = max angle - min angle
Delta ROM signed = current session ROM - previous session ROM
Delta ROM absolute = abs(current session ROM - previous session ROM)
```

## Realistic generated ROM range

- Minimum generated ROM: **30.9°**
- Maximum generated ROM: **148.6°**
- Minimum signed Delta ROM in generated realistic sessions: **-10.2°**
- Maximum signed Delta ROM in generated realistic sessions: **+17.0°**

## Rehab formula used

```text
predicted_delta_KOOS = 139.95 - 0.93*KOOS_pre - 0.785*Delta_ROM + beta3_KL
```

## Rehab formula output range from these realistic generated sessions

- Minimum raw formula output: **10.4** (KOOS=100, KL=1, Delta ROM=17.0°)
- Maximum raw formula output: **130.3** (KOOS=20, KL=0, Delta ROM=-10.2°)
- If displayed as a 0–100 UI score, clamp the raw value to 0–100.

## Session table

| Patient | File | Expected ROM | Min angle | Max angle | ROM | Previous ROM | Signed Delta | Absolute Delta |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| poor_progress | poor_progress_session_01_rom_030.csv | 30.0° | 0.0° | 30.9° | 30.9° | - | - | - |
| poor_progress | poor_progress_session_02_rom_038.csv | 38.0° | 0.0° | 38.8° | 38.8° | 30.9° | +7.9° | 7.9° |
| poor_progress | poor_progress_session_03_rom_045.csv | 45.0° | 0.0° | 45.7° | 45.7° | 38.8° | +6.9° | 6.9° |
| poor_progress | poor_progress_session_04_rom_055.csv | 55.0° | 0.0° | 56.0° | 56.0° | 45.7° | +10.3° | 10.3° |
| poor_progress | poor_progress_session_05_rom_065.csv | 65.0° | 0.0° | 65.7° | 65.7° | 56.0° | +9.7° | 9.7° |
| moderate_progress | moderate_progress_session_01_rom_070.csv | 70.0° | 0.0° | 70.7° | 70.7° | - | - | - |
| moderate_progress | moderate_progress_session_02_rom_082.csv | 82.0° | 0.0° | 82.8° | 82.8° | 70.7° | +12.1° | 12.1° |
| moderate_progress | moderate_progress_session_03_rom_095.csv | 95.0° | 0.0° | 95.7° | 95.7° | 82.8° | +12.9° | 12.9° |
| moderate_progress | moderate_progress_session_04_rom_105.csv | 105.0° | 0.0° | 105.8° | 105.8° | 95.7° | +10.1° | 10.1° |
| moderate_progress | moderate_progress_session_05_rom_115.csv | 115.0° | 0.0° | 115.7° | 115.7° | 105.8° | +9.9° | 9.9° |
| good_progress | good_progress_session_01_rom_115.csv | 115.0° | 0.0° | 116.0° | 116.0° | - | - | - |
| good_progress | good_progress_session_02_rom_125.csv | 125.0° | 0.0° | 125.5° | 125.5° | 116.0° | +9.5° | 9.5° |
| good_progress | good_progress_session_03_rom_135.csv | 135.0° | 0.0° | 135.8° | 135.8° | 125.5° | +10.3° | 10.3° |
| good_progress | good_progress_session_04_rom_142.csv | 142.0° | 0.0° | 142.6° | 142.6° | 135.8° | +6.8° | 6.8° |
| good_progress | good_progress_session_05_rom_148.csv | 148.0° | 0.0° | 148.6° | 148.6° | 142.6° | +6.0° | 6.0° |
| temporary_drop | temporary_drop_session_01_rom_145.csv | 145.0° | 0.0° | 145.5° | 145.5° | - | - | - |
| temporary_drop | temporary_drop_session_02_rom_135.csv | 135.0° | 0.0° | 138.3° | 138.3° | 145.5° | -7.2° | 7.2° |
| temporary_drop | temporary_drop_session_03_rom_125.csv | 125.0° | 0.0° | 128.1° | 128.1° | 138.3° | -10.2° | 10.2° |
| temporary_drop | temporary_drop_session_04_rom_118.csv | 118.0° | 0.0° | 118.7° | 118.7° | 128.1° | -9.4° | 9.4° |
| temporary_drop | temporary_drop_session_05_rom_130.csv | 130.0° | 0.0° | 131.0° | 131.0° | 118.7° | +12.3° | 12.3° |
| stable_patient | stable_patient_session_01_rom_118.csv | 118.0° | 0.0° | 118.4° | 118.4° | - | - | - |
| stable_patient | stable_patient_session_02_rom_121.csv | 121.0° | 0.0° | 121.5° | 121.5° | 118.4° | +3.1° | 3.1° |
| stable_patient | stable_patient_session_03_rom_120.csv | 120.0° | 0.0° | 120.6° | 120.6° | 121.5° | -0.9° | 0.9° |
| stable_patient | stable_patient_session_04_rom_123.csv | 123.0° | 0.0° | 124.0° | 124.0° | 120.6° | +3.5° | 3.5° |
| stable_patient | stable_patient_session_05_rom_122.csv | 122.0° | 0.0° | 122.8° | 122.8° | 124.0° | -1.2° | 1.2° |
| mixed_recovery | mixed_recovery_session_01_rom_085.csv | 85.0° | 0.0° | 85.6° | 85.6° | - | - | - |
| mixed_recovery | mixed_recovery_session_02_rom_100.csv | 100.0° | 0.0° | 100.9° | 100.9° | 85.6° | +15.3° | 15.3° |
| mixed_recovery | mixed_recovery_session_03_rom_095.csv | 95.0° | 0.0° | 95.7° | 95.7° | 100.9° | -5.3° | 5.3° |
| mixed_recovery | mixed_recovery_session_04_rom_112.csv | 112.0° | 0.0° | 112.6° | 112.6° | 95.7° | +17.0° | 17.0° |
| mixed_recovery | mixed_recovery_session_05_rom_125.csv | 125.0° | 0.0° | 125.8° | 125.8° | 112.6° | +13.2° | 13.2° |

## Short explanation for boss

We generated realistic IMU CSV sessions with knee ROM values from low rehab range to high rehab range. Each session ROM is calculated as max angle minus min angle. Delta ROM is calculated only by comparing the current session ROM with the previous session ROM. The generated report shows the realistic ROM range, signed Delta ROM range, and the rehab formula output range using the project formula.