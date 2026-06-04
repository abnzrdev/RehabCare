"""
imu_pipeline.py
===============
Signal-processing and ML logic for the IMU rehabilitation module.
No Streamlit imports — fully testable standalone and importable by FastAPI.

Pipeline (matches LSTM_Activity.ipynb + Rehab_Pipeline.ipynb exactly):

    CSV data (÷32768 space OR auto-detected raw 16-bit)
    → expand to 38 channels  (missing sensors filled with scaler.mean_ → 0 after transform)
    → wavelet denoise per column  (db4, level=4, SURE soft threshold — full signal)
    → StandardScaler.transform
    → sliding windows (window=50, stride=25)
    → LSTM predict (batch)
    → majority-vote smoothing
    → complementary-filter knee angle
    → ROM + rehab score per activity
    → clinical feedback items

Column order — INTERLEAVED, matching classifier_ready.csv exactly:
    accel(3) + gyro(3) per body location × 6 locations, then EMG(2) = 38 total.
"""

from __future__ import annotations

import io
import json
import time
from collections import Counter, deque
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

# ── Paths ────────────────────────────────────────────────────────────────────
_IMU_DIR      = Path(__file__).resolve().parents[1] / "models" / "imu"
MODEL_PATH    = _IMU_DIR / "lstm_classifier.keras"
SCALER_PATH   = _IMU_DIR / "scaler.pkl"
META_PATH     = _IMU_DIR / "model_meta.json"
BASELINE_PATH = _IMU_DIR / "healthy_baseline.csv"
SIM_CSV_PATH  = _IMU_DIR / "classifier_ready.csv"

# ── Signal constants ──────────────────────────────────────────────────────────
WINDOW_SIZE      = 50
STEP_SIZE        = 25
SMOOTHING_WINDOW = 10
SAMPLE_RATE_HZ   = 100
DT               = 1.0 / SAMPLE_RATE_HZ
ALPHA            = 0.98
SCALE_RAW        = 32768.0
GYRO_PHYS        = 2000.0   # dps per ÷32768 unit
ACCEL_PHYS       = 2.0      # g   per ÷32768 unit
MAX_ROWS         = 12_000   # ~120 s at 100 Hz

# ── Feature column order — must match classifier_ready.csv exactly ────────────
# Interleaved by body location: accel(x,y,z) + gyro(x,y,z) per segment, then EMG.
FEATURE_COLS: list[str] = [
    "accelerometer_right_foot_x",  "accelerometer_right_foot_y",  "accelerometer_right_foot_z",
    "gyroscope_right_foot_x",      "gyroscope_right_foot_y",      "gyroscope_right_foot_z",
    "accelerometer_right_shin_x",  "accelerometer_right_shin_y",  "accelerometer_right_shin_z",
    "gyroscope_right_shin_x",      "gyroscope_right_shin_y",      "gyroscope_right_shin_z",
    "accelerometer_right_thigh_x", "accelerometer_right_thigh_y", "accelerometer_right_thigh_z",
    "gyroscope_right_thigh_x",     "gyroscope_right_thigh_y",     "gyroscope_right_thigh_z",
    "accelerometer_left_foot_x",   "accelerometer_left_foot_y",   "accelerometer_left_foot_z",
    "gyroscope_left_foot_x",       "gyroscope_left_foot_y",       "gyroscope_left_foot_z",
    "accelerometer_left_shin_x",   "accelerometer_left_shin_y",   "accelerometer_left_shin_z",
    "gyroscope_left_shin_x",       "gyroscope_left_shin_y",       "gyroscope_left_shin_z",
    "accelerometer_left_thigh_x",  "accelerometer_left_thigh_y",  "accelerometer_left_thigh_z",
    "gyroscope_left_thigh_x",      "gyroscope_left_thigh_y",      "gyroscope_left_thigh_z",
    "EMG_right", "EMG_left",
]  # 38 features

# ── Complementary-filter column indices (right knee) ─────────────────────────
_GYRO_RTHIGH_X  = FEATURE_COLS.index("gyroscope_right_thigh_x")    # 15
_ACCEL_RTHIGH_X = FEATURE_COLS.index("accelerometer_right_thigh_x") # 12
_ACCEL_RTHIGH_Z = FEATURE_COLS.index("accelerometer_right_thigh_z") # 14
_GYRO_RSHIN_X   = FEATURE_COLS.index("gyroscope_right_shin_x")     # 9
_ACCEL_RSHIN_X  = FEATURE_COLS.index("accelerometer_right_shin_x") # 6
_ACCEL_RSHIN_Z  = FEATURE_COLS.index("accelerometer_right_shin_z") # 8

# ── Sensor location → FEATURE_COLS channel indices ───────────────────────────
_SENSOR_LOC: dict[str, dict[str, list[int]]] = {
    "right_foot":  {"accel": [0, 1, 2],   "gyro": [3, 4, 5]},
    "right_shin":  {"accel": [6, 7, 8],   "gyro": [9, 10, 11]},
    "right_thigh": {"accel": [12, 13, 14], "gyro": [15, 16, 17]},
    "left_foot":   {"accel": [18, 19, 20], "gyro": [21, 22, 23]},
    "left_shin":   {"accel": [24, 25, 26], "gyro": [27, 28, 29]},
    "left_thigh":  {"accel": [30, 31, 32], "gyro": [33, 34, 35]},
}

# ── Short column-name aliases (case-insensitive) ──────────────────────────────
_ACCEL_ALIASES: dict[str, int] = {
    "accel_x": 0, "accel_y": 1, "accel_z": 2,
    "acc_x":   0, "acc_y":   1, "acc_z":   2,
    "ax":      0, "ay":      1, "az":      2,
    "a_x":     0, "a_y":     1, "a_z":     2,
    "ax[g]":   0, "ay[g]":   1, "az[g]":   2,
    "xa":      0, "ya":      1, "za":      2,
}
_GYRO_ALIASES: dict[str, int] = {
    "gyro_x":  0, "gyro_y":  1, "gyro_z":  2,
    "gx":      0, "gy":      1, "gz":      2,
    "g_x":     0, "g_y":     1, "g_z":     2,
    "omega_x": 0, "omega_y": 1, "omega_z": 2,
    "wx":      0, "wy":      1, "wz":      2,
    "gx[dps]": 0, "gy[dps]": 1, "gz[dps]": 2,
    "xg":      0, "yg":      1, "zg":      2,
}
_EMG_ALIASES: dict[str, int] = {
    "emg_right": 36, "emg_left": 37,
    "emg":       36, "emg_r":    36, "emg_l": 37,
    "emg_signal": 36, "emg_raw": 36,
}

