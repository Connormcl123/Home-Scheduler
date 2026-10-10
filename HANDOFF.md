# Handoff: Mediabox (CM4 movie server)

Handoff from the cloud Claude session so work can continue on the Windows PC, which can SSH to the box directly. The cloud session could never reach the box, so **none of the Pi-side state below has been confirmed**. Check it first.

## Goal

Turn a Raspberry Pi Compute Module 4 (on the official CM4 IO Board) into a dedicated home movie server:

- **Jellyfin** serves the library. The TV streams it over Wi-Fi with the Jellyfin TV app (DLNA is the fallback).
- **qBittorrent** downloads into the library, routed through a **Gluetun** VPN container with a kill switch.
- The separate **Pi 4B** stays dedicated to MagicMirror (the rest of this repo) and is not part of the media setup.

## The box

| | |
| --- | --- |
| Hardware | Raspberry Pi CM4 on the CM4 IO Board (PCIe x1, gigabit Ethernet, USB 2 only, 12 V barrel power, fan header J17) |
| Hostname | `mediabox` (`mediabox.local` via mDNS) |
| IP | Unknown. Check the router's device list, or run `ping mediabox.local` |
| SSH user | `connor` (password set in Raspberry Pi Imager; not stored here) |
| OS | Freshly flashed **Raspberry Pi OS Lite (64-bit)** via rpiboot + Raspberry Pi Imager, SSH enabled |
| Storage | Built-in eMMC or SD card. No media drive attached or mounted yet |

## State on the box

**Confirmed:** the user flashed the OS and booted it. Nothing else has been confirmed.

**Possibly done:** the user was given the bootstrap command below, but it isn't known whether they ran it or whether it succeeded. Check with:

```bash
ssh connor@mediabox.local
ls ~/Home-Scheduler                                  # repo cloned?
grep dwc2 /boot/firmware/config.txt                  # CM4 USB enabled?
systemctl status jellyfin                            # Jellyfin installed/running?
ls /srv/media                                        # Movies/ Shows/ Downloads/ ?
```

If the bootstrap ran, the box will have:

| What | Where / port |
| --- | --- |
| OS fully upgraded; `git`, `curl` installed | |
| CM4 USB enabled: `dtoverlay=dwc2,dr_mode=host` under `[all]` | `/boot/firmware/config.txt` |
| Jellyfin (official repo, systemd `jellyfin`, enabled at boot) | http://mediabox.local:8096 |
| Jellyfin user added to group `connor` | |
| Media folders owned by `connor` | `/srv/media/{Movies,Shows,Downloads}` |

Not installed yet: Docker, Gluetun, qBittorrent, Samba, Tailscale.

## Ports

| Port | Service | Notes |
| --- | --- | --- |
| 22 | SSH | |
| 8096 | Jellyfin | LAN only; never port-forward |
| 8081 | qBittorrent web UI (via Gluetun) | 8081 because MagicMirror uses 8080 on the Pi 4B; kept the same here for consistency |

## Files in this repo

| File | Purpose |
| --- | --- |
| `scripts/setup-mediabox.sh` | First-boot setup: OS upgrade, CM4 USB overlay, runs the Jellyfin installer, reboots if needed |
| `scripts/install-media-server-pi.sh` | Jellyfin install and media folders. `--with-downloader` installs native qBittorrent, which **should not be used**; use the Gluetun compose file instead |
| `config/torrent/docker-compose.yml` | Gluetun and qBittorrent with a VPN kill switch |
| `config/torrent/.env.example` | Placeholder VPN settings. Copy to `.env` (git-ignored) |
| `docs/media-server.md` | Full guide: drive setup, getting media in, TV options, direct-play tips |

Everything is on branch `claude/raspi-movie-streaming-tv-mo1xjx` (not merged to `main`).

## Commands to run, in order

Run each from the Windows PC (PowerShell) unless noted.

1. **Bootstrap.** Skip this if the checks above show it's done.
   ```powershell
   ssh -t connor@mediabox.local "sudo apt-get update && sudo apt-get install -y git && git clone -b claude/raspi-movie-streaming-tv-mo1xjx https://github.com/Connormcl123/Home-Scheduler.git ~/Home-Scheduler && bash ~/Home-Scheduler/scripts/setup-mediabox.sh"
   ```
   If `~/Home-Scheduler` already exists, run `cd ~/Home-Scheduler && git pull && bash scripts/setup-mediabox.sh` instead.
2. **Optional: passwordless SSH.** In PowerShell, run `type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh connor@mediabox.local "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"`. Generate a key with `ssh-keygen -t ed25519` first if there isn't one.
3. **Jellyfin wizard.** Open http://mediabox.local:8096 in a browser, create the admin user, and add libraries `Movies` → `/srv/media/Movies` and `Shows` → `/srv/media/Shows`.
4. **Media drive.** Do this when the drive is attached. Formatting **erases** the drive, so confirm the device name with the user.
   ```bash
   lsblk -f
   sudo mkfs.ext4 -L media /dev/sdX1
   echo 'LABEL=media  /srv/media  ext4  defaults,nofail,noatime  0  2' | sudo tee -a /etc/fstab
   sudo mount -a && sudo mkdir -p /srv/media/{Movies,Shows,Downloads} && sudo chown -R connor:connor /srv/media
   sudo systemctl restart jellyfin
   ```
   If Jellyfin was set up before the drive was mounted, anything already in `/srv/media` on the eMMC will be hidden under the mount. Move it first.
5. **VPN and qBittorrent.** Do this after the user picks a VPN provider that supports WireGuard and port forwarding, such as ProtonVPN, AirVPN or PIA.
   ```bash
   curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker connor   # log out and back in
   cd ~/Home-Scheduler/config/torrent && cp .env.example .env && nano .env      # real key goes here only
   docker compose up -d
   docker logs gluetun | tail                       # VPN up + forwarded port
   docker logs qbittorrent | grep -i password       # temp web UI password
   ```
   Then, at http://mediabox.local:8081:
   - change the password
   - set the listening port to Gluetun's forwarded port
   - turn UPnP off
   - set encryption to "Require"
   - save to `/downloads`

   Verify with a torrent IP leak test; it should show the VPN's IP. Test the kill switch: run `docker stop gluetun` and confirm downloads stop.
6. **TV.** Install the Jellyfin app and set the server to `http://mediabox.local:8096`, or use the IP if the TV can't resolve `.local`.

## Blocker

Nothing is known to be failing. The open question is the box's real state, because the cloud session couldn't SSH in. Run the checks under "State on the box" first.

Earlier GitHub push 403s are resolved; pushes to this repo work now.

## Next steps

1. Check the box's state and run step 1 if needed.
2. Finish the Jellyfin wizard (step 3) and test playback on the TV with a sample file. Blender's open movies, such as *Tears of Steel* in 4K, are free and good for testing direct play.
3. Choose and buy storage: a USB SSD/HDD, or a PCIe SATA/NVMe card checked against Jeff Geerling's Pi PCIe database. Then do step 4.
4. Choose a VPN provider, then do step 5.
5. Optional: Samba share for drag-and-drop from Windows, and Tailscale for remote access (see `docs/media-server.md`).
6. Optional: add a CM4 section to `docs/media-server.md`, and open a PR to merge this branch into `main`.

Keep secrets (VPN keys, passwords) out of the repo. `.env` and `secrets/` are git-ignored.
