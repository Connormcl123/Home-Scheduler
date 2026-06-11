#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${APP_DIR}"
mkdir -p logs

PORT="${PORT:-4174}"
NGROK_BIN="${NGROK_BIN:-ngrok}"
NGROK_LOG="${NGROK_LOG:-logs/ngrok.log}"

if command -v "${NGROK_BIN}" >/dev/null 2>&1; then
  if ! pgrep -x "$(basename "${NGROK_BIN}")" >/dev/null 2>&1; then
    nohup "${NGROK_BIN}" http "${PORT}" --log=stdout > "${NGROK_LOG}" 2>&1 &
    echo "ngrok tunnel starting for http://localhost:${PORT}; log: ${NGROK_LOG}"
  else
    echo "ngrok tunnel already running for port ${PORT}"
  fi
else
  echo "ngrok is not installed; continuing without public tunnel"
fi

exec npm run start -w server
