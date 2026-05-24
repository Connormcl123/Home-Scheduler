#!/usr/bin/env bash
set -euo pipefail

MAGICMIRROR_DIR="${MAGICMIRROR_DIR:-$HOME/MagicMirror}"
MODE="${1:-auto}"

if [ ! -d "$MAGICMIRROR_DIR" ]; then
  echo "MagicMirror was not found at $MAGICMIRROR_DIR"
  echo "Run: bash ~/Home-Scheduler/scripts/install-magicmirror-pi.sh"
  exit 1
fi

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

case "$MODE" in
  auto)
    if [ -S "$XDG_RUNTIME_DIR/wayland-0" ]; then
      export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
      unset ELECTRON_OZONE_PLATFORM_HINT
      echo "Starting MagicMirror on Pi HDMI using Wayland display $WAYLAND_DISPLAY"
    else
      export DISPLAY="${DISPLAY:-:0}"
      export ELECTRON_OZONE_PLATFORM_HINT="x11"
      echo "Starting MagicMirror on Pi HDMI using X11 display $DISPLAY"
    fi
    ;;
  wayland)
    export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
    unset ELECTRON_OZONE_PLATFORM_HINT
    echo "Starting MagicMirror on Pi HDMI using Wayland display $WAYLAND_DISPLAY"
    ;;
  x11)
    export DISPLAY="${DISPLAY:-:0}"
    export ELECTRON_OZONE_PLATFORM_HINT="x11"
    unset WAYLAND_DISPLAY
    echo "Starting MagicMirror on Pi HDMI using X11 display $DISPLAY"
    ;;
  *)
    echo "Usage: $0 [auto|wayland|x11]"
    exit 1
    ;;
esac

cd "$MAGICMIRROR_DIR"
npm run start
