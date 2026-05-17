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
PHOTO_DIR="$MAGICMIRROR_DIR/photos"
THIRD_PARTY_MODULES=(
  "MMM-CalendarExt3|https://github.com/MMRIZE/MMM-CalendarExt3.git"
  "MMM-GooglePhotos|https://github.com/hermanho/MMM-GooglePhotos.git"
  "MMM-Remote-Control|https://github.com/Jopyth/MMM-Remote-Control.git"
  "MMM-Random-local-image|https://github.com/miccl/MMM-Random-local-image.git"
)

if [ ! -d "$MAGICMIRROR_DIR/.git" ]; then
  git clone https://github.com/MagicMirrorOrg/MagicMirror.git "$MAGICMIRROR_DIR"
else
  echo "Using existing MagicMirror install at $MAGICMIRROR_DIR"
fi

cd "$MAGICMIRROR_DIR"
npm install

install_module_dependencies() {
  local module_dir="$1"

  if [ -f "$module_dir/package-lock.json" ]; then
    (cd "$module_dir" && npm ci)
  elif [ -f "$module_dir/package.json" ]; then
    (cd "$module_dir" && npm install)
  fi
}

rm -rf "$MODULE_TARGET"
mkdir -p "$MODULE_TARGET"
cp -R "$MODULE_SOURCE/." "$MODULE_TARGET/"
echo "Installed fresh MMM-HomeScheduler module at $MODULE_TARGET"

mkdir -p "$PHOTO_DIR"
echo "Local photo folder ready at $PHOTO_DIR"

for module_info in "${THIRD_PARTY_MODULES[@]}"; do
  IFS="|" read -r module_name module_repo <<< "$module_info"
  module_dir="$MAGICMIRROR_DIR/modules/$module_name"

  if [ -d "$module_dir/.git" ]; then
    echo "Updating $module_name"
    (cd "$module_dir" && git pull --ff-only)
  else
    echo "Installing $module_name"
    git clone "$module_repo" "$module_dir"
  fi

  install_module_dependencies "$module_dir"
done

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
