# Pi Movie Server (Jellyfin)

Turns the Raspberry Pi 4 into a home movie server that the TV streams from over Wi-Fi. It runs in the background next to MagicMirror and doesn't use the Pi's HDMI screen.

```text
 [ Downloads / your own rips ]
              │
              ▼
   Pi 4 ── USB 3 drive (/srv/media)
     │  Jellyfin server :8096
     │  (qBittorrent :8081, optional)
     │
  Ethernet (best) or Wi-Fi
     │
     ▼
   Router ── Wi-Fi ──► TV (Jellyfin app, or DLNA)
```

## What you need

| Item | Why |
| --- | --- |
| Raspberry Pi OS **64-bit** (Bookworm or newer) | Current Jellyfin releases only ship arm64 builds. Check with `dpkg --print-architecture`. It should print `arm64`. |
| USB 3 SSD or hard drive (powered, if it's a 3.5" HDD) | A 1080p movie is 2–10 GB, a 4K remux is 40–80 GB. The SD card is too small and too slow. Use the **blue** USB 3 ports. |
| Ethernet cable from Pi to router (strongly recommended) | Pi 4 Wi-Fi gets roughly 40–100 Mbps in practice. A 4K remux can peak above that. Wired gigabit avoids buffering. |
| TV with a Jellyfin app, or a streaming stick | Covered below. |

## 1. Prepare the drive

Format the drive as **ext4** (exFAT/NTFS work but are slower and handle permissions badly), then mount it at `/srv/media` permanently:

```bash
lsblk -f                         # find the drive, e.g. /dev/sda1, and its UUID
sudo mkfs.ext4 -L media /dev/sda1   # ERASES the drive; skip if already ext4
sudo mkdir -p /srv/media
echo 'LABEL=media  /srv/media  ext4  defaults,nofail,noatime  0  2' | sudo tee -a /etc/fstab
sudo mount -a
```

`nofail` keeps the Pi booting even if the drive is unplugged.

## 2. Install Jellyfin (and optionally a downloader)

```bash
cd ~/Home-Scheduler
git pull
bash scripts/install-media-server-pi.sh                    # Jellyfin only
bash scripts/install-media-server-pi.sh --with-downloader  # + qBittorrent web UI
```

Use `--media-root /some/path` if you mounted the drive somewhere other than `/srv/media`.

The script:

- creates `Movies/`, `Shows/`, and `Downloads/` under the media root
- installs Jellyfin from the official Jellyfin apt repo and starts it at boot
- with `--with-downloader`, installs `qbittorrent-nox` with its web UI on port **8081** (MagicMirror already uses 8080) and saves into `Downloads/`

Then open `http://<pi-ip>:8096` from a laptop or phone, finish the setup wizard, and add:

- a **Movies** library → `/srv/media/Movies`
- a **Shows** library → `/srv/media/Shows`

Name files the way Jellyfin expects so it fetches posters and metadata:

```text
/srv/media/Movies/The Matrix (1999)/The Matrix (1999).mkv
/srv/media/Shows/Planet Earth (2006)/Season 01/Planet Earth S01E01.mkv
```

## 3. Get movies onto the Pi

Use content you have the rights to:

- **Your own discs:** rip Blu-rays/DVDs on a PC with MakeMKV (lossless `.mkv`, best quality), optionally shrink with HandBrake, then copy to the Pi.
- **DRM-free purchases and free legal sources:** Internet Archive, public-domain films, creator-released films, and stores that sell DRM-free downloads.
- **Legal torrents:** many of the free sources above publish torrents. Paste the magnet link into qBittorrent at `http://<pi-ip>:8081`.

Note: movies bought on Apple TV, Prime, Disney+, Netflix, etc. are DRM-locked and can't be downloaded into Jellyfin. Keep watching those in the TV's own apps.

Copy files from a PC without touching the terminal by sharing the folder over SMB:

```bash
sudo apt-get install -y samba
sudo tee -a /etc/samba/smb.conf >/dev/null <<EOF

[media]
   path = /srv/media
   read only = no
   valid users = $USER
EOF
sudo smbpasswd -a "$USER"
sudo systemctl restart smbd
```

Then open `\\<pi-ip>\media` in Windows Explorer (or `smb://<pi-ip>/media` on a Mac) and drag files in. Jellyfin picks up new files automatically. If one doesn't show up, use **Dashboard → Libraries → Scan All Libraries**.

## 4. Watch on the TV

### Option A: wireless with the Jellyfin app (recommended)

Install **Jellyfin** from the TV's app store, enter `http://<pi-ip>:8096`, and log in. Apps exist for:

- Android TV / Google TV / Fire TV / NVIDIA Shield: best support, direct-plays almost everything including 4K HDR
- LG webOS and Samsung Tizen (newer TVs). On Samsung, install via the store if listed, otherwise see the Jellyfin Tizen project.
- Roku and Apple TV (Swiftfin or Infuse)

If the TV's built-in app is limited, a ~$30–50 Google TV / Fire TV 4K stick is the most reliable upgrade.

### Option B: no app, using DLNA

Most smart TVs can play from a DLNA media server in their **Sources / Media Player / USB-and-network** menu. In Jellyfin, open **Dashboard → Plugins → Catalog**, install **DLNA**, restart Jellyfin, and the Pi shows up on the TV. DLNA has no resume, subtitles are hit-or-miss, and format support depends on the TV. It's fine as a fallback.

### Option C: HDMI cable from the Pi to the TV

Possible, but it competes with MagicMirror for the Pi's screen. Install Kodi (`sudo apt-get install kodi`), add the **Jellyfin for Kodi** add-on, and stop MagicMirror while watching. Kodi on a Pi 4 hardware-decodes H.264 up to 1080p and HEVC (H.265) up to 4K. Use Option A unless the TV can't run any app.

## Keeping it high quality: direct play

The Pi 4 is a good **file server** but a weak **transcoder**. Jellyfin no longer supports Pi hardware transcoding, and the CPU can't convert 4K in real time. Quality and smoothness depend on the TV playing the original file as-is (**direct play**):

- Prefer `.mkv`/`.mp4` with **H.264 or HEVC** video and **AAC / AC3 / E-AC3** audio. Nearly every TV app direct-plays these.
- In the Jellyfin TV app, set **Max streaming bitrate** to the maximum / "Auto" so it doesn't downscale.
- If a movie stutters and the Jellyfin dashboard shows **Transcoding**, the TV can't handle that format. Re-encode it once on a PC with HandBrake (H.265, AAC), or use a streaming stick that supports it.
- Image subtitles (PGS from Blu-ray rips) can force transcoding on some clients. Use SRT subtitles or turn subtitles off to test.
- Rough bitrates: 1080p encode 5–15 Mbps (fine on Wi-Fi), 4K encode 15–40 Mbps (5 GHz Wi-Fi or wired), 4K remux 50–100 Mbps (wire the Pi, and ideally the TV).

## Coexisting with MagicMirror

- Jellyfin and qBittorrent run as background services and don't draw on the HDMI screen.
- Ports: MagicMirror 8080, qBittorrent 8081, Jellyfin 8096.
- A Pi 4 with 2 GB RAM or more handles both. On a 1 GB model, skip the downloader.
- Keep the Pi cooled (heatsink/fan case). Long downloads and library scans run warm.

## Useful commands

```bash
sudo systemctl status jellyfin
sudo systemctl restart jellyfin
journalctl -u jellyfin -f
sudo systemctl status qbittorrent-nox@$USER
df -h /srv/media          # free space
```

## Optional: watch away from home

Don't port-forward 8096 on the router. Install **Tailscale** on the Pi and your phone/laptop (`curl -fsSL https://tailscale.com/install.sh | sh`, then `sudo tailscale up`) and use the Pi's Tailscale IP in the Jellyfin app.
