#!/usr/bin/env python3
"""Small hotspot portal for entering Raspberry Pi Wi-Fi credentials."""

from __future__ import annotations

import argparse
import html
import os
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs


DEFAULT_HOST = "0.0.0.0"
DEFAULT_PORT = 8080
HOTSPOT_IP = "10.42.0.1"
PAGE_TITLE = "Raspberry Pi Wi-Fi Setup"
OPEN_MODE = "open"
WPA_MODE = "wpa"
ENTERPRISE_MODE = "enterprise"


def run_command(args):
    return subprocess.run(args, capture_output=True, text=True, check=False)


def enable_ssh():
    for command in (["systemctl", "enable", "--now", "ssh"], ["systemctl", "enable", "--now", "sshd"]):
        result = run_command(command)
        if result.returncode == 0:
            return True
    return False


def get_wifi_device():
    result = run_command(["nmcli", "-t", "-f", "DEVICE,TYPE", "device", "status"])
    if result.returncode != 0:
        return ""

    for line in result.stdout.splitlines():
        if not line.strip():
            continue
        device, _, dev_type = line.partition(":")
        if dev_type == "wifi":
            return device
    return ""


def split_nmcli_fields(line, expected_parts):
    parts = []
    current = []
    escape = False

    for char in line:
        if escape:
            current.append(char)
            escape = False
        elif char == "\\":
            escape = True
        elif char == ":" and len(parts) < expected_parts - 1:
            parts.append("".join(current))
            current = []
        else:
            current.append(char)

    parts.append("".join(current))
    while len(parts) < expected_parts:
        parts.append("")
    return parts[:expected_parts]


def parse_wifi_scan(scan_output):
    networks = []
    seen_ssids = set()

    for raw_line in scan_output.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        active, ssid, signal, security, mode, device = split_nmcli_fields(line, 6)
        ssid = ssid.strip()
        if not ssid or ssid in seen_ssids:
            continue

        seen_ssids.add(ssid)
        signal_text = f"{signal.strip()}%" if signal.strip() else "?"
        security_text = security.strip() or "Open"
        networks.append(
            {
                "active": active.strip().lower() == "yes",
                "ssid": ssid,
                "signal": signal_text,
                "security": security_text,
                "mode": mode.strip(),
                "device": device.strip(),
            }
        )

    networks.sort(key=lambda item: (not item["active"], -safe_int(item["signal"].rstrip("%")), item["ssid"].lower()))
    return networks


def safe_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return -1


def scan_wifi_networks():
    wifi_device = get_wifi_device()
    if not wifi_device:
        return [], "", "No Wi-Fi device found."

    run_command(["nmcli", "radio", "wifi", "on"])
    run_command(["nmcli", "device", "wifi", "rescan", "ifname", wifi_device])
    result = run_command(
        [
            "nmcli",
            "-t",
            "-f",
            "ACTIVE,SSID,SIGNAL,SECURITY,MODE,DEVICE",
            "device",
            "wifi",
            "list",
            "ifname",
            wifi_device,
        ]
    )
    if result.returncode != 0:
        error = result.stderr.strip() or result.stdout.strip() or "Unable to scan Wi-Fi networks."
        return [], wifi_device, error

    return parse_wifi_scan(result.stdout), wifi_device, ""


def get_status_text():
    ip_result = run_command(["hostname", "-I"])
    ip_text = " ".join(ip_result.stdout.split()) if ip_result.returncode == 0 else "unknown"
    wifi_device = get_wifi_device()
    if not wifi_device:
        return ip_text, "No Wi-Fi device found"

    wifi_result = run_command(["nmcli", "-t", "-f", "GENERAL.CONNECTION", "device", "show", wifi_device])
    connection = ""
    if wifi_result.returncode == 0:
        _, _, connection = wifi_result.stdout.partition(":")
        connection = connection.strip()
    wifi_text = connection or "No active Wi-Fi client connection"
    return ip_text, f"{wifi_device}: {wifi_text}"


