"""
api/main.py  —  OrthoScan AI  ·  FastAPI backend
=================================================
Endpoints
  GET  /health       → {"status":"ok", "binary_model":"real"|"demo"|"missing", "kl_model":"real_kl"|"demo_kl", "imu":"real"|"demo"}
  POST /predict      → image file + ?lang=en|ru|kz → full JSON report

Main KL grading model
  rehab_platform/models/knee_oa/kl_grade_model.pt

Legacy /predict binary endpoint
  Optionally uses rehab_platform/models/knee_oa/best_convnext.pth.
  If that checkpoint is missing, /predict falls back to the deterministic demo analyser.

Run with (from Rehabilitation/ root):
  uvicorn api.main:app --reload --port 8000
"""

from __future__ import annotations

import hashlib
import io
import logging
import sys
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import Body, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image
from pydantic import BaseModel, Field

log = logging.getLogger("orthoscan")
logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")

# ── IMU pipeline import (rehab_platform/core/imu_pipeline.py) ─────────────────
# Add rehab_platform/ to sys.path so we can import core.imu_pipeline directly.
_ROOT_EARLY = Path(__file__).resolve().parent.parent
_REHAB_DIR  = _ROOT_EARLY / "rehab_platform"
if str(_REHAB_DIR) not in sys.path:
    sys.path.insert(0, str(_REHAB_DIR))

from core.koos import calculate_koos  # noqa: E402
from core.kl_grade import (  # noqa: E402
    KL_MODEL_PATH,
    _build_demo_kl_response,
    _format_kl_prediction,
    infer_kl_class_probs,
    load_kl_model,
)
from core.rehab_levels import (  # noqa: E402
    RAW_SCORE_MAPPING_HIGH,
    RAW_SCORE_MAPPING_LOW,
    build_rehab_level_payload,
    map_raw_rehab_score_to_100,
    rehab_meaning_from_score,
)
from core.storage import (
    SessionRecord,
    get_last_session,
    get_patient_sessions,
    init_db,
    save_session,
)  # noqa: E402

_HAS_IMU_PIPELINE = False
try:
    from core.imu_pipeline import (          # noqa: E402
        analyze_imu_csv      as _imu_analyze,
        score_rehab_exercise as _imu_rehab_score,
        assets_available     as _imu_assets,
        load_classifier      as _imu_load_clf,
        load_scaler          as _imu_load_scl,
        load_metadata        as _imu_load_meta,
        load_baseline        as _imu_load_baseline,
    )
    _HAS_IMU_PIPELINE = True
except Exception as _imu_import_err:
    log.warning(f"IMU pipeline not importable: {_imu_import_err}")

# ── Checkpoint paths ───────────────────────────────────────────────────────────
_ROOT      = Path(__file__).resolve().parent.parent
CKPT_PATH  = _ROOT / "rehab_platform" / "models" / "knee_oa" / "best_convnext.pth"
TEMP_PATH  = _ROOT / "rehab_platform" / "models" / "knee_oa" / "temperatures.pth"

# ── Notebook constants (fallbacks when not stored in checkpoint) ───────────────
_ARCH       = "convnext_small.fb_in22k_ft_in1k"
_MEAN       = 0.6074   # training-set X-ray pixel mean (grayscale)
_STD        = 0.1944   # training-set X-ray pixel std
_THRESHOLD  = 0.56     # Youden's J threshold from val set
_INPUT_SIZE = 224

# ── Global model state ────────────────────────────────────────────────────────
# OA (Knee X-ray) model
_model     = None   # nn.Module or None
_threshold = _THRESHOLD
_mean      = _MEAN
_std       = _STD
_T         = 1.0    # temperature scalar (1.0 = no scaling)
_mode      = "missing" # Legacy /predict status: "real" | "demo" | "missing"
_binary_fail_reason = ""

# IMU (LSTM activity classifier) model
_imu_clf      = None
_imu_scaler   = None
_imu_meta     = None
_imu_baseline = None
_imu_mode     = "demo"         # "real" | "demo"
_imu_fail_reason = ""          # human-readable reason stored for /health

# KL (graded OA) model
_kl_model = None
_kl_mode = "demo_kl"          # "real_kl" | "demo_kl"
_kl_fail_reason = ""


