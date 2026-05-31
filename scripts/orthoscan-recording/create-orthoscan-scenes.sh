#!/usr/bin/env bash
set -euo pipefail

echo "== Create OrthoScan OBS scenes =="

if pgrep -x obs >/dev/null 2>&1; then
  echo "OBS is running. Close OBS first, then run again:"
  echo "./scripts/orthoscan-recording/create-orthoscan-scenes.sh"
  exit 1
fi

OBS_DIR="$HOME/.config/obs-studio"
GLOBAL_INI="$OBS_DIR/global.ini"
SCENES_DIR="$OBS_DIR/basic/scenes"
TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$HOME/.config/obs-studio-scene-backup-orthoscan-$TS"
NEW_NAME="OrthoScan_Record"
NEW_FILE="$SCENES_DIR/$NEW_NAME.json"

mkdir -p "$BACKUP_DIR"

if [ ! -d "$SCENES_DIR" ]; then
  echo "OBS scenes folder not found. Open OBS once, close it, then run again."
  exit 1
fi

SCENE_FILE_NAME=""
if [ -f "$GLOBAL_INI" ]; then
  SCENE_FILE_NAME="$(awk -F= '/^SceneCollectionFile=/{print $2; exit}' "$GLOBAL_INI" | tr -d '\r')"
fi

if [ -n "$SCENE_FILE_NAME" ] && [ -f "$SCENES_DIR/$SCENE_FILE_NAME.json" ]; then
  OLD_FILE="$SCENES_DIR/$SCENE_FILE_NAME.json"
else
  OLD_FILE="$(find "$SCENES_DIR" -maxdepth 1 -type f -name "*.json" | head -1 || true)"
fi

if [ -z "${OLD_FILE:-}" ] || [ ! -f "$OLD_FILE" ]; then
  echo "Could not find existing OBS scene file."
  exit 1
fi

cp -a "$OLD_FILE" "$BACKUP_DIR/"
[ -f "$GLOBAL_INI" ] && cp -a "$GLOBAL_INI" "$BACKUP_DIR/"

python3 - "$OLD_FILE" "$NEW_FILE" <<'PY'
import json, sys, uuid, copy
from pathlib import Path

old_path = Path(sys.argv[1])
new_path = Path(sys.argv[2])
data = json.loads(old_path.read_text())

scene_names = [
    "01_Patient_Context",
    "02_KOOS_Questionnaire",
    "03_KL_Image_Grading",
    "04_IMU_Rehab_Analysis",
    "05_Final_Rehab_Report",
]

sources = data.get("sources", [])

browser_source = None
for s in sources:
    if s.get("id") == "scene":
        continue
    sid = (s.get("id") or "").lower()
    name = (s.get("name") or "").lower()
    if "chrome" in name or "browser" in name or "breez" in name or "pipewire-window" in sid or "pipewire-screen" in sid:
        browser_source = copy.deepcopy(s)
        break

new_sources = []

if browser_source:
    browser_source["name"] = "orthoscan_window"
    browser_source["uuid"] = str(uuid.uuid4())
    new_sources.append(browser_source)

for scene_name in scene_names:
    items = []
    if browser_source:
        items.append({
            "name": "orthoscan_window",
            "source_uuid": browser_source["uuid"],
            "visible": True,
            "locked": False,
            "pos": {"x": 0.0, "y": 0.0},
            "scale": {"x": 1.0, "y": 1.0},
            "rot": 0.0,
            "alignment": 5,
            "bounds_type": 0,
            "bounds_alignment": 0,
            "crop_left": 0,
            "crop_top": 0,
            "crop_right": 0,
            "crop_bottom": 0,
            "id": 1,
            "private_settings": {}
        })

    new_sources.append({
        "id": "scene",
        "name": scene_name,
        "uuid": str(uuid.uuid4()),
        "settings": {
            "id_counter": 1 if browser_source else 0,
            "items": items
        },
        "mixers": 0,
        "sync": 0,
        "flags": 0,
        "volume": 1.0,
        "balance": 0.5,
        "enabled": True,
        "muted": False
    })

