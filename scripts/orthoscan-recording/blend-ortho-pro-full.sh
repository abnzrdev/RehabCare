#!/usr/bin/env bash
set -euo pipefail

echo "== OrthoScan Pro Blend: transitions + labels + audio =="

AUDIO="/home/abnzr/Downloads/ortho.mp3"
CLIPS_DIR="/home/abnzr/Videos/orthoscan/scene-clips-v2/clips"
OUT="/home/abnzr/Videos/orthoscan/blended-pro-v2"
FINAL="$OUT/orthoscan_pro_final.mp4"
CONTACT="$OUT/contact_sheet.jpg"
PROJECT="$OUT/orthoscan_cli_project.json"
README="$OUT/README_PRO_EDIT.md"
TS="$(date +%Y%m%d-%H%M%S)"
TRANSITION_DUR="1.2"

mkdir -p "$OUT/backups"

if [ -f "$FINAL" ]; then
  cp "$FINAL" "$OUT/backups/orthoscan_pro_final.mp4.bak.$TS"
fi

if [ -f "$PROJECT" ]; then
  cp "$PROJECT" "$OUT/backups/orthoscan_cli_project.json.bak.$TS"
fi

if [ ! -f "$AUDIO" ]; then
  echo "Audio not found: $AUDIO"
  exit 1
fi

CLIPS=(
  "$CLIPS_DIR/01_Patient_Context.mp4"
  "$CLIPS_DIR/02_KOOS_Questionnaire.mp4"
  "$CLIPS_DIR/03_KL_Image_Grading.mp4"
  "$CLIPS_DIR/04_IMU_Rehab_Analysis.mp4"
  "$CLIPS_DIR/05_Final_Rehab_Report.mp4"
)

LABELS=(
  "Patient Context"
  "KOOS Questionnaire"
  "KL Image Grading"
  "IMU Rehab Analysis"
  "Final Rehab Report"
)

for c in "${CLIPS[@]}"; do
  if [ ! -f "$c" ]; then
    echo "Missing clip: $c"
    exit 1
  fi
done

FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
if [ ! -f "$FONT" ]; then
  FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
fi

echo "== Creating CLI-Anything Kdenlive project guide =="
if command -v cli-anything-kdenlive >/dev/null 2>&1; then
  cli-anything-kdenlive project new -o "$PROJECT"

  for c in "${CLIPS[@]}"; do
    cli-anything-kdenlive --project "$PROJECT" bin import "$c" || true
  done

  cli-anything-kdenlive --project "$PROJECT" timeline add-track --type video -n "V1" || true

  python3 - "$PROJECT" "${CLIPS[@]}" <<'PY' || true
import subprocess, sys

project = sys.argv[1]
clips = sys.argv[2:]
pos = 0.0

for i, clip in enumerate(clips):
    dur = float(subprocess.check_output([
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=nk=1:nw=1",
        clip
    ], text=True).strip())

    subprocess.run([
        "cli-anything-kdenlive",
        "--project", project,
        "timeline", "add-clip",
        "0", f"clip{i}",
        "-p", str(pos),
        "--in", "0",
        "--out", str(dur)
    ], check=True)

    pos += dur
PY
else
  echo "cli-anything-kdenlive not found, skipping CLI project."
fi

echo "== Rendering final video =="

python3 - "$FINAL" "$AUDIO" "$TRANSITION_DUR" "$FONT" "${CLIPS[@]}" -- "${LABELS[@]}" <<'PY'
import subprocess
import sys
import shlex

sep = sys.argv.index("--")

final = sys.argv[1]
audio = sys.argv[2]
transition_dur = float(sys.argv[3])
font = sys.argv[4]
clips = sys.argv[5:sep]
labels = sys.argv[sep + 1:]

durations = []
for clip in clips:
    dur = float(subprocess.check_output([
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=nk=1:nw=1",
        clip
    ], text=True).strip())
    durations.append(dur)

cmd = ["ffmpeg", "-y"]

for clip in clips:
    cmd += ["-i", clip]

cmd += ["-stream_loop", "-1", "-i", audio]

filters = []

for i, label in enumerate(labels):
    safe_label = label.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
    filters.append(
        f"[{i}:v]"
        f"scale=1920:1080,"
        f"fps=30,"
        f"format=yuv420p,"
        f"drawbox=x=60:y=h-150:w=650:h=85:color=black@0.48:t=fill:enable='lt(t,3.5)',"
        f"drawtext=fontfile='{font}':text='{safe_label}':x=95:y=h-124:"
        f"fontsize=38:fontcolor=white:enable='lt(t,3.5)'"
        f"[v{i}]"
    )

transitions = ["fade", "smoothleft", "wipeleft", "slideright"]

current = "v0"
current_duration = durations[0]

for i in range(1, len(clips)):
    out = f"vx{i}"
    transition = transitions[(i - 1) % len(transitions)]
    offset = max(0.1, current_duration - transition_dur)

    filters.append(
        f"[{current}][v{i}]"
        f"xfade=transition={transition}:duration={transition_dur}:offset={offset}"
        f"[{out}]"
    )

    current = out
    current_duration = current_duration + durations[i] - transition_dur

filter_complex = ";".join(filters)

audio_index = len(clips)

cmd += [
    "-filter_complex", filter_complex,
    "-map", f"[{current}]",
    "-map", f"{audio_index}:a:0",
    "-shortest",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "18",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    final
]

subprocess.run(cmd, check=True)
PY

echo "== Creating contact sheet =="
ffmpeg -y -hide_banner -loglevel error \
  -i "$FINAL" \
  -vf "fps=1/3,scale=480:-1,tile=4x3" \
  "$CONTACT" || true

cat > "$README" <<TXT
OrthoScan Pro Edit

Input clips:
$CLIPS_DIR

Audio:
$AUDIO

Final video:
$FINAL

Contact sheet:
$CONTACT

CLI-Anything Kdenlive project:
$PROJECT

What was added:
- Longer transitions: ${TRANSITION_DUR}s
- Bottom-left text labels
- External background audio
- Original clip audio removed/replaced

Play:
vlc "$FINAL"
TXT

echo
echo "RECAP:"
echo "- Final video created:"
echo "  $FINAL"
echo "- Contact sheet:"
echo "  $CONTACT"
echo "- Audio used:"
echo "  $AUDIO"
echo "- CLI project:"
echo "  $PROJECT"
echo
echo "NEXT:"
echo "vlc \"$FINAL\""
