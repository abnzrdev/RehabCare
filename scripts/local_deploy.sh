#!/usr/bin/env bash

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR" || exit 1

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "Docker Compose is not installed. Install Docker Desktop or the docker compose plugin first."
  exit 1
fi

echo "Using compose command: ${COMPOSE_CMD[*]}"
echo "Stopping old containers..."
"${COMPOSE_CMD[@]}" down --remove-orphans

echo "Building and starting containers..."
"${COMPOSE_CMD[@]}" up -d --build

echo "Checking backend health at http://localhost:8000/health ..."
for _ in $(seq 1 30); do
  if curl -fsS http://localhost:8000/health >/dev/null 2>&1; then
    echo "Backend health check passed."
    echo "Frontend URL: http://localhost:5173"
    echo "Backend URL: http://localhost:8000"
    echo "Logs: ${COMPOSE_CMD[*]} logs -f"
    exit 0
  fi
  sleep 2
done

echo "Backend health check did not pass within 60 seconds."
echo "Inspect logs with: ${COMPOSE_CMD[*]} logs -f"
exit 1
