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


def run_command(args):
    return subprocess.run(args, capture_output=True, text=True, check=False)


def enable_ssh():
    for command in (["systemctl", "enable", "--now", "ssh"], ["systemctl", "enable", "--now", "sshd"]):
        result = run_command(command)
        if result.returncode == 0:
            return True
    return False


def get_status_text():
    ip_result = run_command(["hostname", "-I"])
    ip_text = " ".join(ip_result.stdout.split()) if ip_result.returncode == 0 else "unknown"
    wifi_result = run_command(["nmcli", "-t", "-f", "ACTIVE,SSID,DEVICE", "device", "wifi"])
    wifi_lines = [line for line in wifi_result.stdout.splitlines() if line.strip()]
    wifi_text = ", ".join(wifi_lines) if wifi_lines else "No active Wi-Fi client connection"
    return ip_text, wifi_text


def connect_wifi(ssid, password):
    enable_ssh()
    if password:
        command = ["nmcli", "device", "wifi", "connect", ssid, "password", password]
    else:
        command = ["nmcli", "device", "wifi", "connect", ssid]
    return run_command(command)


def render_page(message="", is_error=False):
    ip_text, wifi_text = get_status_text()
    escaped_message = html.escape(message)
    message_color = "#8b2e1f" if is_error else "#1f6f5f"
    message_block = (
        f'<div style="margin:16px 0;padding:12px 14px;border:1px solid #d9c9ae;'
        f'background:#fff8ee;color:{message_color};border-radius:12px">{escaped_message}</div>'
        if message
        else ""
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{PAGE_TITLE}</title>
  <style>
    body {{ margin: 0; font-family: Arial, sans-serif; background: #f6efe2; color: #2f2418; }}
    .wrap {{ max-width: 720px; margin: 0 auto; padding: 32px 20px 48px; }}
    .card {{ background: #fffaf2; border: 1px solid #dbcdb6; border-radius: 16px; padding: 24px; box-shadow: 0 10px 30px rgba(72, 48, 22, 0.08); }}
    h1 {{ margin-top: 0; font-size: 30px; }}
    p, li {{ line-height: 1.55; }}
    .meta {{ display: grid; gap: 10px; margin: 18px 0 24px; }}
    .meta div {{ padding: 12px 14px; border: 1px solid #e5d8c4; border-radius: 12px; background: #fff; }}
    label {{ display: block; font-weight: 600; margin: 14px 0 6px; }}
    input {{ width: 100%; box-sizing: border-box; padding: 12px 14px; border-radius: 12px; border: 1px solid #ccb99b; background: #fff; }}
    button {{ margin-top: 18px; padding: 12px 18px; border: 0; border-radius: 999px; background: #175f57; color: #fff; font-weight: 700; cursor: pointer; }}
    code {{ background: #f2e8d6; padding: 2px 6px; border-radius: 6px; }}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>{PAGE_TITLE}</h1>
      <p>Connect the Raspberry Pi to your normal Wi-Fi while the <code>pi1</code> hotspot is active.</p>
      <div class="meta">
        <div><strong>Portal URL:</strong> http://{HOTSPOT_IP}:{DEFAULT_PORT}</div>
        <div><strong>Current IP / status:</strong> {html.escape(ip_text)}</div>
        <div><strong>Wi-Fi:</strong> {html.escape(wifi_text)}</div>
      </div>
      {message_block}
      <form method="post" action="/">
        <label for="ssid">Wi-Fi SSID</label>
        <input id="ssid" name="ssid" type="text" required>
        <label for="password">Wi-Fi password</label>
        <input id="password" name="password" type="password">
        <button type="submit">Connect</button>
      </form>
      <p style="margin-top:20px">After a successful connection, the hotspot may disconnect. Check the Raspberry Pi IP with <code>hostname -I</code> on the Pi screen.</p>
    </div>
  </div>
</body>
</html>
"""


class WifiPortalHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = render_page().encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8", errors="replace")
        form = parse_qs(raw)
        ssid = form.get("ssid", [""])[0].strip()
        password = form.get("password", [""])[0]

        if not ssid:
            message = "Wi-Fi SSID is required."
            body = render_page(message=message, is_error=True).encode("utf-8")
            self.send_response(400)
        else:
            result = connect_wifi(ssid, password)
            if result.returncode == 0:
                message = (
                    "Connecting to Wi-Fi. The hotspot may disconnect. "
                    "Check the Raspberry Pi IP with hostname -I on the Pi screen."
                )
                body = render_page(message=message, is_error=False).encode("utf-8")
                self.send_response(200)
            else:
                stderr = result.stderr.strip() or result.stdout.strip() or "Unknown nmcli error."
                body = render_page(message=f"Wi-Fi connect failed: {stderr}", is_error=True).encode("utf-8")
                self.send_response(500)

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
