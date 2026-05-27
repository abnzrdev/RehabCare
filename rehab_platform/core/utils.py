from __future__ import annotations

from pathlib import Path
import streamlit as st

_CSS_PATH = Path(__file__).resolve().parents[1] / "assets" / "style.css"


def inject_css() -> None:
    """Inject the global design-system CSS into the Streamlit page."""
    css = _CSS_PATH.read_text(encoding="utf-8")
    st.markdown(f"<style>{css}</style>", unsafe_allow_html=True)


def card(content_html: str) -> None:
    """Render arbitrary HTML inside a styled white card."""
    st.markdown(f'<div class="rehab-card">{content_html}</div>', unsafe_allow_html=True)


def section_label(text: str) -> None:
    st.markdown(f'<p class="section-label">{text}</p>', unsafe_allow_html=True)


def confidence_bar(value: float, color: str = "linear-gradient(90deg,#0EA5E9,#14B8A6)") -> str:
    """Return an HTML confidence bar (value 0–1)."""
    pct = round(value * 100, 1)
    return (
        f'<div class="confidence-bar-wrap">'
        f'<div class="confidence-bar-fill" style="width:{pct}%;background:{color};"></div>'
        f"</div>"
        f'<p style="font-size:0.85rem;color:#6B7280;margin:0;">{pct}% confidence</p>'
    )


def score_badge(score: float) -> str:
    """Return an HTML circular score badge coloured by performance tier."""
    if score >= 75:
        cls = "score-good"
    elif score >= 45:
        cls = "score-medium"
    else:
        cls = "score-low"
    return f'<div class="score-badge {cls}">{score:.0f}%</div>'
