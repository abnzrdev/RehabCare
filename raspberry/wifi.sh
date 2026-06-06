#!/usr/bin/env bash
set -euo pipefail

HOTSPOT_SSID="pi1"
HOTSPOT_PASS="12344321"
HOTSPOT_CONN="pi1-hotspot"
HOTSPOT_IP="10.42.0.1/24"
SERVICE_NAME="pi-wifi-auto"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}.service"

USER_NAME="${SUDO_USER:-$(whoami)}"
USER_HOME="$(getent passwd "$USER_NAME" | cut -d: -f6)"
SCRIPT_SELF="$(readlink -f "$0")"
BACKUP_DIR="$USER_HOME/wifi_backup_$(date +%Y%m%d_%H%M%S)"

log() {
  echo "[$(date '+%F %T')] $*"
}

need_root() {
  if [ "$EUID" -ne 0 ]; then
    echo "Run with sudo:"
    echo "sudo $SCRIPT_SELF"
    exit 1
  fi
}

backup_state() {
  mkdir -p "$BACKUP_DIR"
  nmcli connection show > "$BACKUP_DIR/nmcli_connections.txt" 2>/dev/null || true
  nmcli device status > "$BACKUP_DIR/nmcli_devices.txt" 2>/dev/null || true
  ip -4 addr > "$BACKUP_DIR/ip_addr.txt" 2>/dev/null || true
}

wifi_device() {
  nmcli -t -f DEVICE,TYPE device status | awk -F: '$2=="wifi"{print $1; exit}'
}

enable_ssh() {
  systemctl enable --now ssh 2>/dev/null || systemctl enable --now sshd 2>/dev/null || true
}

start_hotspot() {
  need_root
  backup_state
  enable_ssh

  local dev
  dev="$(wifi_device)"

  if [ -z "$dev" ]; then
    echo "No Wi-Fi device found."
    exit 1
  fi

  log "Starting hotspot on $dev..."

  nmcli radio wifi on || true
  nmcli connection down "$HOTSPOT_CONN" 2>/dev/null || true
  nmcli connection delete "$HOTSPOT_CONN" 2>/dev/null || true

  nmcli connection add type wifi ifname "$dev" con-name "$HOTSPOT_CONN" autoconnect yes ssid "$HOTSPOT_SSID"

  nmcli connection modify "$HOTSPOT_CONN" \
    802-11-wireless.mode ap \
    802-11-wireless.band bg \
    wifi-sec.key-mgmt wpa-psk \
    wifi-sec.psk "$HOTSPOT_PASS" \
    ipv4.method shared \
    ipv4.addresses "$HOTSPOT_IP" \
    ipv6.method ignore

  nmcli connection up "$HOTSPOT_CONN"

  echo
  echo "Hotspot ready."
  echo "Wi-Fi name: $HOTSPOT_SSID"
  echo "Password: $HOTSPOT_PASS"
  echo "SSH from PC:"
  echo "ssh $USER_NAME@10.42.0.1"
}

