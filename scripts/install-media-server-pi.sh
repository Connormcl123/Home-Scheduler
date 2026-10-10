#!/usr/bin/env bash
# Installs a Jellyfin media server on the Raspberry Pi so the TV can stream
# movies over the home network. Optionally installs qBittorrent (headless,
# web UI) for downloading into the same library.
#
# Usage:
#   bash scripts/install-media-server-pi.sh [--media-root PATH] [--with-downloader]
#
# Defaults: media root /srv/media, no downloader.
set -euo pipefail

MEDIA_ROOT="/srv/media"
WITH_DOWNLOADER=false
QBT_WEBUI_PORT=8081 # MagicMirror already uses 8080.

while [[ $# -gt 0 ]]; do
  case "$1" in
    --media-root)
      MEDIA_ROOT="${2:?--media-root needs a path}"
      shift 2
      ;;
    --with-downloader)
      WITH_DOWNLOADER=true
      shift
      ;;
    -h|--help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$(dpkg --print-architecture)" != "arm64" ]]; then
  echo "Jellyfin needs the 64-bit Raspberry Pi OS (arm64). Reflash with the 64-bit image and rerun." >&2
  exit 1
fi

MEDIA_USER="${SUDO_USER:-$USER}"

echo "==> Creating media library at $MEDIA_ROOT"
sudo mkdir -p "$MEDIA_ROOT/Movies" "$MEDIA_ROOT/Shows" "$MEDIA_ROOT/Downloads"
sudo chown -R "$MEDIA_USER:$MEDIA_USER" "$MEDIA_ROOT"
sudo chmod -R u+rwX,go+rX "$MEDIA_ROOT"

echo "==> Installing Jellyfin from the official repository"
if ! command -v jellyfin >/dev/null 2>&1 && ! dpkg -s jellyfin >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y curl
  INSTALLER="$(mktemp)"
  curl -fsSL https://repo.jellyfin.org/install-debuntu.sh -o "$INSTALLER"
  sudo bash "$INSTALLER"
  rm -f "$INSTALLER"
else
  echo "    Jellyfin already installed, skipping."
fi

# Jellyfin runs as its own user; it needs read access to the library and
# write access if you want it to save artwork/subtitles next to the files.
sudo usermod -aG "$MEDIA_USER" jellyfin
sudo chmod -R g+rwX "$MEDIA_ROOT"
sudo systemctl enable --now jellyfin
sudo systemctl restart jellyfin

if [[ "$WITH_DOWNLOADER" == true ]]; then
  echo "==> Installing qBittorrent (headless web UI on port $QBT_WEBUI_PORT)"
  sudo apt-get install -y qbittorrent-nox

  QBT_CONF_DIR="/home/$MEDIA_USER/.config/qBittorrent"
  QBT_CONF="$QBT_CONF_DIR/qBittorrent.conf"
  if [[ ! -f "$QBT_CONF" ]]; then
    sudo -u "$MEDIA_USER" mkdir -p "$QBT_CONF_DIR"
    sudo -u "$MEDIA_USER" tee "$QBT_CONF" >/dev/null <<EOF
[LegalNotice]
Accepted=true

[BitTorrent]
Session\DefaultSavePath=$MEDIA_ROOT/Downloads

[Preferences]
Downloads\SavePath=$MEDIA_ROOT/Downloads
WebUI\Port=$QBT_WEBUI_PORT
EOF
  else
    echo "    Existing $QBT_CONF kept. Set the Web UI port to $QBT_WEBUI_PORT in its settings if needed."
  fi

  if [[ ! -f /lib/systemd/system/qbittorrent-nox@.service && ! -f /etc/systemd/system/qbittorrent-nox@.service ]]; then
    sudo tee /etc/systemd/system/qbittorrent-nox@.service >/dev/null <<'EOF'
[Unit]
Description=qBittorrent-nox for %i
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=%i
ExecStart=/usr/bin/qbittorrent-nox
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
    sudo systemctl daemon-reload
  fi
  sudo systemctl enable --now "qbittorrent-nox@$MEDIA_USER"
fi

PI_IP="$(hostname -I | awk '{print $1}')"
cat <<EOF

Done.

  Jellyfin:     http://$PI_IP:8096   (finish the setup wizard here)
    - Add a "Movies" library pointing at $MEDIA_ROOT/Movies
    - Add a "Shows" library pointing at $MEDIA_ROOT/Shows
EOF

if [[ "$WITH_DOWNLOADER" == true ]]; then
  cat <<EOF
  qBittorrent:  http://$PI_IP:$QBT_WEBUI_PORT
    - Login: admin. Newer versions print a temporary password with:
        journalctl -u qbittorrent-nox@$MEDIA_USER | grep -i password
      Older versions use the password: adminadmin
    - Change the password in Tools > Options > Web UI right away.
    - Finished downloads land in $MEDIA_ROOT/Downloads; move movies into
      $MEDIA_ROOT/Movies so Jellyfin picks them up.
EOF
fi

cat <<EOF

On the TV: install the Jellyfin app, enter http://$PI_IP:8096 as the server.
See docs/media-server.md for TV, storage, and 4K tips.
EOF
