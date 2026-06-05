# Mirror Dashboard App

Standalone touchscreen family command-center dashboard inspired by the existing MagicMirror prototype. MagicMirror remains untouched; this app is a new React, Express, and SQLite runtime intended for Raspberry Pi OS and Chromium kiosk mode.

This branch is Phase 3. Calendar, weather, news, and finance now have first-pass read providers with mock fallbacks, while tasks, daily notes, RSS feed list storage, and finance watchlist storage are editable through the local touchscreen UI and SQLite API.

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

Open `http://localhost:5174`. The Vite client proxies API calls to the Express server on `http://localhost:4174`.

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

- `ICAL_FEED_URL`: private iCal URL for Google Calendar secret iCal links or iCloud published calendars.
- `WEATHER_LATITUDE`, `WEATHER_LONGITUDE`, `WEATHER_TIMEZONE`: Open-Meteo location.
- `DEFAULT_RSS_FEEDS`: comma-separated RSS feed URLs.
- `FINANCE_WATCHLIST`: used by the mock finance provider to shape placeholder cards.
- `FINANCE_PROVIDER`: `yahoo` for the unofficial test provider, or `mock` for local-only testing.

All Phase 3 providers fall back to mock data when a feed, network call, or quote lookup fails.

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
- Weekly calendar board with days across the top, AM/PM time slots down the side, and local drag/resize behavior for mock events.
- Calendar page uses a Skylight-inspired family organizer layout with a top view selector, today summary rail, color-coded calendar/profile chips, and a wide weekly schedule board.
- Calendar view selector now switches between Day, Week, Month, and Schedule panels, and `+ Event` opens a touch-friendly local event form.

Calendar drag/resize is currently UI-only against mock events. The next calendar phase should persist event changes through iCal/Google-compatible calendar services.

## Phase 3 Providers

- Calendar reads from `ICAL_FEED_URL` when configured. Use a Google Calendar secret iCal address or an iCloud published calendar URL.
- Weather reads from Open-Meteo using the configured latitude, longitude, and timezone.
- News reads RSS feeds from the local feed storage table, falling back to `DEFAULT_RSS_FEEDS`.
- Finance reads the local watchlist symbols and uses `FINANCE_PROVIDER=yahoo` for the unofficial test provider.

Provider data is read-only in this phase. Calendar edits in the weekly board are still local UI behavior until Google Calendar write support is added.

## Phase 4 Kiosk Hardening

- Navigation, forms, and controls use larger tap targets for touchscreens.
- Header has a manual refresh button and the dashboard auto-refreshes every 5 minutes.
- The app shows an offline/provider fallback banner when network calls fail.
- Dark mode can be toggled from the left rail and is saved in browser local storage.
- The dashboard shifts a few pixels every 10 minutes to reduce static image burn-in.
- `scripts/start-kiosk.sh` disables screen blanking through `xset` and launches Chromium in kiosk/app mode.
- Performance mode reduces expensive blur/shadow effects and throttles drag/resize updates for smoother touch response on Raspberry Pi.

Run kiosk mode on the Pi:

```bash
cd ~/Home-Scheduler/mirror-dashboard-app
chmod +x scripts/start-kiosk.sh
./scripts/start-kiosk.sh
```

If touch still feels laggy, run the built production app instead of Vite dev mode:

```bash
npm run build
npm run start
./scripts/start-kiosk.sh
```

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

- Persist weekly calendar drag/resize changes through a writable Google Calendar service.
- Add support for multiple calendar feeds with colors and labels.
- Add reader panel behavior for news links.
- Add finance settings and a reliable paid finance provider behind `server/src/services/finance/FinanceProvider.ts`.
