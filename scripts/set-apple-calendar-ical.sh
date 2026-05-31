#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: bash scripts/set-apple-calendar-ical.sh 'YOUR_APPLE_PUBLIC_ICAL_URL'"
  exit 1
fi

ICAL_URL="$1"
ENV_FILE="$HOME/Home-Scheduler/secrets/apple-calendar.env"

mkdir -p "$(dirname "$ENV_FILE")"
chmod 700 "$(dirname "$ENV_FILE")"

cat > "$ENV_FILE" <<EOF
export APPLE_CALENDAR_ICAL_URL='$ICAL_URL'
EOF

chmod 600 "$ENV_FILE"
echo "Saved Apple Calendar iCal URL to $ENV_FILE"
echo "The HDMI start helper loads this file automatically."
