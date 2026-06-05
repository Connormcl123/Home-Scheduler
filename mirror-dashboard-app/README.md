# Mirror Dashboard App

Standalone touchscreen family command-center dashboard inspired by the existing MagicMirror prototype. MagicMirror remains untouched; this app is a new React, Express, and SQLite runtime intended for Raspberry Pi OS and Chromium kiosk mode.

## Structure

```text
mirror-dashboard-app/
  client/   React + Vite + TypeScript + Tailwind
  server/   Express + TypeScript + SQLite + provider services
  shared/   Shared TypeScript types
  scripts/  Raspberry Pi service and kiosk examples
```

## Local Development

```bash
cd mirror-dashboard-app
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite client proxies API calls to the Express server on `http://localhost:4174`.

Useful checks:

```bash
npm run db:init
npm run typecheck
npm run build
curl http://localhost:4174/api/health
```

## Configuration

Copy `.env.example` to `.env` and adjust values:

```bash
cp .env.example .env
```

Important settings:

- `ICAL_FEED_URL`: private iCal URL for the first calendar integration.
- `WEATHER_LATITUDE`, `WEATHER_LONGITUDE`, `WEATHER_TIMEZONE`: Open-Meteo location.
- `DEFAULT_RSS_FEEDS`: comma-separated RSS feed URLs.
- `FINANCE_WATCHLIST`: comma-separated ticker symbols.
- `FINANCE_PROVIDER`: currently `yahoo` for testing through the isolated provider interface.

When values are missing or providers fail, the app uses demo data so the UI is still testable.

## API

Implemented endpoints:

- `GET /api/health`
- `GET /api/dashboard`
- `GET /api/calendar/events`
- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks/:id`
- `DELETE /api/tasks/:id`
- `GET /api/notes/today`
- `GET /api/notes/:date`
- `POST /api/notes`
- `GET /api/weather`
- `GET /api/news`
- `GET /api/finance/summary`
- `GET /api/settings`
- `PATCH /api/settings`

## Production Build

```bash
cd mirror-dashboard-app
npm install
npm run build
npm run start
```

The Express server serves the built React client from `client/dist`.

## Raspberry Pi Deployment

Recommended target:

- Raspberry Pi 4B
- 4GB minimum, 8GB preferred
- Raspberry Pi OS
- HDMI touchscreen in landscape orientation

Example first setup:

```bash
cd ~/Home-Scheduler
git pull
cd mirror-dashboard-app
npm install
cp .env.example .env
npm run build
npm run start
```

Then open Chromium on the Pi:

```bash
chromium-browser --kiosk --noerrdialogs --disable-infobars http://localhost:4174
```

The helper script at `scripts/start-kiosk.sh` also disables screen blanking for kiosk use.

## systemd Service Example

Edit `scripts/mirror-dashboard.service` so `WorkingDirectory` and `User` match your Pi, then:

```bash
sudo cp scripts/mirror-dashboard.service /etc/systemd/system/mirror-dashboard.service
sudo systemctl daemon-reload
sudo systemctl enable mirror-dashboard
sudo systemctl start mirror-dashboard
sudo systemctl status mirror-dashboard
```

## Next Implementation Passes

- Add touchscreen create/edit forms for tasks and notes.
- Add calendar detail pages and event creation.
- Add Google Calendar API write support behind the calendar service layer.
- Add finance settings and a reliable paid finance provider behind `server/src/services/finance/FinanceProvider.ts`.
- Add reader panel behavior for news links.
