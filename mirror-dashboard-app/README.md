# Mirror Dashboard App

Standalone touchscreen family command-center dashboard inspired by the existing MagicMirror prototype. MagicMirror remains untouched; this app is a new React, Express, and SQLite runtime intended for Raspberry Pi OS and Chromium kiosk mode.

This branch is Phase 3. Calendar, weather, news, and finance now have first-pass read providers with mock fallbacks, while tasks, daily notes, RSS feed list storage, grocery tracking, and finance watchlist storage are editable through the local touchscreen UI and SQLite API.

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

- `ICAL_FEED_URL`: one private iCal URL for Google Calendar secret iCal links or iCloud published calendars.
- `ICAL_FEED_URLS`: multiple private iCal URLs separated by commas. Use this for several iCloud calendars.
- `WEATHER_LATITUDE`, `WEATHER_LONGITUDE`, `WEATHER_TIMEZONE`: Open-Meteo location.
- `DEFAULT_RSS_FEEDS`: comma-separated RSS feed URLs.
- `FINANCE_WATCHLIST`: used by the mock finance provider to shape placeholder cards.
- `FINANCE_PROVIDER`: `yahoo` for the unofficial test provider, or `mock` for local-only testing.
- `PERSONAL_FINANCE_PROVIDER`: currently `local-demo`, which seeds SQLite with accounts, budgets, and transactions for the Monarch-style dashboard.
- `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`: reserved for a future bank/credit-card aggregation provider.
- `PLAID_CLIENT_NAME`, `PLAID_PRODUCTS`, `PLAID_COUNTRY_CODES`, `PLAID_USER_ID`: Plaid Link settings. The first implementation uses the Transactions product.
- `OPENAI_API_KEY`, `OPENAI_MODEL`: optional AI itinerary generation for the Travel tab. Without a key, the app uses a local draft generator.
- `FINANCE_AI_ENABLED`: reserved for a future AI finance review service.

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
- `GET /api/finance/personal`
- `GET /api/finance/plaid/status`
- `POST /api/finance/plaid/link-token`
- `POST /api/finance/plaid/exchange-public-token`
- `POST /api/finance/plaid/sync`
- `GET /api/finance/category-rules`
- `POST /api/finance/category-rules`
- `PATCH /api/finance/transactions/:id/category`
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
- `GET /api/grocery`
- `POST /api/grocery`
- `PATCH /api/grocery/:id`
- `DELETE /api/grocery/:id`
- `GET /api/travel/inspirations`
- `POST /api/travel/inspirations`
- `PATCH /api/travel/inspirations/:id`
- `DELETE /api/travel/inspirations/:id`
- `POST /api/travel/itinerary`

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

Add a grocery item:

```bash
curl -X POST http://localhost:4174/api/grocery \
  -H "Content-Type: application/json" \
  -d '{"name":"Milk","quantity":"1 gallon","category":"Dairy","supplier":"Grocery store","status":"low"}'
```

Add an Instagram travel inspiration:

```bash
curl -X POST http://localhost:4174/api/travel/inspirations \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.instagram.com/reel/example","title":"Cape Cod beach cafe","location":"Cape Cod","notes":"Creator mentioned easy parking and a walkable beach nearby."}'
```

Generate a draft itinerary from saved travel ideas:

```bash
curl -X POST http://localhost:4174/api/travel/itinerary
```

## Travel Inspirations

The Travel tab stores creator post/Reel links, titles, locations, and notes in SQLite. Instagram personal Saved folders are not pulled directly because the public Meta Instagram APIs do not expose a normal endpoint for reading a user's private saved collections. For v1, share or paste the post/Reel URL into the dashboard and add the useful context from the video.

If `OPENAI_API_KEY` is set, the server uses `OPENAI_MODEL` to generate a structured itinerary from the saved links and notes. If the key is missing or the request fails, the app generates a local draft grouped by location.

## Phase 2 Touchscreen Features