data["sources"] = new_sources
data["scene_order"] = [{"name": n} for n in scene_names]
data["current_scene"] = "01_Patient_Context"
data["current_program_scene"] = "01_Patient_Context"

new_path.write_text(json.dumps(data, indent=4, ensure_ascii=False) + "\n")

print("Created scenes:")
for n in scene_names:
    print("-", n)

if browser_source:
    print("\nReused browser/window source as: orthoscan_window")
else:
    print("\nNo browser source found. Scenes are empty; add Window Capture once in OBS.")
PY

if [ -f "$GLOBAL_INI" ]; then
  cp "$GLOBAL_INI" "$GLOBAL_INI.bak.$TS"

  if grep -q '^SceneCollection=' "$GLOBAL_INI"; then
    sed -i "s/^SceneCollection=.*/SceneCollection=$NEW_NAME/" "$GLOBAL_INI"
  else
    echo "SceneCollection=$NEW_NAME" >> "$GLOBAL_INI"
  fi

  if grep -q '^SceneCollectionFile=' "$GLOBAL_INI"; then
    sed -i "s/^SceneCollectionFile=.*/SceneCollectionFile=$NEW_NAME/" "$GLOBAL_INI"
  else
    echo "SceneCollectionFile=$NEW_NAME" >> "$GLOBAL_INI"
  fi
fi

echo
echo "== Setup hotkeys if obs-switch-scene exists =="

if [ -x "$HOME/.local/bin/obs-switch-scene" ]; then
python3 - <<'PY'
import subprocess
from pathlib import Path

schema = "org.gnome.settings-daemon.plugins.media-keys"
base = "/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/"
home = str(Path.home())

scenes = [
    ("01_Patient_Context", "OrthoScan 01 Patient Context", "<Control><Alt>1"),
    ("02_KOOS_Questionnaire", "OrthoScan 02 KOOS Questionnaire", "<Control><Alt>2"),
    ("03_KL_Image_Grading", "OrthoScan 03 KL Image Grading", "<Control><Alt>3"),
    ("04_IMU_Rehab_Analysis", "OrthoScan 04 IMU Rehab Analysis", "<Control><Alt>4"),
    ("05_Final_Rehab_Report", "OrthoScan 05 Final Rehab Report", "<Control><Alt>5"),
]

paths = [f"{base}orthoscan-obs-{i}/" for i in range(1, 6)]

old = subprocess.check_output(["gsettings", "get", schema, "custom-keybindings"], text=True).strip()
existing = []
if old != "@as []":
    existing = [p.strip().strip("'") for p in old.strip("[]").split(",") if p.strip()]

merged = []
for p in existing + paths:
    if p not in merged:
        merged.append(p)

subprocess.run(["gsettings", "set", schema, "custom-keybindings", str(merged)], check=True)

for path, (scene, name, binding) in zip(paths, scenes):
    key_schema = f"{schema}.custom-keybinding:{path}"
    cmd = f"{home}/.local/bin/obs-switch-scene '{scene}'"
    subprocess.run(["gsettings", "set", key_schema, "name", name], check=True)
    subprocess.run(["gsettings", "set", key_schema, "command", cmd], check=True)
    subprocess.run(["gsettings", "set", key_schema, "binding", binding], check=True)

print("Hotkeys:")
for scene, _, binding in scenes:
    print(f"- {binding}: {scene}")
PY
else
  echo "obs-switch-scene not found. Scene collection created, but hotkeys were not updated."
fi

echo
echo "RECAP:"
echo "- Created OBS scene collection: $NEW_NAME"
echo "- Scene file: $NEW_FILE"
echo "- Backup saved at: $BACKUP_DIR"
echo "- Hotkeys: Ctrl+Alt+1..5 for the 5 OrthoScan steps"
echo
echo "NEXT:"
echo "1. Open OBS: obs"
echo "2. Check Scene Collection -> $NEW_NAME"
echo "3. If scenes are empty, add Window Capture once in 01_Patient_Context, then copy/paste reference to other scenes."
echo "4. Enable OBS WebSocket if using hotkeys."
echo "5. Test: obs-switch-scene 01_Patient_Context"
