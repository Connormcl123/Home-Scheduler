#!/usr/bin/env bash
set -euo pipefail

# Raspberry Pi OS (Bookworm) runs labwc on Wayland, not X11, so the old xset
# calls silently did nothing. Handle both: xset under X, wlopm/wlr-randr under
# Wayland, and tell Chromium which platform it is launching into.

DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:4174}"
CHROMIUM_BIN="${CHROMIUM_BIN:-chromium}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

# When launched over SSH there is no session environment, so find the compositor.
if [ -z "${WAYLAND_DISPLAY:-}" ] && [ -S "$XDG_RUNTIME_DIR/wayland-0" ]; then
  export WAYLAND_DISPLAY=wayland-0
fi

PLATFORM_ARGS=()
if [ -n "${WAYLAND_DISPLAY:-}" ]; then
  PLATFORM_ARGS+=(--ozone-platform=wayland)
  # Wake every output and keep it awake.
  command -v wlopm >/dev/null 2>&1 && wlopm --on '*' >/dev/null 2>&1 || true
else
  export DISPLAY="${DISPLAY:-:0}"
  if command -v xset >/dev/null 2>&1; then
    xset s off >/dev/null 2>&1 || true
    xset -dpms >/dev/null 2>&1 || true
    xset s noblank >/dev/null 2>&1 || true
  fi
fi

# The kiosk is started by the desktop session, which can come up before the
# dashboard service is listening. Wait rather than showing an error page.
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "$DASHBOARD_URL/api/health" 2>/dev/null; then
    break
  fi
  sleep 2
done

# A crash flag left by an unclean shutdown makes Chromium show a restore bubble
# on top of the dashboard; clear it before every launch.
PROFILE_PREFS="$HOME/.config/chromium/Default/Preferences"
if [ -f "$PROFILE_PREFS" ]; then
  sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/' "$PROFILE_PREFS" 2>/dev/null || true
fi

exec "${CHROMIUM_BIN}" \
  --kiosk \
  "${PLATFORM_ARGS[@]}" \
  --noerrdialogs \
  --disable-infobars \
  --disable-features=TranslateUI \
  --disable-session-crashed-bubble \
  --disable-renderer-backgrounding \
  --disable-background-timer-throttling \
  --enable-gpu-rasterization \
  --ignore-gpu-blocklist \
  --autoplay-policy=no-user-gesture-required \
  --check-for-update-interval=31536000 \
  "$DASHBOARD_URL"
