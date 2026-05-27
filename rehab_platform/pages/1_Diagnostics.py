"""
pages/1_Diagnostics.py
=======================
Module 1 — Knee OA Image Diagnostics

Upload flow:
  drag-and-drop → CLAHE preview → ConvNeXt-Small inference
  → styled result card (Normal / OA) + confidence bar + Grad-CAM overlay
"""

import streamlit as st
from PIL import Image
import numpy as np

from core.utils import inject_css, section_label, confidence_bar
from core.knee_model import predict, get_gradcam, CKPT_PATH

st.set_page_config(
    page_title="Diagnostics — RehabAI",
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
          <p style="font-size:1.15rem;font-weight:700;color:#111827;margin:0;">RehabAI</p>
          <p style="font-size:0.78rem;color:#9CA3AF;margin:0;font-weight:500;">
            Medical Rehabilitation Platform
          </p>
        </div>
        """,
        unsafe_allow_html=True,
    )
    st.markdown('<p class="section-label">Navigation</p>', unsafe_allow_html=True)
    st.page_link("app.py",               label="Home")
    st.page_link("pages/1_Diagnostics.py", label="Knee OA Diagnostics")
    st.page_link("pages/2_IMU_Rehab.py",   label="IMU Rehab Dashboard")
    st.markdown("<hr>", unsafe_allow_html=True)
    st.markdown('<p class="section-label">About</p>', unsafe_allow_html=True)
    st.markdown(
        """
        <p style="font-size:0.82rem;color:#6B7280;line-height:1.6;">
          Binary classifier trained on knee X-rays.<br>
          <b>Class 0</b> — Normal (Grade 0)<br>
          <b>Class 1</b> — OA (Grades 2–4)<br>
          Grade 1 "Doubtful" excluded from training.
        </p>
        """,
        unsafe_allow_html=True,
    )

# ── Page header ──────────────────────────────────────────────────────────────
st.markdown('<div class="hero-badge">Module 1</div>', unsafe_allow_html=True)
st.markdown("# Knee OA Diagnostics")
st.markdown(
    '<p style="color:#64748B;font-size:1.15rem;margin-bottom:2.5rem;line-height:1.75;">'
    "Upload a knee X-ray image. The AI analyses it for signs of osteoarthritis "
    "and returns a clear, confidence-scored result."
    "</p>",
    unsafe_allow_html=True,
)

# ── Upload zone ───────────────────────────────────────────────────────────────
section_label("Upload X-ray Image")
uploaded = st.file_uploader(
    label="Drag and drop a knee X-ray, or click to browse",
    type=["png", "jpg", "jpeg", "bmp", "tiff"],
    label_visibility="collapsed",
)

if uploaded is None:
    st.markdown(
        """
        <div style="
          text-align:center;padding:4rem 1rem;
          background:#F8FAFC;border:1.5px dashed #CBD5E1;
          border-radius:20px;margin-top:0.75rem;">
          <p style="font-size:2.5rem;margin-bottom:0.75rem;">🩻</p>
          <p style="color:#94A3B8;font-size:1rem;margin:0;font-weight:500;">
            No image uploaded yet. Use the uploader above.
          </p>
        </div>
        """,
        unsafe_allow_html=True,
    )
    st.stop()

# ── Process uploaded image ────────────────────────────────────────────────────
pil_image = Image.open(uploaded).convert("RGB")

with st.spinner("Analysing image…"):
    result = predict(pil_image)

# ── Layout: images + result card ─────────────────────────────────────────────
img_col, result_col = st.columns([1.1, 1], gap="large")

with img_col:
    section_label("Image Preview")
    tab_orig, tab_clahe = st.tabs(["Original", "CLAHE Enhanced"])

    with tab_orig:
        st.image(pil_image, use_container_width=True)
        st.markdown(
            '<p style="font-size:0.8rem;color:#9CA3AF;text-align:center;margin-top:0.25rem;">'
            "Original upload — unmodified"
            "</p>",
            unsafe_allow_html=True,
        )

    with tab_clahe:
        if result["enhanced"] is not None:
            st.image(result["enhanced"], use_container_width=True)
            st.markdown(
                '<p style="font-size:0.8rem;color:#9CA3AF;text-align:center;margin-top:0.25rem;">'
                "CLAHE contrast enhancement applied before inference"
                "</p>",
                unsafe_allow_html=True,
            )

with result_col:
    section_label("Diagnosis Result")

    class_id    = result["class_id"]
    label       = result["label"]
    confidence  = result["confidence"]
    oa_prob     = result["oa_prob"]
    description = result["description"]

    if class_id == 0:
        card_class  = "result-normal"
        icon        = "✅"
        label_color = "#15803D"
    else:
        card_class  = "result-oa"
        icon        = "⚠️"
        label_color = "#B45309"

    conf_bar_html = confidence_bar(confidence)

    st.markdown(
        f"""
        <div class="{card_class}">
          <p style="font-size:2.75rem;margin-bottom:0.35rem;">{icon}</p>
          <p class="result-label" style="color:{label_color};">{label}</p>
          {conf_bar_html}
          <p class="result-sub">{description}</p>
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.markdown("<br>", unsafe_allow_html=True)

    m1, m2 = st.columns(2)
    m1.metric("OA Probability",     f"{oa_prob * 100:.1f}%")
    m2.metric("Normal Probability", f"{(1 - oa_prob) * 100:.1f}%")

    st.markdown(
        """
        <p style="font-size:0.9rem;color:#94A3B8;margin-top:1.25rem;line-height:1.65;">
          This analysis is AI-generated and intended to assist clinicians.
          It is not a substitute for professional medical diagnosis.
        </p>
        """,
        unsafe_allow_html=True,
    )

# ── Grad-CAM section ──────────────────────────────────────────────────────────
if result["model_used"]:
    st.markdown("<hr>", unsafe_allow_html=True)
    section_label("Explainability — Grad-CAM Heatmap")

    with st.expander("Show Grad-CAM overlay (highlights regions that drove the prediction)"):
        with st.spinner("Generating Grad-CAM…"):
            cam_overlay = get_gradcam(pil_image)

        if cam_overlay is not None:
            cam_col, info_col = st.columns([1, 1])
            with cam_col:
                st.image(cam_overlay, caption="Grad-CAM overlay", use_container_width=True)
            with info_col:
                st.markdown(
                    """
                    <div class="rehab-card">
                      <h3>How to read this</h3>
                      <p style="font-size:0.88rem;color:#4B5563;line-height:1.7;">
                        <b style="color:#EF4444;">Red / warm areas</b> indicate the image
                        regions that most strongly influenced the model's decision.<br><br>
                        For knee OA, high activation typically appears around the joint space,
                        medial compartment, and osteophyte-prone margins.
                      </p>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )
        else:
            st.info(
                "Grad-CAM requires `pip install grad-cam`. "
                "Install it and restart the app to enable this feature."
            )
