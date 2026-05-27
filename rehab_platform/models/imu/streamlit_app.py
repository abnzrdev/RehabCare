"""
Rehabilitation IMU Dashboard
============================
Real-time Streamlit dashboard for the LSTM activity classifier + ROM
based rehab-score pipeline (see Rehab_Pipeline notebook).

Pipeline (matches the trained model exactly):

    raw 38-ch IMU/EMG  ──► /32768  ──► wavelet denoise ──► StandardScaler ──┐
                                                                             ├─► LSTM (50,38) ──► activity
    raw IMU            ──► gyro·2000/32768, accel·2/32768 ──► complementary ─┘                         │
                                                                  filter ──► knee angle                │
                                                                                                       ▼
                                                       ROM = max(angle) − min(angle)  per activity
                                                       Rehab Score = ROM / healthy_baseline · 100 %

Connection sources supported (all wrapped in try/except):
    • Serial port      (e.g. /dev/tty.usbserial, COM3)        — pyserial
    • Bluetooth RFCOMM (e.g. /dev/tty.MyIMU-Bluetooth, COM5)  — pyserial
    • Simulation       (replays classifier_ready.csv)         — for demo without hardware
"""

from __future__ import annotations

import os
import time
import json
from collections import Counter, deque
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import streamlit as st


HERE = Path(__file__).resolve().parent
MODEL_PATH    = HERE / "lstm_classifier.keras"
SCALER_PATH   = HERE / "scaler.pkl"
META_PATH     = HERE / "model_meta.json"
BASELINE_PATH = HERE / "healthy_baseline.csv"
SIM_CSV_PATH  = HERE / "classifier_ready.csv"

WINDOW_SIZE       = 50
STEP_SIZE         = 25
SMOOTHING_WINDOW  = 10
SAMPLE_RATE_HZ    = 100
DT                = 1.0 / SAMPLE_RATE_HZ
ALPHA             = 0.98
SCALE_RAW         = 32768.0
GYRO_PHYS         = 2000.0
ACCEL_PHYS        = 2.0

ACCEL_COLS = [
    "accelerometer_right_foot_x",  "accelerometer_right_foot_y",  "accelerometer_right_foot_z",
    "accelerometer_right_shin_x",  "accelerometer_right_shin_y",  "accelerometer_right_shin_z",
    "accelerometer_right_thigh_x", "accelerometer_right_thigh_y", "accelerometer_right_thigh_z",
    "accelerometer_left_foot_x",   "accelerometer_left_foot_y",   "accelerometer_left_foot_z",
    "accelerometer_left_shin_x",   "accelerometer_left_shin_y",   "accelerometer_left_shin_z",
    "accelerometer_left_thigh_x",  "accelerometer_left_thigh_y",  "accelerometer_left_thigh_z",
]
GYRO_COLS = [
    "gyroscope_right_foot_x",  "gyroscope_right_foot_y",  "gyroscope_right_foot_z",
    "gyroscope_right_shin_x",  "gyroscope_right_shin_y",  "gyroscope_right_shin_z",
    "gyroscope_right_thigh_x", "gyroscope_right_thigh_y", "gyroscope_right_thigh_z",
    "gyroscope_left_foot_x",   "gyroscope_left_foot_y",   "gyroscope_left_foot_z",
    "gyroscope_left_shin_x",   "gyroscope_left_shin_y",   "gyroscope_left_shin_z",
    "gyroscope_left_thigh_x",  "gyroscope_left_thigh_y",  "gyroscope_left_thigh_z",
]
EMG_COLS     = ["EMG_right", "EMG_left"]
FEATURE_COLS = ACCEL_COLS + GYRO_COLS + EMG_COLS  # 38 features in the exact training order

GYRO_THIGH_X_IDX = GYRO_COLS.index("gyroscope_right_thigh_x")
ACC_THIGH_X_IDX  = ACCEL_COLS.index("accelerometer_right_thigh_x")
ACC_THIGH_Z_IDX  = ACCEL_COLS.index("accelerometer_right_thigh_z")
GYRO_SHIN_X_IDX  = GYRO_COLS.index("gyroscope_right_shin_x")
ACC_SHIN_X_IDX   = ACCEL_COLS.index("accelerometer_right_shin_x")
ACC_SHIN_Z_IDX   = ACCEL_COLS.index("accelerometer_right_shin_z")


