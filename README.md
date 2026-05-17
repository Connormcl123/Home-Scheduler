# Home Scheduler

A touch-friendly Magic Mirror style dashboard for a Raspberry Pi 3 Model B+.

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

## Raspberry Pi Direction

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

Start MagicMirror:

```bash
cd ~/MagicMirror
npm run start
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

The Pi target can also run the standalone prototype in Chromium kiosk mode:

```bash
chromium-browser --kiosk http://localhost:4173
```

Later steps:

1. Connect MagicMirror's default calendar module or add Google Calendar OAuth to `MMM-HomeScheduler`.
2. Replace placeholder weather with MagicMirror's default weather module or a provider API.
3. Add a photo folder setting that persists on the Pi.
4. Add offline caching so the mirror still looks useful when the network is down.
