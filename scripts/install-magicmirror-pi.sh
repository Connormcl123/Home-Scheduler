#!/usr/bin/env bash
set -euo pipefail

HOME_SCHEDULER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAGICMIRROR_DIR="${MAGICMIRROR_DIR:-$HOME/MagicMirror}"

if [ ! -d "$MAGICMIRROR_DIR/.git" ]; then
  git clone https://github.com/MagicMirrorOrg/MagicMirror.git "$MAGICMIRROR_DIR"
fi

cd "$MAGICMIRROR_DIR"
npm install

mkdir -p "$MAGICMIRROR_DIR/modules/MMM-HomeScheduler"
cp -R "$HOME_SCHEDULER_DIR/magicmirror/modules/MMM-HomeScheduler/." "$MAGICMIRROR_DIR/modules/MMM-HomeScheduler/"

if [ ! -f "$MAGICMIRROR_DIR/config/config.js" ]; then
  cp "$HOME_SCHEDULER_DIR/magicmirror/config/config.js" "$MAGICMIRROR_DIR/config/config.js"
  echo "Created $MAGICMIRROR_DIR/config/config.js"
else
  echo "MagicMirror config already exists. Add MMM-HomeScheduler to $MAGICMIRROR_DIR/config/config.js manually if needed."
fi

echo "Run MagicMirror with:"
echo "  cd $MAGICMIRROR_DIR"
echo "  npm run start"
