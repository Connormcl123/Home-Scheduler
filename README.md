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

The Pi target should run Chromium in kiosk mode once the app is ready:

```bash
chromium-browser --kiosk http://localhost:4173
```

Later steps:

1. Add a small backend service for Google Calendar OAuth and Apple Calendar ICS subscriptions.
2. Replace placeholder weather with a weather provider API.
3. Add a photo folder setting that persists on the Pi.
4. Add offline caching so the mirror still looks useful when the network is down.
