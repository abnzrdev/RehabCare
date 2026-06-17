#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="orthoscan-pi-ble.service"
ENV_FILE="/etc/orthoscan-pi-ble.env"
INSTALL_DIR="/opt/orthoscan-pi-ble"
SCRIPT_PATH="$INSTALL_DIR/pi_ble_peripheral.py"

DEVICE_ID="${ORTHO_DEVICE_ID:-pi1}"
LEG="${ORTHO_LEG:-left}"
BODY_PART="${ORTHO_BODY_PART:-hip}"
BLE_NAME="${ORTHO_BLE_NAME:-ORTHO_PI1}"
NOTIFY_INTERVAL_SECONDS="${ORTHO_BLE_NOTIFY_INTERVAL_SECONDS:-5}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_SCRIPT="$SCRIPT_DIR/pi_ble_peripheral.py"

if [[ ! -f "$SOURCE_SCRIPT" ]]; then
  echo "ERROR: Cannot find $SOURCE_SCRIPT" >&2
  exit 1
fi

echo "Installing experimental OrthoScan Pi BLE peripheral service"
echo "  device_id=$DEVICE_ID"
echo "  leg=$LEG"
echo "  body_part=$BODY_PART"
echo "  ble_name=$BLE_NAME"
echo "  notify_interval=${NOTIFY_INTERVAL_SECONDS}s"
echo "  Stable orthoscan-imu.service should not read the same sensor at the same time."

sudo install -d -m 755 "$INSTALL_DIR"
sudo install -m 755 "$SOURCE_SCRIPT" "$SCRIPT_PATH"

sudo tee "$ENV_FILE" >/dev/null <<EOF
ORTHO_DEVICE_ID=$DEVICE_ID
ORTHO_LEG=$LEG
ORTHO_BODY_PART=$BODY_PART
ORTHO_BLE_NAME=$BLE_NAME
ORTHO_BLE_NOTIFY_INTERVAL_SECONDS=$NOTIFY_INTERVAL_SECONDS
EOF

sudo tee "/etc/systemd/system/$SERVICE_NAME" >/dev/null <<EOF
[Unit]
Description=OrthoScan experimental Raspberry Pi BLE peripheral
After=bluetooth.target network-online.target
Wants=bluetooth.target network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$ENV_FILE
Environment=PYTHONUNBUFFERED=1
ExecStart=/usr/bin/python3 $SCRIPT_PATH
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo python3 -m py_compile "$SCRIPT_PATH"
sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICE_NAME"

echo
echo "Experimental Pi BLE service installed."
echo "Commands:"
echo "  sudo systemctl status $SERVICE_NAME"
echo "  sudo systemctl restart $SERVICE_NAME"
echo "  sudo journalctl -u $SERVICE_NAME -f"
