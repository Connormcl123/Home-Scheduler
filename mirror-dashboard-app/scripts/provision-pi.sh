#!/usr/bin/env bash
#
# One-time setup for a fresh Raspberry Pi OS install.
#
#   curl -fsSL https://raw.githubusercontent.com/Connormcl123/Home-Scheduler/feature/standalone-mirror-dashboard/mirror-dashboard-app/scripts/provision-pi.sh | bash
#
# Safe to re-run: every step checks before acting.
#
# The Pi deliberately does NOT build the client. Compiling on-device is what
# killed the previous board - it pins all four cores while the display is
# running. Builds happen on the dev machine and deploy.ps1 ships the output.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Connormcl123/Home-Scheduler.git}"
BRANCH="${BRANCH:-feature/standalone-mirror-dashboard}"
# The app needs fetch and AbortSignal.timeout, so 18 is the floor. Debian 13
# ships 20, which is plenty and avoids depending on a third-party repo having
# published for a brand-new release.
NODE_MIN_MAJOR="${NODE_MIN_MAJOR:-20}"

APP_USER="$(id -un)"
CHECKOUT="$HOME/Home-Scheduler"
APP_DIR="$CHECKOUT/mirror-dashboard-app"
SERVICE_NAME="mirror-dashboard"

say() { printf "\n\033[1;36m==> %s\033[0m\n" "$1"; }
warn() { printf "\033[1;33m    %s\033[0m\n" "$1"; }

if [ "$APP_USER" = "root" ]; then
  echo "Run this as your normal user, not root - it needs your home directory." >&2
  exit 1
fi

say "Checking prerequisites"
sudo apt-get update -qq
for pkg in git curl chromium wlopm grim; do
  if ! dpkg -s "$pkg" >/dev/null 2>&1; then
    echo "installing $pkg"
    sudo apt-get install -y -qq "$pkg" || warn "could not install $pkg (continuing)"
  fi
done

say "Node.js"
node_major() { node -v 2>/dev/null | sed 's/^v//; s/\..*//'; }
# `|| true` matters: under `set -e` with pipefail, a command substitution whose
# pipeline fails aborts the script. Without it this exits 127 on exactly the
# machines this script exists to set up - the ones with no node installed.
CURRENT="$(node_major || true)"
if [ -n "$CURRENT" ] && [ "$CURRENT" -ge "$NODE_MIN_MAJOR" ] 2>/dev/null; then
  echo "Node v$(node -v | tr -d v) already present"
else
  # Prefer the distribution's own package. NodeSource does not always have a
  # repo up for a newly released Debian, and a failed third-party repo leaves
  # apt in a worse state than not adding it at all.
  APT_NODE="$(apt-cache policy nodejs 2>/dev/null | sed -n 's/.*Candidate: \([0-9]*\).*//p' || true)"
  if [ -n "$APT_NODE" ] && [ "$APT_NODE" -ge "$NODE_MIN_MAJOR" ] 2>/dev/null; then
    echo "installing nodejs ${APT_NODE}.x and npm from apt"
    sudo apt-get install -y -qq nodejs npm
  else
    echo "apt has no suitable Node (candidate: ${APT_NODE:-none}); falling back to NodeSource"
    curl -fsSL "https://deb.nodesource.com/setup_22.x" | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
fi
echo "node $(node -v 2>/dev/null || echo MISSING), npm $(npm -v 2>/dev/null || echo MISSING)"

say "Source"
if [ -d "$CHECKOUT/.git" ]; then
  git -C "$CHECKOUT" fetch --quiet origin
  git -C "$CHECKOUT" checkout --quiet "$BRANCH"
  git -C "$CHECKOUT" pull --ff-only --quiet
  echo "updated $CHECKOUT"
else
  git clone --quiet --branch "$BRANCH" "$REPO_URL" "$CHECKOUT"
  echo "cloned to $CHECKOUT"
fi

say "Runtime dependencies"
cd "$APP_DIR"
# --omit=dev skips vite, typescript and tsx: this box only ever runs compiled
# output, so pulling the toolchain onto it is wasted disk and wasted heat.
npm install --omit=dev --no-audit --no-fund

say "Configuration"
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  warn ".env created from the example - add your keys before the AI features work:"
  warn "  nano $APP_DIR/.env"
else
  echo ".env already present, leaving it alone"
fi

say "Database"
mkdir -p "$APP_DIR/data"
if [ -f "$APP_DIR/data/mirror-dashboard.sqlite" ]; then
  echo "database already exists, leaving it alone"
else
  npm run db:init
  warn "empty database. Restore a backup over it, or run 'npm run db:seed' for sample data."
fi

say "Service"
sudo tee "/etc/systemd/system/${SERVICE_NAME}.service" >/dev/null <<UNIT
[Unit]
Description=Mirror Dashboard
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=PORT=4174
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE_NAME}"
echo "installed ${SERVICE_NAME}.service"

say "Deploy permission"
# Lets the deploy script restart the dashboard without an interactive password.
# Scoped to this one command, so it grants nothing else.
SUDOERS="/etc/sudoers.d/${SERVICE_NAME}"
echo "${APP_USER} ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart ${SERVICE_NAME}, /bin/systemctl restart ${SERVICE_NAME}" \
  | sudo tee "$SUDOERS" >/dev/null
sudo chmod 0440 "$SUDOERS"
echo "deploys can now restart the service unattended"

say "Kiosk"
chmod +x "$APP_DIR/scripts/start-kiosk.sh"

# A real user unit rather than a transient systemd-run scope: transient units
# disappear once they exit, which previously left deploys unable to reload the
# browser. This one can be restarted by name at any time.
mkdir -p "$HOME/.config/systemd/user"
cat > "$HOME/.config/systemd/user/mirror-kiosk.service" <<KIOSK
[Unit]
Description=Mirror Dashboard kiosk browser
PartOf=graphical-session.target
After=graphical-session.target

[Service]
Type=simple
Environment=WAYLAND_DISPLAY=wayland-0
ExecStart=${APP_DIR}/scripts/start-kiosk.sh
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
KIOSK
systemctl --user daemon-reload
systemctl --user enable mirror-kiosk >/dev/null 2>&1 || true
echo "installed mirror-kiosk.service (user)"

# The desktop session starts it, so the kiosk survives a reboot.
mkdir -p "$HOME/.config/labwc"
AUTOSTART="$HOME/.config/labwc/autostart"
if ! grep -q "mirror-kiosk" "$AUTOSTART" 2>/dev/null; then
  cat >> "$AUTOSTART" <<AUTO
# Mirror dashboard kiosk
wlopm --on '*' >/dev/null 2>&1 &
systemctl --user start mirror-kiosk &
AUTO
  echo "kiosk will start with the desktop session"
else
  echo "kiosk autostart already configured"
fi

say "Starting"
sudo systemctl restart "${SERVICE_NAME}"
sleep 4
if curl -fsS -o /dev/null "http://localhost:4174/api/health"; then
  echo "dashboard is answering on http://localhost:4174"
else
  warn "service did not answer yet - check: journalctl -u ${SERVICE_NAME} -n 40"
fi

say "Done"
cat <<SUMMARY
Next steps:

  1. Add your keys:      nano ${APP_DIR}/.env
  2. Restore your data:  copy mirror-dashboard.sqlite into ${APP_DIR}/data/
     (or run: cd ${APP_DIR} && npm run db:seed)
  3. Restart:            sudo systemctl restart ${SERVICE_NAME}
  4. Reboot to confirm the kiosk comes up on its own.

From the dev machine, deploy with:  .\\scripts\\deploy.ps1
SUMMARY
