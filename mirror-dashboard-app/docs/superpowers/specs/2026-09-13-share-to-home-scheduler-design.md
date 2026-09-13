# Share to Home Scheduler: recipes and trip ideas from the iPhone Share sheet

Date: 2026-09-13
Status: approved in brainstorming, awaiting spec review
Scope: sub-project 2 of the phone-control work. Sub-project 3 (Gmail connection and Amazon packages) gets its own spec. Sub-project 1 (a phone web app) was dropped.

## Goal

Tap Share on anything in Instagram, Safari or another app, pick **Send to Home Scheduler**, and the Pi saves it in the right place: a recipe goes to Recipes, a travel idea goes to Trips. The phone shows what happened, and the wall announces it.

## Decisions made during brainstorming

| Decision | Choice | Why |
|---|---|---|
| How links get to the Pi | The user's existing iPhone Shortcut, "Send to Home Scheduler", repurposed | Already in the Share sheet; no phone app needed |
| Who reads the content | Approach 1: the phone sends what it already has, the Pi reads it | Allrecipes and its sister sites return a 403 challenge page to the Pi (curl and Node fetch both), while the same page loads on the laptop from the same home IP. The phone already has the page |
| Recipe or trip | The Pi decides (option A), no menu in the Shortcut | One tap; the notification says where it went, and a wrong guess is one tap to move |
| Instagram posts with ingredients but no method | Save ingredients only, show "Method: see the original post" with a QR code | Claude must not invent steps |

## Feasibility findings (tested 2026-09-13 from the Pi)

- **Instagram:** `https://www.instagram.com/reel/DOmW6LTkqcq/embed/captioned/` returned HTTP 200 without login, with the full caption (title and complete ingredient list) and the cover image. The normal reel page also returned 200 with `og:title`, a truncated `og:description` and `og:image`.
- **Recipe sites:** Budget Bytes and Bon Appétit return 200 to the Pi. Allrecipes and Serious Eats return a 403 "Simple Page" with no recipe data, including to Node 22 `fetch` with browser headers and over IPv4. The laptop gets the full page with a schema.org `Recipe` JSON-LD block.
- **Open question to settle during the real-world check:** whether the iPhone's own download ("Get Contents of URL" in Shortcuts) gets past the Allrecipes check. If not, the Shortcut takes the page from Safari instead (see Shortcut, step 2).

## Components

### 1. The iPhone Shortcut (user builds or edits it once)

The existing "Send to Home Scheduler" Shortcut keeps its name and place in the Share sheet. It accepts URLs, Safari web pages and text. The spec deliverable is a step-by-step edit guide in `docs/share-shortcut.md`; Apple only allows signed shortcut files, and signing needs a Mac, so no ready-made file is shipped.

