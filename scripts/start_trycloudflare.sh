#!/usr/bin/env bash

set -u

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed."
  echo "Install it first, then rerun this script."
  echo "Docs: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  echo "Ubuntu example:"
  echo "  curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb"
  echo "  sudo dpkg -i /tmp/cloudflared.deb"
  exit 0
fi

echo "Starting TryCloudflare tunnel for http://localhost:5173"
echo "The public URL is temporary, random, and does not require Cloudflare login for this script."
cloudflared tunnel --url http://localhost:5173
