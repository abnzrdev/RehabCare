from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

KL_CLASS_LABELS = {
    0: "Normal",
    1: "Doubtful",
    2: "Mild",
    3: "Moderate",
    4: "Severe",
}
KL_GRADE_SCALE = "0-4_internal_1-5_display"
KL_MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "knee_oa" / "kl_grade_model.pt"
KL_RESULTS_PATH = Path(__file__).resolve().parents[1] / "models" / "knee_oa" / "kl_grade_results.json"
KL_IMAGENET_MEAN = [0.485, 0.456, 0.406]
KL_IMAGENET_STD = [0.229, 0.224, 0.225]
KL_INPUT_SIZE = 224


def load_kl_results() -> dict:
    if not KL_RESULTS_PATH.exists():
        return {}
    with open(KL_RESULTS_PATH, encoding="utf-8") as fh:
        return json.load(fh)


def _normalize_probs(class_probs: Iterable[float]) -> list[float]:
    probs = [max(0.0, float(p)) for p in class_probs]
    if len(probs) != len(KL_CLASS_LABELS):
        raise ValueError(f"Expected {len(KL_CLASS_LABELS)} KL class probabilities, got {len(probs)}")
    total = sum(probs)
    if total <= 0:
        raise ValueError("KL class probabilities must sum to a positive value")
    return [p / total for p in probs]


def _predict_demo_class_probs(oa_prob: float) -> list[float]:
    centers = [0.02, 0.22, 0.48, 0.72, 0.92]
    scores = [1.0 / (abs(oa_prob - center) + 0.08) for center in centers]
    total = sum(scores)
    return [score / total for score in scores]


def _extract_state_dict(checkpoint) -> dict:
    try:
        import torch
    except ImportError as exc:
        raise RuntimeError("PyTorch is required to load the KL grade model") from exc

    if isinstance(checkpoint, torch.nn.Module):
        return checkpoint.state_dict()
    if not isinstance(checkpoint, dict):
        raise ValueError(f"Unsupported KL checkpoint object: {type(checkpoint)!r}")

    for key in ("model_state_dict", "state_dict", "model_state"):
        state_dict = checkpoint.get(key)
        if isinstance(state_dict, dict):
            return state_dict

    if checkpoint and all(hasattr(v, "shape") for v in checkpoint.values()):
        return checkpoint

    raise ValueError(f"Could not find a KL state_dict in checkpoint keys: {sorted(checkpoint.keys())}")


def load_kl_model(model_path: Path | None = None):
    model_path = model_path or KL_MODEL_PATH

    import torch
    from torchvision import models

    checkpoint = torch.load(model_path, map_location="cpu", weights_only=False)

    if isinstance(checkpoint, torch.nn.Module):
        model = checkpoint
    else:
        model = models.resnet18(weights=None)
        model.fc = torch.nn.Linear(model.fc.in_features, len(KL_CLASS_LABELS))
        model.load_state_dict(_extract_state_dict(checkpoint), strict=True)

    model.eval()
    return model


def preprocess_kl_image(pil_image):
    import cv2
    import numpy as np
    from PIL import Image
    from torchvision import transforms

    gray = np.array(pil_image.convert("L"), dtype=np.uint8)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    rgb = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2RGB)
    enhanced_pil = Image.fromarray(rgb)

    tf = transforms.Compose(
        [
            transforms.Resize((KL_INPUT_SIZE, KL_INPUT_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize(mean=KL_IMAGENET_MEAN, std=KL_IMAGENET_STD),
        ]
    )
    return tf(enhanced_pil).unsqueeze(0)


def infer_kl_class_probs(model, pil_image) -> list[float]:
    import torch

    tensor = preprocess_kl_image(pil_image)
    with torch.no_grad():
        logits = model(tensor)
        probs = torch.softmax(logits, dim=1).squeeze(0).tolist()
    return _normalize_probs(probs)


def _format_kl_prediction(class_probs: Iterable[float], source: str, note: str | None = None) -> dict:
    probs = _normalize_probs(class_probs)
    kl_grade = max(range(len(probs)), key=probs.__getitem__)
    confidence = probs[kl_grade]
    prob_oa = sum(probs[1:])
    result = {
        "kl_grade": kl_grade,
        "display_grade": kl_grade + 1,
        "grade_scale": KL_GRADE_SCALE,
        "confidence": round(confidence, 4),
        "prob_oa": round(prob_oa, 4),
        "grade_probs": {str(i): round(prob, 4) for i, prob in enumerate(probs)},
        "label": KL_CLASS_LABELS[kl_grade],
        "source": source,
        "kl_scale": {"min": 0, "max": 4},
    }
    if note:
        result["note"] = note
    return result


def _build_demo_kl_response(oa_prob: float) -> dict:
    probs = _predict_demo_class_probs(oa_prob)
    return _format_kl_prediction(
        probs,
        source="demo_kl",
        note="KL grade is estimated from demo OA probability because the real KL model is unavailable.",
    )
