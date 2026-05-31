#!/usr/bin/env bash
set -euo pipefail

MAGICMIRROR_DIR="${MAGICMIRROR_DIR:-$HOME/MagicMirror}"
HOME_SCHEDULER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPERIMENT_CONFIG="$HOME_SCHEDULER_DIR/magicmirror/config/config.experiments.js"
INSTALLED_EXPERIMENT_CONFIG="$MAGICMIRROR_DIR/config/config.experiments.js"
CONFIG_TARGET="$MAGICMIRROR_DIR/config/config.js"
NORMAL_CONFIG="$HOME_SCHEDULER_DIR/magicmirror/config/config.js"
MODE="${1:-x11}"
BACKUP=""

if [ ! -f "$EXPERIMENT_CONFIG" ]; then
  echo "Experiment config not found at $EXPERIMENT_CONFIG"
  exit 1
fi

if [ ! -d "$MAGICMIRROR_DIR" ]; then
  echo "MagicMirror was not found at $MAGICMIRROR_DIR"
  echo "Run: bash ~/Home-Scheduler/scripts/install-magicmirror-pi.sh --replace-config"
  exit 1
fi

if [ -f "$CONFIG_TARGET" ]; then
  BACKUP="$CONFIG_TARGET.before-experiments.$(date +%Y%m%d-%H%M%S)"
  cp "$CONFIG_TARGET" "$BACKUP"
  echo "Backed up current config to $BACKUP"
fi

restore_config() {
  if [ -n "$BACKUP" ] && [ -f "$BACKUP" ]; then
    cp "$BACKUP" "$CONFIG_TARGET"
    echo "Restored normal config from $BACKUP"
  elif [ -f "$NORMAL_CONFIG" ]; then
    cp "$NORMAL_CONFIG" "$CONFIG_TARGET"
    echo "Restored normal Home Scheduler config"
  fi
}

trap restore_config EXIT

cp "$EXPERIMENT_CONFIG" "$CONFIG_TARGET"
cp "$EXPERIMENT_CONFIG" "$INSTALLED_EXPERIMENT_CONFIG"
echo "Loaded experimental MagicMirror config"
echo "Pages: Home Cal, Stock Cal, Ext2 Cal, Finance, Notes"

bash "$HOME_SCHEDULER_DIR/scripts/start-magicmirror-hdmi.sh" "$MODE"
