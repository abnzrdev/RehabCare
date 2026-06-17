#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="orthoscan-imu.service"
ENV_FILE="/etc/orthoscan-imu.env"
INSTALL_DIR="/opt/orthoscan-imu"
SCRIPT_PATH="$INSTALL_DIR/orthosend.py"

API_URL="${ORTHO_API_URL:-http://89.218.178.215:18190/api/imu}"
DEVICE_ID="${ORTHO_DEVICE_ID:-pi1}"
LEG="${ORTHO_LEG:-left}"
BODY_PART="${ORTHO_BODY_PART:-hip}"
SEND_INTERVAL_SECONDS="${ORTHO_SEND_INTERVAL_SECONDS:-5}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_SCRIPT="$SCRIPT_DIR/orthosend.py"

if [[ ! -f "$SOURCE_SCRIPT" ]]; then
  echo "ERROR: Cannot find $SOURCE_SCRIPT" >&2
  exit 1
fi

echo "Installing OrthoScan IMU sender service"
echo "  device_id=$DEVICE_ID"
echo "  leg=$LEG"
echo "  body_part=$BODY_PART"
echo "  api=$API_URL"
echo "  interval=${SEND_INTERVAL_SECONDS}s"

sudo install -d -m 755 "$INSTALL_DIR"
sudo install -m 755 "$SOURCE_SCRIPT" "$SCRIPT_PATH"

sudo tee "$ENV_FILE" >/dev/null <<EOF
ORTHO_API_URL=$API_URL
ORTHO_DEVICE_ID=$DEVICE_ID
ORTHO_LEG=$LEG
ORTHO_BODY_PART=$BODY_PART
ORTHO_SEND_INTERVAL_SECONDS=$SEND_INTERVAL_SECONDS
EOF

sudo tee "/etc/systemd/system/$SERVICE_NAME" >/dev/null <<EOF
[Unit]
Description=OrthoScan AI Raspberry Pi IMU sender
After=network-online.target
Wants=network-online.target

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
echo "Service installed."
echo "Commands:"
echo "  sudo systemctl status $SERVICE_NAME"
echo "  sudo systemctl restart $SERVICE_NAME"
echo "  sudo journalctl -u $SERVICE_NAME -f"
echo "  sudo journalctl -u $SERVICE_NAME -n 20 --no-pager | grep 'POST OK'"
