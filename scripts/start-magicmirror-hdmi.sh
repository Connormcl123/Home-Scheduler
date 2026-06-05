#!/usr/bin/env bash
set -euo pipefail

MAGICMIRROR_DIR="${MAGICMIRROR_DIR:-$HOME/MagicMirror}"
MODE="${1:-auto}"
PI_MODEL="$(tr -d '\0' < /proc/device-tree/model 2>/dev/null || true)"
HOME_SCHEDULER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -d "$MAGICMIRROR_DIR" ]; then
  echo "MagicMirror was not found at $MAGICMIRROR_DIR"
  echo "Run: bash ~/Home-Scheduler/scripts/install-magicmirror-pi.sh"
  exit 1
fi

if [ -n "$PI_MODEL" ]; then
  echo "Detected hardware: $PI_MODEL"
fi

sync_home_scheduler_assets() {
  local page_controls_source="$HOME_SCHEDULER_DIR/magicmirror/modules/MMM-HomePageControls"
  local page_controls_target="$MAGICMIRROR_DIR/modules/MMM-HomePageControls"
  local custom_css_source="$HOME_SCHEDULER_DIR/magicmirror/css/custom.css"
  local custom_css_target="$MAGICMIRROR_DIR/css/custom.css"

  if [ -d "$page_controls_source" ]; then
    rm -rf "$page_controls_target"
    mkdir -p "$page_controls_target"
    cp -R "$page_controls_source/." "$page_controls_target/"
    echo "Synced MMM-HomePageControls into MagicMirror"
  fi

  if [ -f "$custom_css_source" ]; then
    mkdir -p "$(dirname "$custom_css_target")"
    cp "$custom_css_source" "$custom_css_target"
    echo "Synced Home Scheduler custom MagicMirror CSS"
  fi
}

sync_home_scheduler_assets

if [ -f "$HOME/Home-Scheduler/secrets/google-calendar.env" ]; then
  # shellcheck disable=SC1091
  source "$HOME/Home-Scheduler/secrets/google-calendar.env"
fi

if [ -f "$HOME/Home-Scheduler/secrets/apple-calendar.env" ]; then
  # shellcheck disable=SC1091
  source "$HOME/Home-Scheduler/secrets/apple-calendar.env"
fi

if [ -f "$HOME/Home-Scheduler/secrets/plaid.env" ]; then
  # shellcheck disable=SC1091
  source "$HOME/Home-Scheduler/secrets/plaid.env"
fi

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

case "$MODE" in
  auto)
    if [ -S "$XDG_RUNTIME_DIR/wayland-0" ]; then
      export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
      unset ELECTRON_OZONE_PLATFORM_HINT
      echo "Starting MagicMirror on Pi HDMI using Wayland display $WAYLAND_DISPLAY"
      START_SCRIPT="start:wayland"
    else
      export DISPLAY="${DISPLAY:-:0}"
      export ELECTRON_OZONE_PLATFORM_HINT="x11"
      echo "Starting MagicMirror on Pi HDMI using X11 display $DISPLAY"
      START_SCRIPT="start:x11"
    fi
    ;;
  wayland)
    export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
    unset ELECTRON_OZONE_PLATFORM_HINT
    echo "Starting MagicMirror on Pi HDMI using Wayland display $WAYLAND_DISPLAY"
    START_SCRIPT="start:wayland"
    ;;
  x11)
    export DISPLAY="${DISPLAY:-:0}"
    export ELECTRON_OZONE_PLATFORM_HINT="x11"
    unset WAYLAND_DISPLAY
    echo "Starting MagicMirror on Pi HDMI using X11 display $DISPLAY"
    START_SCRIPT="start:x11"
    ;;
  *)
    echo "Usage: $0 [auto|wayland|x11]"
    exit 1
    ;;
esac

cd "$MAGICMIRROR_DIR"
node --run "$START_SCRIPT"