connect_existing_wifi() {
  need_root
  backup_state
  enable_ssh

  local dev ssid pass
  dev="$(wifi_device)"

  if [ -z "$dev" ]; then
    echo "No Wi-Fi device found."
    exit 1
  fi

  echo "Available Wi-Fi networks:"
  nmcli radio wifi on || true
  nmcli device wifi rescan ifname "$dev" 2>/dev/null || true
  nmcli device wifi list ifname "$dev"

  echo
  read -rp "Enter Wi-Fi name / SSID: " ssid
  read -rsp "Enter Wi-Fi password: " pass
  echo

  echo
  echo "Important:"
  echo "- If you are connected by SSH through hotspot, this may disconnect SSH."
  echo "- After Wi-Fi connects, check the Pi IP with: hostname -I"
  echo
  read -rp "Continue? [y/N]: " ok

  if [[ ! "$ok" =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
  fi

  nmcli connection down "$HOTSPOT_CONN" 2>/dev/null || true

  if [ -z "$pass" ]; then
    nmcli device wifi connect "$ssid" ifname "$dev"
  else
    nmcli device wifi connect "$ssid" password "$pass" ifname "$dev"
  fi

  echo
  echo "Connected to Wi-Fi: $ssid"
  echo "Pi IP:"
  hostname -I || true
}

auto_mode() {
  need_root
  backup_state
  enable_ssh

  local dev active
  dev="$(wifi_device)"

  if [ -z "$dev" ]; then
    echo "No Wi-Fi device found."
    exit 1
  fi

  active="$(nmcli -t -f NAME,TYPE,DEVICE connection show --active | awk -F: -v dev="$dev" '$2=="802-11-wireless" && $3==dev {print $1; exit}' || true)"

  if [ -n "$active" ] && [ "$active" != "$HOTSPOT_CONN" ]; then
    echo "Already connected to Wi-Fi: $active"
    hostname -I || true
    exit 0
  fi

  echo "Trying saved Wi-Fi first..."
  nmcli radio wifi on || true
  nmcli device wifi rescan ifname "$dev" 2>/dev/null || true
  sleep 3

  mapfile -t saved < <(
    nmcli -t -f UUID,TYPE,NAME connection show \
      | awk -F: -v hs="$HOTSPOT_CONN" '$2=="802-11-wireless" && $3!=hs {print $1}'
  )

  for uuid in "${saved[@]}"; do
    local name
    name="$(nmcli -g connection.id connection show "$uuid" 2>/dev/null || echo "$uuid")"
    echo "Trying saved Wi-Fi: $name"

    if nmcli --wait 15 connection up uuid "$uuid" ifname "$dev"; then
      sleep 2
      echo "Connected to saved Wi-Fi: $name"
      hostname -I || true
      exit 0
    fi
  done

  echo "No saved Wi-Fi worked. Starting hotspot..."
  start_hotspot
}

install_service() {
  need_root
  backup_state

  cat > "$SERVICE_PATH" <<EOF
[Unit]
Description=Raspberry Pi auto Wi-Fi or pi1 hotspot
After=NetworkManager.service
Wants=NetworkManager.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=$SCRIPT_SELF --auto

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"

  echo "Installed systemd service:"
  echo "$SERVICE_PATH"
  echo
  echo "Start now with:"
  echo "sudo systemctl restart $SERVICE_NAME"
}

status_info() {
  echo "Wi-Fi/device status:"
  nmcli device status || true
  echo
  echo "Active connections:"
  nmcli connection show --active || true
  echo
  echo "IP:"
  hostname -I || true
  echo
  echo "SSH:"
  systemctl status ssh --no-pager 2>/dev/null || systemctl status sshd --no-pager 2>/dev/null || true
}

menu() {
  echo
  echo "Raspberry Pi Wi-Fi helper"
  echo "1) Start hotspot pi1 for SSH"
  echo "2) Connect Raspberry Pi to existing Wi-Fi"
  echo "3) Auto mode: saved Wi-Fi first, hotspot if failed"
  echo "4) Install auto mode as systemd service"
  echo "5) Show status"
  echo
  read -rp "Choose 1-5: " choice

  case "$choice" in
    1) start_hotspot ;;
    2) connect_existing_wifi ;;
    3) auto_mode ;;
    4) install_service ;;
    5) status_info ;;
    *) echo "Invalid choice."; exit 1 ;;
  esac
}

case "${1:-}" in
  --hotspot) start_hotspot ;;
  --wifi) connect_existing_wifi ;;
  --auto) auto_mode ;;
  --install-service) install_service ;;
  --status) status_info ;;
  *) menu ;;
esac

echo
echo "Recap:"
echo "- Backup folder: $BACKUP_DIR"
echo "- Hotspot: $HOTSPOT_SSID / $HOTSPOT_PASS"
echo "- Hotspot SSH: ssh $USER_NAME@10.42.0.1"
