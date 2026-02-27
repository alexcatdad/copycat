#!/usr/bin/env bash
set -euo pipefail

MODEL_ID="${1:-onnx-community/Janus-Pro-1B-ONNX}"
CACHE_DIR="${HF_CACHE_DIR:-$HOME/.cache/huggingface}"

if ! command -v hf >/dev/null 2>&1; then
  echo "error: Hugging Face CLI ('hf') is not installed." >&2
  exit 1
fi

echo "Checking access to ${MODEL_ID}..."
CURL_ARGS=()
if [ -n "${HF_TOKEN:-}" ]; then
  CURL_ARGS+=(-H "Authorization: Bearer ${HF_TOKEN}")
fi

HTTP_CODE="$(
  curl -sS -o /dev/null -w "%{http_code}" \
    -L \
    -I \
    "${CURL_ARGS[@]}" \
    "https://huggingface.co/${MODEL_ID}/resolve/main/config.json"
)"

if [ "${HTTP_CODE}" != "200" ]; then
  echo "error: unable to access ${MODEL_ID} (HTTP ${HTTP_CODE})." >&2
  echo "hint: export HF_TOKEN with access to ${MODEL_ID}, then rerun." >&2
  exit 1
fi

echo "Caching ${MODEL_ID} into ${CACHE_DIR}..."
if [ -n "${HF_TOKEN:-}" ]; then
  hf download "${MODEL_ID}" \
    --repo-type model \
    --cache-dir "${CACHE_DIR}" \
    --token "${HF_TOKEN}" \
    --max-workers 4
else
  hf download "${MODEL_ID}" \
    --repo-type model \
    --cache-dir "${CACHE_DIR}" \
    --max-workers 4
fi

echo "Model cached successfully."