_HUGADB_SEGMENT_MAP: dict[str, str] = {
    "rf": "right_foot",
    "rs": "right_shin",
    "rt": "right_thigh",
    "lf": "left_foot",
    "ls": "left_shin",
    "lt": "left_thigh",
}

_IMU_SENSOR_SETUP_NOTES: dict[str, str] = {
    "simple_single_sensor": (
        "Single-sensor IMU CSV detected. Rehab scoring uses the available gyroscope "
        "channels plus pitch or accelerometer tilt from one sensor."
    ),
    "hugadb_6imu_2emg": (
        "HuGaDB-style multi-sensor CSV detected. RF/RS/RT/LF/LS/LT are mapped to "
        "right/left foot, shin, and thigh. Knee ROM uses right thigh and right shin "
        "when available, or right thigh only as fallback."
    ),
    "orthoscan_38ch": (
        "Full 38-channel OrthoScan CSV detected. Knee ROM uses right thigh and right "
        "shin IMUs when available, or right thigh only as fallback."
    ),
}

SENSOR_LOCATION_LABELS: dict[str, str] = {
    "Right Thigh  (best for knee rehab)": "right_thigh",
    "Right Shin":   "right_shin",
    "Right Foot":   "right_foot",
    "Left Thigh":   "left_thigh",
    "Left Shin":    "left_shin",
    "Left Foot":    "left_foot",
}

ACTIVITY_LABELS: dict[str, str] = {
    "going_down":   "Going Down Stairs",
    "going_up":     "Going Up Stairs",
    "running":      "Running",
    "sitting":      "Sitting",
    "sitting_down": "Sitting Down",
    "standing":     "Standing",
    "standing_up":  "Standing Up",
    "walking":      "Walking",
}

# ── Clinical feedback database ────────────────────────────────────────────────
_FEEDBACK_DB: dict[str, dict[str, tuple[str, str]]] = {
    "walking": {
        "excellent": ("ok",    "Movement is correct and smooth. Excellent walking pattern with strong range of motion."),
        "good":      ("ok",    "Good walking pattern. Range of motion is within healthy limits. Continue your program."),
        "fair":      ("warn",  "Walking range is slightly limited. Focus on heel-to-toe motion and ankle mobility exercises."),
        "poor":      ("alert", "Warning: Significant walking restriction detected. Consult your physiotherapist for a gait assessment."),
    },
    "going_up": {
        "excellent": ("ok",    "Stair ascent is smooth with excellent knee flexion. Great progress!"),
        "good":      ("ok",    "Stair ascent is adequate. Maintain step-up exercises to improve further."),
        "fair":      ("warn",  "Knee flexion during stair ascent is restricted. Practice step-up exercises and hip flexor stretching."),
        "poor":      ("alert", "Warning: Significant restriction during stair ascent. High fall risk — use the handrail and consult your physiotherapist."),
    },
    "going_down": {
        "excellent": ("ok",    "Stair descent is controlled with excellent eccentric muscle strength."),
        "good":      ("ok",    "Stair descent is within normal range. Continue quadriceps strengthening."),
        "fair":      ("warn",  "Caution: Stair descent shows restriction. Work on quadriceps control, balance, and slow eccentric loading."),
        "poor":      ("alert", "Warning: Stair descent is significantly compromised. High fall risk — use handrail and avoid stairs when possible."),
    },
    "running": {
        "excellent": ("ok",    "Running mechanics show excellent symmetry and full range of motion."),
        "good":      ("ok",    "Running pattern is good. Focus on maintaining consistent stride and cadence."),
        "fair":      ("warn",  "Running range is restricted. Gradually increase pace; do not push through pain."),
        "poor":      ("alert", "Warning: Running is not recommended at this recovery stage. Continue walking and low-impact rehabilitation exercises."),
    },
    "sitting": {
        "excellent": ("ok",    "Sitting posture and knee flexion angle are excellent."),
        "good":      ("ok",    "Sitting mechanics are within normal limits."),
        "fair":      ("warn",  "Sitting range is slightly limited. Practice seated knee extension and flexion exercises."),
        "poor":      ("alert", "Warning: Significant limitation detected during sitting. Consider seated cushion support and physiotherapy exercises."),
    },
    "sitting_down": {
        "excellent": ("ok",    "Sit-to-floor transition is smooth and well-controlled."),
        "good":      ("ok",    "Sitting down mechanics are adequate. Ensure controlled descent."),
        "fair":      ("warn",  "Sitting down motion is restricted. Slow the movement, use armrests, and engage core muscles."),
        "poor":      ("alert", "Warning: Sitting down is significantly compromised. Use assistive devices and consult your physiotherapist."),
    },
    "standing": {
        "excellent": ("ok",    "Standing balance and knee alignment are excellent."),
        "good":      ("ok",    "Standing mechanics are within normal limits."),
        "fair":      ("warn",  "Standing posture shows minor imbalance. Incorporate balance exercises such as single-leg stands."),
        "poor":      ("alert", "Warning: Standing alignment is compromised. Balance and proprioception training is strongly recommended."),
    },
    "standing_up": {
        "excellent": ("ok",    "Stand-up motion is smooth and symmetric. Excellent leg strength."),
        "good":      ("ok",    "Stand-up mechanics are good. Continue strengthening exercises such as mini-squats."),
        "fair":      ("warn",  "Standing up motion shows restriction. Focus on quadriceps and glute strengthening to improve sit-to-stand."),
        "poor":      ("alert", "Warning: Significant difficulty standing up detected. Chair height adjustment and physiotherapy are recommended."),
    },
}
_FEEDBACK_DEFAULT: dict[str, tuple[str, str]] = {
    "excellent": ("ok",    "Excellent range of motion. Movement quality is very high."),
    "good":      ("ok",    "Good range of motion. Continue your rehabilitation program."),
    "fair":      ("warn",  "Range of motion is limited. Focus on controlled stretching exercises."),
    "poor":      ("alert", "Warning: Significant range restriction. Consult your physiotherapist."),
}


def _score_tier(score: float) -> str:
    if score >= 85: return "excellent"
    if score >= 65: return "good"
    if score >= 45: return "fair"
    return "poor"