1. Take the shared input.
2. If it is a link, download the page on the phone (**Get Contents of URL**). Fallback if Allrecipes still blocks the phone: when the input is a Safari page, use **Run JavaScript on Web Page** to return `document.documentElement.outerHTML`.
3. POST JSON to `http://100.81.206.101:4174/api/share` (the Pi's Tailscale address, so it works even if MagicDNS does not resolve `connor`).
4. Show the `message` field of the response as a notification.

Tracking parameters are stripped on the Pi, not in the Shortcut, so the Shortcut stays simple.

### 2. `POST /api/share`

Request (JSON, up to 8 MB; this route gets its own body parser because the global one is capped at 1 MB):

```json
{ "url": "https://…", "html": "<!doctype html>…", "text": "caption or notes" }
```

The link is read from the same keys the travel route already accepts: `url`, `URL`, `link`, `Link`, `postUrl`, `Post URL`. At least one of link or text is required.

Response: always HTTP 200 for a handled outcome, so the Shortcut never stops on an error screen; 400 when there is no link and no text; 413 when the body is over 8 MB. The 400 and 413 responses come from the body parser or validation before the pipeline runs, so the route's error handler must still return JSON with a `message` field; otherwise the phone shows an empty notification.

```json
{
  "status": "saved" | "duplicate" | "unrecognized" | "failed",
  "kind": "recipe" | "trip" | null,
  "id": 42,
  "title": "Creamy Chicken Noodle Soup",
  "message": "Saved to Recipes: Creamy Chicken Noodle Soup",
  "shareId": 17
}
```

Pipeline, all within a 20-second budget:

1. **Tidy the link.** Remove `utm_*`, `stkn`, `igsh`, `igshid`, `fbclid`, `si` and fragment identifiers; normalise the host and trailing slash. Duplicate check against `recipes.source_url` and `travel_inspirations.url`; a match returns `duplicate` with "Already in Recipes: …" or "Already in Trips: …".
2. **Get the content**, first one that works:
   1. `html` sent by the phone.
   2. Instagram post, reel or tv link: fetch `https://www.instagram.com/{p|reel|tv}/{code}/embed/captioned/` and read the `Caption` block and the embedded image.
   3. Any other link: the Pi fetches it (10-second timeout, browser-like headers).
   4. `text` sent by the phone.
3. **Read it:**
   - **Structured recipe data present** (a schema.org `Recipe` in JSON-LD, including inside `@graph` or arrays, with `recipeInstructions` as strings, `HowToStep` or `HowToSection`): parse it directly, with no AI call. Fields: `name`, `description`, `recipeYield`, `totalTime` (or `prepTime` + `cookTime`, ISO 8601 durations such as `PT1H30M`), `recipeIngredient`, `recipeInstructions`, `image`, `author`/site name. Ingredient lines are split by rule into quantity and name ("2 tbsp butter" becomes quantity "2 tbsp", name "butter") and given an aisle from a keyword list.
   - **Otherwise:** trim the page to readable text (drop scripts, styles, navigation; cap at 20,000 characters) and make one Claude call with a JSON schema output, using the same pattern as `generateRecipe` (`config.anthropic.model`, `output_config.format` json_schema, 15-second timeout). The schema returns `kind` (`recipe`, `trip` or `neither`), `title`, `summary`, `sourceName`, and either recipe fields (servings, total minutes, tags, ingredients with name, quantity and aisle, steps) or trip fields (location, notes, tags). The prompt tells the model to leave `steps` empty when the source has no method, never to invent one.
4. **Save:**
   - `recipe`: `createRecipe` with `source` `instagram` or `web`, plus `sourceUrl` and `sourceName`.
   - `trip`: `createTravelInspiration` with the extracted title, location, notes and tags (this skips the existing OpenAI enrichment because the details are already filled in), `source` `instagram` or `web`.
   - `neither`: nothing saved; `unrecognized`, "Couldn't find a recipe or trip idea in that post".
5. **Keep the photo:** download the cover image (JSON-LD `image`, embed image, or `og:image`) to `data/share-images/{random}.{ext}`; only `image/*` content types, at most 5 MB, 10-second timeout. Store `/media/{file}` as the item's `image_url` or `thumbnail_url`. If the download fails, the item saves without a photo.
6. **Record the share** in `share_imports` and reply.

### 3. Other routes

- `GET /api/share/recent?after={shareId}`: shares newer than `after`, or the latest 10 without it. Used by the wall banner and the Settings list.
- `POST /api/share/:id/retry`: re-run steps 3 to 6 on the stored content. Used when Claude was unavailable.
- `POST /api/share/:id/move` with `{ "to": "recipe" | "trip" }`: re-read the stored content forced to that kind, save it there, delete the old item, and update the share row.
- `GET /media/:file`: static files from `data/share-images/`.

### 4. Wall (client) changes

- **Banner:** the app polls `GET /api/share/recent?after=` every 30 seconds. A new saved share slides up a banner at the bottom, "From your phone: {title}, saved to {Recipes|Trips}", with the photo. Tapping opens the item; it fades after about 20 seconds. The Recipes and Travel lists reload when a banner appears. The banner uses Ambient tokens (`bg-amb-sheet`, `text-amb-ink`) and a Motion entrance, since it answers an event.
- **Recipe cards:** show the photo and a credit line (`sourceName`).
- **Recipe dialog:** photo header, credit line, and a QR code labelled "Open the original on your phone", reusing the `SlideQr` component. When `steps` is empty, the method column shows "Method: see the original post" beside the QR code. A "This is a trip idea" button calls the move route.
- **Travel idea detail:** a "This is a recipe" button calls the move route.
- **Settings:** a "Recent shares" list of the last 10 shares, with outcome, message, and a Retry button on failed ones.

## Data changes

All additive, applied on startup with the existing `ensureColumn` pattern and `CREATE ... IF NOT EXISTS`.

- `recipes`: add `source_url TEXT` and `source_name TEXT`; add `CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_source_url ON recipes(source_url) WHERE source_url IS NOT NULL`.
- `recipes.source`: new values `instagram` and `web` alongside `manual`.
- `travel_inspirations`: no schema change (`url` is already unique); new `source` value `web`.
- New table:

```sql
CREATE TABLE IF NOT EXISTS share_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT,
  kind TEXT CHECK (kind IN ('recipe', 'trip')),
  status TEXT NOT NULL CHECK (status IN ('saved', 'duplicate', 'unrecognized', 'failed')),
  item_id INTEGER,
  title TEXT,
  message TEXT NOT NULL,
  content TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

`content` holds the trimmed readable text (at most 20,000 characters) so retry and move work without re-fetching.

- Shared types: `Recipe` gains `sourceUrl?: string | null` and `sourceName?: string | null`; `TravelInspiration["source"]` gains `"web"`; new `ShareImport` and `ShareResult` types.
- Ingredient aisles use the names the recipe generator already uses: Produce, Meat, Dairy, Pantry, Frozen, Bakery. Unrecognised items get no aisle, so `pushPlanToGrocery` files them under its existing "Meal plan" fallback.

## Errors

| Situation | Reply `message` |
|---|---|
| Pi unreachable (Tailscale off) | None: the iPhone shows its own connection error. Documented in the Shortcut guide |
| Site blocked the Pi and no page came from the phone | "That site blocked the Pi. Share it from Safari so your phone sends the page." |
| Instagram post private or hidden | "Instagram hid that post. Copy the caption and share the text instead." |
| Claude unavailable (no key, no credit, rate limit, timeout) | Structured recipe sites still save. Otherwise `failed`: "Couldn't read that one right now. It's in Recent shares to retry." |
| Already saved | "Already in Recipes: …" or "Already in Trips: …" |
| Body over 8 MB | HTTP 413, "That page was too big to send. Try sharing the link only." |
| Nothing recognisable | "Couldn't find a recipe or trip idea in that post" |

## Security

- The route is reachable only over Tailscale, like the rest of the server (no public exposure; see CLAUDE.md).
- The Pi fetches only `http` and `https` links, follows at most 3 redirects, and re-checks every redirect target.
- Before fetching, the host is resolved and refused if any address is loopback, private (10/8, 172.16/12, 192.168/16), link-local, CGNAT/Tailscale (100.64/10), or the IPv6 equivalents. This stops a crafted link from making the Pi reach devices inside the house or on the tailnet.
- Downloaded photos must be `image/*` and at most 5 MB, stored under a random filename; `/media` serves only that folder.
- `stkn` and other share tokens are stripped before the link is stored or fetched.

## Cleanup in the same change

- Delete `scripts/start-server-with-ngrok.sh` and the `start:pi` script in `package.json`. ngrok is not installed on the Pi and the service runs `npm run start`, so nothing is exposed today, but the script would open a public tunnel if ngrok were ever installed.
- Update the two CLAUDE.md lines that still describe the ngrok tunnel, and the README section on `start:pi`.

## Testing

The project has no automated tests today. Add Node's built-in test runner for the server (`node --test` through `tsx`), with no new heavy dependencies, and an `npm test` script. Fixtures are small hand-written pages modelled on the real structures, not copies of third-party pages.

Unit tests:
- link tidying and duplicate detection
- JSON-LD recipe extraction: plain object, `@graph`, arrays, `HowToStep`, `HowToSection`, string instructions, missing fields
- ISO 8601 durations and `recipeYield` forms
- ingredient splitting and aisle assignment
- Instagram embed caption parsing
- handling the Claude response for `recipe`, `trip` and `neither`, with the Claude client stubbed so tests cost nothing
- the private-address block, including a redirect to a private address
- photo type and size limits

Real-world check after deploy, from the phone:
1. The soup reel: saved as a recipe with ingredients only and "Method: see the original post".
2. An Allrecipes recipe shared from Safari: saved with full steps, proving the phone-side download path.
3. An Instagram travel post: saved to Trips.
4. A news article link: "Couldn't find a recipe or trip idea in that post".

`npm run typecheck` and `npm test` pass before deploy; deploy with `scripts/deploy.ps1`.

## Out of scope

- A phone web app (sub-project 1, dropped).
- Gmail and Amazon packages (sub-project 3, separate spec).
- Editing an imported recipe's text on the wall, and choosing a meal-plan day during the share.