# ── Exact model architecture from build_model_v3() in the notebook ─────────────
def _build_model(arch: str, in_features: int | None = None):
    """
    Recreates BinaryModel exactly as defined in Cell 10 of
    BIN_knee_ost_dropped_G1.ipynb.

    Head: LayerNorm → Dropout(0.4) → Linear(feats,256) → GELU
          → Dropout(0.3) → Linear(256,1)
    """
    import torch.nn as nn
    import timm

    backbone    = timm.create_model(arch, pretrained=False, num_classes=0)
    in_features = backbone.num_features

    head = nn.Sequential(
        nn.LayerNorm(in_features),
        nn.Dropout(p=0.4),
        nn.Linear(in_features, 256),
        nn.GELU(),
        nn.Dropout(p=0.3),
        nn.Linear(256, 1),
    )

    class BinaryModel(nn.Module):
        def __init__(self, bb, hd):
            super().__init__()
            self.backbone = bb
            self.head     = hd

        def forward(self, x):
            return self.head(self.backbone(x))

    return BinaryModel(backbone, head)


def _load_real_model() -> bool:
    """
    Attempts to load the legacy ConvNeXt-Small checkpoint used only by /predict.
    Returns True on success, False if the endpoint should use demo analysis.
    """
    global _model, _threshold, _mean, _std, _T, _mode, _binary_fail_reason

    if not CKPT_PATH.exists():
        _model = None
        _mode = "missing"
        _binary_fail_reason = (
            f"Legacy /predict binary checkpoint not found at {CKPT_PATH}; "
            "/predict will use demo analysis. KL grading uses kl_grade_model.pt."
        )
        log.info(_binary_fail_reason)
        return False

    try:
        import torch

        log.info(f"Loading checkpoint: {CKPT_PATH}")
        ckpt = torch.load(CKPT_PATH, map_location="cpu", weights_only=False)

        arch = ckpt.get("arch", _ARCH)
        model = _build_model(arch)
        model.load_state_dict(ckpt["model_state_dict"])
        model.eval()

        _model     = model
        _threshold = float(ckpt.get("best_threshold", _THRESHOLD))
        _mean      = float(ckpt.get("train_mean",     _MEAN))
        _std       = float(ckpt.get("train_std",      _STD))
        _mode      = "real"
        _binary_fail_reason = ""

        log.info(f"  arch      : {arch}")
        log.info(f"  threshold : {_threshold:.4f}  (Youden's J, from val set)")
        log.info(f"  mean/std  : {_mean:.4f} / {_std:.4f}  (X-ray training stats)")
        log.info(f"  val_acc   : {ckpt.get('val_accuracy', 'n/a')}")
        log.info(f"  val_auc   : {ckpt.get('val_auc', 'n/a')}")

        # Optional temperature scaling
        if TEMP_PATH.exists():
            calib = torch.load(TEMP_PATH, map_location="cpu", weights_only=False)
            entry = calib.get("ConvNeXt-Small", {})
            _T = float(entry.get("T", 1.0))
            log.info(f"  temperature: {_T:.4f}  (from {TEMP_PATH.name})")
        else:
            _T = 1.0
            log.info("  temperature: 1.0  (temperatures.pth not found, skipping)")

        log.info("✓ Real ConvNeXt-Small model loaded successfully")
        return True

    except Exception as exc:
        _binary_fail_reason = f"Legacy /predict binary checkpoint load failed: {exc}"
        log.error(_binary_fail_reason)
        log.error("Legacy /predict will use demo analysis.")
        _model = None
        _mode  = "demo"
        return False


# ── Preprocessing — exact eval pipeline from Cell 7 of the notebook ────────────
def _preprocess(pil_image: Image.Image) -> "torch.Tensor":
    """
    CLAHE (clipLimit=2.0, tileGridSize=8×8)
    → RGB conversion (same grayscale replicated to 3 channels)
    → Resize 224×224
    → ToTensor  (scales to [0,1])
    → Normalize with training X-ray stats: mean=0.6074, std=0.1944
    Returns shape (1, 3, 224, 224).
    """
    import cv2
    import torch
    from torchvision import transforms

    img_np = np.array(pil_image.convert("L"), dtype=np.uint8)
    clahe  = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    eq     = clahe.apply(img_np)
    # cv2.COLOR_GRAY2RGB replicates the single channel to R,G,B
    rgb    = cv2.cvtColor(eq, cv2.COLOR_GRAY2RGB)
    enhanced_pil = Image.fromarray(rgb)

    tf = transforms.Compose([
        transforms.Resize(_INPUT_SIZE),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[_mean, _mean, _mean],
            std =[_std,  _std,  _std ],
        ),
    ])
    return tf(enhanced_pil).unsqueeze(0)   # (1, 3, 224, 224)