def _note_with_emg(base_note: str, emg_detected: bool) -> str:
    if not emg_detected:
        return base_note
    return (
        f"{base_note} EMG channels detected and stored for movement-quality / future "
        "ML analysis. Current rehab score formula uses KOOS_pre, Delta ROM, and KL grade."
    )


def _get_matching_series(
    df: pd.DataFrame,
    cols_lc: dict[str, str],
    aliases: list[str],
) -> tuple[Optional[np.ndarray], Optional[str]]:
    for alias in aliases:
        orig = cols_lc.get(alias)
        if orig is not None:
            return df[orig].to_numpy(dtype=np.float64), orig
    return None, None


def _emg_channel_summary(source_column: Optional[str], values: Optional[np.ndarray]) -> Optional[dict]:
    if source_column is None or values is None:
        return None
    abs_vals = np.abs(values.astype(np.float64))
    rms = float(np.sqrt(np.mean(np.square(values.astype(np.float64))))) if len(values) else 0.0
    return {
        "source_column": source_column,
        "mean_abs": round(float(np.mean(abs_vals)) if len(abs_vals) else 0.0, 4),
        "rms": round(rms, 4),
    }


def _resolve_uploaded_sensor_columns(df: pd.DataFrame) -> dict:
    cols_lc = {c.strip().lower(): c for c in df.columns}

    # Prefer exact/full schema matches first.
    orthoscan_channels: dict[str, np.ndarray] = {}
    orthoscan_real_names: list[str] = []
    orthoscan_emg_names: list[str] = []
    orthoscan_emg_sources: dict[str, Optional[str]] = {"EMG_right": None, "EMG_left": None}
    for feature in FEATURE_COLS:
        orig = cols_lc.get(feature.lower())
        if orig is None:
            continue
        orthoscan_channels[feature] = df[orig].to_numpy(dtype=np.float64)
        orthoscan_real_names.append(orig)
        if feature in {"EMG_right", "EMG_left"}:
            orthoscan_emg_names.append(orig)
            orthoscan_emg_sources[feature] = orig
    if orthoscan_channels:
        emg_detected = bool(orthoscan_emg_names)
        return {
            "sensor_format": "orthoscan_38ch",
            "channels": orthoscan_channels,
            "real_channel_names": orthoscan_real_names,
            "emg_detected": emg_detected,
            "emg_channels": orthoscan_emg_names,
            "sensor_setup_note": _note_with_emg(_IMU_SENSOR_SETUP_NOTES["orthoscan_38ch"], emg_detected),
            "emg_summary": {
                "EMG_right": _emg_channel_summary(
                    orthoscan_emg_sources["EMG_right"],
                    orthoscan_channels.get("EMG_right"),
                ),
                "EMG_left": _emg_channel_summary(
                    orthoscan_emg_sources["EMG_left"],
                    orthoscan_channels.get("EMG_left"),
                ),
            },
        }

    hugadb_channels: dict[str, np.ndarray] = {}
    hugadb_real_names: list[str] = []
    for prefix, location in _HUGADB_SEGMENT_MAP.items():
        for sensor_kind, feature_prefix in (("acc", "accelerometer"), ("gyro", "gyroscope")):
            for axis in "xyz":
                alias = f"{prefix}_{sensor_kind}_{axis}"
                orig = cols_lc.get(alias)
                if orig is None:
                    continue
                canonical_name = f"{feature_prefix}_{location}_{axis}"
                hugadb_channels[canonical_name] = df[orig].to_numpy(dtype=np.float64)
                hugadb_real_names.append(orig)
    emg_right, emg_right_name = _get_matching_series(df, cols_lc, ["r_emg"])
    emg_left, emg_left_name = _get_matching_series(df, cols_lc, ["l_emg"])
    hugadb_emg_names = [name for name in [emg_right_name, emg_left_name] if name is not None]
    if emg_right is not None:
        hugadb_channels["EMG_right"] = emg_right
    if emg_left is not None:
        hugadb_channels["EMG_left"] = emg_left
    if hugadb_channels:
        real_names = hugadb_real_names + hugadb_emg_names
        emg_detected = bool(hugadb_emg_names)
        return {
            "sensor_format": "hugadb_6imu_2emg",
            "channels": hugadb_channels,
            "real_channel_names": real_names,
            "emg_detected": emg_detected,
            "emg_channels": hugadb_emg_names,
            "sensor_setup_note": _note_with_emg(_IMU_SENSOR_SETUP_NOTES["hugadb_6imu_2emg"], emg_detected),
            "emg_summary": {
                "EMG_right": _emg_channel_summary(emg_right_name, emg_right),
                "EMG_left": _emg_channel_summary(emg_left_name, emg_left),
            },
        }

    simple_channels: dict[str, np.ndarray] = {}
    simple_real_names: list[str] = []
    for key, aliases in {
        "gyro_x": ["gyro_x", "gx", "g_x", "omega_x", "wx"],
        "gyro_y": ["gyro_y", "gy", "g_y", "omega_y", "wy"],
        "gyro_z": ["gyro_z", "gz", "g_z", "omega_z", "wz"],
        "pitch": ["pitch"],
        "acc_x": ["acc_x", "accel_x", "ax", "a_x"],
        "acc_z": ["acc_z", "accel_z", "az", "a_z"],
    }.items():
        values, orig = _get_matching_series(df, cols_lc, aliases)
        if values is not None and orig is not None:
            simple_channels[key] = values
            simple_real_names.append(orig)

    emg_right, emg_right_name = _get_matching_series(df, cols_lc, ["emg_right", "emg", "emg_r", "emg_signal", "emg_raw"])
    emg_left, emg_left_name = _get_matching_series(df, cols_lc, ["emg_left", "emg_l"])
    if emg_right is not None:
        simple_channels["EMG_right"] = emg_right
    if emg_left is not None:
        simple_channels["EMG_left"] = emg_left
    simple_emg_names = [name for name in [emg_right_name, emg_left_name] if name is not None]
    if simple_channels:
        real_names = simple_real_names + simple_emg_names
        emg_detected = bool(simple_emg_names)
        return {
            "sensor_format": "simple_single_sensor",
            "channels": simple_channels,
            "real_channel_names": real_names,
            "emg_detected": emg_detected,
            "emg_channels": simple_emg_names,
            "sensor_setup_note": _note_with_emg(_IMU_SENSOR_SETUP_NOTES["simple_single_sensor"], emg_detected),
            "emg_summary": {
                "EMG_right": _emg_channel_summary(emg_right_name, emg_right),
                "EMG_left": _emg_channel_summary(emg_left_name, emg_left),
            },
        }

    return {
        "sensor_format": "simple_single_sensor",
        "channels": {},
        "real_channel_names": [],
        "emg_detected": False,
        "emg_channels": [],
        "sensor_setup_note": _IMU_SENSOR_SETUP_NOTES["simple_single_sensor"],
        "emg_summary": {"EMG_right": None, "EMG_left": None},
    }


