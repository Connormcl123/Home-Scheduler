#!/usr/bin/env bash
set -euo pipefail

export DISPLAY="${DISPLAY:-:0}"
if command -v xset >/dev/null 2>&1; then
  xset s off
  xset -dpms
  xset s noblank
fi

CHROMIUM_BIN="${CHROMIUM_BIN:-chromium}"

"${CHROMIUM_BIN}" \
  --kiosk \
  --app=http://localhost:4174 \
  --noerrdialogs \
  --disable-infobars \
  --disable-features=TranslateUI \
  --disable-session-crashed-bubble \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000 \
  http://localhost:4174
