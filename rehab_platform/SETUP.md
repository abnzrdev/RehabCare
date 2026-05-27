# RehabAI Platform — Setup Guide

## Quick Start

```bash
cd rehab_platform

# Install dependencies
pip install -r requirements.txt

# Run the app
streamlit run app.py
```

Open http://localhost:8501 in your browser.

---

## Module 1 — Knee OA Diagnostics (image model)

The CLAHE preprocessing and UI are fully functional immediately.
**Inference requires the trained ConvNeXt-Small checkpoint.**

### How to add the checkpoint

1. In your Colab/cloud session, download the `.pth` file:
   ```python
   from google.colab import files
   files.download("/home/ubuntu/apex/knee_oa/best_convnext_small_*.pth")
   ```

2. Rename it to exactly `best_convnext.pth`.

3. Place it at:
   ```
   rehab_platform/models/knee_oa/best_convnext.pth
   ```

4. Restart Streamlit — the status badge on the home page will turn green.

### What the checkpoint must contain

| Key | Type | Description |
|---|---|---|
| `model_state_dict` | OrderedDict | ConvNeXt-Small weights |
| `arch` | str | `"convnext_small.fb_in22k_ft_in1k"` |
| `best_threshold` | float | Sigmoid decision threshold |
| `train_mean` | list[float] | Per-channel mean (R, G, B) used during training |
| `train_std` | list[float] | Per-channel std |

If `train_mean`/`train_std` are absent, ImageNet normalization is used as fallback.

---

## Module 2 — IMU Rehabilitation Dashboard

All assets are already in place at `models/imu/`:

| File | Purpose |
|---|---|
| `lstm_classifier.keras` | Trained 8-class LSTM (94.6% accuracy) |
| `scaler.pkl` | StandardScaler fitted on training windows |
| `model_meta.json` | Activity label mapping + validation metrics |
| `healthy_baseline.csv` | Healthy ROM values per activity |
| `classifier_ready.csv` | Pre-processed patient CSV for Simulation mode |

### Connecting real hardware

Select **Serial (USB)** or **Bluetooth (RFCOMM)** in the sidebar.

- **Serial**: set Port to `COM3` (Windows) or `/dev/ttyUSB0` (Linux/Mac)
- **Bluetooth**: pair the IMU device, then use its virtual serial port path
- **Baudrate**: default 115200, match your firmware setting

The sensor must stream 38 comma-separated values per line at ~100 Hz:

```
accel_rfoot_x, accel_rfoot_y, accel_rfoot_z,
accel_rshin_x, ... (18 accel cols)
gyro_rfoot_x, ... (18 gyro cols)
EMG_right, EMG_left
```

---

## Optional: Grad-CAM explainability (Module 1)

```bash
pip install grad-cam
```

After restarting, expand the "Grad-CAM" section on the Diagnostics page to see
a heatmap highlighting the image regions that drove the prediction.

---

## Directory structure

```
rehab_platform/
├── app.py                     ← Landing page (run this)
├── requirements.txt
├── SETUP.md
├── .streamlit/
│   └── config.toml            ← Theme + server config
├── assets/
│   └── style.css              ← Design system (Apple-style)
├── core/
│   ├── knee_model.py          ← ConvNeXt-Small inference + CLAHE
│   ├── imu_pipeline.py        ← LSTM pipeline + sensor sources
│   └── utils.py               ← CSS injection + UI helpers
├── models/
│   ├── knee_oa/
│   │   └── best_convnext.pth  ← ADD THIS (from Colab)
│   └── imu/
│       ├── lstm_classifier.keras
│       ├── scaler.pkl
│       ├── model_meta.json
│       ├── healthy_baseline.csv
│       └── classifier_ready.csv
└── pages/
    ├── 1_Diagnostics.py       ← Module 1 UI
    └── 2_IMU_Rehab.py         ← Module 2 UI
```