def build_connect_command(ssid, mode, password, identity, wifi_device):
    if not ssid:
        raise ValueError("Wi-Fi SSID is required.")
    if not wifi_device:
        raise ValueError("No Wi-Fi device found.")

    if mode == OPEN_MODE:
        return ["nmcli", "device", "wifi", "connect", ssid, "ifname", wifi_device]

    if mode == WPA_MODE:
        if not password:
            raise ValueError("Password is required for WPA/WPA2 networks.")
        return ["nmcli", "device", "wifi", "connect", ssid, "password", password, "ifname", wifi_device]

    if mode == ENTERPRISE_MODE:
        if not identity:
            raise ValueError("Username or identity is required for Enterprise Wi-Fi.")
        if not password:
            raise ValueError("Password is required for Enterprise Wi-Fi.")
        return [
            "nmcli",
            "connection",
            "add",
            "type",
            "wifi",
            "ifname",
            wifi_device,
            "con-name",
            f"{ssid}-enterprise",
            "ssid",
            ssid,
            "802-11-wireless-security.key-mgmt",
            "wpa-eap",
            "802-1x.eap",
            "peap",
            "802-1x.phase2-auth",
            "mschapv2",
            "802-1x.identity",
            identity,
            "802-1x.password",
            password,
        ]

    raise ValueError("Unknown Wi-Fi mode selected.")


def connect_wifi(ssid, mode, password, identity):
    enable_ssh()
    wifi_device = get_wifi_device()
    command = build_connect_command(ssid=ssid, mode=mode, password=password, identity=identity, wifi_device=wifi_device)

    if mode == ENTERPRISE_MODE:
        connection_name = f"{ssid}-enterprise"
        run_command(["nmcli", "connection", "delete", connection_name])
        create_result = run_command(command)
        if create_result.returncode != 0:
            return create_result
        return run_command(["nmcli", "connection", "up", connection_name])

    return run_command(command)


def describe_network(network):
    parts = [network["ssid"], f"signal {network['signal']}", network["security"]]
    if network["active"]:
        parts.append("active")
    return " | ".join(parts)


