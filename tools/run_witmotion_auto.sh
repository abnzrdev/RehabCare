#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/.." || exit 1

API_URL="${ORTHO_API_URL:-http://89.218.178.215:18190/api/imu}"
INTERVAL="${ORTHO_BLE_POST_INTERVAL_SECONDS:-1.0}"

echo "🔵 OrthoScanAI WitMotion auto runner"
echo "API: $API_URL"
echo "Interval: ${INTERVAL}s"
echo

echo "1) Starting Bluetooth..."
sudo systemctl enable --now bluetooth >/dev/null 2>&1 || true
rfkill unblock bluetooth || true

echo "2) Scanning for WT / WitMotion sensors for 15 seconds..."
timeout 15s bluetoothctl scan on >/tmp/orthoscan_ble_scan.log 2>&1 || true

echo
echo "3) Found possible WitMotion devices:"
mapfile -t MACS < <(
  bluetoothctl devices \
    | grep -Ei 'WT|WIT|BWT|HC-08|JDY' \
    | awk '{print $2}' \
    | awk '!seen[$0]++'
)

if [ "${#MACS[@]}" -eq 0 ]; then
  echo "❌ No WT/WitMotion devices found."
  echo "Try: turn sensors off/on, bring them closer, then run again."
  exit 1
fi

i=1
for mac in "${MACS[@]}"; do
  name="$(bluetoothctl devices | grep "$mac" | cut -d' ' -f3-)"
  echo "  $i) $mac  $name"
  i=$((i+1))
done

echo
echo "4) Auto assignment:"
LABELS=("Left_Arm" "Left_Leg" "Right_Arm" "Right_Leg")
DEVICE_IDS=("ble_left_arm" "ble_left_leg" "ble_right_arm" "ble_right_leg")
LEGS=("left" "left" "right" "right")
BODY_PARTS=("arm" "leg" "arm" "leg")

JSON="["
COUNT=0

for idx in 0 1 2 3; do
  [ -n "${MACS[$idx]:-}" ] || continue

  echo "  ${LABELS[$idx]} -> ${MACS[$idx]}"

  [ "$COUNT" -gt 0 ] && JSON+=","
  JSON+="{\"label\":\"${LABELS[$idx]}\",\"device_id\":\"${DEVICE_IDS[$idx]}\",\"leg\":\"${LEGS[$idx]}\",\"body_part\":\"${BODY_PARTS[$idx]}\",\"mac\":\"${MACS[$idx]}\"}"
  COUNT=$((COUNT+1))
done

JSON+="]"

echo
echo "5) Starting BLE sender..."
echo "Move one sensor at a time and label it physically if assignment is wrong."
echo "Stop with Ctrl+C."
echo

source .venv-ble/bin/activate

sudo env \
  ORTHO_API_URL="$API_URL" \
  ORTHO_BLE_POST_INTERVAL_SECONDS="$INTERVAL" \
  ORTHO_BLE_SENSORS="$JSON" \
  .venv-ble/bin/python tools/ble_witmotion_sender.py
