#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:8000}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:5173}"

echo "🚀 Starting OrthoScan AI..."
echo "API:      $API_URL"
echo "Frontend: $FRONTEND_URL"
echo

docker compose down --remove-orphans
docker compose up -d --build

echo
echo "⏳ Waiting for backend /health..."

for i in {1..90}; do
  if curl -fsS "$API_URL/health" >/dev/null 2>&1; then
    echo "✅ Backend is reachable: $API_URL/health"
    echo "✅ Frontend should be here: $FRONTEND_URL"
    echo
    echo "📌 Live logs:"
    docker compose logs -f api frontend
    exit 0
  fi

  if [ "$i" -eq 90 ]; then
    echo "❌ Backend did not become reachable after 90 seconds."
    echo
    echo "🔍 Last API logs:"
    docker compose logs --tail=120 api || true
    echo
    echo "🔍 Container status:"
    docker compose ps
    echo
    echo "💡 If frontend says ECONNREFUSED, check vite.config.js proxy target."
    echo "   In Docker it should usually target http://api:8000, not http://localhost:8000."
    exit 1
  fi

  sleep 1
done
