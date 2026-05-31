#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: bash scripts/set-google-calendar-ical.sh 'YOUR_SECRET_ICAL_URL'"
  exit 1
fi

ICAL_URL="$1"
ENV_FILE="$HOME/Home-Scheduler/secrets/google-calendar.env"

mkdir -p "$(dirname "$ENV_FILE")"
chmod 700 "$(dirname "$ENV_FILE")"

cat > "$ENV_FILE" <<EOF
export GOOGLE_CALENDAR_ICAL_URL='$ICAL_URL'
EOF

chmod 600 "$ENV_FILE"
echo "Saved Google Calendar iCal URL to $ENV_FILE"
echo "The HDMI start helper loads this file automatically."