# ── Real-model inference with TTA — exact logic from Cell 13 of the notebook ───
def _infer_real(pil_image: Image.Image) -> float:
    """
    3-pass TTA matching collect_val_logits():
      pass 1: original
      pass 2: horizontal flip
      pass 3: brightness × 1.1
    Logits averaged, then temperature-scaled, then sigmoid → P(OA).
    """
    import torch
    import torchvision.transforms.functional as TF

    tensor = _preprocess(pil_image)   # (1, 3, 224, 224)

    with torch.no_grad():
        l1 = _model(tensor)
        l2 = _model(TF.hflip(tensor))
        l3 = _model(TF.adjust_brightness(tensor, brightness_factor=1.1))
        logit = (l1 + l2 + l3) / 3.0          # average TTA logits
        logit = logit / max(_T, 0.05)          # temperature scaling
        oa_prob = float(torch.sigmoid(logit).squeeze())

    return oa_prob


# ── Demo analyser (no model required) ─────────────────────────────────────────
def _infer_demo(pil_image: Image.Image) -> float:
    """
    Deterministic, per-image OA probability from image statistics.
    Used only when the checkpoint is absent.
    """
    import cv2

    gray     = np.array(pil_image.convert("L"), dtype=np.uint8)
    clahe    = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    resized  = np.array(
        Image.fromarray(enhanced).resize((_INPUT_SIZE, _INPUT_SIZE)),
        dtype=np.float32,
    ) / 255.0

    H, W   = resized.shape
    m      = 56
    cx, cy = W // 2, H // 2
    center = resized[cy - m : cy + m, cx - m : cx + m]

    edges   = cv2.Canny((resized * 255).astype(np.uint8), 50, 150)
    c_edges = edges[cy - m : cy + m, cx - m : cx + m]

    h8    = hashlib.md5(pil_image.tobytes()).hexdigest()[:8]
    noise = (int(h8, 16) % 1000) / 1000.0 * 0.10 - 0.05

    raw = (
        -0.55 * float(np.mean(center))
        +  0.45 * float(np.mean(c_edges > 0))
        +  0.30 * float(np.std(resized))
        -  0.15 * float(np.std(center))
        +  0.10 * float(np.mean(edges > 0))
        +  0.30
        +  noise
    )
    return float(np.clip(1.0 / (1.0 + np.exp(-raw * 4.5)), 0.12, 0.96))


# ── Multilingual report content ────────────────────────────────────────────────
_CONTENT = {
    "en": {
        "normal": {
            "diagnosis": "Normal — Grade 0",
            "findings": [
                "Joint space width within normal limits bilaterally",
                "No significant osteophyte formation detected",
                "Subchondral bone density appears uniform",
                "Tibial plateau and femoral condyles structurally intact",
            ],
            "recommendations": [
                "Routine follow-up in 24 months if asymptomatic",
                "Maintain healthy weight to preserve joint health",
                "Low-impact physical activity (swimming, cycling) recommended",
                "Return if symptoms such as pain or stiffness develop",
            ],
        },
        "oa": {
            "diagnosis": "Osteoarthritis Detected — Grade 2–4",
            "findings": [
                "Moderate joint space narrowing in medial compartment",
                "Osteophyte formation at femoral condyle margins",
                "Subchondral sclerosis in medial tibial plateau",
                "Lateral compartment relatively preserved",
            ],
            "recommendations": [
                "Orthopedic specialist consultation recommended",
                "Begin supervised low-impact physiotherapy programme",
                "Weight management to reduce mechanical joint load",
                "Follow-up X-ray in 12–18 months to monitor progression",
            ],
        },
        "scale": "Grade 1 excluded. Binary classifier: Normal vs OA (Grades 2–4).",
    },
    "ru": {
        "normal": {
            "diagnosis": "Норма — Grade 0",
            "findings": [
                "Ширина суставной щели в норме с обеих сторон",
                "Значимых остеофитов не выявлено",
                "Плотность субхондральной кости равномерная",
                "Мыщелки бедра и плато большеберцовой кости структурно сохранны",
            ],
            "recommendations": [
                "Контрольный осмотр через 24 месяца при отсутствии симптомов",
                "Поддерживать нормальный вес для сохранения здоровья суставов",
                "Рекомендована физическая активность с малой нагрузкой",
                "Обратиться при появлении боли или скованности",
            ],
        },
        "oa": {
            "diagnosis": "Остеоартрит выявлен — Grade 2–4",
            "findings": [
                "Умеренное сужение суставной щели в медиальном отделе",
                "Остеофиты у краёв мыщелков бедренной кости",
                "Субхондральный склероз в медиальном отделе большеберцовой кости",
                "Латеральный отдел сустава относительно сохранён",
            ],
            "recommendations": [
                "Консультация ортопеда обязательна",
                "Начать физиотерапию с малой нагрузкой под наблюдением специалиста",
                "Контроль веса для снижения нагрузки на сустав",
                "Контрольный рентген через 12–18 месяцев для мониторинга динамики",
            ],
        },
        "scale": "Grade 1 исключён. Бинарный классификатор: Норма против ОА (Grade 2–4).",
    },
    "kz": {
        "normal": {
            "diagnosis": "Норма — Grade 0",
            "findings": [
                "Буын саңылауының ені екі жағынан да қалыпты шектерде",
                "Маңызды остеофит түзілуі анықталмады",
                "Субхондральды сүйек тығыздығы біркелкі",
                "Тибиальды үстіңгі жақ пен сан мыщелктері құрылымдық жағынан сақталған",
            ],
            "recommendations": [
                "Симптомсыз болса 24 айдан кейін жоспарлы бақылау",
                "Буын денсаулығын сақтау үшін қалыпты салмақты ұстаңыз",
                "Аз жүктемелі физикалық белсенділік (жүзу, велосипед) ұсынылады",
                "Ауырсыну немесе қаттылық пайда болса қайта өтіңіз",
            ],
        },
        "oa": {
            "diagnosis": "Остеоартрит анықталды — Grade 2–4",
            "findings": [
                "Медиальды бөліктегі буын саңылауының орташа тарылуы",
                "Сан мыщелктерінің шеттерінде остеофит түзілуі",
                "Медиальды тибиальды үстіңгі жақта субхондральды склероз",
                "Буынның латеральды бөлігі салыстырмалы түрде сақталған",
            ],
            "recommendations": [
                "Ортопед дәрігерімен міндетті консультация",
                "Маманның бақылауымен аз жүктемелі физиотерапия бағдарламасын бастаңыз",
                "Буынға механикалық жүктемені азайту үшін салмақты басқарыңыз",
                "Динамиканы бақылау үшін 12–18 айдан кейін рентген",
            ],
        },
        "scale": "Grade 1 жойылды. Бинарлы жіктеуіш: Норма — ОА (Grade 2–4).",
    },
}