def _estimate_segment_angles(
    gyro_x: Optional[np.ndarray],
    acc_x: Optional[np.ndarray],
    acc_z: Optional[np.ndarray],
    n: int,
) -> np.ndarray:
    angle = 0.0
    use_accel = acc_x is not None and acc_z is not None
    out = np.zeros(n, dtype=np.float64)
    for i in range(n):
        gyro_dps = float(gyro_x[i]) * GYRO_PHYS if gyro_x is not None else 0.0
        if use_accel:
            angle = complementary_step(
                angle,
                gyro_dps,
                float(acc_x[i]) * ACCEL_PHYS,
                float(acc_z[i]) * ACCEL_PHYS,
            )
        else:
            angle = angle + (gyro_dps * DT)
        out[i] = angle
    return out


def generate_clinical_feedback(
    rom_scores: list[dict],
    dominant_activity: str,
    overall_score: float,
) -> list[dict]:
    """Return a list of feedback cards {level, title, text, score}."""
    items: list[dict] = []

    tier = _score_tier(overall_score)
    overall_msgs = {
        "excellent": ("ok",    "Overall: Movement quality is excellent. Rehabilitation is progressing very well!"),
        "good":      ("ok",    "Overall: Movement is correct and smooth. Good rehabilitation progress — keep it up."),
        "fair":      ("warn",  "Overall: Movement shows some restrictions. Continue your rehabilitation program and track your progress."),
        "poor":      ("alert", "Overall: Significant movement restriction detected. Please consult your physiotherapist to review your plan."),
    }
    lvl, txt = overall_msgs[tier]
    items.append({"level": lvl, "title": "Overall Assessment", "text": txt, "score": overall_score})

    for row in rom_scores:
        act   = row["activity"]
        score = row["score_pct"]
        t     = _score_tier(score)
        db    = _FEEDBACK_DB.get(act, _FEEDBACK_DEFAULT)
        lvl, txt = db.get(t, _FEEDBACK_DEFAULT[t])
        label = ACTIVITY_LABELS.get(act, act.replace("_", " ").title())
        items.append({"level": lvl, "title": label, "text": txt, "score": score, "activity": act})

    return items


# ── Model asset loaders ───────────────────────────────────────────────────────
def assets_available() -> bool:
    return MODEL_PATH.exists() and SCALER_PATH.exists()


def load_classifier():
    import tensorflow as tf
    return tf.keras.models.load_model(str(MODEL_PATH))


def load_scaler():
    import joblib
    return joblib.load(str(SCALER_PATH))


def load_metadata() -> dict:
    with open(META_PATH) as f:
        return json.load(f)


def load_baseline() -> dict[str, float]:
    df = pd.read_csv(BASELINE_PATH)
    return dict(zip(df["activity"], df["healthy_avg"]))


# ── Signal processing ─────────────────────────────────────────────────────────
def complementary_step(prev_angle: float, gyro_dps: float, acc_x: float, acc_z: float) -> float:
    """One step of the complementary filter → angle in degrees."""
    accel_angle = np.degrees(np.arctan2(acc_x, acc_z))
    return ALPHA * (prev_angle + gyro_dps * DT) + (1.0 - ALPHA) * accel_angle


def wavelet_denoise_signal(signal: np.ndarray) -> np.ndarray:
    """SURE soft-threshold denoising on a 1D signal. Falls back to raw if pywt absent."""
    try:
        import pywt
    except ImportError:
        return signal
    coeffs = pywt.wavedec(signal, "db4", level=4)
    sigma  = np.median(np.abs(coeffs[-1])) / 0.6745
    thr    = sigma * np.sqrt(2 * np.log(max(len(signal), 2)))
    coeffs = [coeffs[0]] + [pywt.threshold(d, thr, mode="soft") for d in coeffs[1:]]
    return pywt.waverec(coeffs, "db4")[: len(signal)]


def smooth_predictions(labels: list[str], window: int = SMOOTHING_WINDOW) -> list[str]:
    """Majority-vote smoothing over a ±window neighbourhood."""
    arr = np.array(labels)
    out = []
    for i in range(len(arr)):
        start = max(0, i - window)
        end   = min(len(arr), i + window + 1)
        chunk = arr[start:end]
        unique, counts = np.unique(chunk, return_counts=True)
        out.append(str(unique[np.argmax(counts)]))
    return out


# ── Sensor source abstractions ────────────────────────────────────────────────
class SensorSource:
    def read(self) -> Optional[np.ndarray]: ...
    def close(self) -> None: ...


class SerialSensorSource(SensorSource):
    """Reads CSV-style lines (38 floats per line) from a serial / Bluetooth port."""

    def __init__(self, port: str, baudrate: int = 115_200, timeout: float = 0.5):
        import serial
        self._serial = serial.Serial(port=port, baudrate=baudrate, timeout=timeout)

    def read(self) -> Optional[np.ndarray]:
        line = self._serial.readline().decode(errors="ignore").strip()
        if not line:
            return None
        parts = line.split(",")
        if len(parts) < 38:
            return None
        try:
            return np.asarray([float(x) for x in parts[:38]], dtype=np.float32)
        except ValueError:
            return None

    def close(self) -> None:
        try:
            self._serial.close()
        except Exception:
            pass


class SimulatedSensorSource(SensorSource):
    """Replays classifier_ready.csv at ~100 Hz — demo without hardware."""

    def __init__(self, csv_path: Path = SIM_CSV_PATH, max_rows: int = 60_000):
        self._iter      = pd.read_csv(csv_path, usecols=FEATURE_COLS, chunksize=2048)
        self._buffer: deque = deque()
        self._max_rows  = max_rows
        self._served    = 0
        self._last_emit = time.monotonic()

    def _refill(self) -> None:
        try:
            chunk = next(self._iter)
            self._buffer.extend(chunk[FEATURE_COLS].to_numpy(dtype=np.float32))
        except StopIteration:
            pass

    def read(self) -> Optional[np.ndarray]:
        if self._served >= self._max_rows:
            return None
        if not self._buffer:
            self._refill()
        if not self._buffer:
            return None
        now   = time.monotonic()
        sleep = DT - (now - self._last_emit)
        if sleep > 0:
            time.sleep(sleep)
        self._last_emit = time.monotonic()
        self._served += 1
        return self._buffer.popleft()

    def close(self) -> None:
        self._buffer.clear()