# ---------------------------------------------------------------------------
# Cached resource loaders
# ---------------------------------------------------------------------------
@st.cache_resource(show_spinner="Loading LSTM classifier…")
def load_classifier():
    import tensorflow as tf  # imported lazily so the page renders even if TF is absent
    return tf.keras.models.load_model(str(MODEL_PATH))


@st.cache_resource(show_spinner="Loading scaler…")
def load_scaler():
    import joblib
    return joblib.load(str(SCALER_PATH))


@st.cache_data(show_spinner=False)
def load_metadata() -> dict:
    with open(META_PATH) as f:
        return json.load(f)


@st.cache_data(show_spinner=False)
def load_baseline() -> dict[str, float]:
    df = pd.read_csv(BASELINE_PATH)
    return dict(zip(df["activity"], df["healthy_avg"]))


# ---------------------------------------------------------------------------
# Signal-processing helpers (mirror the notebook exactly)
# ---------------------------------------------------------------------------
def complementary_step(prev_angle: float, gyro_dps: float,
                       acc_x: float, acc_z: float) -> float:
    """One step of the complementary filter. Returns updated angle (degrees)."""
    accel_angle = np.degrees(np.arctan2(acc_x, acc_z))
    return ALPHA * (prev_angle + gyro_dps * DT) + (1.0 - ALPHA) * accel_angle


# ---------------------------------------------------------------------------
# Sensor-source adapters
# ---------------------------------------------------------------------------
class SensorSource:
    """Abstract sensor: each call to `read()` returns one (38,) sample or None."""
    def read(self) -> Optional[np.ndarray]: ...
    def close(self) -> None: ...


class SerialSensorSource(SensorSource):
    """Reads CSV-style lines (38 floats per line) from a serial / Bluetooth port."""

    def __init__(self, port: str, baudrate: int = 115200, timeout: float = 0.5):
        import serial  # pyserial — imported here so missing-dep error surfaces only on use
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
    """Replays the bundled patient CSV so the dashboard is demoable without hardware."""

    def __init__(self, csv_path: Path, max_rows: int = 60_000):
        # Stream a limited slice so we don't load 800 MB into RAM
        self._iter = pd.read_csv(csv_path, usecols=FEATURE_COLS, chunksize=2048)
        self._buffer: deque = deque()
        self._max_rows = max_rows
        self._served = 0
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
        # Approximate the 100 Hz cadence so the chart animates at human speed
        now = time.monotonic()
        sleep = DT - (now - self._last_emit)
        if sleep > 0:
            time.sleep(sleep)
        self._last_emit = time.monotonic()
        self._served += 1
        return self._buffer.popleft()

    def close(self) -> None:
        self._buffer.clear()


def open_sensor(mode: str, port: str, baudrate: int) -> SensorSource:
    """Factory that maps the sidebar settings to a concrete adapter."""
    if mode == "Simulation (replay CSV)":
        if not SIM_CSV_PATH.exists():
            raise FileNotFoundError(f"Simulation CSV not found at {SIM_CSV_PATH}")
        return SimulatedSensorSource(SIM_CSV_PATH)
    # Serial and Bluetooth both go through pyserial — Bluetooth-RFCOMM exposes a /dev/tty.* device
    if not port:
        raise ValueError("Port / MAC address is required for Serial / Bluetooth.")
    return SerialSensorSource(port=port, baudrate=baudrate)


# ---------------------------------------------------------------------------
# Session-state defaults
# ---------------------------------------------------------------------------
def _init_state() -> None:
    defaults = {
        "tracking": False,
        "samples_seen": 0,
        "last_activity": "—",
        "current_rom": 0.0,
        "rehab_score": 0.0,
        "per_activity_rom": {},   # {activity: (rom, score)}
        "connection_msg": "Idle.",
        "connection_state": "idle",  # idle | running | error
    }
    for k, v in defaults.items():
        st.session_state.setdefault(k, v)


def _stop_tracking() -> None:
    st.session_state.tracking = False


def _start_tracking() -> None:
    st.session_state.tracking = True


# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="Rehab IMU Dashboard",
    page_icon=None,
    layout="wide",
)
_init_state()

