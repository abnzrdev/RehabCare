#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "🚀 Starting OrthoScan AI..."

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi

source .venv/bin/activate
export TF_CPP_MIN_LOG_LEVEL=2

echo "📦 Installing backend requirements..."
python -m pip install -r api/requirements.txt

echo "🧠 Starting FastAPI backend on http://localhost:8000 ..."
python -m uvicorn api.main:app --reload --port 8000 &
BACKEND_PID=$!

echo "⏳ Waiting for backend health check..."
for attempt in {1..120}; do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "Backend process exited before /health became ready."
    exit 1
  fi

  if python -c "import json, urllib.request; data=json.load(urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=1)); raise SystemExit(0 if data.get('status') == 'ok' else 1)" >/dev/null 2>&1; then
    echo "✅ Backend is ready."
    break
  fi

  if [ "$attempt" -eq 120 ]; then
    echo "Backend did not become ready after 120 seconds."
    exit 1
  fi

  sleep 1
done

echo "📦 Checking frontend requirements..."
cd frontend
if [ ! -x "node_modules/.bin/vite" ]; then
  echo "Frontend dependencies missing or broken. Reinstalling..."
  rm -rf node_modules
  npm install
fi

echo "🌐 Starting frontend..."
npm run dev &
FRONTEND_PID=$!

echo
echo "===== ORTHOSCAN AI RUNNING ====="
echo "Backend:  http://localhost:8000"
echo "Frontend: usually http://localhost:5173"
echo "Press Ctrl+C to stop both."

trap "echo 'Stopping...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true" EXIT
wait