# ── Column expansion ──────────────────────────────────────────────────────────
def expand_to_38ch(
    df: pd.DataFrame,
    scaler=None,
    sensor_location: str = "right_thigh",
) -> tuple[np.ndarray, dict]:
    """
    Expand a partial-sensor DataFrame to the full 38-channel FEATURE_COLS schema.

    Returns
    -------
    data   : np.ndarray  shape (N, 38), float32, in ÷32768 space
    report : dict        {"real": [...], "simulated": [...], "n_real": int}

    Missing channels are filled with scaler.mean_[i] so they become ≈0 after
    StandardScaler.transform (neutral contribution to LSTM input).

    Auto-detection: if any real accel channel has |value| > 100, the data is
    treated as raw 16-bit integers and divided by SCALE_RAW (32768).
    """
    if sensor_location not in _SENSOR_LOC:
        raise ValueError(
            f"Unknown sensor_location '{sensor_location}'. "
            f"Valid: {sorted(_SENSOR_LOC)}"
        )

    n       = len(df)
    cols_lc = {c.strip().lower(): c for c in df.columns}

    # Neutral fill values (in ÷32768 space → becomes 0 after scaler.transform)
    neutral = scaler.mean_.astype(np.float64) if scaler is not None else np.zeros(38)

    out = np.empty((n, 38), dtype=np.float64)
    for i in range(38):
        out[:, i] = neutral[i]

    real_idx: set[int] = set()

    # 1. Exact FEATURE_COLS column matches
    for i, col in enumerate(FEATURE_COLS):
        if col in df.columns:
            out[:, i] = df[col].to_numpy(dtype=np.float64)
            real_idx.add(i)

    # 2. Short alias mapping to the selected sensor location
    loc_accel = _SENSOR_LOC[sensor_location]["accel"]
    loc_gyro  = _SENSOR_LOC[sensor_location]["gyro"]

    for alias, axis in _ACCEL_ALIASES.items():
        orig = cols_lc.get(alias)
        if orig is not None:
            fi = loc_accel[axis]
            if fi not in real_idx:
                out[:, fi] = df[orig].to_numpy(dtype=np.float64)
                real_idx.add(fi)

    for alias, axis in _GYRO_ALIASES.items():
        orig = cols_lc.get(alias)
        if orig is not None:
            fi = loc_gyro[axis]
            if fi not in real_idx:
                out[:, fi] = df[orig].to_numpy(dtype=np.float64)
                real_idx.add(fi)

    for alias, fi in _EMG_ALIASES.items():
        orig = cols_lc.get(alias)
        if orig is not None and fi not in real_idx:
            out[:, fi] = df[orig].to_numpy(dtype=np.float64)
            real_idx.add(fi)

    if not real_idx:
        raise ValueError(
            "No recognised sensor columns in uploaded CSV.\n"
            "Accepted: accel_x/y/z · gyro_x/y/z · ax/ay/az · gx/gy/gz "
            f"or full names like {FEATURE_COLS[:3]}"
        )

    # 3. Auto-detect raw 16-bit vs already-normalized (÷32768)
    accel_fi   = [i for i in real_idx if "accelerometer" in FEATURE_COLS[i]]
    gyro_fi    = [i for i in real_idx if "gyroscope"     in FEATURE_COLS[i]]
    if accel_fi:
        max_abs = float(np.abs(out[:, accel_fi]).max())
        if max_abs > 100.0:
            for i in accel_fi:
                out[:, i] /= SCALE_RAW
            for i in gyro_fi:
                out[:, i] /= SCALE_RAW

    real_cols = [FEATURE_COLS[i] for i in sorted(real_idx)]
    sim_cols  = [FEATURE_COLS[i] for i in range(38) if i not in real_idx]
    return out.astype(np.float32), {"real": real_cols, "simulated": sim_cols, "n_real": len(real_cols)}


class CsvUploadSensorSource(SensorSource):
    """Streams rows from a user-uploaded single-sensor CSV at ~100 Hz."""

    def __init__(self, csv_bytes: bytes, scaler=None, sensor_location: str = "right_thigh") -> None:
        df_raw = pd.read_csv(io.BytesIO(csv_bytes), encoding="utf-8-sig")
        df_raw.columns = df_raw.columns.str.strip()
        expanded, self.report = expand_to_38ch(df_raw, scaler=scaler, sensor_location=sensor_location)
        self._rows      = expanded
        self._idx       = 0
        self._last_emit = time.monotonic()

    def __len__(self) -> int:
        return len(self._rows)

    def read(self) -> Optional[np.ndarray]:
        if self._idx >= len(self._rows):
            return None
        now   = time.monotonic()
        sleep = DT - (now - self._last_emit)
        if sleep > 0:
            time.sleep(sleep)
        self._last_emit = time.monotonic()
        row = self._rows[self._idx]
        self._idx += 1
        return row

    def close(self) -> None:
        pass


def open_sensor(mode: str, port: str = "", baudrate: int = 115_200) -> SensorSource:
    if mode == "Simulation (replay CSV)":
        if not SIM_CSV_PATH.exists():
            raise FileNotFoundError(f"Simulation CSV not found at {SIM_CSV_PATH}")
        return SimulatedSensorSource()
    if not port:
        raise ValueError("Port is required for Serial / Bluetooth mode.")
    return SerialSensorSource(port=port, baudrate=baudrate)


