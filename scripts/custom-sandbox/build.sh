#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${1:-openclaw-sandbox-custom:latest}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Deno has no official arm64 Linux binary — force amd64.
# On Apple Silicon this runs via Rosetta inside OrbStack/Docker Desktop.
ARCH=$(uname -m)
if [[ "$ARCH" == "arm64" || "$ARCH" == "aarch64" ]]; then
  echo "arm64 detected — building for linux/amd64 (required for Deno)"
  PLATFORM="--platform linux/amd64"
else
  PLATFORM=""
fi

docker build $PLATFORM -t "${IMAGE_NAME}" -f "${SCRIPT_DIR}/Dockerfile" "${SCRIPT_DIR}"
echo "Built ${IMAGE_NAME}"
echo ""
echo "To use in openclaw.json:"
echo '  "docker": { "image": "'"${IMAGE_NAME}"'" }'
echo ""
echo "To verify:"
echo "  docker run --rm ${IMAGE_NAME} zsh -c 'node --version && deno --version && dart --version && uv --version && gh --version'"