_HOTSPOT_LABELS = {
    "en": ["Joint space", "Medial compartment", "Femoral condyle", "Tibial plateau"],
    "ru": ["Суставная щель", "Медиальный отдел", "Мыщелок бедра", "Плато б/берцовой кости"],
    "kz": ["Буын саңылауы", "Медиальды бөлік", "Сан мыщелкі", "Тибиальды үстіңгі жақ"],
}

KL_GRADE_MIN = 0
KL_GRADE_MAX = 4
KL_GRADE_BETA3 = {
    0: 1.0,
    1: -23.29,
    2: -7.93,
    3: -0.81,
    4: 0.0,
}
PREDICTED_DELTA_COEFFS = {
    "beta0": 139.95,
    "beta1": -0.93,
    "beta2": -0.785,
    "beta3_by_KL": KL_GRADE_BETA3,
}
PREDICTED_DELTA_FORMULA_TEXT = "raw_score = 139.95 - 0.93*KOOS_pre - 0.785*Delta_ROM + beta3_KL"


class RehabReportInput(BaseModel):
    patient_id: str
    patient_name: str | None = None
    exercise: str = "knee_extension"
    koos_pre: float | None = Field(default=None, ge=0, le=100)
    kl_grade: int | None = None
    current_rom: float | None = None
    previous_rom: float | None = None
    rehab_score: float | None = None
    image_result: dict[str, Any] | None = None
    imu_result: dict[str, Any] | None = None


def _build_kl_response(pil_image: Image.Image, lang: str, scale_max: int) -> dict:
    if _kl_model is not None:
        result = _format_kl_prediction(
            class_probs=infer_kl_class_probs(_kl_model, pil_image),
            source="real_kl",
        )
        result["lang"] = lang
        result["kl_model"] = _kl_mode
        result["report_score_mapping"] = {
            "formula": PREDICTED_DELTA_FORMULA_TEXT,
            "beta3_by_kl": KL_GRADE_BETA3,
            "beta3_kl": KL_GRADE_BETA3.get(result["kl_grade"]),
        }
        return result

    oa_prob = _infer_real(pil_image) if _model is not None else _infer_demo(pil_image)
    result = _build_demo_kl_response(oa_prob=oa_prob)
    result["lang"] = lang
    result["kl_model"] = _kl_mode
    result["report_score_mapping"] = {
        "formula": PREDICTED_DELTA_FORMULA_TEXT,
        "beta3_by_kl": KL_GRADE_BETA3,
        "beta3_kl": KL_GRADE_BETA3.get(result["kl_grade"]),
    }
    return result


