#!/usr/bin/env python3
import argparse
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

HOTSPOT_SERVICES = [
    "hostapd",
    "dnsmasq",
    "create_ap",
    "autohotspot",
    "orthoscan-hotspot",
    "pi-hotspot",
    "raspapd",
    "orthoscan-pi-ble.service",
]

def run(cmd, check=False):
    print("$ " + " ".join(cmd), flush=True)
    return subprocess.run(cmd, text=True, check=check)

def output(cmd):
    try:
        return subprocess.check_output(cmd, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return ""

def need_root():
    if os.geteuid() != 0:
        print("❌ Run this ON the Raspberry Pi with sudo:")
        print("sudo python3 tools/pi_stop_hotspot_guest_wifi.py --ssid Guest_KazNU --password 'AccessKazNu12'")
        sys.exit(1)

def backup():
    dst = Path("/root") / f"orthoscan-net-backup-{datetime.now():%Y%m%d_%H%M%S}"
    dst.mkdir(parents=True, exist_ok=True)
    for item in [
        "/etc/NetworkManager/system-connections",
        "/etc/orthoscan-wifi.env",
        "/etc/orthoscan-imu.env",
    ]:
        src = Path(item)
        if src.exists():
            target = dst / src.name
            if src.is_dir():
                shutil.copytree(src, target, dirs_exist_ok=True)
            else:
                shutil.copy2(src, target)
    print(f"📦 Backup saved: {dst}")
    return dst

def stop_hotspot_services():
    print("\n🛑 Disabling hotspot services...")
    for svc in HOTSPOT_SERVICES:
        run(["systemctl", "disable", "--now", svc])
        if svc != "orthoscan-pi-ble.service":
            run(["systemctl", "mask", svc])

def remove_hotspot_connections():
    print("\n🛑 Removing hotspot/AP NetworkManager connections...")
    lines = output(["nmcli", "-t", "-f", "NAME,TYPE", "con", "show"]).splitlines()
    removed = []
    for line in lines:
        if ":" not in line:
            continue
        name, typ = line.split(":", 1)
        mode = output(["nmcli", "-g", "802-11-wireless.mode", "con", "show", name]).lower()
        is_hotspot = (
            typ == "wifi"
            and (
                mode == "ap"
                or "hotspot" in name.lower()
                or name.lower().startswith("pi1")
                or name.lower().startswith("orthoscan")
            )
        )
        if is_hotspot:
            print(f"Removing hotspot connection: {name}")
            run(["nmcli", "con", "mod", name, "connection.autoconnect", "no"])
            run(["nmcli", "con", "down", name])
            run(["nmcli", "con", "delete", name])
            removed.append(name)
    if not removed:
        print("✅ No hotspot/AP connection found.")

def write_wifi_env(args):
    print("\n📄 Writing /etc/orthoscan-wifi.env...")
    text = (
        f"ORTHO_WIFI_SSID={args.ssid}\n"
        f"ORTHO_WIFI_PASSWORD={args.password}\n"
        f"ORTHO_WIFI_INTERFACE={args.interface}\n"
        f"ORTHO_API_HEALTH_URL={args.api_health}\n"
        "ORTHO_WIFI_RETRY_SECONDS=30\n"
        "ORTHO_KEEP_HOTSPOT_FALLBACK=0\n"
    )
    Path("/etc/orthoscan-wifi.env").write_text(text)
    os.chmod("/etc/orthoscan-wifi.env", 0o600)

def connect_wifi(args):
    print(f"\n📶 Connecting to {args.ssid}...")
    run(["nmcli", "radio", "wifi", "on"])
    run(["nmcli", "dev", "wifi", "rescan"])

    existing = output(["nmcli", "-t", "-f", "NAME", "con", "show"]).splitlines()
    if args.ssid in existing:
        run(["nmcli", "con", "mod", args.ssid, "connection.autoconnect", "yes"])
        run(["nmcli", "con", "mod", args.ssid, "connection.autoconnect-priority", "100"])
        run(["nmcli", "con", "up", args.ssid])
    else:
        cmd = ["nmcli", "dev", "wifi", "connect", args.ssid, "ifname", args.interface, "name", args.ssid]
        if args.password:
            cmd += ["password", args.password]
        run(cmd)
        run(["nmcli", "con", "mod", args.ssid, "connection.autoconnect", "yes"])
        run(["nmcli", "con", "mod", args.ssid, "connection.autoconnect-priority", "100"])

def restart_services():
    print("\n🔁 Restarting OrthoScan services...")
    run(["systemctl", "daemon-reload"])
    run(["systemctl", "enable", "orthoscan-wifi.service"])
    run(["systemctl", "enable", "orthoscan-imu.service"])
    run(["systemctl", "restart", "orthoscan-wifi.service"])
    run(["systemctl", "restart", "orthoscan-imu.service"])

def recap(args, backup_dir):
    print("\n===== CHECK =====")
    run(["nmcli", "-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device", "status"])
    run(["curl", "-s", "--max-time", "8", args.api_health])
    print("\n===== RECAP =====")
    print("Changed:")
    print(f"- Backup: {backup_dir}")
    print("- Disabled hotspot services")
    print("- Removed hotspot/AP Wi-Fi connections")
    print(f"- Configured Wi-Fi: {args.ssid}")
    print("- Set ORTHO_KEEP_HOTSPOT_FALLBACK=0")
    print("- Restarted orthoscan-wifi + orthoscan-imu")
    print("\nNext:")
    print("sudo reboot")
    print("After reboot, hotspot should not come back.")
    print("=================")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ssid", default="Guest_KazNU")
    parser.add_argument("--password", default="")
    parser.add_argument("--interface", default="wlan0")
    parser.add_argument("--api-health", default="http://89.218.178.215:18190/api/health")
    args = parser.parse_args()

    need_root()
    b = backup()
    stop_hotspot_services()
    remove_hotspot_connections()
    write_wifi_env(args)
    connect_wifi(args)
    restart_services()
    recap(args, b)

if __name__ == "__main__":
    main()
