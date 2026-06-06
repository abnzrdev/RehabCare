#!/usr/bin/env bash

HOTSPOT_SSID="pi1"
HOTSPOT_PASS="12344321"
HOTSPOT_CONN="pi1-hotspot"
HOTSPOT_IP="10.42.0.1/24"
PORTAL_HOST="0.0.0.0"
PORTAL_PORT="8080"
PORTAL_URL="http://10.42.0.1:8080"
PORTAL_PID_FILE="/tmp/orthoscan-wifi-portal.pid"
PORTAL_LOG_FILE="/tmp/orthoscan-wifi-portal.log"
SERVICE_NAME="pi-wifi-auto"

USER_NAME="${SUDO_USER:-$(whoami)}"
SCRIPT_SELF="$(readlink -f "$0")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_SELF")" && pwd)"
PORTAL_SCRIPT="$SCRIPT_DIR/wifi_portal.py"

need_root() {
  if [ "$EUID" -ne 0 ]; then
    echo "Run with:"
    echo "sudo bash $SCRIPT_SELF"
    exit 1
  fi
}

wifi_device() {
  nmcli -t -f DEVICE,TYPE device status | awk -F: '$2=="wifi"{print $1; exit}'
}

enable_ssh() {
  systemctl enable --now ssh 2>/dev/null || systemctl enable --now sshd 2>/dev/null || true
}

stop_portal() {
  if [ -f "$PORTAL_PID_FILE" ]; then
    PID="$(cat "$PORTAL_PID_FILE" 2>/dev/null)"
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
      kill "$PID" 2>/dev/null || true
    fi
    rm -f "$PORTAL_PID_FILE"
  fi
}

start_portal() {
  stop_portal

  if [ ! -f "$PORTAL_SCRIPT" ]; then
    echo "❌ Missing portal script: $PORTAL_SCRIPT"
    exit 1
  fi

  nohup python3 "$PORTAL_SCRIPT" --host "$PORTAL_HOST" --port "$PORTAL_PORT" >"$PORTAL_LOG_FILE" 2>&1 &
  echo $! > "$PORTAL_PID_FILE"
}

start_hotspot() {
  need_root
  enable_ssh

  DEV="$(wifi_device)"
  if [ -z "$DEV" ]; then
    echo "❌ No Wi-Fi device found"
    exit 1
  fi

  echo "📡 Starting hotspot: $HOTSPOT_SSID"

  nmcli radio wifi on || true
  nmcli connection down "$HOTSPOT_CONN" 2>/dev/null || true
  nmcli connection delete "$HOTSPOT_CONN" 2>/dev/null || true

  nmcli connection add type wifi ifname "$DEV" con-name "$HOTSPOT_CONN" autoconnect yes ssid "$HOTSPOT_SSID"

  nmcli connection modify "$HOTSPOT_CONN" \
    802-11-wireless.mode ap \
    802-11-wireless.band bg \
    wifi-sec.key-mgmt wpa-psk \
    wifi-sec.psk "$HOTSPOT_PASS" \
    ipv4.method shared \
    ipv4.addresses "$HOTSPOT_IP" \
    ipv6.method ignore

  nmcli connection up "$HOTSPOT_CONN"
  start_portal

  echo
  echo "✅ Hotspot ready"
  echo "Wi-Fi name: $HOTSPOT_SSID"
  echo "Password: $HOTSPOT_PASS"
  echo "SSH from PC:"
  echo "ssh $USER_NAME@10.42.0.1"
  echo "Open Wi-Fi setup portal:"
  echo "$PORTAL_URL"
}

connect_wifi() {
  need_root
  enable_ssh
  stop_portal

  DEV="$(wifi_device)"
  if [ -z "$DEV" ]; then
    echo "❌ No Wi-Fi device found"
    exit 1
  fi

  nmcli radio wifi on || true
  nmcli device wifi rescan ifname "$DEV" 2>/dev/null || true
  nmcli device wifi list ifname "$DEV"

  echo
  read -r -p "Enter Wi-Fi SSID/name: " SSID
  read -r -s -p "Enter Wi-Fi password: " PASS
  echo

  nmcli connection down "$HOTSPOT_CONN" 2>/dev/null || true

  if [ -z "$PASS" ]; then
    nmcli device wifi connect "$SSID" ifname "$DEV"
  else
    nmcli device wifi connect "$SSID" password "$PASS" ifname "$DEV"
  fi

  echo
  echo "✅ Connected to Wi-Fi: $SSID"
  echo "Pi IP:"
  hostname -I
}

install_service() {
  need_root

  cat > "/etc/systemd/system/$SERVICE_NAME.service" <<EOF
[Unit]
Description=Raspberry Pi pi1 hotspot auto start
After=NetworkManager.service
Wants=NetworkManager.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=$SCRIPT_SELF --hotspot

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"

  echo "✅ Installed service: $SERVICE_NAME"
  echo "Start now with:"
  echo "sudo systemctl restart $SERVICE_NAME"
}

status_info() {
  echo "📡 Devices:"
  nmcli device status || true
  echo
  echo "🌐 IP:"
  hostname -I || true
  echo
  echo "🔐 SSH:"
  systemctl status ssh --no-pager 2>/dev/null || systemctl status sshd --no-pager 2>/dev/null || true
  echo
  echo "🧭 Portal:"
  if [ -f "$PORTAL_PID_FILE" ] && kill -0 "$(cat "$PORTAL_PID_FILE" 2>/dev/null)" 2>/dev/null; then
    echo "Running at $PORTAL_URL"
  else
    echo "Not running"
  fi
}

case "${1:-}" in
  --hotspot) start_hotspot ;;
  --wifi) connect_wifi ;;
  --install-service) install_service ;;
  --status) status_info ;;
  *)
    echo "Raspberry Pi Wi-Fi helper"
    echo "1) Start hotspot + browser Wi-Fi setup portal"
    echo "2) Connect to existing Wi-Fi from terminal"
    echo "3) Show status"
    echo
    read -r -p "Choose 1-3: " CHOICE

    case "$CHOICE" in
      1) start_hotspot ;;
      2) connect_wifi ;;
      3) status_info ;;
      *) echo "Invalid choice"; exit 1 ;;
    esac
    ;;
esac