# ── Batch analysis (FastAPI endpoint) ────────────────────────────────────────
def analyze_imu_csv(
    csv_bytes: bytes,
    scaler,
    classifier,
    baseline: dict[str, float],
    activity_names: list[str],
    sensor_location: str = "right_thigh",
) -> dict:
    """
    Full batch pipeline for an uploaded single-sensor CSV.

    Steps
    -----
    1.  Parse CSV → expand to 38 channels (missing sensors → scaler.mean_ neutral fill).
    2.  Clip to MAX_ROWS.
    3.  Wavelet denoise per column (full signal, matches training notebook).
    4.  StandardScaler.transform.
    5.  Sliding windows (50 × 38), LSTM batch predict.
    6.  Majority-vote smoothing.
    7.  Map window labels back to rows.
    8.  Complementary-filter knee angle per sample.
    9.  ROM + rehab score per activity.
    10. Generate clinical feedback.

    Returns a JSON-ready dict.
    """
    # 1. Parse + expand
    df = pd.read_csv(io.BytesIO(csv_bytes), encoding="utf-8-sig")
    df.columns = df.columns.str.strip()
    data_38ch, report = expand_to_38ch(df, scaler=scaler, sensor_location=sensor_location)

    if len(data_38ch) > MAX_ROWS:
        data_38ch = data_38ch[:MAX_ROWS]
    n = len(data_38ch)

    if n < WINDOW_SIZE:
        raise ValueError(
            f"CSV has only {n} rows; need at least {WINDOW_SIZE} "
            f"({WINDOW_SIZE / SAMPLE_RATE_HZ:.1f} s at 100 Hz)."
        )

    # 2. Wavelet denoise per column (full signal — matches notebook exactly)
    data_f64 = data_38ch.astype(np.float64)
    for c in range(38):
        data_f64[:, c] = wavelet_denoise_signal(data_f64[:, c])

    # 3. StandardScaler transform  →  (N, 38) in z-score space
    data_scaled = scaler.transform(data_f64).astype(np.float32)

    # 4. Build sliding windows and run LSTM (batch)
    windows: list[np.ndarray] = []
    win_end_idx: list[int]    = []
    for start in range(0, n - WINDOW_SIZE, STEP_SIZE):
        windows.append(data_scaled[start : start + WINDOW_SIZE])
        win_end_idx.append(start + WINDOW_SIZE - 1)

    if not windows:
        raise ValueError("Not enough rows to create any inference windows.")

    X      = np.stack(windows, axis=0)                          # (W, 50, 38)
    proba  = classifier.predict(X, batch_size=256, verbose=0)   # (W, 8)
    preds  = np.argmax(proba, axis=1)
    labels = [str(activity_names[int(p)]) for p in preds]

    # 5. Majority-vote smoothing
    smoothed    = smooth_predictions(labels)
    act_counter = Counter(smoothed)
    dominant    = act_counter.most_common(1)[0][0]

    # 6. Map window predictions back to row-level labels (forward fill)
    row_labels = [dominant] * n
    for idx, lbl in zip(win_end_idx, smoothed):
        row_labels[idx] = lbl
    last = dominant
    for i in range(n):
        if row_labels[i] != dominant or i == 0:
            last = row_labels[i]
        else:
            row_labels[i] = last

    # 7. Complementary-filter knee angle (on raw ÷32768 data for physical units)
    # If shin sensor is simulated, keep shin_angle=0 (thigh ≈ knee proxy).
    real_set         = set(report["real"])
    shin_gyro_real   = FEATURE_COLS[_GYRO_RSHIN_X]  in real_set
    shin_accel_real  = FEATURE_COLS[_ACCEL_RSHIN_X] in real_set

    thigh_angle = shin_angle = 0.0
    knee_angles: list[float] = []

    for i in range(n):
        s = data_38ch[i]

        gyro_thigh = float(s[_GYRO_RTHIGH_X])  * GYRO_PHYS
        acc_th_x   = float(s[_ACCEL_RTHIGH_X]) * ACCEL_PHYS
        acc_th_z   = float(s[_ACCEL_RTHIGH_Z]) * ACCEL_PHYS

        thigh_angle = complementary_step(thigh_angle, gyro_thigh, acc_th_x, acc_th_z)

        if shin_gyro_real or shin_accel_real:
            gyro_shin  = float(s[_GYRO_RSHIN_X])  * GYRO_PHYS
            acc_sh_x   = float(s[_ACCEL_RSHIN_X]) * ACCEL_PHYS
            acc_sh_z   = float(s[_ACCEL_RSHIN_Z]) * ACCEL_PHYS
            shin_angle = complementary_step(shin_angle, gyro_shin, acc_sh_x, acc_sh_z)
        else:
            shin_angle = 0.0  # treat shin as stationary — thigh ≈ knee proxy

        knee_angles.append(thigh_angle - shin_angle)

    # 8. Collect knee angles by activity
    knee_per_act: dict[str, list[float]] = {}
    for i, lbl in enumerate(row_labels):
        knee_per_act.setdefault(lbl, []).append(knee_angles[i])

    # 9. ROM + score per activity
    rom_scores: list[dict] = []
    score_sum = n_scored = 0

    for act in sorted(knee_per_act):
        angles = knee_per_act[act]
        if len(angles) < 50:
            continue
        min_angle = float(min(angles))
        max_angle = float(max(angles))
        rom     = float(max_angle - min_angle)
        healthy = float(baseline.get(act, 0.0))
        score   = min((rom / healthy) * 100.0, 100.0) if healthy > 0 else 0.0
        rom_scores.append({
            "activity":         act,
            "activity_label":   ACTIVITY_LABELS.get(act, act.replace("_", " ").title()),
            "min_angle_deg":    round(min_angle, 1),
            "max_angle_deg":    round(max_angle, 1),
            "rom_deg":          round(rom, 1),
            "healthy_baseline": round(healthy, 1),
            "score_pct":        round(score, 1),
        })
        score_sum += score
        n_scored  += 1

    rom_scores.sort(key=lambda x: -x["score_pct"])
    overall_score = round(score_sum / n_scored, 1) if n_scored else 0.0

    # 10. Clinical feedback
    feedback = generate_clinical_feedback(rom_scores, dominant, overall_score)

    return {
        "session_summary": {
            "total_samples":        n,
            "n_windows":            len(windows),
            "n_real_channels":      report["n_real"],
            "n_simulated_channels": len(report["simulated"]),
            "real_channel_names":   report["real"],
            "sensor_location":      sensor_location,
        },
        "min_angle_deg":    None,
        "max_angle_deg":    None,
        "rom_deg":          rom_scores[0]["rom_deg"] if rom_scores else None,
        "previous_rom_deg": None,
        "delta_rom_signed_deg": None,
        "delta_rom_abs_deg": None,
        "delta_rom_used_in_score_deg": None,
        "delta_rom_formula_explanation": {
            "title": "Delta ROM calculation",
            "steps": [
                "Current ROM = current max angle - current min angle",
                "Previous ROM = previous max angle - previous min angle",
                "Delta ROM = current ROM - previous ROM",
                "Absolute Delta ROM = abs(current ROM - previous ROM)",
            ],
        },
        "dominant_activity":       dominant,
        "dominant_activity_label": ACTIVITY_LABELS.get(dominant, dominant),
        "activity_breakdown": {
            act: {
                "count": cnt,
                "pct":   round(cnt / len(smoothed) * 100, 1),
                "label": ACTIVITY_LABELS.get(act, act),
            }
            for act, cnt in act_counter.most_common()
        },
        "rom_scores":    rom_scores,
        "overall_score": overall_score,
        "feedback":      feedback,
        "source":        "real",
    }


