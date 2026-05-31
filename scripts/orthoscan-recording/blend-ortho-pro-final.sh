#!/usr/bin/env bash
set -euo pipefail

echo "== OrthoScan Final Pro Blend =="

AUDIO="/home/abnzr/Downloads/ortho.mp3"
CLIPS_DIR="/home/abnzr/Videos/orthoscan/scene-clips-v2/clips"
OUT="/home/abnzr/Videos/orthoscan/blended-pro-final"
FINAL="$OUT/orthoscan_final_pro.mp4"
CONTACT="$OUT/contact_sheet.jpg"
README="$OUT/README_FINAL_EDIT.md"
TS="$(date +%Y%m%d-%H%M%S)"

TRANSITION_DUR="1.35"
AUDIO_FADE_IN="1.2"
AUDIO_FADE_OUT="3.0"
VIDEO_FADE_OUT="1.0"

mkdir -p "$OUT/backups"

if [ -f "$FINAL" ]; then
  cp "$FINAL" "$OUT/backups/orthoscan_final_pro.mp4.bak.$TS"
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

# Try nicer fonts first, fallback safely.
FONT="$(fc-match -f '%{file}\n' 'Ubuntu' 2>/dev/null | head -1 || true)"
if [ -z "$FONT" ] || [ ! -f "$FONT" ]; then
  FONT="$(fc-match -f '%{file}\n' 'Cantarell' 2>/dev/null | head -1 || true)"
fi
if [ -z "$FONT" ] || [ ! -f "$FONT" ]; then
  FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
fi

echo "Font used: $FONT"
echo "Audio used: $AUDIO"

python3 - "$FINAL" "$AUDIO" "$TRANSITION_DUR" "$AUDIO_FADE_IN" "$AUDIO_FADE_OUT" "$VIDEO_FADE_OUT" "$FONT" "${CLIPS[@]}" -- "${LABELS[@]}" <<'PY'
import subprocess
import sys

sep = sys.argv.index("--")

final = sys.argv[1]
audio = sys.argv[2]
td = float(sys.argv[3])
audio_fade_in = float(sys.argv[4])
audio_fade_out = float(sys.argv[5])
video_fade_out = float(sys.argv[6])
font = sys.argv[7]

clips = sys.argv[8:sep]
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

# final duration after xfade overlaps
final_duration = durations[0]
for d in durations[1:]:
    final_duration += d - td

video_fade_start = max(0.0, final_duration - video_fade_out)
audio_fade_start = max(0.0, final_duration - audio_fade_out)

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
        # smaller, cleaner bottom-right label
        f"drawbox=x=w-560:y=h-112:w=500:h=62:color=black@0.72:t=fill:enable='lt(t,3.4)',"
        f"drawbox=x=w-560:y=h-112:w=7:h=62:color=cyan@0.95:t=fill:enable='lt(t,3.4)',"
        f"drawtext=fontfile='{font}':text='{safe_label}':"
        f"x=w-tw-90:y=h-92:fontsize=22:fontcolor=0xFDE68A:"
        f"shadowcolor=black:shadowx=2:shadowy=2:"
        f"enable='lt(t,3.4)'"
        f"[v{i}]"
    )

transitions = ["fade", "smoothleft", "fade", "slideright"]

current = "v0"
current_duration = durations[0]

for i in range(1, len(clips)):
    out = f"vx{i}"
    transition = transitions[(i - 1) % len(transitions)]
    offset = max(0.1, current_duration - td)

    filters.append(
        f"[{current}][v{i}]"
        f"xfade=transition={transition}:duration={td}:offset={offset}"
        f"[{out}]"
    )

    current = out
    current_duration = current_duration + durations[i] - td

# Final video fade out only at the end
filters.append(
    f"[{current}]fade=t=out:st={video_fade_start}:d={video_fade_out}[vfinal]"
)

audio_index = len(clips)

# External audio trimmed to final duration + fade in/out
filters.append(
    f"[{audio_index}:a]"
    f"atrim=0:{final_duration},"
    f"asetpts=PTS-STARTPTS,"
    f"afade=t=in:st=0:d={audio_fade_in},"
    f"afade=t=out:st={audio_fade_start}:d={audio_fade_out},"
    f"volume=0.72"
    f"[afinal]"
)

cmd += [
    "-filter_complex", ";".join(filters),
    "-map", "[vfinal]",
    "-map", "[afinal]",
    "-t", str(final_duration),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "18",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    final
]

subprocess.run(cmd, check=True)

print(f"Final duration: {final_duration:.2f}s")
PY

echo "== Creating contact sheet =="
ffmpeg -y -hide_banner -loglevel error \
  -i "$FINAL" \
  -vf "fps=1/3,scale=480:-1,tile=4x3" \
  "$CONTACT" || true

cat > "$README" <<TXT
OrthoScan final pro edit

Final video:
$FINAL

Audio:
$AUDIO

Font:
$FONT

Changes:
- Text moved to bottom-right
- Text size reduced
- Better system font used
- Longer scene transitions: ${TRANSITION_DUR}s
- Audio fade in: ${AUDIO_FADE_IN}s
- Audio fade out: ${AUDIO_FADE_OUT}s
- Video fade out at end: ${VIDEO_FADE_OUT}s
- Original clip audio replaced by external audio

Play:
vlc "$FINAL"
TXT

echo
echo "RECAP:"
echo "- Created final video:"
echo "  $FINAL"
echo "- Contact sheet:"
echo "  $CONTACT"
echo "- Text is now smaller and bottom-right."
echo "- Audio fades in/out."
echo "- Video fades out at the end."
echo
echo "NEXT:"
echo "vlc \"$FINAL\""
