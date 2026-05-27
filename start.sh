#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "🚀 Starting OrthoScan AI..."

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi

source .venv/bin/activate

echo "📦 Installing backend requirements..."
python -m pip install -r api/requirements.txt

echo "🧠 Starting FastAPI backend on http://localhost:8000 ..."
python -m uvicorn api.main:app --reload --port 8000 &
BACKEND_PID=$!

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
