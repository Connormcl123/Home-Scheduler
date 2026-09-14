# Mirror Dashboard App — Claude Code Guide

Family command-center touchscreen dashboard. Runs in production on a **Raspberry Pi 4 Model B** (Raspberry Pi OS, Chromium kiosk mode, HDMI touchscreen, landscape). Development happens on Windows; `scripts/deploy.ps1` builds there and ships the compiled output to the Pi.

## Architecture

npm workspaces monorepo:

- `client/` — React 19 + Vite + TypeScript + Tailwind 3. Almost the entire UI lives in `client/src/App.tsx` (~5,000 lines: nav rail, Home/Calendar/Grocery/Recipes/Tasks/Notes/Finance/Travel/Assistant/Settings panels and all their modals). The time-of-day palette is `client/src/ambient.ts`. `KidsApp.tsx` is a small secondary view. API client helpers in `client/src/api.ts`.
- `server/` — Express 5 + TypeScript (ESM, `tsx` in dev) + SQLite (`sqlite`/`sqlite3`). All routes are defined inline in `server/src/index.ts`; business logic lives in `server/src/services/*` (one file per domain: calendar, weather, news, tasks, notes, grocery, rssFeeds, financeWatchlist, finance/ market quotes, personalFinance, plaidProvider, travelInspirations, travelPlaces, travelLodging, settings, integrations, voiceCommands, share). `services/share/` turns links shared from the iPhone Shortcut into recipes or trip ideas (`POST /api/share`).
- `shared/` — TypeScript types shared by both (`@mirror-dashboard/shared`).
- **Assistant** — `server/src/services/assistant.ts` is a Claude agent that drives the same service layer the REST API uses. It owns its tool-use loop explicitly (rather than the SDK beta tool runner) so the Pi stays on the stable Messages API and every mutation is recorded for the UI to refresh. Add a capability by adding a tool definition plus a handler in that one file. UI is `AssistantPanel` in `App.tsx`, laid out like the Claude app (Recents list + thread); chats are saved in `assistant_conversations` / `assistant_messages` through `services/assistantHistory.ts`.
- `scripts/` — Pi deployment: systemd unit, kiosk launcher (Chromium + xset no-blank), `deploy.ps1` and `provision-pi.sh`.
- `alexa-skill/` — Alexa interaction model + Lambda bridge that forwards voice intents to `/api/voice/*` webhooks (Bearer token auth via `ALEXA_WEBHOOK_TOKEN`).

## Commands

Run from the repo root (`mirror-dashboard-app/`):

- `npm run dev` — Vite client on :5174 + Express server on :4174 concurrently (client proxies `/api` to the server).
- `npm run build` — builds shared → server → client.
- `npm run start` — production: Express serves `client/dist` on :4174.
- `npm test` — server unit tests (Node's test runner through tsx, files in `server/test/`).
- `npm run typecheck` — all three workspaces. **Run this and `npm test` after changes.**
- `npm run db:init` — initialize/seed the SQLite database at `data/mirror-dashboard.sqlite`.

## Conventions & gotchas

- Server is ESM: relative imports need `.js` extensions in TS source (`./config.js`).
- Dark mode uses Tailwind's **class** strategy (`darkMode: "class"` in `client/tailwind.config.ts`) because the dusk and night Ambient palettes put a `dark` class on `<main>`. Never remove that setting — every `dark:` variant in the app silently stops working.
- **The Pi never compiles.** Running vite/tsc on-device pins all four cores while it drives the display; sustained builds on the first board preceded a hardware failure. `scripts/deploy.ps1` builds on the dev machine and ships `shared/dist`, `server/dist`, `client/dist` over one tar stream, then restarts the service. The Pi only runs `npm install --omit=dev` when a package.json actually changed. A fresh board is set up with `scripts/provision-pi.sh` (idempotent).
- After a deploy: server code needs `systemctl restart mirror-dashboard`; UI changes additionally need the browser reloaded (`systemctl --user restart mirror-kiosk`), because Express serves `client/dist` from disk and Chromium holds the old bundle in memory.
- **Remote access is Tailscale only.** The server has no authentication, and the dashboard holds finance data and can spend the Anthropic key via `/api/assistant/chat` - never expose port 4174 publicly (no ngrok, no port forwarding). The Pi's tailnet name is `connor`; set `MIRROR_PI_HOST=connor` to deploy from anywhere.
- `sudo` on the Pi is **not** passwordless. Only `systemctl restart mirror-dashboard` is, via `/etc/sudoers.d/mirror-dashboard`. Installing packages needs the user.
- Config is centralized in `server/src/config.ts`, reading `.env` at repo root (copy from `.env.example`). Never commit real keys.
- Every external provider (iCal, Open-Meteo weather, RSS, Yahoo finance, Plaid, Google Places, OpenAI travel itineraries) must degrade gracefully to mock/local fallback data when unconfigured or offline — the Pi should never show a broken panel.
- `data/mirror-dashboard.sqlite` holds Plaid access tokens and personal finance data — treat as sensitive, never commit.
- UI is touch-first: large tap targets, no hover-only affordances. Performance matters — the Pi 4 is weak, so avoid heavy blur/shadow effects (there is a "performance mode" that strips them) and keep re-renders cheap.
- Colours come from the Ambient tokens, not hard-coded white/slate classes (see Design below). The rail's moon button pins the night palette (`mirror-dashboard-force-night` in localStorage).
- Burn-in protection: layout shifts a few pixels every 10 min; auto-refresh every 5 min.
- Calendar drag/resize on the weekly board is UI-only (mock events); persistence to Google/iCal is a future phase.

## Design

UI work follows the **`frontend-design` skill** (`.claude/skills/frontend-design/SKILL.md`): load it whenever you build or reshape a screen, and critique the result with a Pi screenshot (`grim` over SSH). Its brief is already set, and the chosen direction below wins wherever the skill leaves an axis open:

- **Ambient** (chosen 2026-09-11): the screen is tinted like the sky outside. Four palettes (dawn, morning, dusk, night) live in `client/src/ambient.ts` and reach Tailwind as the `amb-*` colours: `ink`, `muted`, `card`, `rail`, `well`, `sheet`, `border`, `accent`, `accent-ink`. Use them for every surface and text colour so all four palettes work.
- **Type**: Instrument Serif (`font-display`) for the clock, headings and card titles; Instrument Sans for everything else.
- **Surfaces**: translucent tinted cards with no backdrop blur (the Pi's GPU can't afford it). `well` for rows inside a card, `sheet` (opaque) for dialogs.
- **Motion**: one orchestrated entrance on Home (Motion, `motion/react`); anywhere else, motion only answers a touch.
- **Readability**: text passes WCAG AA against all four palettes and reads from across a room.
- **Avoid the skill's generic tells**: tracked ALL-CAPS labels, `A · B · C` meta strings, a single accented word in a headline, labels that say nothing the content doesn't.
- Design sources and the rejected directions are in `design/home-directions/`.

## Current state / roadmap

Phase 4 (kiosk hardening) is done. Open threads from README: writable calendar sync, multi-feed calendar colors, real Plaid personal-finance provider beyond sandbox, AI finance review (`FINANCE_AI_ENABLED`), news reader panel. The travel itinerary generator still calls OpenAI (`OPENAI_API_KEY`). The in-dashboard assistant is built and uses the Claude API (`ANTHROPIC_API_KEY`); prefer Claude for new AI features and consider folding travel planning into the assistant.
