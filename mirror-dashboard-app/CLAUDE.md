# Mirror Dashboard App — Claude Code Guide

Family command-center touchscreen dashboard. Runs in production on a **Raspberry Pi 4 Model B** (Raspberry Pi OS, Chromium kiosk mode, HDMI touchscreen, landscape). Development happens on Windows; deployment is via `git pull` on the Pi followed by `npm install && npm run build && npm run start:pi`.

## Architecture

npm workspaces monorepo:

- `client/` — React 19 + Vite + TypeScript + Tailwind 3. Almost the entire UI lives in `client/src/App.tsx` (~3,500 lines: nav rail, Home/Calendar/Grocery/Tasks/Notes/Finance/Travel/Settings panels and all their modals). `KidsApp.tsx` is a small secondary view. API client helpers in `client/src/api.ts`.
- `server/` — Express 5 + TypeScript (ESM, `tsx` in dev) + SQLite (`sqlite`/`sqlite3`). All routes are defined inline in `server/src/index.ts`; business logic lives in `server/src/services/*` (one file per domain: calendar, weather, news, tasks, notes, grocery, rssFeeds, financeWatchlist, finance/ market quotes, personalFinance, plaidProvider, travelInspirations, travelPlaces, travelLodging, settings, integrations, voiceCommands).
- `shared/` — TypeScript types shared by both (`@mirror-dashboard/shared`).
- **Assistant** — `server/src/services/assistant.ts` is a Claude agent that drives the same service layer the REST API uses. It owns its tool-use loop explicitly (rather than the SDK beta tool runner) so the Pi stays on the stable Messages API and every mutation is recorded for the UI to refresh. Add a capability by adding a tool definition plus a handler in that one file. UI is `AssistantPanel` in `App.tsx`.
- `scripts/` — Pi deployment: systemd unit, kiosk launcher (Chromium + xset no-blank), ngrok tunnel starter.
- `alexa-skill/` — Alexa interaction model + Lambda bridge that forwards voice intents to `/api/voice/*` webhooks (Bearer token auth via `ALEXA_WEBHOOK_TOKEN`).

## Commands

Run from the repo root (`mirror-dashboard-app/`):

- `npm run dev` — Vite client on :5174 + Express server on :4174 concurrently (client proxies `/api` to the server).
- `npm run build` — builds shared → server → client.
- `npm run start` — production: Express serves `client/dist` on :4174.
- `npm run start:pi` — same but also starts an ngrok tunnel (Pi only).
- `npm run typecheck` — all three workspaces. **Run this after changes; there are no automated tests.**
- `npm run db:init` — initialize/seed the SQLite database at `data/mirror-dashboard.sqlite`.

## Conventions & gotchas

- Server is ESM: relative imports need `.js` extensions in TS source (`./config.js`).
- Dark mode uses Tailwind's **class** strategy (`darkMode: "class"` in `client/tailwind.config.ts`) because the nav rail toggles a `dark` class on `<main>`. Never remove that setting — every `dark:` variant in the app silently stops working.
- Config is centralized in `server/src/config.ts`, reading `.env` at repo root (copy from `.env.example`). Never commit real keys.
- Every external provider (iCal, Open-Meteo weather, RSS, Yahoo finance, Plaid, Google Places, OpenAI travel itineraries) must degrade gracefully to mock/local fallback data when unconfigured or offline — the Pi should never show a broken panel.
- `data/mirror-dashboard.sqlite` holds Plaid access tokens and personal finance data — treat as sensitive, never commit.
- UI is touch-first: large tap targets, no hover-only affordances. Performance matters — the Pi 4 is weak, so avoid heavy blur/shadow effects (there is a "performance mode" that strips them) and keep re-renders cheap.
- Dark mode is toggled from the nav rail and persisted in localStorage; new UI must style both themes (Tailwind `dark:` variants).
- Burn-in protection: layout shifts a few pixels every 10 min; auto-refresh every 5 min.
- Calendar drag/resize on the weekly board is UI-only (mock events); persistence to Google/iCal is a future phase.

## Current state / roadmap

Phase 4 (kiosk hardening) is done. Open threads from README: writable calendar sync, multi-feed calendar colors, real Plaid personal-finance provider beyond sandbox, AI finance review (`FINANCE_AI_ENABLED`), news reader panel. The travel itinerary generator still calls OpenAI (`OPENAI_API_KEY`). The in-dashboard assistant is built and uses the Claude API (`ANTHROPIC_API_KEY`); prefer Claude for new AI features and consider folding travel planning into the assistant.