def render_page(message="", is_error=False, form_data=None, networks=None, scan_error=""):
    form_data = form_data or {}
    networks = networks or []
    ip_text, wifi_text = get_status_text()
    selected_network = form_data.get("selected_ssid", "")
    manual_ssid = form_data.get("manual_ssid", "")
    mode = form_data.get("mode", WPA_MODE)
    identity = form_data.get("identity", "")
    password = form_data.get("password", "")
    escaped_message = html.escape(message)
    message_color = "#8b2e1f" if is_error else "#1f6f5f"

    message_block = (
        f'<div class="notice {"error" if is_error else "ok"}">{escaped_message}</div>' if message else ""
    )
    scan_block = f'<div class="scan-note">{html.escape(scan_error)}</div>' if scan_error else ""

    option_markup = ['<option value="">Select a scanned network</option>']
    for network in networks:
        selected_attr = " selected" if network["ssid"] == selected_network else ""
        option_markup.append(
            f'<option value="{html.escape(network["ssid"], quote=True)}"{selected_attr}>'
            f"{html.escape(describe_network(network))}</option>"
        )
    options_html = "".join(option_markup)

    open_selected = "selected" if mode == OPEN_MODE else ""
    wpa_selected = "selected" if mode == WPA_MODE else ""
    enterprise_selected = "selected" if mode == ENTERPRISE_MODE else ""
    enterprise_style = "block" if mode == ENTERPRISE_MODE else "none"

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{PAGE_TITLE}</title>
  <style>
    :root {{
      color-scheme: light;
      --bg: #f6efe2;
      --card: #fffaf2;
      --panel: #fffdf8;
      --border: #dbcdb6;
      --border-soft: #e7dcc7;
      --text: #2f2418;
      --muted: #6d5c48;
      --accent: #175f57;
      --accent-2: #1f6f5f;
      --error: #8b2e1f;
      --shadow: rgba(72, 48, 22, 0.08);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: Arial, sans-serif;
      background:
        radial-gradient(circle at top, rgba(255, 255, 255, 0.6), transparent 34%),
        linear-gradient(180deg, #f8f2e8 0%, var(--bg) 45%, #efe4d3 100%);
      color: var(--text);
    }}
    .wrap {{ max-width: 820px; margin: 0 auto; padding: 32px 20px 48px; }}
    .card {{
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 24px;
      box-shadow: 0 14px 34px var(--shadow);
    }}
    h1 {{ margin: 0 0 10px; font-size: 31px; }}
    p, li {{ line-height: 1.55; }}
    .meta {{
      display: grid;
      gap: 10px;
      margin: 18px 0 24px;
    }}
    .meta div {{
      padding: 12px 14px;
      border: 1px solid var(--border-soft);
      border-radius: 12px;
      background: var(--panel);
    }}
    .layout {{
      display: grid;
      gap: 18px;
    }}
    .grid-two {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }}
    label {{
      display: block;
      font-weight: 600;
      margin: 14px 0 6px;
    }}
    input, select {{
      width: 100%;
      padding: 12px 14px;
      border-radius: 12px;
      border: 1px solid #ccb99b;
      background: #fff;
      color: var(--text);
      font: inherit;
    }}
    .actions {{
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 18px;
    }}
    button, .button-link {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 46px;
      padding: 12px 18px;
      border: 0;
      border-radius: 999px;
      background: var(--accent);
      color: #fff;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
    }}
    .button-link.secondary {{
      background: transparent;
      color: var(--accent);
      border: 1px solid var(--border);
    }}
    .hint {{
      margin-top: 6px;
      font-size: 14px;
      color: var(--muted);
    }}
    .notice {{
      margin: 16px 0;
      padding: 12px 14px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: #fff8ee;
    }}
    .notice.ok {{ color: var(--accent-2); }}
    .notice.error {{ color: var(--error); }}
    .scan-note {{
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 14px;
    }}
    .mode-note {{
      margin-top: 10px;
      padding: 10px 12px;
      border-radius: 12px;
      background: #f5ece0;
      color: var(--muted);
      font-size: 14px;
    }}
    .enterprise-fields {{ display: {enterprise_style}; }}
    code {{ background: #f2e8d6; padding: 2px 6px; border-radius: 6px; }}
    @media (max-width: 720px) {{
      .wrap {{ padding: 20px 14px 34px; }}
      .card {{ padding: 18px; }}
      .grid-two {{ grid-template-columns: 1fr; }}
    }}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>{PAGE_TITLE}</h1>
      <p>Connect the Raspberry Pi to your normal Wi-Fi while the <code>pi1</code> hotspot stays available at <code>http://{HOTSPOT_IP}:{DEFAULT_PORT}</code>.</p>
      <div class="meta">
        <div><strong>Portal URL:</strong> http://{HOTSPOT_IP}:{DEFAULT_PORT}</div>
        <div><strong>Current IP / status:</strong> {html.escape(ip_text)}</div>
        <div><strong>Wi-Fi:</strong> {html.escape(wifi_text)}</div>
      </div>
      {message_block}
      <div class="layout">
        <form method="get" action="/">
          <div class="actions" style="margin-top:0">
            <button type="submit">Refresh networks</button>
          </div>
          {scan_block}
        </form>
        <form method="post" action="/">
          <label for="selected_ssid">Scanned Wi-Fi networks</label>
          <select id="selected_ssid" name="selected_ssid">
            {options_html}
          </select>
          <div class="hint">Choose a scanned network when possible. Signal and security are shown in the list.</div>

          <label for="manual_ssid">Manual SSID fallback</label>
          <input id="manual_ssid" name="manual_ssid" type="text" value="{html.escape(manual_ssid, quote=True)}" placeholder="Use this only if your network is hidden or missing from the list">
          <div class="hint">If both are filled, the manual SSID is used.</div>

          <div class="grid-two">
            <div>
              <label for="mode">Network type</label>
              <select id="mode" name="mode">
                <option value="{OPEN_MODE}" {open_selected}>Open network / no password</option>
                <option value="{WPA_MODE}" {wpa_selected}>WPA/WPA2 password</option>
                <option value="{ENTERPRISE_MODE}" {enterprise_selected}>University/Enterprise Wi-Fi</option>
              </select>
            </div>
            <div>
              <label for="password">Password</label>
              <input id="password" name="password" type="password" value="{html.escape(password, quote=True)}" placeholder="Leave blank for open networks">
            </div>
          </div>

          <div class="enterprise-fields">
            <label for="identity">Username / identity</label>
            <input id="identity" name="identity" type="text" value="{html.escape(identity, quote=True)}" placeholder="Required for Enterprise Wi-Fi">
          </div>

          <div class="mode-note">
            Open networks connect without <code>wifi-sec.key-mgmt</code>. Enterprise mode uses PEAP + MSCHAPv2 with your identity and password.
          </div>
          <div class="actions">
            <button type="submit">Connect</button>
          </div>
        </form>
      </div>
      <p style="margin-top:20px">After a successful connection, the hotspot may disconnect. Check the Raspberry Pi IP with <code>hostname -I</code> on the Pi screen or over SSH.</p>
    </div>
  </div>
  <script>
    const modeSelect = document.getElementById("mode");
    const enterpriseFields = document.querySelector(".enterprise-fields");
    const passwordInput = document.getElementById("password");

    function syncModeFields() {{
      const enterprise = modeSelect.value === "{ENTERPRISE_MODE}";
      const open = modeSelect.value === "{OPEN_MODE}";
      enterpriseFields.style.display = enterprise ? "block" : "none";
      passwordInput.placeholder = open ? "Leave blank for open networks" : "Enter Wi-Fi password";
    }}

    modeSelect.addEventListener("change", syncModeFields);
    syncModeFields();
  </script>
</body>
</html>
"""


class WifiPortalHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        networks, _, scan_error = scan_wifi_networks()
        body = render_page(
            networks=networks,
            scan_error=scan_error,
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8", errors="replace")
        form = parse_qs(raw)
        form_data = {
            "selected_ssid": form.get("selected_ssid", [""])[0].strip(),
            "manual_ssid": form.get("manual_ssid", [""])[0].strip(),
            "mode": form.get("mode", [WPA_MODE])[0].strip() or WPA_MODE,
            "identity": form.get("identity", [""])[0].strip(),
            "password": form.get("password", [""])[0],
        }
        networks, _, scan_error = scan_wifi_networks()
        ssid = form_data["manual_ssid"] or form_data["selected_ssid"]

        try:
            result = connect_wifi(
                ssid=ssid,
                mode=form_data["mode"],
                password=form_data["password"],
                identity=form_data["identity"],
            )
            if result.returncode == 0:
                message = (
                    "Connecting to Wi-Fi. The hotspot may disconnect. "
                    "Check the Raspberry Pi IP with hostname -I on the Pi screen."
                )
                body = render_page(
                    message=message,
                    is_error=False,
                    form_data=form_data,
                    networks=networks,
                    scan_error=scan_error,
                ).encode("utf-8")
                self.send_response(200)
            else:
                stderr = result.stderr.strip() or result.stdout.strip() or "Unknown nmcli error."
                body = render_page(
                    message=f"Wi-Fi connect failed: {stderr}",
                    is_error=True,
                    form_data=form_data,
                    networks=networks,
                    scan_error=scan_error,
                ).encode("utf-8")
                self.send_response(500)
        except ValueError as exc:
            body = render_page(
                message=str(exc),
                is_error=True,
                form_data=form_data,
                networks=networks,
                scan_error=scan_error,
            ).encode("utf-8")
            self.send_response(400)

        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):  # noqa: A003
        return


def main():
    parser = argparse.ArgumentParser(description=PAGE_TITLE)
    parser.add_argument("--host", default=os.getenv("WIFI_PORTAL_HOST", DEFAULT_HOST))
    parser.add_argument("--port", default=int(os.getenv("WIFI_PORTAL_PORT", str(DEFAULT_PORT))), type=int)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), WifiPortalHandler)
    print(f"Starting Wi-Fi portal at http://{HOTSPOT_IP}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        print("Wi-Fi portal stopped.")


if __name__ == "__main__":
    main()
