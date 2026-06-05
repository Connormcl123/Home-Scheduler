# Mirror Dashboard App

Standalone touchscreen family command-center dashboard inspired by the existing MagicMirror prototype. MagicMirror remains untouched; this app is a new React, Express, and SQLite runtime intended for Raspberry Pi OS and Chromium kiosk mode.

This branch is Phase 2. Calendar, weather, news, and finance still use mock placeholder adapters, while tasks, daily notes, RSS feed list storage, and finance watchlist storage are editable through the local touchscreen UI and SQLite API.

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

Phase 1 settings are placeholders:

- `ICAL_FEED_URL`: reserved for a future iCal calendar adapter.
- `WEATHER_LATITUDE`, `WEATHER_LONGITUDE`, `WEATHER_TIMEZONE`: reserved for a future weather adapter.
- `DEFAULT_RSS_FEEDS`: reserved for a future RSS adapter.
- `FINANCE_WATCHLIST`: used by the mock finance provider to shape placeholder cards.
- `FINANCE_PROVIDER`: keep as `mock` in Phase 1.

External provider data intentionally remains mocked in Phase 2.

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
- `GET /api/notes`
- `GET /api/notes/:date`
- `POST /api/notes`
- `PATCH /api/notes/:date`
- `DELETE /api/notes/:date`
- `GET /api/weather`
- `GET /api/news`
- `GET /api/finance/summary`
- `GET /api/settings`
- `PATCH /api/settings`
- `GET /api/rss-feeds`
- `POST /api/rss-feeds`
- `PATCH /api/rss-feeds/:id`
- `DELETE /api/rss-feeds/:id`
- `GET /api/finance/watchlist`
- `POST /api/finance/watchlist`
- `PATCH /api/finance/watchlist/:id`
- `DELETE /api/finance/watchlist/:id`

## Local Storage Examples

Create a task:

```bash
curl -X POST http://localhost:4174/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Take trash out","dueDate":"2026-06-05","priority":"normal"}'
```

Create or update a daily note:

```bash
curl -X POST http://localhost:4174/api/notes \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-06-05","body":"Dinner at 6 and budget review after."}'
```

Add an RSS feed to local storage:

```bash
curl -X POST http://localhost:4174/api/rss-feeds \
  -H "Content-Type: application/json" \
  -d '{"title":"NPR","url":"https://feeds.npr.org/1001/rss.xml"}'
```

Add a finance watchlist symbol to local storage:

```bash
curl -X POST http://localhost:4174/api/finance/watchlist \
  -H "Content-Type: application/json" \
  -d '{"symbol":"SPY"}'
```

## Phase 2 Touchscreen Features

- Create, complete, reprioritize, and delete local tasks.
- Create, edit, browse, and delete daily notes by date.
- Add, enable/disable, and delete RSS feed records.
- Add, enable/disable, and delete finance watchlist symbols.
- Refresh the home dashboard after local storage changes.

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
chromium --kiosk --noerrdialogs --disable-infobars http://localhost:4174
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

- Add weekly calendar view matching the MagicMirror family calendar reference.
- Add iCal feeds for Google Calendar and iPhone/iCloud calendars.
- Add Open-Meteo weather adapter.
- Add RSS news adapter and reader panel behavior.
- Add finance settings and a reliable paid finance provider behind `server/src/services/finance/FinanceProvider.ts`.
