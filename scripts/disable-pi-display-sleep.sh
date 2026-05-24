#!/usr/bin/env bash
set -euo pipefail

USER_HOME="${HOME}"
AUTOSTART_DIR="$USER_HOME/.config/lxsession/LXDE-pi"
AUTOSTART_FILE="$AUTOSTART_DIR/autostart"
XPROFILE_FILE="$USER_HOME/.xprofile"

mkdir -p "$AUTOSTART_DIR"
touch "$AUTOSTART_FILE"
touch "$XPROFILE_FILE"

add_line_once() {
  local file="$1"
  local line="$2"

  if ! grep -Fxq "$line" "$file"; then
    printf '%s\n' "$line" >> "$file"
  fi
}

add_line_once "$AUTOSTART_FILE" "@xset s off"
add_line_once "$AUTOSTART_FILE" "@xset -dpms"
add_line_once "$AUTOSTART_FILE" "@xset s noblank"

add_line_once "$XPROFILE_FILE" "xset s off"
add_line_once "$XPROFILE_FILE" "xset -dpms"
add_line_once "$XPROFILE_FILE" "xset s noblank"

if command -v xset >/dev/null 2>&1; then
  export DISPLAY="${DISPLAY:-:0}"
  xset s off || true
  xset -dpms || true
  xset s noblank || true
fi

if command -v gsettings >/dev/null 2>&1; then
  gsettings set org.gnome.desktop.session idle-delay 0 >/dev/null 2>&1 || true
  gsettings set org.gnome.desktop.screensaver lock-enabled false >/dev/null 2>&1 || true
fi

echo "Pi display sleep/blanking has been disabled for the current user."
echo "Reboot the Pi or log out/in for startup settings to fully apply."
