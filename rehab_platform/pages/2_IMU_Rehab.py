"""
pages/2_IMU_Rehab.py
=====================
Module 2 — IMU Rehabilitation Dashboard

Real-time loop:
  sensor (Serial / Bluetooth / Simulation)
  → wavelet denoise → StandardScaler → LSTM (window 50, stride 25)
  → majority-vote activity label
  → complementary-filter knee angle → ROM → Rehab Score
"""

from __future__ import annotations

import time
from collections import Counter, deque

import numpy as np
import pandas as pd
import streamlit as st

from core.utils import inject_css, section_label, score_badge
from core.imu_pipeline import (
    assets_available,
    load_classifier,
    load_scaler,
    load_metadata,
    load_baseline,
    open_sensor,
    CsvUploadSensorSource,
    SENSOR_LOCATION_LABELS,
    complementary_step,
    wavelet_denoise_window,
    extract_knee_channels,
    compute_rom_and_score,
    score_to_feedback,
    FEATURE_COLS,
    WINDOW_SIZE,
    STEP_SIZE,
    SMOOTHING_WINDOW,
    SCALE_RAW,
    N_ACCEL,
    GYRO_THIGH_X_IDX,
    ACC_THIGH_X_IDX,
    DT,
    ACTIVITY_LABELS,
    SIM_CSV_PATH,
    MODEL_PATH,
)

st.set_page_config(
    page_title="IMU Rehab — RehabAI",
    page_icon=None,
    layout="wide",
    initial_sidebar_state="expanded",
)

inject_css()

# ── Session-state initialisation ──────────────────────────────────────────────
_DEFAULTS = {
    "tracking":           False,
    "samples_seen":       0,
    "last_activity":      "—",
    "current_rom":        0.0,
    "rehab_score":        0.0,
    "per_activity_rom":   {},
    "conn_state":         "idle",   # idle | running | error
    "conn_msg":           "Ready to start.",
    "_thigh_angle":       0.0,
    "_shin_angle":        0.0,
}
for k, v in _DEFAULTS.items():
    st.session_state.setdefault(k, v)


def _start():
    st.session_state.tracking = True

def _stop():
    st.session_state.tracking = False


# ── Sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown(
        """
        <div style="padding:0.5rem 0 1.5rem 0;">
          <p style="font-size:1.15rem;font-weight:700;color:#111827;margin:0;">RehabAI</p>
          <p style="font-size:0.78rem;color:#9CA3AF;margin:0;font-weight:500;">
            Medical Rehabilitation Platform
          </p>
        </div>
        """,
        unsafe_allow_html=True,
    )
    st.markdown('<p class="section-label">Navigation</p>', unsafe_allow_html=True)
    st.page_link("app.py",                 label="Home")
    st.page_link("pages/1_Diagnostics.py", label="Knee OA Diagnostics")
    st.page_link("pages/2_IMU_Rehab.py",   label="IMU Rehab Dashboard")

    st.markdown("<hr>", unsafe_allow_html=True)
    st.markdown('<p class="section-label">Sensor Connection</p>', unsafe_allow_html=True)

    mode = st.selectbox(
        "Data source",
        [
            "Simulation (replay CSV)",
            "Upload CSV (1 sensor)",
            "Serial (USB)",
            "Bluetooth (RFCOMM)",
        ],
        help="'Upload CSV (1 sensor)' lets you upload your own sensor file. "
             "Missing sensor channels are filled automatically with neutral dummy values.",
    )

    is_sim    = mode == "Simulation (replay CSV)"
    is_upload = mode == "Upload CSV (1 sensor)"
    is_serial = not is_sim and not is_upload

    # ── Serial connection settings (hidden for sim/upload modes) ────────────
    port = st.text_input(
        "Port / device path",
        value="" if not is_serial else "COM3",
        disabled=not is_serial,
        help="Examples: COM3, /dev/ttyUSB0, /dev/tty.usbserial-1410",
    )
    baudrate = st.number_input(
        "Baudrate",
        min_value=9600, max_value=921_600, value=115_200, step=9600,
        disabled=not is_serial,
    )

    # ── Single-sensor CSV upload settings ────────────────────────────────────
    if is_upload:
        st.markdown("<hr style='margin:0.6rem 0'>", unsafe_allow_html=True)
        st.markdown('<p class="section-label">Single-Sensor Upload</p>', unsafe_allow_html=True)

        loc_label = st.selectbox(
            "Sensor placement",
            list(SENSOR_LOCATION_LABELS.keys()),
            help="Which body segment is your single sensor attached to? "
                 "This maps generic column names (accel_x, gyro_z …) to the correct feature slot.",
        )
        st.session_state["_upload_location"] = SENSOR_LOCATION_LABELS[loc_label]

        uploaded_file = st.file_uploader(
            "Upload sensor CSV",
            type=["csv"],
            key="csv_upload_widget",
            help="CSV must have at least accel (accel_x/y/z or ax/ay/az) "
                 "and/or gyro (gyro_x/y/z or gx/gy/gz) columns. "
                 "Full FEATURE_COLS names are also accepted.",
        )
        if uploaded_file is not None:
            csv_bytes = uploaded_file.getvalue()
            st.session_state["_upload_csv_bytes"] = csv_bytes
            size_kb = len(csv_bytes) // 1024
            st.success(f"✓ {uploaded_file.name}  ({size_kb:,} KB)")
        elif "_upload_csv_bytes" not in st.session_state:
            st.info("Upload a CSV file, then click Start Tracking.")

    st.markdown("<hr>", unsafe_allow_html=True)
    st.markdown('<p class="section-label">System Status</p>', unsafe_allow_html=True)

    state = st.session_state.conn_state
    if state == "running":
        st.success(f"Tracking · {st.session_state.conn_msg}")
    elif state == "error":
        st.error(f"Error · {st.session_state.conn_msg}")
    else:
        st.info(st.session_state.conn_msg)

    st.metric("Samples processed", f"{st.session_state.samples_seen:,}")

    if not assets_available():
        st.warning(
            f"IMU model assets missing.\nExpected at `{MODEL_PATH.parent}`.",
            icon="⚠️",
        )


# ── Page header ───────────────────────────────────────────────────────────────
st.markdown('<div class="hero-badge">Module 2</div>', unsafe_allow_html=True)
st.markdown("# IMU Rehabilitation Dashboard")
st.markdown(
    '<p style="color:#64748B;font-size:1.15rem;margin-bottom:2rem;line-height:1.75;">'
    "Real-time activity classification and range-of-motion scoring. "
    "Use Simulation mode to explore the platform without hardware."
    "</p>",
    unsafe_allow_html=True,
)

# ── Start / Stop controls ─────────────────────────────────────────────────────
btn1, btn2, _ = st.columns([1, 1, 4])

# For Upload mode the user must provide a file before tracking can begin.
_upload_ready = (
    mode != "Upload CSV (1 sensor)"
    or "_upload_csv_bytes" in st.session_state
)
btn1.button(
    "Start Tracking",
    on_click=_start,
    disabled=st.session_state.tracking or not assets_available() or not _upload_ready,
    type="primary",
)
btn2.button(
    "Stop Tracking",
    on_click=_stop,
    disabled=not st.session_state.tracking,
)

st.markdown("<br>", unsafe_allow_html=True)

# ── KPI metric row ────────────────────────────────────────────────────────────
kpi1, kpi2, kpi3 = st.columns(3)
rom_ph      = kpi1.empty()
score_ph    = kpi2.empty()
activity_ph = kpi3.empty()

# ── Main dashboard layout ─────────────────────────────────────────────────────
st.markdown("<br>", unsafe_allow_html=True)
posture_col, chart_col = st.columns([1, 2], gap="large")