def _extract_current_rom(imu_result: dict[str, Any] | None, provided_current_rom: float | None) -> float | None:
    if provided_current_rom is not None:
        return float(provided_current_rom)
    if not isinstance(imu_result, dict):
        return None
    summary = imu_result.get("session_summary", {})
    rom_val = summary.get("rom_deg")
    return float(rom_val) if rom_val is not None else None


def _extract_imu_angle_metrics(imu_result: dict[str, Any] | None) -> dict[str, float | None]:
    if not isinstance(imu_result, dict):
        return {
            "min_angle_deg": None,
            "max_angle_deg": None,
            "rom_deg": None,
        }

    summary = imu_result.get("session_summary", {}) or {}
    rom_scores = imu_result.get("rom_scores") or []
    primary = rom_scores[0] if isinstance(rom_scores, list) and rom_scores else {}

    def _num(value):
        return float(value) if value is not None else None

    return {
        "min_angle_deg": _num(summary.get("min_angle_deg", primary.get("min_angle_deg"))),
        "max_angle_deg": _num(summary.get("max_angle_deg", primary.get("max_angle_deg"))),
        "rom_deg": _num(summary.get("rom_deg", primary.get("rom_deg"))),
    }


def _build_rehab_report(payload: RehabReportInput) -> dict[str, Any]:
    current_rom = _extract_current_rom(payload.imu_result, payload.current_rom)
    current_metrics = _extract_imu_angle_metrics(payload.imu_result)
    previous_row = get_last_session(payload.patient_id, payload.exercise)

    if payload.previous_rom is not None:
        previous_rom = float(payload.previous_rom)
        delta_note = "previous_ROM provided by request"
    elif previous_row and previous_row.get("current_rom") is not None:
        previous_rom = float(previous_row["current_rom"])
        delta_note = "previous_ROM loaded from latest session"
    else:
        previous_rom = None
        delta_note = "No previous session ROM for this patient/exercise"

    delta_rom_signed = None if (previous_rom is None or current_rom is None) else round(current_rom - previous_rom, 2)
    delta_rom_abs = None if delta_rom_signed is None else round(abs(delta_rom_signed), 2)
    delta_rom_used_in_score = delta_rom_signed
    imu_rehab_score = payload.rehab_score
    if imu_rehab_score is None and isinstance(payload.imu_result, dict):
        imu_rehab_score = payload.imu_result.get("overall_score")
    imu_rehab_score = float(imu_rehab_score) if imu_rehab_score is not None else None

    beta0 = PREDICTED_DELTA_COEFFS["beta0"]
    beta1 = PREDICTED_DELTA_COEFFS["beta1"]
    beta2 = PREDICTED_DELTA_COEFFS["beta2"]
    beta3_kl = KL_GRADE_BETA3.get(payload.kl_grade) if payload.kl_grade is not None else None
    raw_score = None
    final_rehab_score = None
    if payload.koos_pre is not None and delta_rom_used_in_score is not None and beta3_kl is not None:
        raw_score = round(beta0 + beta1 * payload.koos_pre + beta2 * delta_rom_used_in_score + beta3_kl, 3)
        final_rehab_score = map_raw_rehab_score_to_100(raw_score)
    rehab_level_payload = build_rehab_level_payload(final_rehab_score)

    interpretation = "insufficient_data"
    if final_rehab_score is not None and delta_rom_signed is not None:
        if final_rehab_score >= 61 and delta_rom_signed > 0 and (payload.koos_pre or 0) >= 55:
            interpretation = "improving"
        elif final_rehab_score <= 40 or delta_rom_signed < 0 or (payload.kl_grade or 0) >= 3:
            interpretation = "needs_attention"
        else:
            interpretation = "stable"

    if interpretation == "improving":
        recommendations = [
            "Continue current rehab protocol.",
            "Re-evaluate KOOS and ROM in next session.",
        ]
    elif interpretation == "needs_attention":
        recommendations = [
            "Review exercise technique and intensity.",
            "Consider clinician follow-up for plan adjustment.",
        ]
    else:
        recommendations = ["Collect more sessions to establish trend."]

    session_info = save_session(
        SessionRecord(
            patient_id=payload.patient_id,
            patient_name=payload.patient_name,
            exercise=payload.exercise,
            koos_pre=payload.koos_pre,
            kl_grade=payload.kl_grade,
            current_rom=current_rom,
            previous_rom=previous_rom,
            delta_rom=delta_rom_signed,
            rehab_score=final_rehab_score,
            image_result=payload.image_result,
            imu_result=payload.imu_result,
        )
    )

    simple_meaning = None
    if final_rehab_score is not None:
        meaning_label = rehab_meaning_from_score(final_rehab_score)
        if interpretation == "improving":
            simple_meaning = (
                f"This patient is improving: KOOS_pre {payload.koos_pre:.2f}, "
                f"Delta ROM {delta_rom_signed:.2f}°, KL grade {payload.kl_grade}, "
                f"mapped score {final_rehab_score:.2f}/100 ({meaning_label})."
            )
        elif interpretation == "stable":
            simple_meaning = (
                f"This patient is stable: KOOS_pre {payload.koos_pre:.2f}, "
                f"Delta ROM {delta_rom_signed:.2f}°, KL grade {payload.kl_grade}, "
                f"mapped score {final_rehab_score:.2f}/100 ({meaning_label})."
            )
        elif interpretation == "needs_attention":
            simple_meaning = (
                f"This patient needs attention: KOOS_pre {payload.koos_pre:.2f}, "
                f"Delta ROM {delta_rom_signed:.2f}°, KL grade {payload.kl_grade}, "
                f"mapped score {final_rehab_score:.2f}/100 ({meaning_label})."
            )

    return {
        "patient_id": payload.patient_id,
        "patient_name": payload.patient_name,
        "exercise": payload.exercise,
        "current_ROM": current_rom,
        "previous_ROM": previous_rom,
        "delta_ROM": delta_rom_signed,
        "min_angle_deg": current_metrics["min_angle_deg"],
        "max_angle_deg": current_metrics["max_angle_deg"],
        "rom_deg": current_metrics["rom_deg"] if current_metrics["rom_deg"] is not None else current_rom,
        "previous_rom_deg": previous_rom,
        "delta_rom_signed_deg": delta_rom_signed,
        "delta_rom_abs_deg": delta_rom_abs,
        "delta_rom_used_in_score_deg": delta_rom_used_in_score,
        "delta_rom_formula_explanation": {
            "title": "Delta ROM calculation",
            "steps": [
                "Current ROM = current max angle - current min angle",
                "Previous ROM = previous max angle - previous min angle",
                "Delta ROM = current ROM - previous ROM",
                "Absolute Delta ROM = abs(current ROM - previous ROM)",
            ],
        },
        "rehab_score": imu_rehab_score,
        "rehab_level": rehab_level_payload["rehab_level"],
        "rehab_level_label": rehab_level_payload["rehab_level_label"],
        "rehab_level_meaning": rehab_level_payload["rehab_level_meaning"],
        "KOOS_pre": payload.koos_pre,
        "KL_grade": payload.kl_grade,
        "beta0": beta0,
        "beta1": beta1,
        "beta2": beta2,
        "beta3_KL": beta3_kl,
        "raw_score": raw_score,
        "predicted_delta_KOOS": raw_score,
        "final_rehab_score": final_rehab_score,
        "formula_coefficients": PREDICTED_DELTA_COEFFS,
        "formula_text": PREDICTED_DELTA_FORMULA_TEXT,
        "raw_score_mapping_low": RAW_SCORE_MAPPING_LOW,
        "raw_score_mapping_high": RAW_SCORE_MAPPING_HIGH,
        "mapped_score_formula": "final_rehab_score = 100 * (raw_high - raw_score) / (raw_high - raw_low)",
        "mapped_score_clamp_formula": "final_rehab_score = clamp(final_rehab_score, 0, 100)",
        "interpretation": interpretation,
        "score_meaning": simple_meaning,
        "recommendations": recommendations,
        "recommended_exercises": rehab_level_payload["recommended_exercises"],
        "delta_note": delta_note,
        "session_id": session_info["session_id"],
        "created_at": session_info["created_at"],
    }


