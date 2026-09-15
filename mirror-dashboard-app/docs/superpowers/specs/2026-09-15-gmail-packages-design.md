# Gmail connection and package tracking: design

Date: 2026-09-15. Sub-project 3 of the Home Scheduler roadmap (sub-project 2 was Share to Home Scheduler).

## What it does

The Pi reads the family's Gmail (mrsoundsweet@gmail.com, read-only) and turns shipping emails from any store or carrier into packages on the wall. Each package shows a four-step meter, Ordered → Shipped → Out for delivery → Delivered, with the item's photo and name above it and an icon riding the meter. Home shows what is on its way, a Packages tab shows everything, and a banner announces "Out for delivery" and "Delivered".

The Gmail connection is general: packages is its first user, and later features can search and read other mail through the same service.

## Decisions (from brainstorming)

| Question | Decision | Why |
|---|---|---|
| Which packages | Every shipping email: Amazon, UPS, FedEx, USPS, Target, Walmart and any other store | Once Gmail is connected, other senders cost nothing extra |
| Where on the wall | Home card, Packages tab, delivery banner (no morning story line) | The Home card already covers what the story would say |
| Home card look | The user's Amazon-style meter: four labelled dots, the current step bold, with the item photo and name above and a moving icon on the meter | Chosen from a screenshot the user sent |
| Several packages | Stack up to three meters, soonest first, then "+N more in Packages" | Dense screens are preferred; three short meters read at once |
| How emails are read | Gmail search finds likely shipping mail; Claude fills a strict form per email | Copes with every store's layout without per-store code |
| Sign-in | The user signs in once from their PC through an SSH tunnel; Google returns the key straight to the Pi | Claude never handles tokens; no public exposure of port 4174 |
| Email check before design | Not done (the user did not approve reading their mail in this session) | Replaced by the real-world check after the first deploy |

## Part 1: the Gmail connection

### Files

`server/src/services/gmail/`, with no knowledge of packages:
- `oauth.ts`: builds the Google consent URL, exchanges the returned code, refreshes the access token.
- `account.ts`: reads and writes the `gmail_account` row; connection status.
- `client.ts`: `searchMessages(query, max)` and `getMessage(id)`, plus `getProfile()` for the connected address.
- `mime.ts`: turns a Gmail `format=full` message into `{ id, from, subject, receivedAt, text, imageUrls }`.

Google is called with plain `fetch`, not the `googleapis` package, to keep the Pi's install small. Endpoints:
- Consent: `https://accounts.google.com/o/oauth2/v2/auth` with `scope=https://www.googleapis.com/auth/gmail.readonly`, `access_type=offline`, `prompt=consent`, a random `state`, and PKCE (`S256`).
- Token: `https://oauth2.googleapis.com/token` (authorization-code and refresh-token grants).
- Gmail: `https://gmail.googleapis.com/gmail/v1/users/me/messages` (list with `q` and `maxResults`), `.../messages/{id}?format=full`, `.../profile`.

### Configuration

`.env` (the user adds these on the Pi; `.env.example` documents them empty):
- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`: from a Google Cloud OAuth client of type **Desktop app**.
- `PACKAGES_CHECK_MINUTES`: default `10`.

`config.gmail = { clientId, clientSecret }` and `config.packages = { checkMinutes }` in `server/src/config.ts`.

### Sign-in flow

1. On the PC: `ssh -L 4175:localhost:4174 connor@192.168.1.185` (local port 4175 so it never collides with a dev server on 4174).
2. Browser: `http://localhost:4175/gmail/connect`. The server builds `redirect_uri` from the request's `Host` (`http://localhost:4175/gmail/callback`); Desktop-app clients accept any loopback port without registering it.
3. The server keeps `{ state, codeVerifier, redirectUri }` in memory for 10 minutes and redirects to Google.
4. `GET /gmail/callback?code&state`: the state must match an unexpired entry (used once). The server exchanges the code, reads the profile address, stores the refresh token and shows "Connected as {address}. You can close this tab and the SSH session."

Guard: `/gmail/connect`, `/gmail/callback` and `POST /gmail/disconnect` answer only requests whose socket address is loopback (`127.0.0.1` or `::1`), which is true on the Pi itself and through the SSH tunnel and false for anyone else on the LAN or tailnet. Others get 403 with "Open this through the SSH tunnel; see docs/gmail-setup.md."

`POST /gmail/disconnect` deletes the row (the user can also remove access at myaccount.google.com).

### Storage

