#!/usr/bin/env bash
set -euo pipefail

REPLACE_CONFIG="false"

for arg in "$@"; do
  case "$arg" in
    --replace-config)
      REPLACE_CONFIG="true"
      ;;
    *)
      echo "Unknown option: $arg"
      echo "Usage: bash scripts/install-magicmirror-pi.sh [--replace-config]"
      exit 1
      ;;
  esac
done

HOME_SCHEDULER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAGICMIRROR_DIR="${MAGICMIRROR_DIR:-$HOME/MagicMirror}"
MODULE_SOURCE="$HOME_SCHEDULER_DIR/magicmirror/modules/MMM-HomeScheduler"
MODULE_TARGET="$MAGICMIRROR_DIR/modules/MMM-HomeScheduler"
CONFIG_SOURCE="$HOME_SCHEDULER_DIR/magicmirror/config/config.js"
CONFIG_TARGET="$MAGICMIRROR_DIR/config/config.js"

if [ ! -d "$MAGICMIRROR_DIR/.git" ]; then
  git clone https://github.com/MagicMirrorOrg/MagicMirror.git "$MAGICMIRROR_DIR"
else
  echo "Using existing MagicMirror install at $MAGICMIRROR_DIR"
fi

cd "$MAGICMIRROR_DIR"
npm install

rm -rf "$MODULE_TARGET"
mkdir -p "$MODULE_TARGET"
cp -R "$MODULE_SOURCE/." "$MODULE_TARGET/"
echo "Installed fresh MMM-HomeScheduler module at $MODULE_TARGET"

if [ ! -f "$CONFIG_TARGET" ]; then
  cp "$CONFIG_SOURCE" "$CONFIG_TARGET"
  echo "Created $CONFIG_TARGET"
elif [ "$REPLACE_CONFIG" = "true" ]; then
  BACKUP="$CONFIG_TARGET.backup.$(date +%Y%m%d-%H%M%S)"
  cp "$CONFIG_TARGET" "$BACKUP"
  cp "$CONFIG_SOURCE" "$CONFIG_TARGET"
  echo "Replaced $CONFIG_TARGET"
  echo "Backup saved at $BACKUP"
else
  echo "MagicMirror config already exists at $CONFIG_TARGET"
  echo "Keeping it unchanged. To replace it with Home Scheduler's base config, rerun:"
  echo "  bash scripts/install-magicmirror-pi.sh --replace-config"
fi

echo "Run MagicMirror with:"
echo "  cd $MAGICMIRROR_DIR"
echo "  npm run start"