# ── Build the full response dict ───────────────────────────────────────────────
def _build_response(pil_image: Image.Image, lang: str) -> dict:
    # Pick inference path
    if _model is not None:
        oa_prob = _infer_real(pil_image)
    else:
        oa_prob = _infer_demo(pil_image)

    grade      = 1 if oa_prob >= _threshold else 0
    conf_pct   = round((oa_prob if grade == 1 else 1.0 - oa_prob) * 100, 1)
    normal_pct = round((1.0 - oa_prob) * 100, 1)
    oa_pct     = round(oa_prob * 100, 1)

    lang_c  = _CONTENT.get(lang, _CONTENT["en"])
    content = lang_c["oa" if grade == 1 else "normal"]
    labels  = _HOTSPOT_LABELS.get(lang, _HOTSPOT_LABELS["en"])

    h8   = hashlib.md5(pil_image.tobytes()).hexdigest()[:8]
    seed = int(h8[:4], 16)

    if grade == 1:
        hotspots = [
            {"x": 0.50, "y": 0.58, "r": 0.28, "intensity": round(min(0.96, oa_prob + 0.05), 2), "label": labels[0]},
            {"x": round(0.35 + (seed % 10) * 0.01, 2), "y": 0.55, "r": 0.22, "intensity": round(min(0.88, oa_prob - 0.04), 2), "label": labels[1]},
            {"x": 0.65, "y": round(0.52 + (seed % 8) * 0.01, 2), "r": 0.20, "intensity": round(min(0.75, oa_prob - 0.14), 2), "label": labels[2]},
            {"x": 0.50, "y": 0.40, "r": 0.25, "intensity": round(max(0.30, oa_prob - 0.25), 2), "label": labels[3]},
        ]
    else:
        hotspots = [
            {"x": 0.50, "y": 0.55, "r": 0.30, "intensity": round(max(0.20, oa_prob + 0.10), 2), "label": labels[0]},
            {"x": 0.38, "y": 0.53, "r": 0.22, "intensity": round(max(0.15, oa_prob), 2),         "label": labels[1]},
            {"x": 0.62, "y": 0.50, "r": 0.20, "intensity": round(max(0.12, oa_prob - 0.05), 2),  "label": labels[2]},
            {"x": 0.50, "y": 0.42, "r": 0.24, "intensity": round(max(0.10, oa_prob - 0.08), 2),  "label": labels[3]},
        ]

    return {
        "grade"          : grade,
        "diagnosis"      : content["diagnosis"],
        "prob_oa"        : round(oa_prob, 4),
        "confidence"     : conf_pct,
        "grade_probs"    : {"0": normal_pct, "1": oa_pct},
        "threshold"      : round(_threshold, 4),
        "T_optimal"      : round(_T, 4),
        "severity"       : "None" if grade == 0 else ("Moderate" if conf_pct > 80 else "Mild"),
        "findings"       : content["findings"],
        "recommendations": content["recommendations"],
        "scale"          : lang_c["scale"],
        "urgency"        : "Routine" if grade == 0 else ("Soon" if conf_pct > 85 else "Routine"),
        "hotspots"       : hotspots,
        "binary_model"   : _mode,
        "source"         : _mode,
    }


