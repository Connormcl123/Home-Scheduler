#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: bash scripts/set-background-photo-folder.sh /path/to/photo-folder"
  exit 1
fi

PHOTO_DIR="$1"
SECRETS_DIR="$HOME/Home-Scheduler/secrets"
ENV_FILE="$SECRETS_DIR/background-photo.env"

mkdir -p "$SECRETS_DIR"
mkdir -p "$PHOTO_DIR"

cat > "$ENV_FILE" <<EOF
export HOME_SCHEDULER_BACKGROUND_PHOTO_DIR="$PHOTO_DIR"
EOF

echo "Background photo folder saved to $ENV_FILE"
echo "MagicMirror will pick a random image from: $PHOTO_DIR"