st.title("Rehabilitation IMU Dashboard")
st.caption("Real-time activity classification and ROM-based rehab scoring (HuGaDB pipeline).")


# ---- Sidebar: connection + status ----------------------------------------
with st.sidebar:
    st.header("Connection")
    mode = st.selectbox(
        "Source",
        ["Simulation (replay CSV)", "Serial (USB)", "Bluetooth (RFCOMM)"],
        help="Simulation streams the bundled patient CSV at ~100 Hz so you can demo without hardware.",
    )
    default_port = "" if mode == "Simulation (replay CSV)" else "/dev/tty.usbserial-XXXX"
    port = st.text_input(
        "Port / MAC (tty device)",
        value=default_port,
        help="Examples: /dev/tty.usbserial-1410, COM3, /dev/tty.MyIMU-RFCOMM",
        disabled=(mode == "Simulation (replay CSV)"),
    )
    baudrate = st.number_input("Baudrate", min_value=9600, max_value=921_600, value=115_200, step=9600,
                               disabled=(mode == "Simulation (replay CSV)"))

    st.divider()
    st.header("System Status")

    # Lightweight indicator (st.sidebar.status is also valid; this gives a single inline summary)
    state_label = {
        "idle":    ("Idle", "Ready to start tracking."),
        "running": ("Tracking", st.session_state.connection_msg),
        "error":   ("Error",   st.session_state.connection_msg),
    }[st.session_state.connection_state]

    if st.session_state.connection_state == "error":
        st.error(f"{state_label[0]}: {state_label[1]}")
    elif st.session_state.connection_state == "running":
        st.success(f"{state_label[0]}: {state_label[1]}")
    else:
        st.info(f"{state_label[0]}: {state_label[1]}")

    st.metric("Samples processed", st.session_state.samples_seen)


# ---- Main layout ---------------------------------------------------------
btn_col1, btn_col2, _ = st.columns([1, 1, 4])
btn_col1.button("Start Tracking", on_click=_start_tracking,
                disabled=st.session_state.tracking, type="primary")
btn_col2.button("Stop Tracking", on_click=_stop_tracking,
                disabled=not st.session_state.tracking)

metric_col1, metric_col2, metric_col3 = st.columns(3)
rom_metric        = metric_col1.empty()
score_metric      = metric_col2.empty()
activity_metric   = metric_col3.empty()

posture_col, signal_col = st.columns([1, 2])
posture_placeholder = posture_col.empty()
signal_chart_ph     = signal_col.empty()

table_placeholder   = st.empty()


def _render_metrics() -> None:
    rom_metric.metric("Current ROM (deg)", f"{st.session_state.current_rom:.1f}")
    score_metric.metric("Rehab Score (%)", f"{st.session_state.rehab_score:.1f}")
    activity_metric.metric("Detected activity", st.session_state.last_activity)


def _render_posture(knee_angle: float) -> None:
    """Tiny stick-figure rendering of the knee flexion angle."""
    import matplotlib.pyplot as plt  # local import keeps top-of-file fast
    fig, ax = plt.subplots(figsize=(3.2, 3.6))
    ax.set_xlim(-1.4, 1.4)
    ax.set_ylim(-2.2, 0.4)
    ax.axis("off")

    hip   = np.array([0.0, 0.0])
    knee  = hip + np.array([0.0, -1.0])
    rad   = np.deg2rad(knee_angle)
    ankle = knee + np.array([np.sin(rad), -np.cos(rad)])

    ax.plot([hip[0], knee[0]], [hip[1], knee[1]], "-", linewidth=4)
    ax.plot([knee[0], ankle[0]], [knee[1], ankle[1]], "-", linewidth=4)
    ax.plot(*hip, "o", markersize=10)
    ax.plot(*knee, "o", markersize=10)
    ax.plot(*ankle, "o", markersize=10)
    ax.set_title(f"Knee angle: {knee_angle:+.1f}°", fontsize=10)
    posture_placeholder.pyplot(fig, clear_figure=True)


