# Home Scheduler

A touch-friendly Magic Mirror style dashboard for a Raspberry Pi 4 Model B running Raspberry Pi OS with the full desktop over HDMI.

## First Working Slice

This version is intentionally local and dependency-free so it can be tested on this machine before moving to the Pi.

- Swipe between Calendar, Weather, Notes, and Photos panels.
- Add and remove local calendar events.
- Add and remove weekly notes.
- Choose a local photo album folder in Chromium-based browsers.
- Idle mode automatically moves to the Photos panel after 45 seconds.

## Run Locally

Open `index.html` directly in a browser for a quick look, or serve the folder for the full test path.

On Windows, use the included launcher:

```powershell
.\start-mirror.ps1
```

If PowerShell blocks scripts, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-mirror.ps1
```

If Node.js is installed and available on your PATH, this also works:

```powershell
node server.js
```

Then visit `http://localhost:4173`.

The album folder picker requires a Chromium-based browser and works best from `http://localhost:4173`.

## Raspberry Pi 4 Direction

Target setup:

- Raspberry Pi 4 Model B
- Raspberry Pi OS with desktop
- HDMI display attached to the Pi
- SSH from a laptop for installation and maintenance
- MagicMirror displayed on the Pi's physical HDMI screen

This repo now supports two paths:

- `index.html`, `app.js`, and `styles.css` are the standalone prototype for quick local testing.
- `magicmirror/modules/MMM-HomeScheduler` is the real MagicMirror module we will build on.

## MagicMirror Setup

On the Raspberry Pi, clone this repo and run the installer:

```bash
git clone https://github.com/Connormcl123/Home-Scheduler.git
cd Home-Scheduler
bash scripts/install-magicmirror-pi.sh
```

The script installs the official MagicMirror repo at `~/MagicMirror`, copies `MMM-HomeScheduler` into `~/MagicMirror/modules`, and creates `~/MagicMirror/config/config.js` if one does not exist.

It also installs these companion modules:

- `MMM-CalendarExt3` for richer week/month calendar views.
- `MMM-GooglePhotos` for Google Photos album rotation.
- `MMM-Random-local-image` for local photo folders.
- `MMM-Remote-Control` for browser-based mirror management.

The sample config includes default `calendar`, `weather`, and `newsfeed` modules too. Modules that need API keys, OAuth, or private calendar URLs are present but disabled until configured.
The no-credential modules are enabled by default: `calendar`, `MMM-CalendarExt3`, `newsfeed`, `MMM-Random-local-image`, `MMM-Remote-Control`, and `MMM-HomeScheduler`.
The primary config keeps `MMM-HomeScheduler` as the only full-screen visual layer. CalendarExt3, newsfeed, and local image modules are installed and configured, but duplicate visual modules are disabled when they would sit behind the scheduler. The default `calendar` module still feeds events into `MMM-HomeScheduler`.

There is also a module-demo config at:

```text
magicmirror/config/config.modules-demo.js
```

Use that only when you want to test the third-party modules directly without the HomeScheduler full-screen interface.

For smaller HDMI touchscreens, set the scheduler to compact mode in `~/MagicMirror/config/config.js`:

```js
{
  module: "MMM-HomeScheduler",
  position: "fullscreen_above",
  config: {
    title: "Home Scheduler",
    displayMode: "compact"
  }
}
```

Use `displayMode: "auto"` to let CSS compact the view based on screen size.

Put local family photos in:

```bash
~/MagicMirror/photos
```

Weather turns on automatically when `OPENWEATHER_API_KEY` is set before starting MagicMirror:

```bash
export OPENWEATHER_API_KEY="your-api-key"
export MIRROR_WEATHER_LOCATION="Your City"
cd ~/MagicMirror
npm run start
```

Google Photos stays off until `GOOGLE_PHOTOS_ALBUMS` is set and the module's OAuth setup has been completed.

## Google Calendar Editing

