#!/usr/bin/env bash
set -euo pipefail

echo "🧹 Cleaning old containers and rebuilding..."
docker compose down --remove-orphans
docker compose build --no-cache
docker compose up -d

echo
echo "✅ Clean restart done."
echo "Next: run ./scripts/check-backend.sh"
