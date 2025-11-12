#!/usr/bin/env bash
set -euo pipefail

# Pull prebuilt images for Qualitative Canvas
IMAGES=(
  ghcr.io/hdzajac/qualitative-canvas-frontend:latest
  ghcr.io/hdzajac/qualitative-canvas-backend:latest
  ghcr.io/hdzajac/qualitative-canvas-worker:latest
)

for img in "${IMAGES[@]}"; do
  echo "Pulling $img ..."
  docker pull "$img"
  echo
done

echo "Done. Use: docker compose -f docker-compose.yml -f docker-compose.images.yml up -d"
