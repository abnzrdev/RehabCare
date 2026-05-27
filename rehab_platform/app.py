"""
app.py — Landing page / home
============================
Entry point for the Rehabilitation Platform.
Run with:  streamlit run app.py
"""

import streamlit as st
from core.utils import inject_css
from core.knee_model import is_model_available
from core.imu_pipeline import assets_available

st.set_page_config(
    page_title="RehabAI Platform",
    page_icon=None,
    layout="wide",
    initial_sidebar_state="expanded",
)

inject_css()

# ── Sidebar brand ────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown(
        """
        <div style="padding:0.5rem 0 1.5rem 0;">
          <p style="font-size:1.15rem;font-weight:700;color:#111827;margin:0;letter-spacing:-0.02em;">
            RehabAI
          </p>
          <p style="font-size:0.78rem;color:#9CA3AF;margin:0;font-weight:500;">
            Medical Rehabilitation Platform
          </p>
        </div>
        """,
        unsafe_allow_html=True,
    )

# ── Hero ─────────────────────────────────────────────────────────────────────
col_hero, col_status = st.columns([3, 1])

with col_hero:
    st.markdown('<div class="hero-badge">AI-Powered Rehabilitation</div>', unsafe_allow_html=True)
    st.markdown(
        """
        <h1 style="line-height:1.1;margin-bottom:1rem;">
          Precision Diagnostics<br>& Rehabilitation Tracking
        </h1>
        <p style="font-size:1.15rem;color:#64748B;max-width:580px;margin-bottom:2.5rem;line-height:1.75;">
          Two integrated AI modules — image-based knee OA diagnosis and
          real-time IMU sensor analysis — built for clinicians and patients.
        </p>
        """,
        unsafe_allow_html=True,
    )

with col_status:
    st.markdown("<br><br>", unsafe_allow_html=True)
    diag_ok = is_model_available()
    imu_ok  = assets_available()

    st.markdown(
        f"""
        <div class="rehab-card" style="padding:1.75rem 2rem;text-align:center;">
          <p class="section-label" style="margin-bottom:1rem;">System Status</p>
          <div style="display:flex;flex-direction:column;gap:0.75rem;">
            <div style="display:flex;align-items:center;gap:0.65rem;">
              <span style="font-size:1.1rem;">{'✅' if diag_ok else '⚠️'}</span>
              <span style="font-size:0.95rem;font-weight:500;color:#334155;">
                Diagnostics model {'ready' if diag_ok else 'not loaded'}
              </span>
            </div>
            <div style="display:flex;align-items:center;gap:0.65rem;">
              <span style="font-size:1.1rem;">{'✅' if imu_ok else '⚠️'}</span>
              <span style="font-size:0.95rem;font-weight:500;color:#334155;">
                IMU model {'ready' if imu_ok else 'not found'}
              </span>
            </div>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

st.markdown("<hr>", unsafe_allow_html=True)

# ── Module cards ─────────────────────────────────────────────────────────────
st.markdown("### Choose a Module")
st.markdown(
    '<p style="color:#64748B;font-size:1.05rem;margin-bottom:2rem;">'
    "Navigate using the sidebar, or click a card below to jump directly."
    "</p>",
    unsafe_allow_html=True,
)

card1, card2, spacer = st.columns([1, 1, 1])

with card1:
    st.markdown(
        """
        <div class="module-card">
          <span class="icon">🩻</span>
          <h3>Knee OA Diagnostics</h3>
          <p>
            Upload a knee X-ray and receive an AI-powered binary diagnosis —
            Normal vs. Osteoarthritis — with confidence score and CLAHE-enhanced preview.
          </p>
          <br>
          <div style="display:inline-block;background:#0EA5E9;color:#fff;
               padding:0.4rem 1.1rem;border-radius:8px;font-size:0.85rem;font-weight:600;">
            Open Module →
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )
    st.page_link("pages/1_Diagnostics.py", label="Open Diagnostics Module")

with card2:
    st.markdown(
        """
        <div class="module-card">
          <span class="icon">📡</span>
          <h3>IMU Rehab Dashboard</h3>
          <p>
            Connect IMU sensors or run in simulation mode. The LSTM classifier
            identifies activities in real time and scores your range of motion
            against healthy baselines.
          </p>
          <br>
          <div style="display:inline-block;background:#14B8A6;color:#fff;
               padding:0.4rem 1.1rem;border-radius:8px;font-size:0.85rem;font-weight:600;">
            Open Module →
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )
    st.page_link("pages/2_IMU_Rehab.py", label="Open IMU Rehab Module")

st.markdown("<br>", unsafe_allow_html=True)

# ── Key metrics strip ────────────────────────────────────────────────────────
st.markdown("<hr>", unsafe_allow_html=True)
st.markdown("### Model Performance at a Glance")

m1, m2, m3, m4 = st.columns(4)
m1.metric("OA Classifier Accuracy", "88.8%",  help="ConvNeXt-Small test-set accuracy")
m2.metric("OA Classifier AUC",      "94.8%",  help="ROC-AUC on held-out test set")
m3.metric("LSTM Accuracy",           "94.6%",  help="8-class activity classification test accuracy")
m4.metric("LSTM F1 Score",           "94.8%",  help="Macro F1 on held-out test set")

st.markdown("<br>", unsafe_allow_html=True)

# ── Quick-start help (collapsed) ────────────────────────────────────────────
with st.expander("Setup guide — how to add the diagnostic model checkpoint"):
    st.markdown(
        """
        **Module 1 — Diagnostics** requires the ConvNeXt-Small checkpoint you trained in Colab.

        1. In your Colab session, run:
           ```python
           from google.colab import files
           files.download("/home/ubuntu/apex/knee_oa/best_convnext_small_*.pth")
           ```
        2. Rename the downloaded file to **`best_convnext.pth`**.
        3. Place it inside this project at:
           ```
           rehab_platform/models/knee_oa/best_convnext.pth
           ```
        4. Restart the Streamlit app — the Diagnostics module will detect it automatically.

        ---
        **Module 2 — IMU Rehab** is fully ready. The LSTM model assets are already
        bundled in `models/imu/`. Use **Simulation mode** to demo without hardware.
        """
    )