posture_ph = posture_col.empty()
chart_ph   = chart_col.empty()

table_ph = st.empty()
feedback_ph = st.empty()


# ── Render helpers ────────────────────────────────────────────────────────────
def _render_kpis() -> None:
    rom_ph.metric(
        "Range of Motion",
        f"{st.session_state.current_rom:.1f}°",
    )
    score = st.session_state.rehab_score
    score_ph.metric(
        "Rehab Score",
        f"{score:.1f}%",
    )
    activity_ph.metric(
        "Detected Activity",
        ACTIVITY_LABELS.get(st.session_state.last_activity, st.session_state.last_activity),
    )


def _render_posture(knee_angle: float) -> None:
    """Stick-figure knee-angle widget using matplotlib."""
    import matplotlib.pyplot as plt
    import matplotlib.patches as mpatches

    fig, ax = plt.subplots(figsize=(3.0, 3.6), facecolor="#FFFFFF")
    ax.set_xlim(-1.5, 1.5)
    ax.set_ylim(-2.3, 0.5)
    ax.axis("off")
    fig.patch.set_facecolor("#FFFFFF")

    hip   = np.array([0.0, 0.0])
    knee  = hip + np.array([0.0, -1.0])
    rad   = np.deg2rad(abs(knee_angle))
    ankle = knee + np.array([np.sin(rad), -np.cos(rad)])

    color = "#0EA5E9"
    ax.plot([hip[0], knee[0]], [hip[1], knee[1]], "-", color=color, linewidth=5)
    ax.plot([knee[0], ankle[0]], [knee[1], ankle[1]], "-", color=color, linewidth=5)

    for pt in [hip, knee, ankle]:
        ax.plot(*pt, "o", color=color, markersize=12, zorder=5)

    # Angle arc
    if abs(knee_angle) > 2:
        arc = mpatches.Arc(
            knee, 0.5, 0.5,
            angle=0,
            theta1=270 - abs(knee_angle),
            theta2=270,
            color="#14B8A6",
            linewidth=2,
        )
        ax.add_patch(arc)

    ax.set_title(
        f"Knee flexion  {knee_angle:+.1f}°",
        fontsize=11,
        fontweight="bold",
        color="#111827",
        pad=10,
    )
    posture_ph.pyplot(fig, clear_figure=True)


def _render_table(baseline: dict) -> None:
    rows = [
        {
            "Activity":          ACTIVITY_LABELS.get(a, a),
            "ROM (°)":           round(r, 1),
            "Healthy Baseline (°)": round(baseline.get(a, 0.0), 1),
            "Score (%)":         round(s, 1),
        }
        for a, (r, s) in st.session_state.per_activity_rom.items()
    ]
    if not rows:
        return
    df = pd.DataFrame(rows)
    table_ph.dataframe(df, use_container_width=True, hide_index=True)