- Create, complete, reprioritize, and delete local tasks.
- Create, edit, browse, and delete daily notes by date.
- Add, enable/disable, and delete RSS feed records.
- Add, enable/disable, and delete finance watchlist symbols.
- Track weekly grocery items and household supplies that are low or out.
- Refresh the home dashboard after local storage changes.
- Weekly calendar board with days across the top, AM/PM time slots down the side, and local drag/resize behavior for mock events.
- Calendar page uses a Skylight-inspired family organizer layout with a top view selector, today summary rail, color-coded calendar/profile chips, and a wide weekly schedule board.
- Calendar view selector now switches between Day, Week, Month, and Schedule panels, and `+ Event` opens a touch-friendly local event form.

Calendar drag/resize is currently UI-only against mock events. The next calendar phase should persist event changes through iCal/Google-compatible calendar services.

## Phase 3 Providers

- Calendar reads from `ICAL_FEED_URLS` when configured, or `ICAL_FEED_URL` for one feed. Use Google Calendar secret iCal addresses or iCloud published calendar URLs.
- Weather reads from Open-Meteo using the configured latitude, longitude, and timezone.
- News reads RSS feeds from the local feed storage table, falling back to `DEFAULT_RSS_FEEDS`.
- Finance reads the local watchlist symbols and uses `FINANCE_PROVIDER=yahoo` for the unofficial test provider.
- Personal finance uses local SQLite demo tables for accounts, budgets, and transactions. The UI is intentionally shaped like a household finance dashboard so bank aggregation can be added behind the service layer later.

Provider data is read-only in this phase. Calendar edits in the weekly board are still local UI behavior until Google Calendar write support is added.

## Personal Finance Roadmap

The Finance tab is now split into two lanes:

- Market watch: existing symbol watchlist and Yahoo/mock quote provider.
- Household finance: accounts, credit-card balances, budgets, monthly spending, recent transactions, and AI-ready observations.

For real bank and credit-card linking, use an aggregator such as Plaid, MX, or Finicity rather than attempting to connect directly to each bank. The next backend step should add a provider behind `server/src/services/personalFinance.ts` that syncs account and transaction records into the existing SQLite tables.

OpenAI finance analysis should read summarized, redacted budget and transaction data from the local service. The current UI has an AI Money Review panel, but it only displays local rule-based insights until `FINANCE_AI_ENABLED=true` is implemented.

## Plaid Setup

Plaid is configured server-side only. Do not put Plaid secrets in React code or commit them to Git.

1. Create a Plaid developer account and copy your sandbox `client_id` and `secret`.
2. On the Pi, edit `mirror-dashboard-app/.env`:

```bash
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_sandbox_secret
PLAID_ENV=sandbox
PLAID_PRODUCTS=transactions
PLAID_COUNTRY_CODES=US
PLAID_CLIENT_NAME=Home Scheduler
```

3. Reinstall so the Plaid SDK is present:

```bash
cd ~/Home-Scheduler/mirror-dashboard-app
npm install
npm run build
npm run start
```

4. Open the Finance tab and tap `Connect`. In sandbox mode, Plaid Link can use sandbox institutions and test credentials from Plaid's dashboard/docs.
5. After Link succeeds, tap `Sync` to pull accounts and transactions through `/transactions/sync`.

The app stores Plaid access tokens in local SQLite because this dashboard is local-only. Treat `data/mirror-dashboard.sqlite` as sensitive and do not commit or share it.

## Finance Categorization

Plaid categories are normalized into dashboard groups such as Groceries, Dining, Gas, Bills, Shopping, Home, Health, Travel, Entertainment, Income, Transfers, and Fees. Anything the app cannot confidently map remains `Uncategorized`.

In the Finance tab:

- Use the transaction category dropdown to manually categorize one transaction.
- Tap `Rule` on a transaction to create a merchant matching rule, such as `STARBUCKS -> Dining`.
- New rules immediately update matching existing transactions unless they were manually categorized.
- Future Plaid syncs apply custom rules before using Plaid's provider category.

Multiple iCloud calendars:

```bash
ICAL_FEED_URLS=https://p1-caldav.icloud.com/published/2/calendar-one,https://p2-caldav.icloud.com/published/2/calendar-two,https://p3-caldav.icloud.com/published/2/calendar-three,https://p4-caldav.icloud.com/published/2/calendar-four
```

If Apple gives you `webcal://...`, change it to `https://...` before adding it.

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
- Add a real personal-finance provider behind `server/src/services/personalFinance.ts`, starting with Plaid sandbox.
- Add OpenAI-powered finance analysis using summarized, privacy-conscious local data.