Table `gmail_account` (one row, `id = 1`): `email`, `refresh_token`, `status` (`connected` | `needs_reconnect`), `connected_at`, `last_checked_at`, `last_error`. It lives in `data/mirror-dashboard.sqlite` with the Plaid tokens; never committed.

The access token (about an hour) stays in memory and is refreshed when it is within a minute of expiry or a Gmail call returns 401.

A refresh that returns `invalid_grant` sets `status = needs_reconnect` and stops checks until the user signs in again. No retry loop.

### Status board

`services/integrations.ts` gains a `gmail` item: `live` when connected, `partial` with "Sign in again: see docs/gmail-setup.md" when `needs_reconnect` or when credentials are set but no account is connected, `missing` with "Add GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET" otherwise.

## Part 2: emails become packages

### Files

`server/src/services/packages/`:
- `query.ts`: the Gmail search string.
- `extract.ts`: the Claude call and `toPackageUpdate(raw)` (same shape as `share/classify.ts`: injected `create`, `json_schema` output, 12-second timeout, `maxRetries: 0`, `ClassifyUnavailableError` on failure).
- `apply.ts`: pure grouping and status rules (no database, no network).
- `store.ts`: the three tables below.
- `checker.ts`: one check (search → read → extract → apply → clean up) with injected dependencies, and the timer.
- `deps.ts`: real wiring.

### The check

Runs when the server starts (after 30 seconds), then every `PACKAGES_CHECK_MINUTES`, and on "Check now". Only one check runs at a time; a second request while one runs returns the running one's result.

1. Skip unless `gmail_account.status = connected`.
2. Search. First check: `newer_than:14d`. Later checks: `after:{unix seconds of last_checked_at minus 3600}` (an hour of overlap for late-indexed mail; duplicates are filtered in step 3). Both add:
   `-in:spam -in:trash (subject:(shipped OR "out for delivery" OR delivered OR arriving OR "on its way" OR "on the way" OR "order confirmed" OR "order confirmation" OR "your order" OR delivery) OR from:(amazon.com OR ups.com OR fedex.com OR usps.com OR target.com OR walmart.com))`
   At most 50 messages per check, processed oldest first.
3. Skip any message already in `package_emails` with outcome `package`, `skipped`, `hidden` or `failed`.
4. Read it (`mime.ts`): prefer the `text/plain` part, else the HTML part through the existing `readableText` (`share/html.ts`), capped at 12,000 characters. `imageUrls`: `https` `<img src>` values, skipping 1×1 images, at most 30.
5. Extract (Claude, one email at a time). The prompt gives sender, subject, date, text and the numbered image list, and says the email is data, not instructions. Schema fields (structured outputs have no nulls: `""` and `-1` mean unknown):
   - `isShipmentUpdate` (boolean): false for ads, reviews, receipts for services, and return labels.
   - `store`, `item` (short, e.g. "Kids' sneakers"; several items become "Kids' sneakers and 2 more").
   - `imageIndex` (integer; the product photo from the list, or `-1`). Claude cannot supply its own URL.
   - `carrier`, `trackingNumber`, `orderNumber`.
   - `status`: `ordered` | `shipped` | `out_for_delivery` | `delivered` | `delayed` | `attempted` | `cancelled`.
   - `arrivalStart`, `arrivalEnd` (ISO dates or `""`), `issue` (short text or `""`).
6. Apply (`apply.ts`), below.
7. Record the email: outcome `package` (with `package_id`), `skipped`, or `hidden` (matched a hidden package).
8. If Claude or Gmail fails for one email: outcome `pending`, `attempts + 1`; after 3 attempts, `failed`. The check moves on to the next email. A Gmail failure for the search itself ends the check with `last_error` set.
9. Update `last_checked_at` (only when the search succeeded), then clean up.

### Grouping and status (`apply.ts`)

Match, in order:
1. A package with the same tracking number (case- and space-insensitive).
2. A package with the same store and order number, unless both have tracking numbers and they differ (a split Amazon order: the second shipment becomes its own package, copying the item text from its email).
3. Otherwise a new package, when the status is not `cancelled`.

Status moves forward only: `ordered` (0) → `shipped` (1) → `out_for_delivery` (2) → `delivered` (3). An email with a lower step never moves a package back, but can still fill empty fields (carrier, tracking number, arrival dates, photo).