# ── FastAPI app ────────────────────────────────────────────────────────────────
app = FastAPI(title="OrthoScan AI", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load_imu_model() -> bool:
    """Attempt to load the LSTM IMU classifier; otherwise use the biomechanical scorer."""
    global _imu_clf, _imu_scaler, _imu_meta, _imu_baseline, _imu_mode, _imu_fail_reason
    if not _HAS_IMU_PIPELINE:
        _imu_fail_reason = "IMU pipeline import failed (tensorflow / joblib / pandas not installed?)"
        log.warning(_imu_fail_reason)
        _imu_mode = "demo"
        return False
    if not _imu_assets():
        _imu_fail_reason = (
            f"LSTM model files not found at {_REHAB_DIR / 'models' / 'imu'}. "
            "Using biomechanical demo scorer for /imu/analyze."
        )
        _imu_mode = "demo"
        log.info(_imu_fail_reason)
        return False
    try:
        log.info("Loading IMU LSTM classifier…")
        _imu_clf      = _imu_load_clf()
        _imu_scaler   = _imu_load_scl()
        _imu_meta     = _imu_load_meta()
        _imu_baseline = _imu_load_baseline()
        _imu_mode     = "real"
        _imu_fail_reason = ""
        log.info("✓ IMU LSTM model loaded successfully")
        return True
    except Exception as exc:
        _imu_fail_reason = f"Model load error: {exc}"
        log.error(_imu_fail_reason)
        _imu_mode = "demo"
        return False


def _load_kl_model() -> bool:
    """Attempt to load the graded KL PyTorch classifier."""
    global _kl_model, _kl_mode, _kl_fail_reason

    if not KL_MODEL_PATH.exists():
        _kl_model = None
        _kl_mode = "demo_kl"
        _kl_fail_reason = f"KL grade model not found at {KL_MODEL_PATH}"
        log.warning(_kl_fail_reason)
        return False

    try:
        _kl_model = load_kl_model(KL_MODEL_PATH)
        _kl_mode = "real_kl"
        _kl_fail_reason = ""
        log.info(f"✓ Real KL grade model loaded successfully from {KL_MODEL_PATH.name}")
        return True
    except Exception as exc:
        _kl_model = None
        _kl_mode = "demo_kl"
        _kl_fail_reason = f"KL grade model load failed: {exc}"
        log.warning(_kl_fail_reason)
        return False


@app.on_event("startup")
async def startup():
    """Load OA and IMU models at startup."""
    init_db()
    _load_kl_model()
    _load_real_model()
    _load_imu_model()
    if _HAS_IMU_PIPELINE:
        log.info("✓ IMU endpoint → biomechanical rehab scorer (score_rehab_exercise)")
    else:
        log.warning("✗ IMU pipeline import failed — /imu/analyze will return 503")


@app.get("/health")
async def health():
    resp = {
        "status":    "ok",
        "binary_model": _mode,     # Legacy /predict: "real" | "demo"
        "kl_model":  _kl_mode,     # KL model: "real_kl" | "demo_kl"
        "threshold": _threshold,
        "T":         _T,
        "imu":       _imu_mode,    # IMU analysis: "real" | "demo"
    }
    if _binary_fail_reason:
        resp["binary_model_note"] = _binary_fail_reason
    if _imu_fail_reason:
        resp["imu_error"] = _imu_fail_reason
    if _kl_fail_reason:
        resp["kl_error"] = _kl_fail_reason
    return resp


@app.post("/imu/analyze")
async def imu_analyze(
    file: UploadFile = File(...),
    lang: str            = Query("en"),
    sensor_location: str = Query("right_thigh"),
):
    """
    Accepts a single-sensor IMU CSV and returns biomechanical rehab scores.

    Scoring is done via direct signal analysis (no LSTM required):
      - Shakiness  — gyro-magnitude std detects tremor / instability
      - ROM        — pitch range measures knee bend completeness
    Clinical feedback is generated from threshold logic with continuous scoring.
    """
    if not _HAS_IMU_PIPELINE:
        return JSONResponse(
            status_code=503,
            content={"error": "IMU pipeline unavailable — numpy/pandas not installed."},
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    valid_locations = {
        "right_thigh", "right_shin", "right_foot",
        "left_thigh",  "left_shin",  "left_foot",
    }
    if sensor_location not in valid_locations:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid sensor_location '{sensor_location}'. Valid: {sorted(valid_locations)}",
        )

    try:
        log.info(f"IMU analyze: {len(data)} bytes, location={sensor_location}")
        result = _imu_rehab_score(
            csv_bytes=data,
            sensor_location=sensor_location,
        )
        log.info(
            f"IMU result: scorer=biomechanical "
            f"file_hash={result['session_summary'].get('file_hash','?')} "
            f"rows={result['session_summary']['total_samples']} "
            f"gyro_std={result['session_summary']['gyro_std_dps']} "
            f"rom={result['session_summary']['rom_deg']}° "
            f"score={result['overall_score']}"
        )
        return result
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})
    except Exception as exc:
        log.error(f"IMU analysis failed: {exc}")
        return JSONResponse(
            status_code=500,
            content={"error": "Analysis failed. Check backend logs for details."},
        )