The mirror can display Google Calendar events through the default MagicMirror `calendar` module using a private iCal URL. To create, move, resize, and delete events from the touchscreen and sync them back into Google Calendar, enable the `MMM-HomeScheduler` Google Calendar API helper.

1. In Google Cloud, create OAuth credentials with application type `Desktop app`.
2. Copy the downloaded JSON to the Pi:

```bash
mkdir -p ~/Home-Scheduler/secrets
cp ~/Downloads/YOUR_GOOGLE_CLIENT_JSON.json ~/Home-Scheduler/secrets/google-calendar-credentials.json
```

3. Install/update the module dependencies:

```bash
cd ~/Home-Scheduler
git pull
bash scripts/install-magicmirror-pi.sh
```

4. Run the one-time authorization:

```bash
cd ~/MagicMirror/modules/MMM-HomeScheduler
node ~/Home-Scheduler/scripts/authorize-google-calendar.js
```

Follow the URL shown in the terminal, approve access, and let the script save `~/Home-Scheduler/secrets/google-calendar-token.json`.

5. Enable Google sync in `~/MagicMirror/config/config.js`:

```js
googleCalendar: {
  enabled: true,
  calendarId: "primary",
  credentialsPath: "Home-Scheduler/secrets/google-calendar-credentials.json",
  tokenPath: "Home-Scheduler/secrets/google-calendar-token.json",
  timeZone: "America/New_York"
}
```

6. Restart MagicMirror:

```bash
cd ~/MagicMirror
node --run start:x11
```

Touch-created, moved, resized, and deleted local events will then sync to Google Calendar.

If MagicMirror already exists and you want this repo's base config to replace the current MagicMirror config, run:

```bash
bash scripts/install-magicmirror-pi.sh --replace-config
```

The script backs up the previous config first. The module folder is replaced on every install so updates from this repo are applied cleanly.

After editing `~/MagicMirror/config/config.js`, enable modules by changing `disabled: true` to `disabled: false` or removing the `disabled` line.

If a third-party module install fails with a corrupted Git submodule error, remove that module and rerun the installer:

```bash
rm -rf ~/MagicMirror/modules/MMM-CalendarExt3
bash scripts/install-magicmirror-pi.sh --replace-config
```

Start MagicMirror:

```bash
cd ~/MagicMirror
npm run start
```

When starting MagicMirror from SSH but displaying it on the Pi HDMI desktop, use:

```bash
cd ~/Home-Scheduler
bash scripts/start-magicmirror-hdmi.sh
```

If Electron has trouble with the Pi desktop display backend, force one explicitly:

```bash
bash scripts/start-magicmirror-hdmi.sh wayland
bash scripts/start-magicmirror-hdmi.sh x11
```

On Raspberry Pi OS with X11, MagicMirror should be launched with `node --run start:x11`. On Wayland, use `node --run start:wayland`.

To stop the HDMI display from sleeping or blanking on Raspberry Pi OS:

```bash
cd ~/Home-Scheduler
bash scripts/disable-pi-display-sleep.sh
sudo reboot
```

For local development against MagicMirror on another machine, copy:

```text
magicmirror/modules/MMM-HomeScheduler
```

into:

```text
MagicMirror/modules/MMM-HomeScheduler
```

Then add this module to `MagicMirror/config/config.js`:

```js
{
  module: "MMM-HomeScheduler",
  position: "fullscreen_above",
  config: {
    title: "Home Scheduler"
  }
}
```

## Standalone Prototype

The standalone prototype can still run without MagicMirror:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-mirror.ps1
```

Then visit `http://localhost:4173`.

The Pi 4 target can also run the standalone prototype in Chromium kiosk mode:

```bash
chromium-browser --kiosk http://localhost:4173
```

Later steps:

1. Connect MagicMirror's default calendar module or add Google Calendar OAuth to `MMM-HomeScheduler`.
2. Replace placeholder weather with MagicMirror's default weather module or a provider API.
3. Add a photo folder setting that persists on the Pi.
4. Add offline caching so the mirror still looks useful when the network is down.
