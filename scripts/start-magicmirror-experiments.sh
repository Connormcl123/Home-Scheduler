#!/usr/bin/env bash
set -euo pipefail

MAGICMIRROR_DIR="${MAGICMIRROR_DIR:-$HOME/MagicMirror}"
HOME_SCHEDULER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPERIMENT_CONFIG="$HOME_SCHEDULER_DIR/magicmirror/config/config.experiments.js"
INSTALLED_EXPERIMENT_CONFIG="$MAGICMIRROR_DIR/config/config.experiments.js"
MODE="${1:-x11}"
PI_MODEL="$(tr -d '\0' < /proc/device-tree/model 2>/dev/null || true)"

if [ ! -f "$EXPERIMENT_CONFIG" ]; then
  echo "Experiment config not found at $EXPERIMENT_CONFIG"
  exit 1
fi

if [ ! -d "$MAGICMIRROR_DIR" ]; then
  echo "MagicMirror was not found at $MAGICMIRROR_DIR"
  echo "Run: bash ~/Home-Scheduler/scripts/install-magicmirror-pi.sh --replace-config"
  exit 1
fi

if [ -n "$PI_MODEL" ]; then
  echo "Detected hardware: $PI_MODEL"
fi

mkdir -p "$MAGICMIRROR_DIR/config"
cp "$EXPERIMENT_CONFIG" "$INSTALLED_EXPERIMENT_CONFIG"
export MM_CONFIG_FILE="config/config.experiments.js"

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

if [ -f "$HOME/Home-Scheduler/secrets/background-photo.env" ]; then
  # shellcheck disable=SC1091
  source "$HOME/Home-Scheduler/secrets/background-photo.env"
fi

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

case "$MODE" in
  auto)
    if [ -S "$XDG_RUNTIME_DIR/wayland-0" ]; then
      export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
      unset ELECTRON_OZONE_PLATFORM_HINT
      echo "Starting experimental MagicMirror using Wayland display $WAYLAND_DISPLAY"
      START_SCRIPT="start:wayland"
    else
      export DISPLAY="${DISPLAY:-:0}"
      export ELECTRON_OZONE_PLATFORM_HINT="x11"
      echo "Starting experimental MagicMirror using X11 display $DISPLAY"
      START_SCRIPT="start:x11"
    fi
    ;;
  wayland)
    export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
    unset ELECTRON_OZONE_PLATFORM_HINT
    echo "Starting experimental MagicMirror using Wayland display $WAYLAND_DISPLAY"
    START_SCRIPT="start:wayland"
    ;;
  x11)
    export DISPLAY="${DISPLAY:-:0}"
    export ELECTRON_OZONE_PLATFORM_HINT="x11"
    unset WAYLAND_DISPLAY
    echo "Starting experimental MagicMirror using X11 display $DISPLAY"
    START_SCRIPT="start:x11"
    ;;
  *)
    echo "Usage: $0 [auto|wayland|x11]"
    exit 1
    ;;
esac

echo "Using MM_CONFIG_FILE=$MM_CONFIG_FILE"
echo "Pages: Default, Calendar, Finance, Notes"

cd "$MAGICMIRROR_DIR"
node --run "$START_SCRIPT"
