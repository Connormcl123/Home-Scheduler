#!/usr/bin/env bash
# First-boot setup for a fresh Raspberry Pi OS Lite (64-bit) media box
# (Pi 4 or CM4). Updates the OS, enables CM4 IO board USB, and installs
# Jellyfin via install-media-server-pi.sh. Reboots at the end if needed.
#
# Usage (on the box):
#   bash ~/Home-Scheduler/scripts/setup-mediabox.sh [--media-root PATH]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEDIA_ROOT="/srv/media"
if [[ "${1:-}" == "--media-root" ]]; then
  MEDIA_ROOT="${2:?--media-root needs a path}"
fi

CONFIG_TXT="/boot/firmware/config.txt"
[[ -f "$CONFIG_TXT" ]] || CONFIG_TXT="/boot/config.txt"
MODEL="$(tr -d '\0' </proc/device-tree/model 2>/dev/null || echo unknown)"
NEEDS_REBOOT=false

echo "==> Device: $MODEL"
echo "==> Architecture: $(dpkg --print-architecture)"
free -h | awk 'NR==2 {print "==> RAM: " $2}'

echo "==> Updating the OS (this can take a while)"
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get full-upgrade -y
sudo apt-get install -y git curl

if [[ "$MODEL" == *"Compute Module 4"* ]]; then
  if ! grep -q '^dtoverlay=dwc2,dr_mode=host' "$CONFIG_TXT"; then
    echo "==> Enabling USB ports on the CM4 IO board"
    printf '\n[all]\ndtoverlay=dwc2,dr_mode=host\n' | sudo tee -a "$CONFIG_TXT" >/dev/null
    NEEDS_REBOOT=true
  fi
fi

if [[ -f /var/run/reboot-required ]]; then
  NEEDS_REBOOT=true
fi

if ! mountpoint -q "$MEDIA_ROOT"; then
  echo
  echo "NOTE: $MEDIA_ROOT is not a mounted drive yet, so movies will go on the"
  echo "      eMMC/SD card for now. Mount a USB/SATA drive there later; see"
  echo "      docs/media-server.md step 1."
  echo
fi

bash "$SCRIPT_DIR/install-media-server-pi.sh" --media-root "$MEDIA_ROOT"

if [[ "$NEEDS_REBOOT" == true ]]; then
  echo "==> Rebooting in 10 seconds to apply updates/USB settings (Ctrl+C to cancel)"
  sleep 10
  sudo reboot
fi