def _wavelet_denoise_window(x: np.ndarray) -> np.ndarray:
    """Per-window wavelet denoise across the time axis, matching the notebook."""
    import pywt
    out = np.empty_like(x)
    for c in range(x.shape[1]):
        sig = x[:, c]
        coeffs = pywt.wavedec(sig, "db4", level=4)
        sigma = np.median(np.abs(coeffs[-1])) / 0.6745
        thr = sigma * np.sqrt(2 * np.log(len(sig)))
        coeffs = [coeffs[0]] + [pywt.threshold(d, thr, mode="soft") for d in coeffs[1:]]
        rec = pywt.waverec(coeffs, "db4")[:len(sig)]
        out[:, c] = rec
    return out


# ---------------------------------------------------------------------------
# Main tracking loop
# ---------------------------------------------------------------------------
if st.session_state.tracking:
    # --- guarded resource loading ---
    try:
        classifier  = load_classifier()
        scaler      = load_scaler()
        meta        = load_metadata()
        baseline    = load_baseline()
    except Exception as exc:
        st.session_state.connection_state = "error"
        st.session_state.connection_msg   = f"Model assets failed to load: {exc}"
        st.session_state.tracking = False
        st.error(st.session_state.connection_msg)
        st.stop()

    activity_names: list[str] = meta["activity_names"]

    # --- guarded sensor opening ---
    sensor: Optional[SensorSource] = None
    try:
        sensor = open_sensor(mode, port, int(baudrate))
        st.session_state.connection_state = "running"
        st.session_state.connection_msg   = f"Streaming from {mode}"
    except ModuleNotFoundError as exc:
        st.session_state.connection_state = "error"
        st.session_state.connection_msg   = (
            f"Missing dependency: {exc.name}. "
            "Install with: pip install pyserial"
        )
    except Exception as exc:
        st.session_state.connection_state = "error"
        st.session_state.connection_msg   = f"Could not open sensor: {exc}"

    if st.session_state.connection_state == "error":
        st.session_state.tracking = False
        st.error(st.session_state.connection_msg)
        st.stop()

    # --- per-run buffers ---------------------------------------------------
    raw_buffer:    deque = deque(maxlen=WINDOW_SIZE)        # rolling 50-sample window of /32768 floats
    signal_buffer: deque = deque(maxlen=300)                # ~3 s of signals for the line chart
    pred_history:  deque = deque(maxlen=SMOOTHING_WINDOW * 2)  # for majority-vote smoothing
    knee_per_activity: dict[str, list[float]] = {}
    smoothed_activity = "—"
    knee_angle = 0.0
    step_counter = 0
    failures = 0

    try:
        while st.session_state.tracking:
            sample = None
            try:
                sample = sensor.read()
            except Exception as exc:
                # Sensor went away mid-stream — stop cleanly instead of crashing.
                st.session_state.connection_state = "error"
                st.session_state.connection_msg   = f"Sensor read failed: {exc}"
                break

            if sample is None:
                failures += 1
                if failures > 200:  # ~2 s of nothing → assume disconnect / EOF
                    st.session_state.connection_state = "error"
                    st.session_state.connection_msg   = "Sensor returned no data (timeout / disconnect / EOF)."
                    break
                time.sleep(DT)
                continue
            failures = 0

            # 1) classifier copy: divide raw by 32768
            clf_sample = sample / SCALE_RAW
            raw_buffer.append(clf_sample)

            # 2) physical-units copy for knee angle (per-sample)
            gyro_thigh = sample[len(ACCEL_COLS) + GYRO_THIGH_X_IDX] / SCALE_RAW * GYRO_PHYS
            gyro_shin  = sample[len(ACCEL_COLS) + GYRO_SHIN_X_IDX]  / SCALE_RAW * GYRO_PHYS
            acc_thigh_x = sample[ACC_THIGH_X_IDX] / SCALE_RAW * ACCEL_PHYS
            acc_thigh_z = sample[ACC_THIGH_Z_IDX] / SCALE_RAW * ACCEL_PHYS
            acc_shin_x  = sample[ACC_SHIN_X_IDX]  / SCALE_RAW * ACCEL_PHYS
            acc_shin_z  = sample[ACC_SHIN_Z_IDX]  / SCALE_RAW * ACCEL_PHYS

            # complementary filter — track thigh & shin angles in session_state across iterations
            prev_thigh = st.session_state.get("_thigh_angle", 0.0)
            prev_shin  = st.session_state.get("_shin_angle",  0.0)
            thigh_angle = complementary_step(prev_thigh, gyro_thigh, acc_thigh_x, acc_thigh_z)
            shin_angle  = complementary_step(prev_shin,  gyro_shin,  acc_shin_x,  acc_shin_z)
            st.session_state._thigh_angle = thigh_angle
            st.session_state._shin_angle  = shin_angle
            knee_angle = thigh_angle - shin_angle

            # collect knee angle under the current smoothed activity for ROM
            if smoothed_activity != "—":
                knee_per_activity.setdefault(smoothed_activity, []).append(knee_angle)

            # 3) signal-chart buffer (a few representative channels)
            signal_buffer.append({
                "accel_thigh_x": clf_sample[ACC_THIGH_X_IDX],
                "accel_shin_x":  clf_sample[ACC_SHIN_X_IDX],
                "gyro_thigh_x":  clf_sample[len(ACCEL_COLS) + GYRO_THIGH_X_IDX],
                "gyro_shin_x":   clf_sample[len(ACCEL_COLS) + GYRO_SHIN_X_IDX],
            })

            st.session_state.samples_seen += 1
            step_counter += 1

            # 4) every STEP_SIZE samples and once we have a full window, run inference
            if len(raw_buffer) == WINDOW_SIZE and step_counter >= STEP_SIZE:
                step_counter = 0
                window = np.stack(list(raw_buffer), axis=0)              # (50, 38)
                try:
                    window = _wavelet_denoise_window(window)
                except Exception:
                    pass  # if pywavelets is missing, fall back to raw — classifier still runs
                window_scaled = scaler.transform(window).astype(np.float32)
                proba = classifier.predict(window_scaled[None, ...], verbose=0)
                pred_idx = int(np.argmax(proba, axis=1)[0])
                pred_label = activity_names[pred_idx]
                pred_history.append(pred_label)

                # majority-vote smoothing
                if pred_history:
                    most_common, _ = Counter(pred_history).most_common(1)[0]
                    smoothed_activity = most_common
                st.session_state.last_activity = smoothed_activity

                # 5) ROM and rehab-score for the active activity
                angles = knee_per_activity.get(smoothed_activity, [])
                if len(angles) >= 50:
                    rom = float(max(angles) - min(angles))
                    healthy = float(baseline.get(smoothed_activity, 0.0))
                    score = min((rom / healthy) * 100.0, 100.0) if healthy > 0 else 0.0
                    st.session_state.current_rom  = rom
                    st.session_state.rehab_score  = score
                    st.session_state.per_activity_rom[smoothed_activity] = (rom, score)

            # 6) UI updates — every 5 samples is plenty (every-tick blocks the loop on rendering)
            if st.session_state.samples_seen % 5 == 0:
                _render_metrics()
                if signal_buffer:
                    signal_chart_ph.line_chart(pd.DataFrame(list(signal_buffer)))
                _render_posture(knee_angle)
                if st.session_state.per_activity_rom:
                    table_placeholder.dataframe(
                        pd.DataFrame(
                            [
                                {"Activity": a, "ROM (deg)": round(r, 2),
                                 "Healthy (deg)": round(baseline.get(a, 0.0), 2),
                                 "Score (%)": round(s, 1)}
                                for a, (r, s) in st.session_state.per_activity_rom.items()
                            ]
                        ),
                        use_container_width=True,
                        hide_index=True,
                    )
    finally:
        if sensor is not None:
            sensor.close()
        if st.session_state.connection_state != "error":
            st.session_state.connection_state = "idle"
            st.session_state.connection_msg = "Stopped."

    # one final render so the last values stay on screen
    _render_metrics()

else:
    # Idle state: render last-known values so the page isn't empty between runs
    _render_metrics()
    if not st.session_state.per_activity_rom:
        st.info("Configure the sensor in the sidebar, then click **Start Tracking**.")
    else:
        table_placeholder.dataframe(
            pd.DataFrame(
                [
                    {"Activity": a, "ROM (deg)": round(r, 2),
                     "Healthy (deg)": round(load_baseline().get(a, 0.0), 2),
                     "Score (%)": round(s, 1)}
                    for a, (r, s) in st.session_state.per_activity_rom.items()
                ]
            ),
            use_container_width=True,
            hide_index=True,
        )
