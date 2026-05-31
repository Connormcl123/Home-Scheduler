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
FINANCE_MODULE_SOURCE="$HOME_SCHEDULER_DIR/magicmirror/modules/MMM-HomeFinance"
FINANCE_MODULE_TARGET="$MAGICMIRROR_DIR/modules/MMM-HomeFinance"
PAGE_CONTROLS_SOURCE="$HOME_SCHEDULER_DIR/magicmirror/modules/MMM-HomePageControls"
PAGE_CONTROLS_TARGET="$MAGICMIRROR_DIR/modules/MMM-HomePageControls"
CONFIG_SOURCE="$HOME_SCHEDULER_DIR/magicmirror/config/config.js"
CONFIG_TARGET="$MAGICMIRROR_DIR/config/config.js"
EXPERIMENT_CONFIG_SOURCE="$HOME_SCHEDULER_DIR/magicmirror/config/config.experiments.js"
EXPERIMENT_CONFIG_TARGET="$MAGICMIRROR_DIR/config/config.experiments.js"
PHOTO_DIR="$MAGICMIRROR_DIR/photos"
SECRETS_DIR="$HOME_SCHEDULER_DIR/secrets"
THIRD_PARTY_MODULES=(
  "MMM-pages|https://github.com/edward-shen/MMM-pages.git"
  "MMM-CalendarExt2|https://github.com/MagicMirrorModules/MMM-CalendarExt2.git"
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

install_third_party_module() {
  local module_name="$1"
  local module_repo="$2"
  local module_dir="$MAGICMIRROR_DIR/modules/$module_name"

  if [ -d "$module_dir/.git" ]; then
    echo "Updating $module_name"
    if ! (cd "$module_dir" && git pull --ff-only); then
      echo "Update failed for $module_name. Removing and recloning."
      rm -rf "$module_dir"
      git clone --recurse-submodules "$module_repo" "$module_dir"
    fi
  else
    echo "Installing $module_name"
    rm -rf "$module_dir"
    git clone --recurse-submodules "$module_repo" "$module_dir"
  fi

  if ! install_module_dependencies "$module_dir"; then
    echo "Dependency install failed for $module_name. Removing and recloning once."
    rm -rf "$module_dir"
    git clone --recurse-submodules "$module_repo" "$module_dir"
    install_module_dependencies "$module_dir"
  fi
}

rm -rf "$MODULE_TARGET"
mkdir -p "$MODULE_TARGET"
cp -R "$MODULE_SOURCE/." "$MODULE_TARGET/"
echo "Installed fresh MMM-HomeScheduler module at $MODULE_TARGET"
install_module_dependencies "$MODULE_TARGET"

rm -rf "$FINANCE_MODULE_TARGET"
mkdir -p "$FINANCE_MODULE_TARGET"
cp -R "$FINANCE_MODULE_SOURCE/." "$FINANCE_MODULE_TARGET/"
echo "Installed fresh MMM-HomeFinance module at $FINANCE_MODULE_TARGET"
install_module_dependencies "$FINANCE_MODULE_TARGET"

rm -rf "$PAGE_CONTROLS_TARGET"
mkdir -p "$PAGE_CONTROLS_TARGET"
cp -R "$PAGE_CONTROLS_SOURCE/." "$PAGE_CONTROLS_TARGET/"
echo "Installed fresh MMM-HomePageControls module at $PAGE_CONTROLS_TARGET"
install_module_dependencies "$PAGE_CONTROLS_TARGET"

mkdir -p "$PHOTO_DIR"
mkdir -p "$SECRETS_DIR"
echo "Local photo folder ready at $PHOTO_DIR"
echo "Secrets folder ready at $SECRETS_DIR"

for module_info in "${THIRD_PARTY_MODULES[@]}"; do
  IFS="|" read -r module_name module_repo <<< "$module_info"
  install_third_party_module "$module_name" "$module_repo"
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

cp "$EXPERIMENT_CONFIG_SOURCE" "$EXPERIMENT_CONFIG_TARGET"
echo "Installed experimental config at $EXPERIMENT_CONFIG_TARGET"

echo "Run MagicMirror with:"
echo "  cd $MAGICMIRROR_DIR"
echo "  npm run start"
