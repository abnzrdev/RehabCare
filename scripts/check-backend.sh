#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:8000}"

echo "🔍 Checking backend..."
echo "API URL: $API_URL"
echo

if curl -fsS "$API_URL/health"; then
  echo
  echo "✅ Backend is reachable."
else
  echo
  echo "❌ Backend is not reachable."
  echo
  echo "📦 Docker status:"
  docker compose ps || true
  echo
  echo "🧾 API logs:"
  docker compose logs --tail=120 api || true
  exit 1
fi