# ── Rehabilitation biomechanical scoring (no LSTM required) ──────────────────
_REHAB_GOOD_ROM_DEG  = 45.0   # degrees — healthy knee extension target
_REHAB_MIN_ROM_DEG   = 15.0   # degrees — poor/incomplete ROM cutoff
_REHAB_HIGH_GYRO_STD = 80.0   # °/s — shaky/unstable threshold
_REHAB_MED_GYRO_STD  = 35.0   # °/s — moderate instability threshold


def score_rehab_exercise(
    csv_bytes: bytes,
    sensor_location: str = "right_thigh",
) -> dict:
    """
    Biomechanical rehabilitation scoring from uploaded IMU CSVs.

    Supports:
      1. Simple single-sensor CSVs (gyro_x/gyro_y/gyro_z, acc_x/acc_z, pitch)
      2. Full OrthoScan 38-channel CSVs
      3. HuGaDB-style 6 IMU + 2 EMG CSVs (RF/RS/RT/LF/LS/LT, r_EMG/l_EMG)

    Does NOT use the LSTM model — analyses raw signals directly:
      Shakiness — std of gyro-magnitude signal (°/s)
      ROM       — detrended pitch range for simple CSVs, or
                  complementary-filter knee angle from thigh/shin IMUs

    Returns the same JSON schema as analyze_imu_csv() so the frontend
    renders without any changes.
    """
    import hashlib

    df = pd.read_csv(io.BytesIO(csv_bytes), encoding="utf-8-sig")
    df.columns = df.columns.str.strip()
    resolved = _resolve_uploaded_sensor_columns(df)
    channels = resolved["channels"]
    sensor_format = resolved["sensor_format"]
    emg_detected = resolved["emg_detected"]
    emg_channels = resolved["emg_channels"]
    sensor_setup_note = resolved["sensor_setup_note"]
    emg_summary = resolved["emg_summary"]

    # Fingerprint — proves a fresh file is being processed on every request
    file_hash = hashlib.md5(csv_bytes).hexdigest()[:10]

    n = len(df)

    if sensor_format == "simple_single_sensor":
        gx = channels.get("gyro_x")
        gy = channels.get("gyro_y")
        gz = channels.get("gyro_z")
        pitch = channels.get("pitch")
        ax = channels.get("acc_x")
        az = channels.get("acc_z")
        smoothness_components = [c for c in [gx, gy, gz] if c is not None]
    else:
        pitch = None
        ax = None
        az = None
        gx = channels.get("gyroscope_right_thigh_x")
        gy = channels.get("gyroscope_right_thigh_y")
        gz = channels.get("gyroscope_right_thigh_z")
        smoothness_components = [
            channels.get("gyroscope_right_thigh_x"),
            channels.get("gyroscope_right_thigh_y"),
            channels.get("gyroscope_right_thigh_z"),
            channels.get("gyroscope_right_shin_x"),
            channels.get("gyroscope_right_shin_y"),
            channels.get("gyroscope_right_shin_z"),
        ]
        smoothness_components = [c for c in smoothness_components if c is not None]

    if not smoothness_components:
        raise ValueError(
            "No gyroscope columns found in CSV. Expected either simple columns "
            "gyro_x/gyro_y/gyro_z, full 38-channel OrthoScan columns, or HuGaDB-style "
            "columns like RT_gyro_x / RS_gyro_x."
        )

    # ── Shakiness: std of gyro-magnitude per sample ───────────────────────────
    gyro_mag = np.sqrt(sum(c ** 2 for c in smoothness_components))
    gyro_std   = float(np.std(gyro_mag))

    # ── ROM: detrend before computing range to strip integration drift ────────
    # RPi MPU6050 libraries often output pitch as an integrated (cumulative)
    # angle, not a bounded arctan value.  Without detrending, a 60-second
    # recording can show 10 000°+ range while the actual knee motion is ~45°.
    # Linear detrending removes the DC drift while preserving the oscillations.
    def _detrend(arr: np.ndarray) -> np.ndarray:
        if len(arr) < 2:
            return arr
        t = np.arange(len(arr), dtype=np.float64)
        slope, intercept = np.polyfit(t, arr, 1)
        return arr - (slope * t + intercept)

    if sensor_format == "simple_single_sensor" and pitch is not None:
        angle_arr = _detrend(pitch)
    elif sensor_format == "simple_single_sensor" and ax is not None and az is not None:
        # arctan2 is already bounded (-180 to 180); no detrending needed
        angle_arr = np.degrees(np.arctan2(ax, np.abs(az)))
    else:
        thigh_angles = _estimate_segment_angles(
            channels.get("gyroscope_right_thigh_x"),
            channels.get("accelerometer_right_thigh_x"),
            channels.get("accelerometer_right_thigh_z"),
            n,
        )
        shin_gyro_x = channels.get("gyroscope_right_shin_x")
        shin_acc_x = channels.get("accelerometer_right_shin_x")
        shin_acc_z = channels.get("accelerometer_right_shin_z")
        if shin_gyro_x is not None or (shin_acc_x is not None and shin_acc_z is not None):
            shin_angles = _estimate_segment_angles(shin_gyro_x, shin_acc_x, shin_acc_z, n)
            angle_arr = thigh_angles - shin_angles
        else:
            angle_arr = thigh_angles

    min_angle_deg = float(np.min(angle_arr)) if angle_arr is not None else None
    max_angle_deg = float(np.max(angle_arr)) if angle_arr is not None else None
    rom_deg = float(max_angle_deg - min_angle_deg) if angle_arr is not None else 0.0

    # ── Continuous component scores (0–100) ───────────────────────────────────
    gyro_score = float(np.clip(
        100.0 * (1.0 - gyro_std / _REHAB_HIGH_GYRO_STD), 0.0, 100.0
    ))
    rom_score = float(np.clip(
        rom_deg / _REHAB_GOOD_ROM_DEG * 100.0, 0.0, 100.0
    )) if angle_arr is not None else 50.0

    # Shakiness 40%, ROM 60% — weighted overall
    overall_score = round(0.4 * gyro_score + 0.6 * rom_score, 1)

    # ── Primary condition: evaluated in priority order ────────────────────────
    if gyro_std >= _REHAB_HIGH_GYRO_STD:
        level        = "alert"
        fb_title     = "Movement Stability"
        fb_text      = (
            "Warning: Movement is shaky and unstable. "
            "Please slow down and control your leg throughout the full exercise."
        )
        dominant_lbl = "Knee Extension (Unstable)"

    elif angle_arr is not None and rom_deg < _REHAB_MIN_ROM_DEG:
        level        = "alert"
        fb_title     = "Range of Motion"
        fb_text      = (
            f"Warning: Insufficient range of motion detected "
            f"({rom_deg:.1f}°). Try to bend your knee further and "
            "complete the full arc of movement."
        )
        dominant_lbl = "Knee Extension (Incomplete ROM)"

    elif gyro_std >= _REHAB_MED_GYRO_STD:
        level        = "warn"
        fb_title     = "Movement Control"
        fb_text      = (
            "Movement shows moderate instability. "
            "Focus on slow, controlled motion and avoid compensating with your hip."
        )
        dominant_lbl = "Knee Extension (Moderate)"

    elif angle_arr is not None and rom_deg < _REHAB_GOOD_ROM_DEG:
        level        = "warn"
        fb_title     = "Range of Motion"
        fb_text      = (
            f"Range of motion is limited ({rom_deg:.1f}°). "
            f"Target ≥ {_REHAB_GOOD_ROM_DEG:.0f}°. "
            "Gradually increase the bend angle each session."
        )
        dominant_lbl = "Knee Extension (Limited ROM)"

    else:
        level        = "ok"
        fb_title     = "Overall Assessment"
        fb_text      = (
            "Movement is correct and smooth. "
            "Excellent rehabilitation exercise with strong range of motion."
        )
        dominant_lbl = "Knee Extension"

    # ── ROM scores list ───────────────────────────────────────────────────────
    rom_scores: list[dict] = []
    if angle_arr is not None:
        rs_pct = round(float(np.clip(rom_deg / _REHAB_GOOD_ROM_DEG * 100.0, 0.0, 100.0)), 1)
        rom_scores.append({
            "activity":         "knee_extension",
            "activity_label":   "Knee Extension",
            "min_angle_deg":    round(min_angle_deg, 1),
            "max_angle_deg":    round(max_angle_deg, 1),
            "rom_deg":          round(rom_deg, 1),
            "healthy_baseline": _REHAB_GOOD_ROM_DEG,
            "score_pct":        rs_pct,
        })

    # ── Feedback cards ─────────────────────────────────────────────────────────
    smoothness_score = round(float(np.clip(
        100.0 * (1.0 - gyro_std / _REHAB_HIGH_GYRO_STD), 0.0, 100.0
    )), 1)
    smoothness_level = (
        "ok"    if gyro_std < _REHAB_MED_GYRO_STD  else
        "warn"  if gyro_std < _REHAB_HIGH_GYRO_STD else
        "alert"
    )
    rom_fb_level = (
        "ok"    if (angle_arr is None or rom_deg >= _REHAB_GOOD_ROM_DEG) else
        "warn"  if rom_deg >= _REHAB_MIN_ROM_DEG                          else
        "alert"
    )

    feedback: list[dict] = [
        {
            "level": level,
            "title": fb_title,
            "text":  fb_text,
            "score": overall_score,
        },
        {
            "level": smoothness_level,
            "title": "Movement Smoothness",
            "text":  (
                f"Gyroscope stability: {smoothness_score:.0f}% — "
                f"gyro-magnitude std: {gyro_std:.1f} °/s."
            ),
            "score": smoothness_score,
        },
    ]
    if angle_arr is not None:
        feedback.append({
            "level": rom_fb_level,
            "title": "Range of Motion",
            "text":  (
                f"Measured ROM: {rom_deg:.1f}° — "
                f"target ≥ {_REHAB_GOOD_ROM_DEG:.0f}°."
            ),
            "score": round(rom_score, 1),
        })

    real_channels = resolved["real_channel_names"]

    return {
        "session_summary": {
            "total_samples":        n,
            "n_windows":            0,
            "n_real_channels":      len(real_channels),
            "n_simulated_channels": 0,
            "real_channel_names":   real_channels,
            "sensor_location":      sensor_location,
            "sensor_format":        sensor_format,
            "emg_detected":         emg_detected,
            "emg_channels":         emg_channels,
            "sensor_setup_note":    sensor_setup_note,
            "EMG_right":            emg_summary["EMG_right"],
            "EMG_left":             emg_summary["EMG_left"],
            "scoring_method":       "biomechanical",
            "gyro_std_dps":         round(gyro_std, 2),
            "min_angle_deg":        round(min_angle_deg, 1) if min_angle_deg is not None else None,
            "max_angle_deg":        round(max_angle_deg, 1) if max_angle_deg is not None else None,
            "rom_deg":              round(rom_deg, 1),
            "file_hash":            file_hash,
        },
        "min_angle_deg":        round(min_angle_deg, 1) if min_angle_deg is not None else None,
        "max_angle_deg":        round(max_angle_deg, 1) if max_angle_deg is not None else None,
        "rom_deg":              round(rom_deg, 1),
        "previous_rom_deg":     None,
        "delta_rom_signed_deg": None,
        "delta_rom_abs_deg":    None,
        "delta_rom_used_in_score_deg": None,
        "delta_rom_formula_explanation": {
            "title": "Delta ROM calculation",
            "steps": [
                "Current ROM = current max angle - current min angle",
                "Previous ROM = previous max angle - previous min angle",
                "Delta ROM = current ROM - previous ROM",
                "Absolute Delta ROM = abs(current ROM - previous ROM)",
            ],
        },
        "dominant_activity":       "knee_extension",
        "dominant_activity_label": dominant_lbl,
        "activity_breakdown": {
            "knee_extension": {
                "count": n,
                "pct":   100.0,
                "label": dominant_lbl,
            }
        },
        "rom_scores":    rom_scores,
        "overall_score": overall_score,
        "feedback":      feedback,
        "source":        "biomechanical",
    }
