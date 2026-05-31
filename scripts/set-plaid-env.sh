#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 2 ] || [ $# -gt 3 ]; then
  echo "Usage: bash scripts/set-plaid-env.sh 'PLAID_CLIENT_ID' 'PLAID_SECRET' [sandbox|development|production]"
  exit 1
fi

CLIENT_ID="$1"
SECRET="$2"
PLAID_ENVIRONMENT="${3:-sandbox}"
ENV_FILE="$HOME/Home-Scheduler/secrets/plaid.env"

mkdir -p "$(dirname "$ENV_FILE")"
chmod 700 "$(dirname "$ENV_FILE")"

cat > "$ENV_FILE" <<EOF
export PLAID_CLIENT_ID='$CLIENT_ID'
export PLAID_SECRET='$SECRET'
export PLAID_ENV='$PLAID_ENVIRONMENT'
EOF

chmod 600 "$ENV_FILE"
echo "Saved Plaid settings to $ENV_FILE"
echo "The HDMI start helper loads this file automatically."