@app.post("/predict")
async def predict(
    file: UploadFile = File(...),
    lang: str = Query("en"),
):
    data = await file.read()
    img  = Image.open(io.BytesIO(data)).convert("RGB")
    lang = lang if lang in ("en", "ru", "kz") else "en"
    return _build_response(img, lang=lang)


@app.post("/predict-kl")
async def predict_kl(
    file: UploadFile = File(...),
    lang: str = Query("en"),
    kl_scale_max: int = Query(KL_GRADE_MAX, ge=1, le=5),
):
    data = await file.read()
    img = Image.open(io.BytesIO(data)).convert("RGB")
    lang = lang if lang in ("en", "ru", "kz") else "en"
    return _build_kl_response(img, lang=lang, scale_max=kl_scale_max)


@app.post("/koos/calculate")
async def koos_calculate(payload: dict[str, Any] = Body(...)):
    answers = payload.get("answers")
    if not isinstance(answers, dict):
        raise HTTPException(status_code=400, detail="Body must include 'answers' object.")
    try:
        return calculate_koos(answers)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/rehab/report")
async def rehab_report(payload: RehabReportInput):
    if payload.kl_grade is not None and not (KL_GRADE_MIN <= payload.kl_grade <= KL_GRADE_MAX):
        raise HTTPException(status_code=400, detail="kl_grade must be between 0 and 4.")
    return _build_rehab_report(payload)


@app.get("/sessions/{patient_id}")
async def sessions_by_patient(patient_id: str, exercise: str | None = Query(None)):
    return {"patient_id": patient_id, "sessions": get_patient_sessions(patient_id, exercise)}