def _render_feedback() -> None:
    activity = st.session_state.last_activity
    score    = st.session_state.rehab_score
    if activity == "—" or score == 0.0:
        return
    badge_html = score_badge(score)
    text = score_to_feedback(score, activity)
    feedback_ph.markdown(
        f"""
        <div class="rehab-card" style="display:flex;align-items:center;gap:2rem;">
          <div style="text-align:center;flex-shrink:0;">{badge_html}</div>
          <div>
            <p style="font-size:1.1rem;font-weight:700;color:#0F172A;margin:0 0 0.4rem 0;letter-spacing:-0.01em;">
              Patient Feedback
            </p>
            <p style="font-size:1rem;color:#475569;margin:0;line-height:1.7;">{text}</p>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


# ── Idle state render ─────────────────────────────────────────────────────────
if not st.session_state.tracking:
    _render_kpis()
    _render_posture(0.0)

    if not st.session_state.per_activity_rom:
        chart_ph.markdown(
            """
            <div style="height:240px;display:flex;align-items:center;justify-content:center;
              background:#F8FAFC;border:1.5px dashed #CBD5E1;border-radius:20px;">
              <p style="color:#94A3B8;font-size:1rem;margin:0;font-weight:500;">
                Signal chart will appear here during tracking.
              </p>
            </div>
            """,
            unsafe_allow_html=True,
        )
    else:
        _render_table(load_baseline() if assets_available() else {})
        _render_feedback()

    st.stop()


# ── Tracking loop ─────────────────────────────────────────────────────────────
if not assets_available():
    st.error("IMU model assets not found. Cannot start tracking.")
    st.stop()

try:
    classifier = load_classifier()
    scaler     = load_scaler()
    meta       = load_metadata()
    baseline   = load_baseline()
except Exception as exc:
    st.session_state.conn_state = "error"
    st.session_state.conn_msg   = f"Failed to load model assets: {exc}"
    st.session_state.tracking   = False
    st.error(st.session_state.conn_msg)
    st.stop()

activity_names: list[str] = meta["activity_names"]

sensor = None
if mode == "Upload CSV (1 sensor)":
    # ── Single-sensor CSV path ─────────────────────────────────────────────
    csv_bytes = st.session_state.get("_upload_csv_bytes")
    if not csv_bytes:
        st.session_state.conn_state = "error"
        st.session_state.conn_msg   = "No CSV file found. Please upload a file in the sidebar."
        st.error(st.session_state.conn_msg)
        st.stop()

    location = st.session_state.get("_upload_location", "right_thigh")
    try:
        sensor = CsvUploadSensorSource(
            csv_bytes, scaler=scaler, sensor_location=location
        )
        st.session_state.conn_state = "running"
        st.session_state.conn_msg   = f"Streaming CSV · {location.replace('_', ' ').title()}"

        # ── Info banner: real vs simulated channels ────────────────────────
        rep = sensor.report
        n_real = rep["n_real"]
        n_sim  = len(rep["simulated"])
        real_short = ", ".join(
            c.replace("accelerometer_", "acc_")
             .replace("gyroscope_", "gyro_")
             .replace(f"_{location}", "")
            for c in rep["real"]
        )
        st.info(
            f"**Single-Sensor CSV Mode** — {len(sensor)} rows loaded\n\n"
            f"- ✅ **{n_real} real channel{'s' if n_real != 1 else ''}**: {real_short}\n"
            f"- 🔵 **{n_sim} simulated channel{'s' if n_sim != 1 else ''}**: "
            f"filled with scaler-neutral dummy values (→ 0 after preprocessing)\n\n"
            "⚠ Activity classification is less precise with partial sensor data.",
            icon="📡",
        )
    except ValueError as exc:
        st.session_state.conn_state = "error"
        st.session_state.conn_msg   = f"CSV format error: {exc}"
        st.error(st.session_state.conn_msg)
        st.stop()
    except Exception as exc:
        st.session_state.conn_state = "error"
        st.session_state.conn_msg   = f"Could not parse CSV: {exc}"
        st.error(st.session_state.conn_msg)
        st.stop()
else:
    # ── Serial / Simulation path (unchanged) ──────────────────────────────
    try:
        sensor = open_sensor(mode, port=port, baudrate=int(baudrate))
        st.session_state.conn_state = "running"
        st.session_state.conn_msg   = f"Streaming · {mode}"
    except ModuleNotFoundError as exc:
        st.session_state.conn_state = "error"
        st.session_state.conn_msg   = f"Missing dependency: {exc.name}. Run: pip install pyserial"
    except Exception as exc:
        st.session_state.conn_state = "error"
        st.session_state.conn_msg   = f"Could not open sensor: {exc}"

if st.session_state.conn_state == "error":
    st.session_state.tracking = False
    st.error(st.session_state.conn_msg)
    st.stop()

# ── Per-run buffers ────────────────────────────────────────────────────────────
raw_buffer:    deque = deque(maxlen=WINDOW_SIZE)
signal_buffer: deque = deque(maxlen=300)
pred_history:  deque = deque(maxlen=SMOOTHING_WINDOW * 2)
knee_per_activity: dict[str, list[float]] = {}
smoothed_activity = "—"
knee_angle        = 0.0
step_counter      = 0
failures          = 0

section_label("Live Signal — Right Thigh Accel & Gyro")

try:
    while st.session_state.tracking:
        sample = None
        try:
            sample = sensor.read()
        except Exception as exc:
            st.session_state.conn_state = "error"
            st.session_state.conn_msg   = f"Sensor read failed: {exc}"
            break

        if sample is None:
            failures += 1
            if failures > 200:
                st.session_state.conn_state = "error"
                st.session_state.conn_msg   = "Sensor timeout / EOF."
                break
            time.sleep(DT)
            continue
        failures = 0

        # 1) Normalise for classifier
        clf_sample = sample / SCALE_RAW
        raw_buffer.append(clf_sample)

        # 2) Knee angle (physical units)
        gyro_thigh, gyro_shin, ax_th, az_th, ax_sh, az_sh = extract_knee_channels(sample)
        thigh_angle = complementary_step(
            st.session_state._thigh_angle, gyro_thigh, ax_th, az_th
        )
        shin_angle  = complementary_step(
            st.session_state._shin_angle,  gyro_shin,  ax_sh, az_sh
        )
        st.session_state._thigh_angle = thigh_angle
        st.session_state._shin_angle  = shin_angle
        knee_angle = thigh_angle - shin_angle

        if smoothed_activity != "—":
            knee_per_activity.setdefault(smoothed_activity, []).append(knee_angle)

        # 3) Signal chart buffer (4 representative channels)
        signal_buffer.append({
            "Accel Thigh X": clf_sample[ACC_THIGH_X_IDX],
            "Gyro Thigh X":  clf_sample[N_ACCEL + GYRO_THIGH_X_IDX],
        })

        st.session_state.samples_seen += 1
        step_counter += 1

        # 4) LSTM inference every STEP_SIZE samples
        if len(raw_buffer) == WINDOW_SIZE and step_counter >= STEP_SIZE:
            step_counter = 0
            window = np.stack(list(raw_buffer), axis=0)  # (50, 38)

            window = wavelet_denoise_window(window)

            window_scaled = scaler.transform(window).astype(np.float32)
            proba         = classifier.predict(window_scaled[None, ...], verbose=0)
            pred_idx      = int(np.argmax(proba, axis=1)[0])
            pred_label    = activity_names[pred_idx]
            pred_history.append(pred_label)

            if pred_history:
                smoothed_activity, _ = Counter(pred_history).most_common(1)[0]
            st.session_state.last_activity = smoothed_activity

            # 5) ROM & rehab score
            angles = knee_per_activity.get(smoothed_activity, [])
            if len(angles) >= 50:
                rom, score = compute_rom_and_score(angles, smoothed_activity, baseline)
                st.session_state.current_rom  = rom
                st.session_state.rehab_score  = score
                st.session_state.per_activity_rom[smoothed_activity] = (rom, score)

        # 6) UI update every 5 samples
        if st.session_state.samples_seen % 5 == 0:
            _render_kpis()
            _render_posture(knee_angle)
            if signal_buffer:
                chart_ph.line_chart(
                    pd.DataFrame(list(signal_buffer)),
                    use_container_width=True,
                    height=220,
                )
            if st.session_state.per_activity_rom:
                _render_table(baseline)
                _render_feedback()

finally:
    if sensor is not None:
        sensor.close()
    if st.session_state.conn_state != "error":
        st.session_state.conn_state = "idle"
        st.session_state.conn_msg   = "Stopped."

_render_kpis()
if st.session_state.per_activity_rom:
    _render_table(baseline)
    _render_feedback()
