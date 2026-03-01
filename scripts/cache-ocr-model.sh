#!/usr/bin/env bash
set -euo pipefail

MODEL_ID="${1:-Xenova/trocr-small-printed}"
CACHE_DIR="${HF_CACHE_DIR:-$HOME/.cache/huggingface}"

if ! command -v hf >/dev/null 2>&1; then
  echo "error: Hugging Face CLI ('hf') is not installed." >&2
  exit 1
fi

echo "Checking access to ${MODEL_ID}..."
HTTP_CODE="$(
  curl -sS -o /dev/null -w "%{http_code}" \
    -L \
    -I \
    "https://huggingface.co/${MODEL_ID}/resolve/main/config.json"
)"

if [ "${HTTP_CODE}" != "200" ]; then
  echo "error: unable to access ${MODEL_ID} (HTTP ${HTTP_CODE})." >&2
  exit 1
fi

echo "Caching ${MODEL_ID} into ${CACHE_DIR}..."
hf download "${MODEL_ID}" \
  --repo-type model \
  --cache-dir "${CACHE_DIR}" \
  --max-workers 4

echo "Model cached successfully."
