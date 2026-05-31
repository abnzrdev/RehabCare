#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  COMPOSE="docker-compose"
fi

case "${1:-up}" in
  up)
    echo "🐳 Starting OrthoScan AI with Docker..."
    $COMPOSE -f docker-compose.dev.yml up --build
    ;;
  down)
    echo "🛑 Stopping OrthoScan AI..."
    $COMPOSE -f docker-compose.dev.yml down
    ;;
  logs)
    $COMPOSE -f docker-compose.dev.yml logs -f
    ;;
  rebuild)
    echo "♻️ Rebuilding OrthoScan AI..."
    $COMPOSE -f docker-compose.dev.yml down
    $COMPOSE -f docker-compose.dev.yml up --build
    ;;
  *)
    echo "Usage: ./start.sh [up|down|logs|rebuild]"
    exit 1
    ;;
esac