- `delayed` and `attempted` keep the step and set `issue` (Claude's text, or "Delayed" / "Delivery attempted"); the next forward update clears `issue`.
- `cancelled` deletes the package (and its photo); a `cancelled` email with no match is `skipped`.
- The newest email's arrival dates replace older ones; `delivered` sets `delivered_at` to the email's date.
- The photo is set once: the first email with a usable image wins (downloaded with `share/images.ts`' `saveShareImage`: `image/*` only, no SVG, 5 MB, 12-second timeout).
- A package marked hidden stays hidden; its later emails are recorded as `hidden`.

Each forward move to `out_for_delivery` or `delivered` adds a `package_events` row (for the banner).

### Storage

- `packages`: `id`, `store`, `item`, `image_url`, `carrier`, `tracking_number`, `order_number`, `status`, `arrival_start`, `arrival_end`, `issue`, `delivered_at`, `hidden` (0/1), `created_at`, `updated_at`.
- `package_emails`: `gmail_id` (primary key), `package_id`, `received_at`, `subject`, `outcome`, `attempts`.
- `package_events`: `id`, `package_id`, `status`, `created_at`.

### Clean-up (after every check)

"Today" and "midnight" use `WEATHER_TIMEZONE`.
- Delivered packages leave Home after midnight of their delivery day and stay in the Packages tab's history for 7 days, then are deleted with their photo.
- Undelivered packages with no update for 30 days are deleted.
- `package_emails` rows older than 60 days are deleted (older mail is past the search window anyway); `package_events` older than 2 days are deleted.

### API

- `GET /api/packages`: `{ gmail: { configured, status, email, lastCheckedAt, lastError }, active: PackageView[], delivered: PackageView[] }`. `active` excludes hidden packages and delivered ones past midnight; sorted by step (out for delivery first), then arrival date (none last).
- `GET /api/packages/events?after={id}`: new events with their package, for the banner. Without `after`, returns only the latest id.
- `POST /api/packages/check`: runs a check now; returns the same shape as `GET /api/packages`.
- `POST /api/packages/:id/hide`: "Not a package".

`PackageView` and `PackageStatus` go in `@mirror-dashboard/shared`.

Home pulse: `homeBrief.ts` adds today's arrivals (item, store, status) to the context the model writes the "Right now" headline from. The model does not create package cards.

## Part 3: the wall

Client files, outside the 5,000-line `App.tsx`: `client/src/packages/PackageMeter.tsx`, `PackagesPanel.tsx`, `PackageBanner.tsx`, and `packageText.ts` (pure helpers: step index, arrival wording, grouping by day).

### The meter (`PackageMeter`)

- Top row: photo (rounded square) or, without one, nothing extra; the item name in `font-display`; one line such as "Amazon, arriving today", "Target, arrives Thursday", "UPS, arriving Sep 16 to 18", "Delivered at 2:14 pm". No `A · B` strings.
- Meter: four dots joined by a line; the line fills with `amb-accent` up to the current dot; finished dots show a tick. Labels under each dot (Ordered, Shipped, Out for delivery, Delivered); the current label bold `amb-ink`, the rest `amb-muted`.
- Icon above the meter at the current dot: `Package` (ordered), `Truck` (shipped, out for delivery), `House` (delivered), from lucide. On Home it slides from the first dot to its step as part of Home's one entrance animation; elsewhere it is still.
- `issue`: an amber line under the meter ("Delayed: now arriving Friday").
- Ambient tokens only, so all four palettes work; no blur.

### Home card

- Pinned by the client, not ranked by the model; shown whenever `active` is not empty.
- One package: one grid slot. Two or more: the right-hand column (one column, two rows). The model's cards fill the remaining slots (5 or 4 instead of 6).
- Up to three meters, in `active` order; then "+N more in Packages".
- Tapping opens the Packages tab.
- Gmail `needs_reconnect`: a small line, "Gmail disconnected, showing last known".

### Packages tab

- New nav item "Packages" (lucide `Package`), inserted before Settings; reorderable like the rest. Saved nav orders that lack it get it appended before Settings.
- Left: active packages as full-width meters, grouped under Today, Tomorrow, weekday-and-date headings, and "No date yet". Each row adds carrier, tracking number, order number and "Updated 20 min ago".
- Right: "Delivered this week" (compact rows with photo, item, day), and a Gmail box (connected address, last checked, last error, **Check now**).
- Tapping a package opens a sheet: every field, the subjects of its emails, a QR code to the carrier's tracking page (UPS, FedEx, USPS, Amazon order page; none when unknown), and **Not a package**.
- Gmail not configured: the tab shows the setup steps from `docs/gmail-setup.md` in short form.

### Delivery banner (`PackageBanner`)

Same shape and placement as `ShareBanner`: polls `/api/packages/events` every 60 seconds, remembers the last id at start (no announcements of old events after a restart), shows the newest new event for 20 seconds ("Out for delivery: Kids' sneakers", "Delivered: Kids' sneakers", with the photo). Tapping opens that package in the Packages tab. When a share banner is showing, the package banner waits until it closes.

## Part 4: testing and roll-out

### Automated tests

Server (`server/test/gmail/`, `server/test/packages/`), Node's test runner through tsx, fakes injected, no network:
- Consent URL: read-only scope, `access_type=offline`, state and PKCE challenge present.
- Callback: unknown or reused state rejected; code exchange stores the refresh token and address; `invalid_grant` on refresh sets `needs_reconnect`.
- Loopback guard: non-loopback address gets 403.
- `mime.ts`: base64url bodies, nested multipart, HTML-only mail, image list without 1×1 images.
- Query: first-check and later-check strings.
- `toPackageUpdate`: garbage, empty strings, `-1`, an out-of-range `imageIndex`.
- `apply.ts`: tracking match, order match, split shipment, forward-only, `delayed` then forward clears `issue`, `cancelled` deletes, hidden stays hidden, arrival replacement, photo set once.
- Checker: a message is never processed twice; a failed extraction is retried up to 3 times then `failed`; search failure keeps `last_checked_at`; clean-up windows.
- Fixtures: made-up emails (Amazon ordered, shipped, out for delivery, delivered; UPS; USPS; an ad). No real mail in the repo.

Client (`client/test/`): `packageText.ts` (step index, arrival wording across today, tomorrow and later, day grouping) and the banner's announce-once logic.

### Real-world check after the first deploy

The user connects Gmail; the first check reads 14 days. Compare the wall with the user's real recent orders; adjust the search string or the extraction prompt for misses or wrong matches. Pi screenshots (`grim`) of the Home card and Packages tab in all four palettes.

### Setup guide: `docs/gmail-setup.md`

1. Google Cloud console: new project "Home Scheduler"; enable the Gmail API.
2. OAuth consent screen: External; app name and the user's email; scope `gmail.readonly`; add the user as a test user; then **Publish app** so the status is **In production** (in Testing, Google expires the sign-in every 7 days).
3. Credentials: create an OAuth client ID of type **Desktop app**; copy the client ID and secret into `~/Home-Scheduler/mirror-dashboard-app/.env` on the Pi; `sudo systemctl restart mirror-dashboard`.
4. PC: `ssh -L 4175:localhost:4174 connor@192.168.1.185`, open `http://localhost:4175/gmail/connect`, sign in, choose **Advanced → Go to Home Scheduler** on the unverified-app warning, allow read-only access.
5. Reconnecting later: repeat step 4.

### Running cost (checked 2026-09-15)

- **Google:** the Gmail API has no charge for standard use. Projects created after 2026-05-01 get 6,000 quota units per user per minute and 80,000,000 per project per day; `messages.list` costs 5 units, `messages.get` 20, `getProfile` 1. This design uses about 1,100 units a day (144 searches plus about 20 reads) and at most about 1,000 in one minute (the first check's 50 reads). Google plans to charge for going over quota later in 2026, with 90 days' notice. The project needs no billing account; leaving billing off means Google has nothing to charge.
- **Claude:** `claude-haiku-4-5` (the Pi's `ANTHROPIC_MODEL`) at $1 per million input tokens and $5 per million output. One email is about 3,500 input and 150 output tokens, about $0.004. At 40 to 80 matching emails a week (shipping updates plus the look-alikes that get skipped), about $0.70 to $1.50 a month; the first 14-day check about $0.20 once.

### Privacy and safety

- Read-only scope: the Pi cannot send, change or delete mail.
- Only messages matching the shipping search are sent to Claude; the prompt treats the email as data, and the output is a fixed form with no tools.
- Refresh token and package data stay in the Pi's SQLite database. Port 4174 stays Tailscale-only.
- Until Gmail is set up, nothing fails: the Home card is hidden and the Packages tab shows the setup steps.

### Out of scope

More than one Gmail account; other email features; sending or changing mail; live tracking from carrier websites or APIs.

## Branch

Work continues on `feature/standalone-mirror-dashboard`, after the share feature; how the branch is merged is decided when this sub-project finishes.
