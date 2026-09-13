# Share to Home Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anything shared from the iPhone Share sheet through the "Send to Home Scheduler" Shortcut lands on the Pi as a recipe or a trip idea, the phone gets a plain-words reply, and the wall announces it.

**Architecture:** A new `POST /api/share` route runs a pipeline in `server/src/services/share/`: tidy the link, get the content (page sent by the phone, Instagram's public embed page, a guarded server fetch, or shared text), read schema.org recipe data directly or ask Claude once to classify and extract, save through the existing recipe and travel services, keep the photo on the Pi, and record the share. Pure parsing lives in small focused files with unit tests; the pipeline takes its side effects as injected dependencies so it is tested with fakes. The wall polls a small "recent shares" route to show a banner.

**Tech Stack:** Node 22 on the Pi (Node 24 on the laptop), Express 5, TypeScript (NodeNext ESM), SQLite via `sqlite`/`sqlite3`, `@anthropic-ai/sdk` structured outputs, React 19 + Tailwind 3 + `motion/react` on the client, Node's built-in test runner through `tsx`.

**Spec:** `mirror-dashboard-app/docs/superpowers/specs/2026-09-13-share-to-home-scheduler-design.md`

## Global Constraints

- Work in `C:\Users\mrsou\Documents\New project 2\mirror-dashboard-app` (git root is the parent folder `New project 2`, branch `feature/standalone-mirror-dashboard`). Run npm commands from `mirror-dashboard-app/`.
- The Pi never compiles. Build on Windows, ship with `scripts/deploy.ps1`.
- Server imports use `.js` extensions (`./tidyUrl.js`) because the server is NodeNext ESM.
- Share request body limit: 8 MB, on `/api/share` only; the global JSON limit stays 1 MB.
- The Shortcut posts to `http://100.81.206.101:4174/api/share` (the Pi's Tailscale address).
- Link keys accepted: `url`, `URL`, `link`, `Link`, `postUrl`, `Post URL`. Text keys: `text`, `Text`.
- Tracking parameters removed: every `utm_*`, plus `stkn`, `igsh`, `igshid`, `fbclid`, `gclid`, `si`, `mc_cid`, `mc_eid`; fragments removed.
- Photos: only `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/avif`; at most 5 MB; stored in `data/share-images/{random}.{ext}`; served at `/media/{file}`. No SVG.
- The Pi fetches only `http`/`https`, at most 3 redirects, and refuses loopback, private (10/8, 172.16/12, 192.168/16), link-local, CGNAT/Tailscale (100.64/10), multicast, and the IPv6 equivalents, re-checked on every redirect.
- Timeouts, tightened so a share fits the spec's 20-second budget: page fetch 8 s; Claude 12 s; the photo download runs alongside Claude and gives up at 12 s.
- Claude: `config.anthropic.model` with `output_config.format` json_schema, same pattern as `generateRecipe` in `server/src/services/recipes.ts`. Claude never writes steps the source does not have.
- Ingredient aisles: Produce, Meat, Dairy, Pantry, Frozen, Bakery. Unrecognised ingredients get no aisle, so `pushPlanToGrocery` files them under its existing "Meal plan" fallback.
- Reply messages, exactly:
  - `Saved to Recipes: {title}` / `Saved to Trips: {title}`
  - `Already in Recipes: {title}` / `Already in Trips: {title}`
  - `That site blocked the Pi. Share it from Safari so your phone sends the page.`
  - `Instagram hid that post. Copy the caption and share the text instead.`
  - `Couldn't read that one right now. It's in Recent shares to retry.`
  - `Couldn't find a recipe or trip idea in that post`
  - `That page was too big to send. Try sharing the link only.`
  - `Nothing to save: share a link or some text.`
- Test fixtures are small hand-written pages modelled on the real structures, not copies of third-party pages.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Never commit `.env` or anything under `data/`.

## Deviations from the spec (decided while planning)

- `share_imports` gets one extra column, `image_url`, so the wall banner can show the photo without a second lookup and a retry can reuse a photo already downloaded.
- "Move" is addressed by the item the wall is showing: `POST /api/share/move` with `{ "from": "recipe" | "trip", "id": 42, "to": "trip" | "recipe" }`, instead of `/api/share/:id/move`. The wall knows the recipe or trip id, not the share id.
- Timeouts are 8 s / 12 s / 12 s (see above) instead of 10 s / 15 s / 10 s, to honour the 20-second budget.

## File Structure

Server, new (`server/src/services/share/`), one job each:

| File | Responsibility |
|---|---|
| `tidyUrl.ts` | Canonical link form; Instagram post detection; embed URL |
| `html.ts` | Entity decoding, meta tags, page title, readable text |
| `recipeJsonLd.ts` | schema.org `Recipe` extraction, ISO 8601 durations, yields |
| `ingredients.ts` | "2 tbsp butter" to `{ quantity, name }`; aisle keywords |
| `instagram.ts` | Parse Instagram's public embed page (caption, author, image) |
| `safeFetch.ts` | Guarded fetch: public hosts only, redirects, size cap, timeout |
| `classify.ts` | One Claude call: kind + fields; normaliser for its answer |
| `images.ts` | Download and store a cover photo, return `/media/...` |
| `store.ts` | `share_imports` reads and writes; duplicate lookup |
| `pipeline.ts` | `handleShare`, `retryShare`, `moveSharedItem`, real dependency wiring |

Server, modified: `db.ts` (schema), `services/recipes.ts` (source fields), `services/travelInspirations.ts` (`web` source), `index.ts` (routes, parser, media, 413), `package.json` (test script).

Tests, new: `server/test/share/*.test.ts` (outside `src/`, so `tsc` builds never include them; `tsx` runs them).

Shared, modified: `shared/src/index.ts` (Recipe source fields, `TravelInspiration` source, `ShareImport`, `ShareResult`).

Client: new `client/src/ShareBanner.tsx`; modified `client/src/api.ts`, `client/src/App.tsx`.

Other: delete `scripts/start-server-with-ngrok.sh`; edit root `package.json`, `CLAUDE.md`, `README.md`; new `docs/share-shortcut.md`.

---

### Task 1: Test runner and link tidying

**Files:**
- Modify: `server/package.json` (scripts), root `package.json` (scripts)
- Create: `server/src/services/share/tidyUrl.ts`
- Test: `server/test/share/tidyUrl.test.ts`

**Interfaces:**
- Produces: `tidyUrl(raw: string): string | null`; `instagramPost(url: string): { kind: "p" | "reel" | "tv"; code: string } | null`; `instagramEmbedUrl(post: { kind: "p" | "reel" | "tv"; code: string }): string`

- [ ] **Step 1: Add the test scripts**

In `server/package.json` `scripts`, add after `"typecheck"`:

```json
"test": "node --import tsx --test \"test/**/*.test.ts\""
```

In the root `package.json` `scripts`, add after `"typecheck"`:

```json
"test": "npm run test -w server"
```

- [ ] **Step 2: Write the failing test**

Create `server/test/share/tidyUrl.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { instagramEmbedUrl, instagramPost, tidyUrl } from "../../src/services/share/tidyUrl.js";

test("strips Instagram share tracking from a real copied link", () => {
  assert.equal(
    tidyUrl("https://www.instagram.com/reel/DOmW6LTkqcq/?utm_source=ig_web_button_share_sheet&stkn=MzRlODBiNWFlZA=="),
    "https://www.instagram.com/reel/DOmW6LTkqcq"
  );
});

test("keeps meaningful query parameters and drops fragments", () => {
  assert.equal(tidyUrl("HTTP://Example.COM/recipe?id=5&utm_medium=x&fbclid=abc#comments"), "https://example.com/recipe?id=5");
});

test("same page shared twice tidies to the same string", () => {
  assert.equal(tidyUrl("https://site.com/soup/?igsh=1"), tidyUrl("https://site.com/soup"));
});

test("rejects anything that is not a web link", () => {
  assert.equal(tidyUrl("javascript:alert(1)"), null);
  assert.equal(tidyUrl("ftp://files.example.com/a"), null);
  assert.equal(tidyUrl("not a link"), null);
});

test("detects Instagram posts, reels and tv links", () => {
  assert.deepEqual(instagramPost("https://www.instagram.com/reel/DOmW6LTkqcq"), { kind: "reel", code: "DOmW6LTkqcq" });
  assert.deepEqual(instagramPost("https://instagram.com/reels/ABC_12-x/"), { kind: "reel", code: "ABC_12-x" });
  assert.deepEqual(instagramPost("https://www.instagram.com/p/Cx1/"), { kind: "p", code: "Cx1" });
  assert.equal(instagramPost("https://www.instagram.com/heresyourbite/"), null);
  assert.equal(instagramPost("https://example.com/reel/abc"), null);
});

test("builds the public embed URL", () => {
  assert.equal(instagramEmbedUrl({ kind: "reel", code: "DOmW6LTkqcq" }), "https://www.instagram.com/reel/DOmW6LTkqcq/embed/captioned/");
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -w server`
Expected: FAIL, cannot find module `tidyUrl.js`.

- [ ] **Step 4: Implement**

Create `server/src/services/share/tidyUrl.ts`:

```ts
const TRACKING_PARAMS = new Set(["stkn", "igsh", "igshid", "fbclid", "gclid", "si", "mc_cid", "mc_eid"]);

/**
 * The canonical form of a shared link: https, lower-case host, no tracking
 * parameters, no fragment, no trailing slash. The same page shared twice must
 * tidy to the same string, because that string is how duplicates are found.
 * Returns null for anything that is not an http(s) link.
 */
export function tidyUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  const text = url.toString();
  return url.pathname === "/" && !url.search ? text.replace(/\/$/, "") : text;
}

export type InstagramPost = { kind: "p" | "reel" | "tv"; code: string };

export function instagramPost(url: string): InstagramPost | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/^(www\.)?instagram\.com$/i.test(parsed.hostname)) return null;
  const match = parsed.pathname.match(/^\/(p|reels?|tv)\/([A-Za-z0-9_-]+)/);
  if (!match) return null;
  const kind = match[1] === "reels" ? "reel" : (match[1] as InstagramPost["kind"]);
  return { kind, code: match[2] };
}

/** Instagram's public embed page: the one websites use to embed a post. It carries the full caption without a login. */
export function instagramEmbedUrl(post: InstagramPost): string {
  return `https://www.instagram.com/${post.kind}/${post.code}/embed/captioned/`;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -w server`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

From the repo root (`New project 2`):

```bash
git add mirror-dashboard-app/package.json mirror-dashboard-app/server/package.json mirror-dashboard-app/server/src/services/share/tidyUrl.ts mirror-dashboard-app/server/test/share/tidyUrl.test.ts
git commit -m "Add a test runner and tidy shared links" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Read schema.org recipe data

**Files:**
- Create: `server/src/services/share/html.ts`, `server/src/services/share/recipeJsonLd.ts`
- Test: `server/test/share/recipeJsonLd.test.ts`

**Interfaces:**
- Produces: `decodeEntities(text: string): string` (html.ts); `type ParsedRecipe = { title: string; summary: string | null; servings: number | null; totalMinutes: number | null; ingredientLines: string[]; steps: string[]; imageUrl: string | null; author: string | null; tags: string[] }`; `findJsonLdRecipe(html: string): ParsedRecipe | null`; `parseIsoDuration(value: unknown): number | null`; `parseYield(value: unknown): number | null`

- [ ] **Step 1: Write the failing test**

Create `server/test/share/recipeJsonLd.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { findJsonLdRecipe, parseIsoDuration, parseYield } from "../../src/services/share/recipeJsonLd.js";

const page = (json: unknown) => `<html><head><script type="application/ld+json">${JSON.stringify(json)}</script></head><body></body></html>`;

test("reads a plain Recipe object with string instructions", () => {
  const recipe = findJsonLdRecipe(page({
    "@context": "https://schema.org", "@type": "Recipe", name: "Weeknight Chili",
    description: "Quick &amp; cozy.", recipeYield: "6 servings", totalTime: "PT45M",
    recipeIngredient: ["1 lb ground beef", "1 onion, diced"],
    recipeInstructions: "Brown the beef.\nAdd the onion.", image: "https://img.example.com/chili.jpg", author: "Budget Bytes"
  }));
  assert.ok(recipe);
  assert.equal(recipe.title, "Weeknight Chili");
  assert.equal(recipe.summary, "Quick & cozy.");
  assert.equal(recipe.servings, 6);
  assert.equal(recipe.totalMinutes, 45);
  assert.deepEqual(recipe.ingredientLines, ["1 lb ground beef", "1 onion, diced"]);
  assert.deepEqual(recipe.steps, ["Brown the beef.", "Add the onion."]);
  assert.equal(recipe.imageUrl, "https://img.example.com/chili.jpg");
  assert.equal(recipe.author, "Budget Bytes");
});

test("finds a Recipe inside @graph with HowToStep, image object and author object", () => {
  const recipe = findJsonLdRecipe(page({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", name: "Page" },
      { "@type": ["Recipe", "NewsArticle"], name: "Buffalo Chicken Casserole", recipeYield: ["8", "8 servings"],
        prepTime: "PT15M", cookTime: "PT1H", recipeIngredient: ["2 cups shredded chicken"],
        recipeInstructions: [{ "@type": "HowToStep", text: "Heat the oven." }, { "@type": "HowToStep", text: "Bake." }],
        image: { "@type": "ImageObject", url: "https://img.example.com/c.jpg" }, author: [{ "@type": "Person", name: "Nicole" }] }
    ]
  }));
  assert.ok(recipe);
  assert.equal(recipe.servings, 8);
  assert.equal(recipe.totalMinutes, 75);
  assert.deepEqual(recipe.steps, ["Heat the oven.", "Bake."]);
  assert.equal(recipe.imageUrl, "https://img.example.com/c.jpg");
  assert.equal(recipe.author, "Nicole");
});

test("flattens HowToSection groups in a top-level array", () => {
  const recipe = findJsonLdRecipe(page([
    { "@type": "Organization", name: "Site" },
    { "@type": "Recipe", name: "Soup", recipeIngredient: ["6 cups broth"],
      recipeInstructions: [{ "@type": "HowToSection", name: "Base", itemListElement: [{ "@type": "HowToStep", text: "Simmer." }] }] }
  ]));
  assert.ok(recipe);
  assert.deepEqual(recipe.steps, ["Simmer."]);
});

test("skips broken JSON-LD blocks and returns null without a recipe", () => {
  const html = `<script type="application/ld+json">{ not json</script><script type="application/ld+json">{"@type":"Recipe","name":"Pasta","recipeIngredient":["pasta"]}</script>`;
  assert.equal(findJsonLdRecipe(html)?.title, "Pasta");
  assert.equal(findJsonLdRecipe(page({ "@type": "Article", name: "News" })), null);
  assert.equal(findJsonLdRecipe(page({ "@type": "Recipe", name: "No ingredients" })), null);
});

test("parses ISO 8601 durations", () => {
  assert.equal(parseIsoDuration("PT1H30M"), 90);
  assert.equal(parseIsoDuration("P0DT2H"), 120);
  assert.equal(parseIsoDuration("PT90S"), 2);
  assert.equal(parseIsoDuration("PT"), null);
  assert.equal(parseIsoDuration("45 minutes"), null);
  assert.equal(parseIsoDuration(undefined), null);
});

test("parses recipe yields", () => {
  assert.equal(parseYield("4 servings"), 4);
  assert.equal(parseYield(["6", "6 bowls"]), 6);
  assert.equal(parseYield(8), 8);
  assert.equal(parseYield("a crowd"), null);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w server`
Expected: FAIL, cannot find module `recipeJsonLd.js`.

- [ ] **Step 3: Implement**

Create `server/src/services/share/html.ts`:

```ts
const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", "#39": "'" };

/** Decode the HTML entities that show up in page text and JSON-LD strings. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (whole, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return NAMED[lower] ?? whole;
  });
}
```

Create `server/src/services/share/recipeJsonLd.ts`:

```ts
import { decodeEntities } from "./html.js";

export type ParsedRecipe = {
  title: string;
  summary: string | null;
  servings: number | null;
  totalMinutes: number | null;
  ingredientLines: string[];
  steps: string[];
  imageUrl: string | null;
  author: string | null;
  tags: string[];
};

type Node = Record<string, unknown>;

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  return decodeEntities(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function isType(node: unknown, type: string): boolean {
  if (!node || typeof node !== "object") return false;
  return asArray((node as Node)["@type"]).some((entry) => typeof entry === "string" && entry.toLowerCase() === type.toLowerCase());
}

function findRecipeNode(data: unknown): Node | null {
  for (const node of asArray(data)) {
    if (!node || typeof node !== "object") continue;
    if (isType(node, "Recipe")) return node as Node;
    const found = findRecipeNode((node as Node)["@graph"]);
    if (found) return found;
  }
  return null;
}

export function parseIsoDuration(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  const match = trimmed.match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!match || trimmed === "P" || trimmed === "PT") return null;
  const minutes = Number(match[1] || 0) * 1440 + Number(match[2] || 0) * 60 + Number(match[3] || 0) + Number(match[4] || 0) / 60;
  return minutes > 0 ? Math.round(minutes) : null;
}

export function parseYield(value: unknown): number | null {
  const first = asArray(value)[0];
  if (typeof first === "number") return first > 0 ? Math.round(first) : null;
  if (typeof first !== "string") return null;
  const match = first.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function stepsFrom(value: unknown): string[] {
  const steps: string[] = [];
  for (const item of asArray(value)) {
    if (typeof item === "string") {
      steps.push(...item.split(/\n+/).map(clean).filter(Boolean));
    } else if (isType(item, "HowToSection")) {
      steps.push(...stepsFrom((item as Node).itemListElement));
    } else if (item && typeof item === "object") {
      const text = clean((item as Node).text ?? (item as Node).name);
      if (text) steps.push(text);
    }
  }
  return steps;
}

function imageFrom(value: unknown): string | null {
  const first = asArray(value)[0];
  if (typeof first === "string") return first;
  if (first && typeof first === "object" && typeof (first as Node).url === "string") return (first as Node).url as string;
  return null;
}

function authorFrom(value: unknown): string | null {
  const first = asArray(value)[0];
  if (typeof first === "string") return clean(first) || null;
  if (first && typeof first === "object") return clean((first as Node).name) || null;
  return null;
}

function addMinutes(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

/** The first schema.org Recipe on the page with a title and at least one ingredient, or null. */
export function findJsonLdRecipe(html: string): ParsedRecipe | null {
  const blocks = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(block[1].trim());
    } catch {
      continue;
    }
    const node = findRecipeNode(data);
    if (!node) continue;
    const title = clean(node.name);
    const ingredientLines = asArray(node.recipeIngredient).map(clean).filter(Boolean);
    if (!title || !ingredientLines.length) continue;
    return {
      title,
      summary: clean(node.description) || null,
      servings: parseYield(node.recipeYield),
      totalMinutes: parseIsoDuration(node.totalTime) ?? addMinutes(parseIsoDuration(node.prepTime), parseIsoDuration(node.cookTime)),
      ingredientLines,
      steps: stepsFrom(node.recipeInstructions),
      imageUrl: imageFrom(node.image),
      author: authorFrom(node.author),
      tags: [...asArray(node.recipeCategory), ...asArray(node.recipeCuisine)].map(clean).filter(Boolean).slice(0, 4)
    };
  }
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w server`
Expected: PASS (Task 1 and Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add mirror-dashboard-app/server/src/services/share/html.ts mirror-dashboard-app/server/src/services/share/recipeJsonLd.ts mirror-dashboard-app/server/test/share/recipeJsonLd.test.ts
git commit -m "Read the recipe data that recipe sites publish" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Split ingredient lines and pick an aisle

**Files:**
- Create: `server/src/services/share/ingredients.ts`
- Test: `server/test/share/ingredients.test.ts`

**Interfaces:**
- Produces: `splitIngredient(line: string): RecipeIngredient` (`{ name, quantity, category }` from `@mirror-dashboard/shared`); `aisleFor(name: string): string | null`

- [ ] **Step 1: Write the failing test**

Create `server/test/share/ingredients.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { aisleFor, splitIngredient } from "../../src/services/share/ingredients.js";

test("splits quantity, unit and a shopping-list name", () => {
  assert.deepEqual(splitIngredient("2 tbsp butter"), { name: "butter", quantity: "2 tbsp", category: "Dairy" });
  assert.deepEqual(splitIngredient("1 yellow onion, diced"), { name: "yellow onion", quantity: "1", category: "Produce" });
  assert.deepEqual(splitIngredient("8–10 cloves garlic, minced (to taste)"), { name: "garlic", quantity: "8–10 cloves", category: "Produce" });
  assert.deepEqual(splitIngredient("1/2 cup dry white wine (optional)"), { name: "dry white wine", quantity: "1/2 cup", category: "Pantry" });
  assert.deepEqual(splitIngredient("1 1/2 cups of flour"), { name: "flour", quantity: "1 1/2 cups", category: "Pantry" });
  assert.deepEqual(splitIngredient("½ tsp salt"), { name: "salt", quantity: "½ tsp", category: "Pantry" });
});

test("lines without a quantity keep the whole name", () => {
  assert.deepEqual(splitIngredient("Salt and pepper, to taste"), { name: "Salt and pepper", quantity: null, category: "Pantry" });
});

test("assigns aisles with the tricky cases first", () => {
  assert.equal(aisleFor("chicken broth"), "Pantry");
  assert.equal(aisleFor("frozen peas"), "Frozen");
  assert.equal(aisleFor("chicken breasts"), "Meat");
  assert.equal(aisleFor("parmesan"), "Dairy");
  assert.equal(aisleFor("peanut butter"), "Pantry");
  assert.equal(aisleFor("red pepper flakes"), "Pantry");
  assert.equal(aisleFor("bell pepper"), "Produce");
  assert.equal(aisleFor("flour tortillas"), "Bakery");
  assert.equal(aisleFor("Italian seasoning"), "Pantry");
  assert.equal(aisleFor("unobtainium"), null);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w server`
Expected: FAIL, cannot find module `ingredients.js`.

- [ ] **Step 3: Implement**

Create `server/src/services/share/ingredients.ts`:

```ts
import type { RecipeIngredient } from "@mirror-dashboard/shared";

const NUMBER = "(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?|[¼½¾⅓⅔⅛])";
const QUANTITY = `${NUMBER}(?:\\s*(?:-|–|to)\\s*${NUMBER})?`;
const UNIT = [
  "cups?", "tablespoons?", "tbsps?", "tbsp", "teaspoons?", "tsps?", "tsp", "pounds?", "lbs?", "lb", "ounces?", "oz",
  "grams?", "g", "kilograms?", "kg", "ml", "milliliters?", "liters?", "l", "cloves?", "cans?", "packages?", "pkgs?",
  "sticks?", "bunch(?:es)?", "slices?", "pinch(?:es)?", "dash(?:es)?", "stalks?", "heads?", "quarts?", "pints?",
  "large", "medium", "small"
].join("|");
const LINE = new RegExp(`^\\s*(${QUANTITY})\\s*(?:(${UNIT})\\.?(?=\\s|$))?\\s*(?:of\\s+)?(.+)$`, "i");

// Order matters: "chicken broth" is Pantry, not Meat; "frozen peas" is Frozen, not Produce.
const AISLES: Array<[string, RegExp]> = [
  ["Frozen", /\bfrozen\b/i],
  ["Pantry", /\b(salt|broth|stock|bouillon|peanut butter|pepper flakes|black pepper|chili powder|garlic powder|onion powder|seasoning|spice)\b/i],
  ["Meat", /\b(chicken|beef|pork|turkey|sausage|bacon|ham|lamb|steak|shrimp|salmon|fish|tuna|cod|tilapia|prosciutto|chorizo)\b/i],
  ["Dairy", /\b(milk|cream|butter|cheese|cheddar|parmesan|mozzarella|yogurt|eggs?|half-and-half|ricotta|feta)\b/i],
  ["Bakery", /\b(bread|buns?|rolls?|tortillas?|baguette|pita|naan|bagels?)\b/i],
  ["Produce", /\b(onions?|garlic|carrots?|celery|potato(?:es)?|tomato(?:es)?|peppers?|lettuce|spinach|kale|lemons?|limes?|apples?|bananas?|avocados?|cilantro|parsley|basil|mushrooms?|zucchini|broccoli|cucumbers?|ginger|scallions?|green onions?|jalape[nñ]os?|thyme|rosemary|berries|corn)\b/i],
  ["Pantry", /\b(flour|sugar|salt|oil|vinegar|rice|pasta|noodles?|beans?|lentils?|paprika|cumin|oregano|chili|sauce|honey|syrup|yeast|baking|cornstarch|wine|canned|oats)\b/i]
];

export function aisleFor(name: string): string | null {
  for (const [aisle, pattern] of AISLES) if (pattern.test(name)) return aisle;
  return null;
}

/** "2 tbsp butter" becomes { quantity: "2 tbsp", name: "butter" }. The name is cut at the first comma or bracket so it reads like a shopping-list entry. */
export function splitIngredient(line: string): RecipeIngredient {
  const text = line.replace(/\s+/g, " ").trim();
  const match = text.match(LINE);
  const quantity = match ? [match[1], match[2]].filter(Boolean).join(" ").trim() : null;
  const rest = match ? match[3] : text;
  const name = rest.split(/[,(]/)[0].trim() || rest.trim();
  return { name, quantity, category: aisleFor(name) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w server`
Expected: PASS. If a single aisle case fails, adjust only the keyword list order, never the test expectation.

- [ ] **Step 5: Commit**

```bash
git add mirror-dashboard-app/server/src/services/share/ingredients.ts mirror-dashboard-app/server/test/share/ingredients.test.ts
git commit -m "Split shared ingredient lines into grocery-ready items" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 4: Page text, meta tags and Instagram's embed page

**Files:**
- Modify: `server/src/services/share/html.ts` (append)
- Create: `server/src/services/share/instagram.ts`
- Test: `server/test/share/html.test.ts`, `server/test/share/instagram.test.ts`

**Interfaces:**
- Consumes: `decodeEntities` (Task 2)
- Produces: `metaContent(html: string, names: string[]): string | null`; `pageTitle(html: string): string | null`; `readableText(html: string, maxChars?: number): string`; `type InstagramEmbed = { caption: string; author: string | null; imageUrl: string | null }`; `parseInstagramEmbed(html: string): InstagramEmbed | null`

- [ ] **Step 1: Write the failing tests**

Create `server/test/share/html.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { metaContent, pageTitle, readableText } from "../../src/services/share/html.js";

test("reads meta tags in either attribute order", () => {
  const html = `<meta property="og:title" content="Soup &amp; Bread"><meta content="https://img/x.jpg" property="og:image"><meta name="description" content="Warm.">`;
  assert.equal(metaContent(html, ["og:title"]), "Soup & Bread");
  assert.equal(metaContent(html, ["og:image"]), "https://img/x.jpg");
  assert.equal(metaContent(html, ["twitter:title", "description"]), "Warm.");
  assert.equal(metaContent(html, ["og:site_name"]), null);
});

test("reads the page title", () => {
  assert.equal(pageTitle("<title> Best Chili | Site </title>"), "Best Chili | Site");
  assert.equal(pageTitle("<p>no title</p>"), null);
});

test("keeps readable text and drops scripts, styles and navigation", () => {
  const html = `<html><head><style>p{}</style><script>var x = 1;</script></head><body><nav>Home About</nav>
    <h1>Chili</h1><p>Brown the beef.<br>Add beans &amp; tomatoes.</p><ul><li>1 lb beef</li></ul><footer>© Site</footer></body></html>`;
  const text = readableText(html);
  assert.match(text, /Chili/);
  assert.match(text, /Add beans & tomatoes\./);
  assert.match(text, /1 lb beef/);
  assert.doesNotMatch(text, /var x|Home About|© Site|p\{\}/);
});

test("caps readable text length", () => {
  assert.equal(readableText(`<p>${"a".repeat(50)}</p>`, 10).length, 10);
});
```

Create `server/test/share/instagram.test.ts`. The fixture is modelled on the structure seen on the real embed page (a `Caption` block that starts with a `CaptionUsername` link and uses `<br />` line breaks, and an `EmbeddedMediaImage` image):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInstagramEmbed } from "../../src/services/share/instagram.js";

const EMBED = `<html><body><div class="Embed">
  <img class="EmbeddedMediaImage" alt="" src="https://scontent.cdninstagram.com/v/cover.jpg?stp=1&amp;oh=abc" />
  <div class="Caption"><a class="CaptionUsername" href="https://www.instagram.com/heresyourbite/">heresyourbite</a> <br /><br />Creamy Chicken Noodle Soup with Potatoes &#x1f963;<br /><br />Inspired by &#064;eatwithalyssa<br /><br />2 tbsp butter<br />2 chicken breasts<br />6 cups chicken broth<br /><div class="CaptionComments"></div></div>
</div></body></html>`;

test("reads the caption, author and cover image", () => {
  const embed = parseInstagramEmbed(EMBED);
  assert.ok(embed);
  assert.equal(embed.author, "heresyourbite");
  assert.equal(embed.imageUrl, "https://scontent.cdninstagram.com/v/cover.jpg?stp=1&oh=abc");
  assert.match(embed.caption, /^Creamy Chicken Noodle Soup with Potatoes 🥣/);
  assert.match(embed.caption, /Inspired by @eatwithalyssa/);
  assert.match(embed.caption, /2 tbsp butter\n2 chicken breasts\n6 cups chicken broth/);
  assert.doesNotMatch(embed.caption, /^heresyourbite/);
});

test("returns null when there is no caption", () => {
  assert.equal(parseInstagramEmbed("<html><body>Log in to see this post</body></html>"), null);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w server`
Expected: FAIL, `metaContent` is not exported and `instagram.js` is missing.

- [ ] **Step 3: Implement**

Append to `server/src/services/share/html.ts`:

```ts
function attribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return match ? (match[2] ?? match[3] ?? null) : null;
}

/** The content of the first meta tag whose property or name matches, in the order given. */
export function metaContent(html: string, names: string[]): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const name of names) {
    for (const tag of tags) {
      const key = attribute(tag, "property") ?? attribute(tag, "name");
      if (key?.toLowerCase() !== name.toLowerCase()) continue;
      const content = attribute(tag, "content");
      if (content && content.trim()) return decodeEntities(content.trim());
    }
  }
  return null;
}

export function pageTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = match ? decodeEntities(match[1]).replace(/\s+/g, " ").trim() : "";
  return title || null;
}

/** The words a person would read on the page, one block per line, capped for a Claude prompt. */
export function readableText(html: string, maxChars = 20000): string {
  const text = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|iframe|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, maxChars);
}
```

Create `server/src/services/share/instagram.ts`:

```ts
import { decodeEntities } from "./html.js";

export type InstagramEmbed = { caption: string; author: string | null; imageUrl: string | null };

/**
 * Reads Instagram's public embed page (/embed/captioned/). That page is meant
 * for other websites to embed a post, so it carries the full caption without a
 * login, unlike the normal post page, which only has a truncated preview.
 */
export function parseInstagramEmbed(html: string): InstagramEmbed | null {
  const block = html.match(/<div class="Caption"[^>]*>([\s\S]*?)(?:<div class="CaptionComments"|<\/div>)/i);
  if (!block) return null;

  const authorMatch = block[1].match(/class="CaptionUsername"[^>]*>([^<]+)</i);
  const author = authorMatch ? decodeEntities(authorMatch[1]).trim() : null;

  let caption = decodeEntities(
    block[1]
      .replace(/<a[^>]*class="CaptionUsername"[^>]*>[^<]*<\/a>/i, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (author && caption.startsWith(author)) caption = caption.slice(author.length).trim();
  if (!caption) return null;

  const imageTag = (html.match(/<img\b[^>]*>/gi) || []).find((tag) => /EmbeddedMediaImage/.test(tag));
  const src = imageTag?.match(/\bsrc="([^"]+)"/i)?.[1];
  return { caption, author, imageUrl: src ? decodeEntities(src) : null };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w server`
Expected: PASS.

- [ ] **Step 5: Check the parser against the real embed page (not committed)**

The fixture models the real page; confirm the live structure still matches. From `mirror-dashboard-app/`:

```bash
ssh -i /c/Users/mrsou/.ssh/id_rsa -o UserKnownHostsFile=/c/Users/mrsou/.ssh/known_hosts connor@192.168.1.185 "curl -s -A 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' https://www.instagram.com/reel/DOmW6LTkqcq/embed/captioned/" > /tmp/embed.html
npx tsx -e "import { readFileSync } from 'node:fs'; import { parseInstagramEmbed } from './server/src/services/share/instagram.ts'; const e = parseInstagramEmbed(readFileSync('/tmp/embed.html', 'utf8')); console.log(e?.author, '|', e?.imageUrl?.slice(0, 60)); console.log(e?.caption.slice(0, 400));"
```

Expected: author `heresyourbite`, an image URL, and the caption starting "Creamy Chicken Noodle Soup with Potatoes". If the real markup differs (for example the username sits in a different class), adjust the regexes in `instagram.ts` and the fixture together so the test still describes the real structure, then re-run `npm test -w server`. Delete `/tmp/embed.html` afterwards; it is a copy of a third-party page and must not be committed.

- [ ] **Step 6: Commit**

```bash
git add mirror-dashboard-app/server/src/services/share/html.ts mirror-dashboard-app/server/src/services/share/instagram.ts mirror-dashboard-app/server/test/share/html.test.ts mirror-dashboard-app/server/test/share/instagram.test.ts
git commit -m "Read page text, meta tags and Instagram captions" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: A fetch that cannot reach the home network

**Files:**
- Create: `server/src/services/share/safeFetch.ts`
- Test: `server/test/share/safeFetch.test.ts`

**Interfaces:**
- Produces: `BROWSER_UA: string`; `class FetchBlockedError extends Error`; `type Resolver = (host: string) => Promise<string[]>`; `isPrivateAddress(address: string): boolean`; `assertPublicUrl(url: URL, resolve?: Resolver): Promise<void>`; `type SafeFetchResult = { url: string; status: number; contentType: string; body: Buffer }`; `safeFetch(rawUrl: string, options: { timeoutMs: number; maxBytes: number; headers?: Record<string, string>; fetchImpl?: typeof fetch; resolve?: Resolver }): Promise<SafeFetchResult>`

- [ ] **Step 1: Write the failing test**

Create `server/test/share/safeFetch.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { FetchBlockedError, assertPublicUrl, isPrivateAddress, safeFetch } from "../../src/services/share/safeFetch.js";

const publicDns = async () => ["93.184.216.34"];

test("recognises private, loopback, tailnet and link-local addresses", () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "172.16.0.9", "172.31.255.1", "192.168.1.185", "100.81.206.101", "169.254.1.1", "0.0.0.0", "224.0.0.1", "::1", "fd7a:115c:a1e0::1", "fe80::1", "::ffff:192.168.1.1"]) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  for (const address of ["93.184.216.34", "172.32.0.1", "100.128.0.1", "2606:4700::1111"]) {
    assert.equal(isPrivateAddress(address), false, address);
  }
});

test("refuses hosts that resolve inside the home network", async () => {
  await assert.rejects(assertPublicUrl(new URL("https://sneaky.example"), async () => ["192.168.1.1"]), FetchBlockedError);
  await assert.rejects(assertPublicUrl(new URL("http://127.0.0.1:4174/api/tasks")), FetchBlockedError);
  await assert.rejects(assertPublicUrl(new URL("file:///etc/passwd")), FetchBlockedError);
  await assertPublicUrl(new URL("https://example.com"), publicDns);
});

test("returns the body of a public page", async () => {
  const fetchImpl = (async () => new Response("<html>ok</html>", { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
  const result = await safeFetch("https://example.com/recipe", { timeoutMs: 1000, maxBytes: 1000, fetchImpl, resolve: publicDns });
  assert.equal(result.status, 200);
  assert.equal(result.contentType, "text/html");
  assert.equal(result.body.toString("utf8"), "<html>ok</html>");
});

test("re-checks redirects and refuses one that points inside the house", async () => {
  const fetchImpl = (async () => new Response(null, { status: 302, headers: { location: "http://192.168.1.1/admin" } })) as typeof fetch;
  const resolve = async (host: string) => (host === "192.168.1.1" ? ["192.168.1.1"] : ["93.184.216.34"]);
  await assert.rejects(safeFetch("https://example.com/r", { timeoutMs: 1000, maxBytes: 1000, fetchImpl, resolve }), FetchBlockedError);
});

test("gives up after three redirects", async () => {
  const fetchImpl = (async () => new Response(null, { status: 301, headers: { location: "https://example.com/again" } })) as typeof fetch;
  await assert.rejects(safeFetch("https://example.com/loop", { timeoutMs: 1000, maxBytes: 1000, fetchImpl, resolve: publicDns }), FetchBlockedError);
});

test("stops reading once the size cap is passed", async () => {
  const fetchImpl = (async () => new Response("x".repeat(5000), { status: 200 })) as typeof fetch;
  await assert.rejects(safeFetch("https://example.com/big", { timeoutMs: 1000, maxBytes: 100, fetchImpl, resolve: publicDns }), FetchBlockedError);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w server`
Expected: FAIL, cannot find module `safeFetch.js`.

- [ ] **Step 3: Implement**

Create `server/src/services/share/safeFetch.ts`:

```ts
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const BROWSER_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

export class FetchBlockedError extends Error {}

export type Resolver = (host: string) => Promise<string[]>;

const systemResolver: Resolver = async (host) => (await lookup(host, { all: true })).map((entry) => entry.address);

/** True for anything that is not a public internet address, including the tailnet (100.64/10). */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127);
  }
  if (version === 6) {
    const value = address.toLowerCase();
    if (value === "::" || value === "::1") return true;
    if (value.startsWith("::ffff:")) return isPrivateAddress(value.slice(7));
    return /^(fc|fd|fe[89ab]|ff)/.test(value);
  }
  return true;
}

export async function assertPublicUrl(url: URL, resolve: Resolver = systemResolver): Promise<void> {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new FetchBlockedError("Only web links can be fetched.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : await resolve(host);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new FetchBlockedError("That link points inside the home network.");
}

export type SafeFetchResult = { url: string; status: number; contentType: string; body: Buffer };

async function readCapped(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new FetchBlockedError("That download was too large.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * fetch() for links other people's pages hand us: public hosts only, every
 * redirect re-checked, at most 3 redirects, a size cap and a timeout. This is
 * what stops a crafted link from making the Pi poke at devices in the house.
 */
export async function safeFetch(
  rawUrl: string,
  options: { timeoutMs: number; maxBytes: number; headers?: Record<string, string>; fetchImpl?: typeof fetch; resolve?: Resolver }
): Promise<SafeFetchResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  let url = new URL(rawUrl);
  try {
    for (let hop = 0; hop <= 3; hop += 1) {
      await assertPublicUrl(url, options.resolve);
      const response = await fetchImpl(url, { redirect: "manual", signal: controller.signal, headers: options.headers });
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        url = new URL(location, url);
        continue;
      }
      if (Number(response.headers.get("content-length") || 0) > options.maxBytes) throw new FetchBlockedError("That download was too large.");
      const body = await readCapped(response, options.maxBytes);
      return { url: url.toString(), status: response.status, contentType: response.headers.get("content-type") || "", body };
    }
    throw new FetchBlockedError("That link redirected too many times.");
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mirror-dashboard-app/server/src/services/share/safeFetch.ts mirror-dashboard-app/server/test/share/safeFetch.test.ts
git commit -m "Fetch shared links without reaching into the home network" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 6: One Claude call decides recipe, trip or neither

**Files:**
- Create: `server/src/services/share/classify.ts`
- Test: `server/test/share/classify.test.ts`

**Interfaces:**
- Consumes: `config.anthropic` from `server/src/config.ts`; `RecipeIngredient` from shared
- Produces:
  - `type ShareExtraction = { kind: "recipe"; title: string; summary: string | null; sourceName: string | null; servings: number | null; totalMinutes: number | null; tags: string[]; ingredients: RecipeIngredient[]; steps: string[] } | { kind: "trip"; title: string; summary: string | null; sourceName: string | null; location: string | null; notes: string | null; tags: string[] } | { kind: "neither"; title: string | null }`
  - `class ClassifyUnavailableError extends Error`
  - `type CreateMessage = (body: Anthropic.MessageCreateParamsNonStreaming, options?: { timeout?: number }) => Promise<Pick<Anthropic.Message, "content">>`
  - `toExtraction(raw: unknown): ShareExtraction`
  - `classifyShare(input: { url: string | null; text: string; forceKind?: "recipe" | "trip" }, create?: CreateMessage): Promise<ShareExtraction>`

- [ ] **Step 1: Write the failing test**

Create `server/test/share/classify.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ClassifyUnavailableError, classifyShare, toExtraction } from "../../src/services/share/classify.js";

const answer = (json: unknown) => async () => ({ content: [{ type: "text", text: JSON.stringify(json) }] }) as never;

const soup = {
  kind: "recipe", title: "Creamy Chicken Noodle Soup", summary: "", sourceName: "heresyourbite on Instagram",
  servings: 0, totalMinutes: 0, tags: ["soup"], location: "", notes: "",
  ingredients: [{ name: "butter", quantity: "2 tbsp", category: "Dairy" }, { name: "", quantity: "1", category: "Produce" }],
  steps: []
};

test("normalises a recipe answer: blanks become null, empty ingredient names are dropped, steps stay empty", () => {
  const extraction = toExtraction(soup);
  assert.equal(extraction.kind, "recipe");
  if (extraction.kind !== "recipe") return;
  assert.equal(extraction.summary, null);
  assert.equal(extraction.servings, null);
  assert.deepEqual(extraction.ingredients, [{ name: "butter", quantity: "2 tbsp", category: "Dairy" }]);
  assert.deepEqual(extraction.steps, []);
});

test("a recipe with no ingredients is not a recipe", () => {
  assert.equal(toExtraction({ ...soup, ingredients: [] }).kind, "neither");
});

test("normalises a trip answer", () => {
  const extraction = toExtraction({ kind: "trip", title: "Savannah, Georgia", summary: "Moss and squares", sourceName: "", location: "Savannah, GA", notes: "Forsyth Park", tags: ["weekend"], ingredients: [], steps: [], servings: 0, totalMinutes: 0 });
  assert.deepEqual(extraction, { kind: "trip", title: "Savannah, Georgia", summary: "Moss and squares", sourceName: null, location: "Savannah, GA", notes: "Forsyth Park", tags: ["weekend"] });
});

test("anything unexpected becomes neither", () => {
  assert.deepEqual(toExtraction(null), { kind: "neither", title: null });
  assert.equal(toExtraction({ kind: "poem", title: "x" }).kind, "neither");
});

test("classifyShare returns the normalised answer from Claude", async () => {
  const extraction = await classifyShare({ url: "https://www.instagram.com/reel/x", text: "caption" }, answer(soup));
  assert.equal(extraction.kind, "recipe");
});

test("classifyShare tells the model about a forced kind", async () => {
  let system = "";
  const create = (async (body: { system: string }) => { system = body.system; return { content: [{ type: "text", text: JSON.stringify(soup) }] }; }) as never;
  await classifyShare({ url: null, text: "caption", forceKind: "trip" }, create);
  assert.match(system, /this is a trip/i);
});

test("classifyShare turns API failures and empty answers into ClassifyUnavailableError", async () => {
  const failing = (async () => { throw new Error("529 overloaded"); }) as never;
  await assert.rejects(classifyShare({ url: null, text: "x" }, failing), ClassifyUnavailableError);
  const empty = (async () => ({ content: [] })) as never;
  await assert.rejects(classifyShare({ url: null, text: "x" }, empty), ClassifyUnavailableError);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w server`
Expected: FAIL, cannot find module `classify.js`.

- [ ] **Step 3: Implement**

Create `server/src/services/share/classify.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { RecipeIngredient } from "@mirror-dashboard/shared";
import { config } from "../../config.js";

export type ShareExtraction =
  | { kind: "recipe"; title: string; summary: string | null; sourceName: string | null; servings: number | null; totalMinutes: number | null; tags: string[]; ingredients: RecipeIngredient[]; steps: string[] }
  | { kind: "trip"; title: string; summary: string | null; sourceName: string | null; location: string | null; notes: string | null; tags: string[] }
  | { kind: "neither"; title: string | null };

export class ClassifyUnavailableError extends Error {}

export type CreateMessage = (
  body: Anthropic.MessageCreateParamsNonStreaming,
  options?: { timeout?: number }
) => Promise<Pick<Anthropic.Message, "content">>;

// Structured outputs have no nulls here: 0 and "" mean unknown, and toExtraction turns them into null.
const SHARE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ["recipe", "trip", "neither"] },
    title: { type: "string" },
    summary: { type: "string", description: "One sentence, or empty." },
    sourceName: { type: "string", description: "Who made it, e.g. 'heresyourbite on Instagram' or 'Budget Bytes'. Empty if unknown." },
    servings: { type: "integer", description: "0 if unknown." },
    totalMinutes: { type: "integer", description: "0 if unknown." },
    tags: { type: "array", items: { type: "string" } },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", description: "Just the item, as on a shopping list. No quantity." },
          quantity: { type: "string", description: "e.g. 2 tbsp, 1 bunch. Empty if none." },
          category: { type: "string", enum: ["Produce", "Meat", "Dairy", "Pantry", "Frozen", "Bakery"] }
        },
        required: ["name", "quantity", "category"]
      }
    },
    steps: { type: "array", items: { type: "string" } },
    location: { type: "string", description: "Trips only: the place. Empty otherwise." },
    notes: { type: "string", description: "Trips only: what makes it worth going. Empty otherwise." }
  },
  required: ["kind", "title", "summary", "sourceName", "servings", "totalMinutes", "tags", "ingredients", "steps", "location", "notes"]
};

const SYSTEM =
  "Someone shared this page or social media caption to their family kitchen display. Decide what it is. " +
  "kind=recipe when it describes a dish to cook and lists ingredients. kind=trip when it is about a place to visit: " +
  "a destination, a town, a hotel, a park, an attraction. Otherwise kind=neither. " +
  "For recipes, ingredient names read like a shopping-list entry ('chicken breasts', not 'boneless skinless chicken breasts, trimmed'), " +
  "quantity holds the amount and unit, and category is the supermarket aisle. " +
  "Copy the method only from the source. If the source has no method (for example 'full recipe in my bio'), return an empty steps array. " +
  "Never write steps yourself. Use 0 for unknown numbers and an empty string for unknown text.";

let client: Anthropic | null = null;
const defaultCreate: CreateMessage = (body, options) => {
  if (!client) client = new Anthropic({ apiKey: config.anthropic.apiKey });
  return client.messages.create(body, options);
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(str).filter((entry): entry is string => entry !== null) : [];
}

export function toExtraction(raw: unknown): ShareExtraction {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const title = str(record.title);
  if (record.kind === "recipe" && title) {
    const ingredients: RecipeIngredient[] = Array.isArray(record.ingredients)
      ? record.ingredients.flatMap((item) => {
          const entry = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
          const name = str(entry.name);
          return name ? [{ name, quantity: str(entry.quantity), category: str(entry.category) }] : [];
        })
      : [];
    if (ingredients.length) {
      return {
        kind: "recipe", title, summary: str(record.summary), sourceName: str(record.sourceName),
        servings: positive(record.servings), totalMinutes: positive(record.totalMinutes),
        tags: strings(record.tags).slice(0, 4), ingredients, steps: strings(record.steps)
      };
    }
  }
  if (record.kind === "trip" && title) {
    return {
      kind: "trip", title, summary: str(record.summary), sourceName: str(record.sourceName),
      location: str(record.location), notes: str(record.notes), tags: strings(record.tags).slice(0, 6)
    };
  }
  return { kind: "neither", title };
}

export async function classifyShare(
  input: { url: string | null; text: string; forceKind?: "recipe" | "trip" },
  create?: CreateMessage
): Promise<ShareExtraction> {
  if (!create && !config.anthropic.apiKey) throw new ClassifyUnavailableError("ANTHROPIC_API_KEY is not set.");
  const system = input.forceKind
    ? `${SYSTEM} The person says this is a ${input.forceKind}; extract it as kind=${input.forceKind}.`
    : SYSTEM;
  let response: Pick<Anthropic.Message, "content">;
  try {
    response = await (create ?? defaultCreate)(
      {
        model: config.anthropic.model,
        max_tokens: 3000,
        output_config: { format: { type: "json_schema", schema: SHARE_SCHEMA } },
        system,
        messages: [{ role: "user", content: `${input.url ? `Link: ${input.url}\n\n` : ""}${input.text.slice(0, 20000)}` }]
      },
      { timeout: 12_000 }
    );
  } catch (error) {
    throw new ClassifyUnavailableError(error instanceof Error ? error.message : "Claude could not be reached.");
  }
  const text = response.content.find((block): block is Anthropic.TextBlock => block.type === "text")?.text;
  if (!text) throw new ClassifyUnavailableError("Claude returned no answer.");
  try {
    return toExtraction(JSON.parse(text));
  } catch {
    throw new ClassifyUnavailableError("Claude's answer was not valid JSON.");
  }
}
```

The system prompt says "this is a trip" for a forced trip, which is what the forced-kind test looks for.

- [ ] **Step 4: Run the tests and the type check**

Run: `npm test -w server` then `npm run typecheck -w server`
Expected: tests PASS; typecheck clean. If `output_config` is rejected by the SDK types, copy exactly how `generateRecipe` in `server/src/services/recipes.ts` passes it (it compiles today).

- [ ] **Step 5: Commit**

```bash
git add mirror-dashboard-app/server/src/services/share/classify.ts mirror-dashboard-app/server/test/share/classify.test.ts
git commit -m "Let Claude sort shares into recipes and trip ideas" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Store shares, and record where recipes came from

**Files:**
- Modify: `server/src/db.ts`, `shared/src/index.ts`, `server/src/services/recipes.ts`, `server/src/services/travelInspirations.ts`
- Create: `server/src/services/share/store.ts`
- Test: `server/test/share/store.test.ts`

**Interfaces:**
- Produces (shared): `Recipe.sourceUrl?: string | null`, `Recipe.sourceName?: string | null`; `TravelInspiration["source"]` is `"instagram" | "manual" | "web"`; `type ShareKind = "recipe" | "trip"`; `type ShareStatus = "saved" | "duplicate" | "unrecognized" | "failed"`; `interface ShareResult { status; kind: ShareKind | null; id: number | null; title: string | null; message: string; shareId: number | null; imageUrl: string | null }`; `interface ShareImport { id; url: string | null; kind: ShareKind | null; status; itemId: number | null; title: string | null; message: string; imageUrl: string | null; createdAt: string }`
- Produces (server): `createRecipe` accepts `sourceUrl?: string | null; sourceName?: string | null`; store: `type ShareRecord = { url: string | null; kind: ShareKind | null; status: ShareStatus; itemId: number | null; title: string | null; message: string; content: string | null; imageUrl: string | null }`, `recordShare(entry: ShareRecord): Promise<number>`, `updateShare(id: number, entry: ShareRecord): Promise<void>`, `getShare(id: number): Promise<(ShareRecord & { id: number }) | null>`, `findShareByItem(kind: ShareKind, itemId: number): Promise<(ShareRecord & { id: number }) | null>`, `listShares(after?: number): Promise<ShareImport[]>`, `findDuplicate(url: string): Promise<{ kind: ShareKind; id: number; title: string } | null>`

- [ ] **Step 1: Write the failing test**

Create `server/test/share/store.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Point the app at a throwaway database before anything imports config.ts.
const dir = mkdtempSync(path.join(tmpdir(), "share-store-"));
process.env.DATABASE_PATH = path.join(dir, "test.sqlite");
const { getDb } = await import("../../src/db.js");
const store = await import("../../src/services/share/store.js");
const { createRecipe } = await import("../../src/services/recipes.js");

test.after(async () => {
  await (await getDb()).close();
  rmSync(dir, { recursive: true, force: true });
});

test("recipes keep their source link and name, and a link can be saved only once", async () => {
  const recipe = await createRecipe({ title: "Soup", source: "instagram", sourceUrl: "https://www.instagram.com/reel/abc", sourceName: "heresyourbite on Instagram" });
  assert.equal(recipe.sourceUrl, "https://www.instagram.com/reel/abc");
  assert.equal(recipe.sourceName, "heresyourbite on Instagram");
  await assert.rejects(createRecipe({ title: "Soup again", sourceUrl: "https://www.instagram.com/reel/abc" }));
  await createRecipe({ title: "Manual one" });
  await createRecipe({ title: "Manual two" });
});

test("finds duplicates in recipes and trips", async () => {
  const db = await getDb();
  await db.run("INSERT INTO travel_inspirations (source, url, title, tags) VALUES ('web', 'https://visit.example/savannah', 'Savannah', '')");
  assert.deepEqual(await store.findDuplicate("https://www.instagram.com/reel/abc"), { kind: "recipe", id: 1, title: "Soup" });
  assert.equal((await store.findDuplicate("https://visit.example/savannah"))?.kind, "trip");
  assert.equal(await store.findDuplicate("https://nothing.example"), null);
});

test("records, updates, lists and looks up shares", async () => {
  const first = await store.recordShare({ url: "https://a.example", kind: null, status: "failed", itemId: null, title: null, message: "Couldn't read that one right now. It's in Recent shares to retry.", content: "caption text", imageUrl: null });
  const second = await store.recordShare({ url: "https://b.example", kind: "recipe", status: "saved", itemId: 1, title: "Soup", message: "Saved to Recipes: Soup", content: null, imageUrl: "/media/x.jpg" });
  assert.equal((await store.getShare(first))?.content, "caption text");
  assert.deepEqual((await store.listShares(first)).map((share) => share.id), [second]);
  assert.deepEqual((await store.listShares()).map((share) => share.id), [second, first]);
  assert.equal((await store.findShareByItem("recipe", 1))?.id, second);
  await store.updateShare(first, { url: "https://a.example", kind: "trip", status: "saved", itemId: 7, title: "Trip", message: "Saved to Trips: Trip", content: "caption text", imageUrl: null });
  assert.equal((await store.getShare(first))?.status, "saved");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w server`
Expected: FAIL, cannot find module `store.js` (and `createRecipe` ignores `sourceUrl`).

- [ ] **Step 3: Schema**

In `server/src/db.ts`, inside the `database.exec` template in `initializeSchema`, directly after the line `CREATE INDEX IF NOT EXISTS idx_assistant_messages_conversation ON assistant_messages(conversation_id, id);` add:

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
      image_url TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
```

After the line `await ensureColumn(database, "travel_deals", "image_url", "TEXT");` add:

```ts
  await ensureColumn(database, "recipes", "source_url", "TEXT");
  await ensureColumn(database, "recipes", "source_name", "TEXT");
  // A shared link is saved once; manual and AI recipes have no link and are not affected.
  await database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_source_url ON recipes(source_url) WHERE source_url IS NOT NULL");
```

- [ ] **Step 4: Shared types**

In `shared/src/index.ts`, in `interface Recipe`, replace:

```ts
  imageUrl?: string | null;
  source: string;
  createdAt: string;
}
```

with:

```ts
  imageUrl?: string | null;
  source: string;
  /** The link it was shared from, tidied. */
  sourceUrl?: string | null;
  /** Who made it, e.g. "heresyourbite on Instagram". */
  sourceName?: string | null;
  createdAt: string;
}
```

In `interface TravelInspiration`, replace `  source: "instagram" | "manual";` with `  source: "instagram" | "manual" | "web";`.

Append to the end of `shared/src/index.ts`:

```ts
export type ShareKind = "recipe" | "trip";
export type ShareStatus = "saved" | "duplicate" | "unrecognized" | "failed";

/** What POST /api/share returns; the phone shows `message` as a notification. */
export interface ShareResult {
  status: ShareStatus;
  kind: ShareKind | null;
  id: number | null;
  title: string | null;
  message: string;
  shareId: number | null;
  imageUrl: string | null;
}

/** One row of share history, for the wall banner and Settings. */
export interface ShareImport {
  id: number;
  url: string | null;
  kind: ShareKind | null;
  status: ShareStatus;
  itemId: number | null;
  title: string | null;
  message: string;
  imageUrl: string | null;
  createdAt: string;
}
```

- [ ] **Step 5: Recipes and travel services**

In `server/src/services/recipes.ts`:

1. In `type RecipeRow`, replace `  image_url: string | null;\n  source: string;` with:

```ts
  image_url: string | null;
  source: string;
  source_url: string | null;
  source_name: string | null;
```

2. In `rowToRecipe`, replace `    source: row.source,\n    createdAt: row.created_at` with:

```ts
    source: row.source,
    sourceUrl: row.source_url,
    sourceName: row.source_name,
    createdAt: row.created_at
```

3. In `createRecipe`'s input type, replace `  imageUrl?: string | null;\n  source?: string;\n}): Promise<Recipe> {` with:

```ts
  imageUrl?: string | null;
  source?: string;
  sourceUrl?: string | null;
  sourceName?: string | null;
}): Promise<Recipe> {
```

4. Replace the insert:

```ts
    `INSERT INTO recipes (title, summary, servings, total_minutes, tags, ingredients, steps, image_url, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
```

with:

```ts
    `INSERT INTO recipes (title, summary, servings, total_minutes, tags, ingredients, steps, image_url, source, source_url, source_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
```

and replace the last argument `    input.source || "manual"\n  );` with:

```ts
    input.source || "manual",
    input.sourceUrl || null,
    input.sourceName || null
  );
```

In `server/src/services/travelInspirations.ts`, replace `  source: "instagram" | "manual";` (in `TravelRow`) with `  source: "instagram" | "manual" | "web";`, and `  source?: "instagram" | "manual";` (in `TravelInput`) with `  source?: "instagram" | "manual" | "web";`.

- [ ] **Step 6: The share store**

Create `server/src/services/share/store.ts`:

```ts
import type { ShareImport, ShareKind, ShareStatus } from "@mirror-dashboard/shared";
import { getDb } from "../../db.js";

type ShareRow = {
  id: number;
  url: string | null;
  kind: ShareKind | null;
  status: ShareStatus;
  item_id: number | null;
  title: string | null;
  message: string;
  content: string | null;
  image_url: string | null;
  created_at: string;
};

export type ShareRecord = {
  url: string | null;
  kind: ShareKind | null;
  status: ShareStatus;
  itemId: number | null;
  title: string | null;
  message: string;
  content: string | null;
  imageUrl: string | null;
};

// SQLite's CURRENT_TIMESTAMP is UTC with no zone marker; give the client ISO.
function iso(value: string) {
  return value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
}

function toRecord(row: ShareRow): ShareRecord & { id: number } {
  return { id: row.id, url: row.url, kind: row.kind, status: row.status, itemId: row.item_id, title: row.title, message: row.message, content: row.content, imageUrl: row.image_url };
}

function toShareImport(row: ShareRow): ShareImport {
  return { id: row.id, url: row.url, kind: row.kind, status: row.status, itemId: row.item_id, title: row.title, message: row.message, imageUrl: row.image_url, createdAt: iso(row.created_at) };
}

export async function recordShare(entry: ShareRecord): Promise<number> {
  const db = await getDb();
  const result = await db.run(
    "INSERT INTO share_imports (url, kind, status, item_id, title, message, content, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    entry.url, entry.kind, entry.status, entry.itemId, entry.title, entry.message, entry.content, entry.imageUrl
  );
  return Number(result.lastID);
}

export async function updateShare(id: number, entry: ShareRecord): Promise<void> {
  const db = await getDb();
  await db.run(
    "UPDATE share_imports SET url = ?, kind = ?, status = ?, item_id = ?, title = ?, message = ?, content = ?, image_url = ? WHERE id = ?",
    entry.url, entry.kind, entry.status, entry.itemId, entry.title, entry.message, entry.content, entry.imageUrl, id
  );
}

export async function getShare(id: number) {
  const db = await getDb();
  const row = await db.get<ShareRow>("SELECT * FROM share_imports WHERE id = ?", id);
  return row ? toRecord(row) : null;
}

/** The most recent share that produced this recipe or trip, so the wall can move it. */
export async function findShareByItem(kind: ShareKind, itemId: number) {
  const db = await getDb();
  const row = await db.get<ShareRow>("SELECT * FROM share_imports WHERE kind = ? AND item_id = ? ORDER BY id DESC LIMIT 1", kind, itemId);
  return row ? toRecord(row) : null;
}

/** Shares newer than `after`, oldest first (for the banner), or the latest 10, newest first (for Settings). */
export async function listShares(after?: number): Promise<ShareImport[]> {
  const db = await getDb();
  const rows = after
    ? await db.all<ShareRow[]>("SELECT * FROM share_imports WHERE id > ? ORDER BY id ASC LIMIT 20", after)
    : await db.all<ShareRow[]>("SELECT * FROM share_imports ORDER BY id DESC LIMIT 10");
  return rows.map(toShareImport);
}

export async function findDuplicate(url: string): Promise<{ kind: ShareKind; id: number; title: string } | null> {
  const db = await getDb();
  const recipe = await db.get<{ id: number; title: string }>("SELECT id, title FROM recipes WHERE source_url = ?", url);
  if (recipe) return { kind: "recipe", ...recipe };
  const trip = await db.get<{ id: number; title: string }>("SELECT id, title FROM travel_inspirations WHERE url = ?", url);
  return trip ? { kind: "trip", ...trip } : null;
}
```

- [ ] **Step 7: Run the tests and the type check**

Run: `npm test -w server` then `npm run typecheck`
Expected: tests PASS; typecheck clean across shared, server and client.

- [ ] **Step 8: Commit**

```bash
git add mirror-dashboard-app/server/src/db.ts mirror-dashboard-app/shared/src/index.ts mirror-dashboard-app/server/src/services/recipes.ts mirror-dashboard-app/server/src/services/travelInspirations.ts mirror-dashboard-app/server/src/services/share/store.ts mirror-dashboard-app/server/test/share/store.test.ts
git commit -m "Store share history and where recipes came from" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 8: Keep cover photos on the Pi

**Files:**
- Create: `server/src/services/share/images.ts`
- Test: `server/test/share/images.test.ts`

**Interfaces:**
- Consumes: `safeFetch`, `BROWSER_UA`, `Resolver` (Task 5); `config.databasePath`
- Produces: `SHARE_IMAGE_DIR: string`; `saveShareImage(imageUrl: string | null, options?: { dir?: string; fetchImpl?: typeof fetch; resolve?: Resolver }): Promise<string | null>` (returns `/media/{file}` or null, never throws)

- [ ] **Step 1: Write the failing test**

Create `server/test/share/images.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { saveShareImage } from "../../src/services/share/images.js";

const dir = mkdtempSync(path.join(tmpdir(), "share-images-"));
test.after(() => rmSync(dir, { recursive: true, force: true }));
const resolve = async () => ["93.184.216.34"];
const serve = (body: BodyInit, type: string) => (async () => new Response(body, { status: 200, headers: { "content-type": type } })) as typeof fetch;

test("stores a real image and returns its /media path", async () => {
  const saved = await saveShareImage("https://cdn.example/cover.jpg", { dir, resolve, fetchImpl: serve(new Uint8Array([255, 216, 255, 1]), "image/jpeg") });
  assert.match(saved ?? "", /^\/media\/[0-9a-f]{24}\.jpg$/);
  const file = path.join(dir, path.basename(saved!));
  assert.ok(existsSync(file));
  assert.deepEqual([...readFileSync(file)], [255, 216, 255, 1]);
});

test("refuses pages, SVG, oversized files, private hosts and missing links", async () => {
  assert.equal(await saveShareImage("https://cdn.example/x", { dir, resolve, fetchImpl: serve("<html>", "text/html") }), null);
  assert.equal(await saveShareImage("https://cdn.example/x.svg", { dir, resolve, fetchImpl: serve("<svg/>", "image/svg+xml") }), null);
  assert.equal(await saveShareImage("https://cdn.example/huge.png", { dir, resolve, fetchImpl: serve(new Uint8Array(5 * 1024 * 1024 + 1), "image/png") }), null);
  assert.equal(await saveShareImage("https://nas.local/x.jpg", { dir, resolve: async () => ["192.168.1.20"], fetchImpl: serve("x", "image/jpeg") }), null);
  assert.equal(await saveShareImage(null, { dir }), null);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w server`
Expected: FAIL, cannot find module `images.js`.

- [ ] **Step 3: Implement**

Create `server/src/services/share/images.ts`:

```ts
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../../config.js";
import { BROWSER_UA, safeFetch, type Resolver } from "./safeFetch.js";

/** Next to the database, so it moves with it and stays out of git (data/ is ignored). */
export const SHARE_IMAGE_DIR = path.join(path.dirname(config.databasePath), "share-images");

// No SVG: it can carry script, and the wall shows these images directly.
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif"
};

/**
 * Downloads a cover photo and keeps our own copy. Instagram's image links stop
 * working after a few days, so the Pi cannot just store the link. Returns the
 * /media path to store on the recipe or trip, or null; a missing photo never
 * stops a share from saving.
 */
export async function saveShareImage(
  imageUrl: string | null,
  options: { dir?: string; fetchImpl?: typeof fetch; resolve?: Resolver } = {}
): Promise<string | null> {
  if (!imageUrl) return null;
  try {
    const result = await safeFetch(imageUrl, {
      timeoutMs: 12_000,
      maxBytes: 5 * 1024 * 1024,
      headers: { "user-agent": BROWSER_UA },
      fetchImpl: options.fetchImpl,
      resolve: options.resolve
    });
    const extension = EXTENSIONS[result.contentType.split(";")[0].trim().toLowerCase()];
    if (result.status !== 200 || !extension || !result.body.length) return null;
    const dir = options.dir ?? SHARE_IMAGE_DIR;
    await mkdir(dir, { recursive: true });
    const file = `${randomBytes(12).toString("hex")}.${extension}`;
    await writeFile(path.join(dir, file), result.body);
    return `/media/${file}`;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mirror-dashboard-app/server/src/services/share/images.ts mirror-dashboard-app/server/test/share/images.test.ts
git commit -m "Keep shared cover photos on the Pi" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: The share pipeline

**Files:**
- Create: `server/src/services/share/pipeline.ts`, `server/src/services/share/deps.ts`
- Test: `server/test/share/pipeline.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–8; `createRecipe`, `deleteRecipe` (recipes.ts); `createTravelInspiration`, `deleteTravelInspiration` (travelInspirations.ts)
- Produces:
  - `MESSAGES` (the spec's reply strings)
  - `type ShareInput = { url: string | null; html: string | null; text: string | null }`
  - `type NewRecipe`, `type NewTrip`, `type ShareDeps` (see code)
  - `handleShare(input: ShareInput, deps: ShareDeps): Promise<ShareResult>`
  - `retryShare(id: number, deps: ShareDeps): Promise<ShareResult>`
  - `moveSharedItem(from: ShareKind, itemId: number, to: ShareKind, deps: ShareDeps): Promise<ShareResult>`
  - `createShareDeps(): ShareDeps` (deps.ts, the real wiring)

`pipeline.ts` imports only pure modules and types, so its tests never touch the database or the network.

- [ ] **Step 1: Write the failing test**

Create `server/test/share/pipeline.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ClassifyUnavailableError } from "../../src/services/share/classify.js";
import { MESSAGES, handleShare, moveSharedItem, retryShare, type NewRecipe, type NewTrip, type ShareDeps } from "../../src/services/share/pipeline.js";
import type { ShareRecord } from "../../src/services/share/store.js";

function fake(overrides: Partial<ShareDeps> = {}) {
  const calls = { recipes: [] as NewRecipe[], trips: [] as NewTrip[], records: [] as ShareRecord[], classified: [] as unknown[], fetched: [] as string[], deleted: [] as string[], updates: [] as Array<[number, ShareRecord]> };
  const deps: ShareDeps = {
    findDuplicate: async () => null,
    fetchPage: async (url) => { calls.fetched.push(url); return null; },
    classify: async (input) => { calls.classified.push(input); return { kind: "neither", title: null }; },
    saveImage: async (url) => (url ? "/media/cover.jpg" : null),
    saveRecipe: async (recipe) => { calls.recipes.push(recipe); return { id: 11, title: recipe.title }; },
    saveTrip: async (trip) => { calls.trips.push(trip); return { id: 22, title: trip.title }; },
    deleteItem: async (kind, id) => { calls.deleted.push(`${kind}:${id}`); },
    record: async (entry) => { calls.records.push(entry); return calls.records.length; },
    update: async (id, entry) => { calls.updates.push([id, entry]); },
    getShare: async () => null,
    findShareByItem: async () => null,
    ...overrides
  };
  return { deps, calls };
}

const RECIPE_PAGE = `<html><head><meta property="og:site_name" content="Budget Bytes"><script type="application/ld+json">${JSON.stringify({
  "@type": "Recipe", name: "Weeknight Chili", recipeIngredient: ["1 lb ground beef", "1 onion, diced"],
  recipeInstructions: ["Brown the beef.", "Add the onion."], image: "https://img.example/chili.jpg", totalTime: "PT40M"
})}</script></head><body>${"<p>Chili is great.</p>".repeat(20)}</body></html>`;

const EMBED = `<img class="EmbeddedMediaImage" src="https://cdn.example/soup.jpg" /><div class="Caption"><a class="CaptionUsername" href="#">heresyourbite</a><br />Creamy Chicken Noodle Soup<br />2 tbsp butter<br />full recipe in my bio!</div>`;

const soup = { kind: "recipe" as const, title: "Creamy Chicken Noodle Soup", summary: null, sourceName: null, servings: null, totalMinutes: null, tags: [], ingredients: [{ name: "butter", quantity: "2 tbsp", category: "Dairy" }], steps: [] };

test("a link already saved is reported and nothing is fetched", async () => {
  const { deps, calls } = fake({ findDuplicate: async () => ({ kind: "recipe", id: 5, title: "Soup" }) });
  const result = await handleShare({ url: "https://site.example/soup?utm_source=x", html: null, text: null }, deps);
  assert.equal(result.status, "duplicate");
  assert.equal(result.message, "Already in Recipes: Soup");
  assert.deepEqual(calls.fetched, []);
});

test("a recipe page sent by the phone is read without Claude", async () => {
  const { deps, calls } = fake();
  const result = await handleShare({ url: "https://www.allrecipes.com/recipe/1/chili/?utm_medium=s", html: RECIPE_PAGE, text: null }, deps);
  assert.equal(result.message, "Saved to Recipes: Weeknight Chili");
  assert.equal(calls.classified.length, 0);
  assert.deepEqual(calls.fetched, []);
  const saved = calls.recipes[0];
  assert.equal(saved.sourceUrl, "https://www.allrecipes.com/recipe/1/chili");
  assert.equal(saved.sourceName, "Budget Bytes");
  assert.equal(saved.source, "web");
  assert.equal(saved.totalMinutes, 40);
  assert.equal(saved.imageUrl, "/media/cover.jpg");
  assert.deepEqual(saved.ingredients[0], { name: "ground beef", quantity: "1 lb", category: "Meat" });
  assert.deepEqual(saved.steps, ["Brown the beef.", "Add the onion."]);
  assert.equal(calls.records[0].status, "saved");
});

test("an Instagram reel is read from the embed page and saved with no invented steps", async () => {
  const { deps, calls } = fake({
    fetchPage: async (url) => (url.endsWith("/embed/captioned/") ? { status: 200, html: EMBED } : null),
    classify: async (input) => { calls.classified.push(input); return soup; }
  });
  const result = await handleShare({ url: "https://www.instagram.com/reel/DOmW6LTkqcq/?stkn=abc", html: null, text: null }, deps);
  assert.equal(result.message, "Saved to Recipes: Creamy Chicken Noodle Soup");
  assert.match((calls.classified[0] as { text: string }).text, /2 tbsp butter/);
  assert.equal(calls.recipes[0].source, "instagram");
  assert.equal(calls.recipes[0].sourceName, "heresyourbite on Instagram");
  assert.deepEqual(calls.recipes[0].steps, []);
});

test("a travel post goes to Trips", async () => {
  const { deps, calls } = fake({
    fetchPage: async () => ({ status: 200, html: EMBED.replace("Creamy Chicken Noodle Soup", "48 hours in Savannah") }),
    classify: async () => ({ kind: "trip", title: "Savannah, Georgia", summary: "Moss and squares", sourceName: null, location: "Savannah, GA", notes: null, tags: ["weekend"] })
  });
  const result = await handleShare({ url: "https://www.instagram.com/p/abc/", html: null, text: null }, deps);
  assert.equal(result.message, "Saved to Trips: Savannah, Georgia");
  assert.equal(calls.trips[0].url, "https://www.instagram.com/p/abc");
  assert.equal(calls.trips[0].notes, "Moss and squares");
  assert.equal(calls.trips[0].thumbnailUrl, "/media/cover.jpg");
});

test("something that is neither saves nothing", async () => {
  const { deps, calls } = fake({ fetchPage: async () => ({ status: 200, html: `<p>${"Election news. ".repeat(30)}</p>` }) });
  const result = await handleShare({ url: "https://news.example/story", html: null, text: null }, deps);
  assert.equal(result.status, "unrecognized");
  assert.equal(result.message, MESSAGES.unrecognized);
  assert.equal(calls.recipes.length + calls.trips.length, 0);
});

test("a site that blocks the Pi with nothing from the phone gets the Safari advice", async () => {
  const { deps, calls } = fake({ fetchPage: async () => ({ status: 403, html: "<title>Simple Page</title>" }) });
  const result = await handleShare({ url: "https://www.allrecipes.com/recipe/2/", html: null, text: null }, deps);
  assert.equal(result.status, "failed");
  assert.equal(result.message, MESSAGES.blocked);
  assert.equal(calls.classified.length, 0);
});

test("a hidden Instagram post asks for the caption", async () => {
  const { deps } = fake({ fetchPage: async () => ({ status: 200, html: "<p>Log in</p>" }) });
  const result = await handleShare({ url: "https://www.instagram.com/p/private/", html: null, text: null }, deps);
  assert.equal(result.message, MESSAGES.hidden);
});

test("shared text alone is classified", async () => {
  const { deps, calls } = fake({ classify: async (input) => { calls.classified.push(input); return soup; } });
  const result = await handleShare({ url: null, html: null, text: "Creamy soup\n2 tbsp butter" }, deps);
  assert.equal(result.status, "saved");
  assert.equal(calls.recipes[0].sourceUrl, null);
});

test("when Claude is unavailable the share is kept for retry, and retry saves it", async () => {
  const { deps, calls } = fake({
    fetchPage: async () => ({ status: 200, html: EMBED }),
    classify: async () => { throw new ClassifyUnavailableError("529"); }
  });
  const failed = await handleShare({ url: "https://www.instagram.com/reel/x/", html: null, text: null }, deps);
  assert.equal(failed.message, MESSAGES.unavailable);
  const stored = calls.records[0];
  assert.match(stored.content ?? "", /2 tbsp butter/);
  assert.equal(stored.imageUrl, "/media/cover.jpg");

  const retry = fake({ getShare: async () => ({ id: 1, ...stored }), classify: async () => soup });
  const result = await retryShare(1, retry.deps);
  assert.equal(result.message, "Saved to Recipes: Creamy Chicken Noodle Soup");
  assert.equal(retry.calls.recipes[0].imageUrl, "/media/cover.jpg");
  assert.equal(retry.calls.updates[0][1].status, "saved");
});

test("moving a recipe to Trips saves the trip first, then removes the recipe", async () => {
  const share = { id: 3, url: "https://www.instagram.com/p/abc", kind: "recipe" as const, status: "saved" as const, itemId: 11, title: "Soup", message: "Saved to Recipes: Soup", content: "Savannah caption", imageUrl: "/media/c.jpg" };
  const { deps, calls } = fake({
    findShareByItem: async () => share,
    classify: async (input) => { calls.classified.push(input); return { kind: "trip", title: "Savannah", summary: null, sourceName: null, location: "Savannah, GA", notes: null, tags: [] }; }
  });
  const result = await moveSharedItem("recipe", 11, "trip", deps);
  assert.equal(result.message, "Saved to Trips: Savannah");
  assert.equal((calls.classified[0] as { forceKind: string }).forceKind, "trip");
  assert.deepEqual(calls.deleted, ["recipe:11"]);
  assert.equal(calls.updates[0][1].kind, "trip");
});

test("only shared items can be moved", async () => {
  const { deps } = fake();
  const result = await moveSharedItem("recipe", 99, "trip", deps);
  assert.equal(result.status, "failed");
  assert.equal(result.message, "Only things shared from your phone can be moved.");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w server`
Expected: FAIL, cannot find module `pipeline.js`.

- [ ] **Step 3: Implement the pipeline**

Create `server/src/services/share/pipeline.ts`:

```ts
import { createHash } from "node:crypto";
import type { RecipeIngredient, ShareKind, ShareResult } from "@mirror-dashboard/shared";
import { ClassifyUnavailableError, type ShareExtraction } from "./classify.js";
import { metaContent, readableText } from "./html.js";
import { splitIngredient } from "./ingredients.js";
import { parseInstagramEmbed, type InstagramEmbed } from "./instagram.js";
import { findJsonLdRecipe, type ParsedRecipe } from "./recipeJsonLd.js";
import type { ShareRecord } from "./store.js";
import { instagramEmbedUrl, instagramPost, tidyUrl } from "./tidyUrl.js";

export const MESSAGES = {
  blocked: "That site blocked the Pi. Share it from Safari so your phone sends the page.",
  hidden: "Instagram hid that post. Copy the caption and share the text instead.",
  unavailable: "Couldn't read that one right now. It's in Recent shares to retry.",
  unrecognized: "Couldn't find a recipe or trip idea in that post",
  notMovable: "Only things shared from your phone can be moved.",
  gone: "That share is no longer in the history."
};

export type ShareInput = { url: string | null; html: string | null; text: string | null };

export type NewRecipe = {
  title: string; summary: string | null; servings: number | null; totalMinutes: number | null; tags: string[];
  ingredients: RecipeIngredient[]; steps: string[]; imageUrl: string | null;
  source: "instagram" | "web"; sourceUrl: string | null; sourceName: string | null;
};

export type NewTrip = {
  url: string; title: string; location: string | null; notes: string | null; tags: string[];
  thumbnailUrl: string | null; source: "instagram" | "web";
};

export type ShareDeps = {
  findDuplicate(url: string): Promise<{ kind: ShareKind; id: number; title: string } | null>;
  /** null when the page could not be fetched at all (blocked host, timeout, network). */
  fetchPage(url: string): Promise<{ status: number; html: string } | null>;
  classify(input: { url: string | null; text: string; forceKind?: ShareKind }): Promise<ShareExtraction>;
  /** Never throws; null when there is no usable photo. */
  saveImage(imageUrl: string | null): Promise<string | null>;
  saveRecipe(recipe: NewRecipe): Promise<{ id: number; title: string }>;
  saveTrip(trip: NewTrip): Promise<{ id: number; title: string }>;
  deleteItem(kind: ShareKind, id: number): Promise<void>;
  record(entry: ShareRecord): Promise<number>;
  update(id: number, entry: ShareRecord): Promise<void>;
  getShare(id: number): Promise<(ShareRecord & { id: number }) | null>;
  findShareByItem(kind: ShareKind, itemId: number): Promise<(ShareRecord & { id: number }) | null>;
};

type Gathered = {
  url: string | null;
  text: string;
  jsonLd: ParsedRecipe | null;
  imageCandidate: string | null;
  sourceName: string | null;
  problem: "blocked" | "hidden" | null;
  fromInstagram: boolean;
};

type Outcome = Omit<ShareRecord, "url">;

const label = (kind: ShareKind) => (kind === "recipe" ? "Recipes" : "Trips");

function hostName(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function failed(message: string, shareId: number | null = null): ShareResult {
  return { status: "failed", kind: null, id: null, title: null, message, shareId, imageUrl: null };
}

function toResult(entry: Outcome, shareId: number): ShareResult {
  return { status: entry.status, kind: entry.kind, id: entry.itemId, title: entry.title, message: entry.message, shareId, imageUrl: entry.imageUrl };
}

/** Get the words to read, in the order: the page the phone sent, Instagram's embed page, the Pi's own fetch, the shared text. */
async function gather(input: ShareInput, url: string | null, deps: ShareDeps): Promise<Gathered> {
  const post = url ? instagramPost(url) : null;
  let html = input.html && input.html.length > 200 ? input.html : null;
  let embed: InstagramEmbed | null = null;
  let problem: Gathered["problem"] = null;

  if (post) {
    const page = await deps.fetchPage(instagramEmbedUrl(post));
    embed = page && page.status === 200 ? parseInstagramEmbed(page.html) : null;
    if (!embed && !html) problem = "hidden";
  } else if (url && !html) {
    const page = await deps.fetchPage(url);
    if (page && page.status === 200) html = page.html;
    else problem = "blocked";
  }

  const jsonLd = html ? findJsonLdRecipe(html) : null;
  // A phone-sent Instagram page only has the caption in its preview tag.
  const pageText = embed ? embed.caption : html ? (post ? metaContent(html, ["og:description"]) ?? "" : readableText(html)) : "";
  const shared = input.text?.trim() ?? "";
  const text = [pageText, shared && shared !== pageText ? shared : ""].filter(Boolean).join("\n\n").slice(0, 20000);

  return {
    url,
    text,
    jsonLd,
    imageCandidate: jsonLd?.imageUrl ?? embed?.imageUrl ?? (html ? metaContent(html, ["og:image", "twitter:image"]) : null),
    sourceName: jsonLd?.author ?? (embed?.author ? `${embed.author} on Instagram` : null) ?? (html ? metaContent(html, ["og:site_name"]) : null) ?? hostName(url),
    problem: text || jsonLd ? null : problem,
    fromInstagram: Boolean(post)
  };
}

function fromJsonLd(recipe: ParsedRecipe): ShareExtraction {
  return {
    kind: "recipe", title: recipe.title, summary: recipe.summary, sourceName: recipe.author,
    servings: recipe.servings, totalMinutes: recipe.totalMinutes, tags: recipe.tags,
    ingredients: recipe.ingredientLines.map(splitIngredient), steps: recipe.steps
  };
}

/** Save the extraction where it belongs and describe the result for the share history. */
async function outcome(extraction: ShareExtraction, gathered: Gathered, imageUrl: string | null, deps: ShareDeps): Promise<Outcome> {
  if (extraction.kind === "neither") {
    return { kind: null, status: "unrecognized", itemId: null, title: extraction.title, message: MESSAGES.unrecognized, content: gathered.text, imageUrl: null };
  }
  const source = gathered.fromInstagram ? "instagram" : "web";
  const sourceName = extraction.sourceName ?? gathered.sourceName;
  const saved = extraction.kind === "recipe"
    ? await deps.saveRecipe({
        title: extraction.title, summary: extraction.summary, servings: extraction.servings, totalMinutes: extraction.totalMinutes,
        tags: extraction.tags, ingredients: extraction.ingredients, steps: extraction.steps, imageUrl, source, sourceUrl: gathered.url, sourceName
      })
    : await deps.saveTrip({
        // Trip ideas need a unique link; shared text gets a stable stand-in.
        url: gathered.url ?? `shared-text:${createHash("sha1").update(gathered.text).digest("hex").slice(0, 16)}`,
        title: extraction.title, location: extraction.location, notes: extraction.notes ?? extraction.summary,
        tags: extraction.tags, thumbnailUrl: imageUrl, source
      });
  return {
    kind: extraction.kind, status: "saved", itemId: saved.id, title: saved.title,
    message: `Saved to ${label(extraction.kind)}: ${saved.title}`, content: gathered.text, imageUrl
  };
}

export async function handleShare(input: ShareInput, deps: ShareDeps): Promise<ShareResult> {
  const url = input.url ? tidyUrl(input.url) : null;
  const finish = async (entry: Outcome) => toResult(entry, await deps.record({ url, ...entry }));

  if (url) {
    const duplicate = await deps.findDuplicate(url);
    if (duplicate) {
      return finish({ kind: duplicate.kind, status: "duplicate", itemId: duplicate.id, title: duplicate.title, message: `Already in ${label(duplicate.kind)}: ${duplicate.title}`, content: null, imageUrl: null });
    }
  }

  const gathered = await gather(input, url, deps);
  if (gathered.problem) return finish({ kind: null, status: "failed", itemId: null, title: null, message: MESSAGES[gathered.problem], content: null, imageUrl: null });
  if (!gathered.text && !gathered.jsonLd) return finish({ kind: null, status: "unrecognized", itemId: null, title: null, message: MESSAGES.unrecognized, content: null, imageUrl: null });

  // The photo downloads while Claude reads, so a share fits in about 20 seconds.
  const image = deps.saveImage(gathered.imageCandidate);
  let extraction: ShareExtraction;
  if (gathered.jsonLd) {
    extraction = fromJsonLd(gathered.jsonLd);
  } else {
    try {
      extraction = await deps.classify({ url, text: gathered.text });
    } catch (error) {
      if (!(error instanceof ClassifyUnavailableError)) throw error;
      return finish({ kind: null, status: "failed", itemId: null, title: null, message: MESSAGES.unavailable, content: gathered.text, imageUrl: await image });
    }
  }
  return finish(await outcome(extraction, gathered, await image, deps));
}

function storedGathered(share: ShareRecord): Gathered {
  return {
    url: share.url, text: share.content ?? "", jsonLd: null, imageCandidate: null,
    sourceName: hostName(share.url), problem: null, fromInstagram: Boolean(share.url && instagramPost(share.url))
  };
}

/** Re-read a share that failed because Claude was unavailable. */
export async function retryShare(id: number, deps: ShareDeps): Promise<ShareResult> {
  const share = await deps.getShare(id);
  if (!share) return failed(MESSAGES.gone);
  if (share.status !== "failed" || !share.content) return toResult(share, share.id);
  let extraction: ShareExtraction;
  try {
    extraction = await deps.classify({ url: share.url, text: share.content });
  } catch (error) {
    if (error instanceof ClassifyUnavailableError) return toResult(share, share.id);
    throw error;
  }
  const entry = await outcome(extraction, storedGathered(share), share.imageUrl, deps);
  await deps.update(share.id, { url: share.url, ...entry });
  return toResult(entry, share.id);
}

/** Fix a wrong guess: read the share again as the other kind, save it there, then remove the old item. */
export async function moveSharedItem(from: ShareKind, itemId: number, to: ShareKind, deps: ShareDeps): Promise<ShareResult> {
  const share = await deps.findShareByItem(from, itemId);
  if (!share || !share.content) return failed(MESSAGES.notMovable);
  if (from === to) return toResult(share, share.id);
  let extraction: ShareExtraction;
  try {
    extraction = await deps.classify({ url: share.url, text: share.content, forceKind: to });
  } catch (error) {
    if (error instanceof ClassifyUnavailableError) return failed(MESSAGES.unavailable, share.id);
    throw error;
  }
  if (extraction.kind !== to) return failed(`Couldn't read that as a ${to === "recipe" ? "recipe" : "trip idea"}.`, share.id);
  // Save the new item before deleting the old one, so a failure never loses both.
  const entry = await outcome(extraction, storedGathered(share), share.imageUrl, deps);
  await deps.deleteItem(from, itemId);
  await deps.update(share.id, { url: share.url, ...entry });
  return toResult(entry, share.id);
}
```

- [ ] **Step 4: Wire the real dependencies**

Create `server/src/services/share/deps.ts`:

```ts
import { createRecipe, deleteRecipe } from "../recipes.js";
import { createTravelInspiration, deleteTravelInspiration } from "../travelInspirations.js";
import { classifyShare } from "./classify.js";
import { saveShareImage } from "./images.js";
import type { ShareDeps } from "./pipeline.js";
import { BROWSER_UA, safeFetch } from "./safeFetch.js";
import * as store from "./store.js";

export function createShareDeps(): ShareDeps {
  return {
    findDuplicate: store.findDuplicate,
    fetchPage: async (url) => {
      try {
        const result = await safeFetch(url, {
          timeoutMs: 8_000,
          maxBytes: 8 * 1024 * 1024,
          headers: { "user-agent": BROWSER_UA, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8", "accept-language": "en-US,en;q=0.9" }
        });
        return { status: result.status, html: result.body.toString("utf8") };
      } catch {
        return null;
      }
    },
    classify: (input) => classifyShare(input),
    saveImage: (imageUrl) => saveShareImage(imageUrl),
    saveRecipe: async (recipe) => {
      const saved = await createRecipe(recipe);
      return { id: saved.id, title: saved.title };
    },
    saveTrip: async (trip) => {
      const saved = await createTravelInspiration(trip);
      return { id: saved.id, title: saved.title };
    },
    deleteItem: async (kind, id) => {
      if (kind === "recipe") await deleteRecipe(id);
      else await deleteTravelInspiration(id);
    },
    record: store.recordShare,
    update: store.updateShare,
    getShare: store.getShare,
    findShareByItem: store.findShareByItem
  };
}
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npm test -w server` then `npm run typecheck -w server`
Expected: all tests PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add mirror-dashboard-app/server/src/services/share/pipeline.ts mirror-dashboard-app/server/src/services/share/deps.ts mirror-dashboard-app/server/test/share/pipeline.test.ts
git commit -m "Turn a share into a saved recipe or trip idea" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 10: Routes, the 8 MB parser, photos and share errors

**Files:**
- Modify: `server/src/index.ts`

**Interfaces:**
- Consumes: `handleShare`, `retryShare`, `moveSharedItem` (pipeline.ts), `createShareDeps` (deps.ts), `listShares` (store.ts), `SHARE_IMAGE_DIR` (images.ts), the existing `firstText` helper in index.ts
- Produces (HTTP): `POST /api/share`, `GET /api/share/recent?after=`, `POST /api/share/:id/retry`, `POST /api/share/move` (`{ from, id, to }`), `GET /media/:file`; every `/api/share` response carries a `message`

`index.ts` starts listening when imported, so these routes are checked with the dev server and curl rather than unit tests; the logic behind them is already tested.

- [ ] **Step 1: Imports**

After the line `import { createRecipe, deleteRecipe, generateRecipe, getMealPlan, listRecipes, pushPlanToGrocery, setMeal, suggestWeek } from "./services/recipes.js";` add:

```ts
import { createShareDeps } from "./services/share/deps.js";
import { SHARE_IMAGE_DIR } from "./services/share/images.js";
import { handleShare, moveSharedItem, retryShare } from "./services/share/pipeline.js";
import { listShares } from "./services/share/store.js";
```

- [ ] **Step 2: The share body parser**

Replace `app.use(express.json({ limit: "1mb" }));` with:

```ts
// Shares carry the whole page the phone downloaded, so this one route takes up
// to 8 MB. It runs first; the global parser then sees the body already parsed.
app.use("/api/share", express.json({ limit: "8mb" }));
app.use(express.json({ limit: "1mb" }));
```

- [ ] **Step 3: The routes**

Directly above the line `if (fs.existsSync(config.clientDistPath)) {` add:

```ts
const NOTHING_TO_SAVE = "Nothing to save: share a link or some text.";

app.post("/api/share", async (req, res, next) => {
  try {
    const url = firstText(req.body, ["url", "URL", "link", "Link", "postUrl", "Post URL"]) || null;
    const text = firstText(req.body, ["text", "Text"]) || null;
    const html = typeof req.body?.html === "string" ? req.body.html : null;
    if (!url && !text) {
      return res.status(400).json({ status: "failed", kind: null, id: null, title: null, shareId: null, imageUrl: null, message: NOTHING_TO_SAVE });
    }
    res.json(await handleShare({ url, html, text }, createShareDeps()));
  } catch (error) {
    next(error);
  }
});

app.get("/api/share/recent", async (req, res, next) => {
  try {
    const after = Number(req.query.after);
    res.json(await listShares(Number.isInteger(after) && after > 0 ? after : undefined));
  } catch (error) {
    next(error);
  }
});

app.post("/api/share/move", async (req, res, next) => {
  try {
    const { from, to } = req.body ?? {};
    const id = Number(req.body?.id);
    const kinds = ["recipe", "trip"];
    if (!kinds.includes(from) || !kinds.includes(to) || !Number.isInteger(id)) {
      return res.status(400).json({ status: "failed", kind: null, id: null, title: null, shareId: null, imageUrl: null, message: "Say what to move and where: recipe or trip." });
    }
    res.json(await moveSharedItem(from, id, to, createShareDeps()));
  } catch (error) {
    next(error);
  }
});

app.post("/api/share/:id/retry", async (req, res, next) => {
  try {
    res.json(await retryShare(Number(req.params.id), createShareDeps()));
  } catch (error) {
    next(error);
  }
});

// Cover photos saved from shares. fallthrough: false turns a missing file into a 404 instead of the app shell.
app.use("/media", express.static(SHARE_IMAGE_DIR, { fallthrough: false, maxAge: "30d" }));
```

- [ ] **Step 4: Share errors always carry a message**

Replace:

```ts
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof VoiceCommandError) return res.status(error.status).json({ error: error.message });
```

with:

```ts
app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // The Shortcut shows `message` as a notification, so a share must never come back without one.
  if (req.path.startsWith("/api/share")) {
    const failure = { status: "failed", kind: null, id: null, title: null, shareId: null, imageUrl: null };
    if (isBodyParserError(error)) {
      const tooBig = error.type === "entity.too.large";
      return res.status(tooBig ? 413 : 400).json({ ...failure, message: tooBig ? "That page was too big to send. Try sharing the link only." : NOTHING_TO_SAVE });
    }
    console.error(error);
    return res.status(500).json({ ...failure, message: "Something went wrong on the Pi saving that share." });
  }
  if (error instanceof VoiceCommandError) return res.status(error.status).json({ error: error.message });
```

At the end of `index.ts`, next to `firstText`, add:

```ts
function isBodyParserError(error: unknown): error is { type: string; status: number } {
  return Boolean(
    error && typeof error === "object"
    && typeof (error as { type?: unknown }).type === "string"
    && typeof (error as { status?: unknown }).status === "number"
  );
}
```

- [ ] **Step 5: Type check**

Run: `npm run typecheck -w server`
Expected: clean.

- [ ] **Step 6: Check the routes on the dev server**

Start the server locally with `npm run dev -w server` (it listens on 4174 and uses the laptop's own `data/` database). Then, from `mirror-dashboard-app/`:

```bash
curl -s -X POST localhost:4174/api/share -H "Content-Type: application/json" -d "{}"
```
Expected: HTTP 400, `"message":"Nothing to save: share a link or some text."`

```bash
node -e "const r={'@type':'Recipe',name:'Plan Check Chili',recipeIngredient:['1 lb ground beef'],recipeInstructions:['Cook it.']};require('fs').writeFileSync('share-check.json',JSON.stringify({url:'https://example.com/plan-check-chili?utm_source=x',html:'<script type=\"application/ld+json\">'+JSON.stringify(r)+'</script>'+'<p>filler</p>'.repeat(40)}))"
curl -s -X POST localhost:4174/api/share -H "Content-Type: application/json" --data-binary @share-check.json
```
Expected: `"status":"saved"`, `"message":"Saved to Recipes: Plan Check Chili"` (no Claude call; works without an API key).

```bash
curl -s -X POST localhost:4174/api/share -H "Content-Type: application/json" --data-binary @share-check.json
```
Expected: `"status":"duplicate"`, `"message":"Already in Recipes: Plan Check Chili"`.

```bash
node -e "require('fs').writeFileSync('share-big.json',JSON.stringify({url:'https://example.com/big',html:'x'.repeat(9*1024*1024)}))"
curl -s -o - -w "\nHTTP %{http_code}\n" -X POST localhost:4174/api/share -H "Content-Type: application/json" --data-binary @share-big.json
curl -s "localhost:4174/api/share/recent"
```
Expected: HTTP 413 with `"message":"That page was too big to send. Try sharing the link only."`; the recent list shows the saved and duplicate shares.

Clean up: note the recipe id from the saved response and run `curl -s -X DELETE localhost:4174/api/recipes/{id}`, delete `share-check.json` and `share-big.json`, and stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add mirror-dashboard-app/server/src/index.ts
git commit -m "Add the share routes and serve saved photos" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Recipes, trips and Settings on the wall

**Files:**
- Modify: `client/src/api.ts`, `client/src/App.tsx`

**Interfaces:**
- Consumes: `ShareImport`, `ShareResult`, `ShareKind` (shared); the HTTP routes from Task 10
- Produces: `fetchRecentShares(after?: number): Promise<ShareImport[]>`, `retryShare(id: number): Promise<ShareResult>`, `moveSharedItem(from: ShareKind, id: number, to: ShareKind): Promise<ShareResult>` (api.ts); `RecentShares` component; `SlideQr` gains an optional `label`

- [ ] **Step 1: Client API**

In `client/src/api.ts`, replace `import type { ApiIntegrationStatus, ` (the start of the first line) with `import type { ShareImport, ShareKind, ShareResult, ApiIntegrationStatus, `.

Append to `client/src/api.ts`:

```ts
export function fetchRecentShares(after?: number) {
  return request<ShareImport[]>(`/api/share/recent${after ? `?after=${after}` : ""}`);
}

export function retryShare(id: number) {
  return request<ShareResult>(`/api/share/${id}/retry`, { method: "POST" });
}

export function moveSharedItem(from: ShareKind, id: number, to: ShareKind) {
  return request<ShareResult>("/api/share/move", { method: "POST", body: JSON.stringify({ from, id, to }) });
}
```

- [ ] **Step 2: App imports**

In `client/src/App.tsx`:
- Replace `import type { ApiIntegrationStatus, HomeCard,` with `import type { ShareImport, ApiIntegrationStatus, HomeCard,`.
- In the multi-line import from `./api`, replace the line `  fetchTravelInspirations,` with:

```ts
  fetchTravelInspirations,
  fetchRecentShares,
  moveSharedItem,
  retryShare,
```

- [ ] **Step 3: Recipe cards show the photo and credit**

In `RecipesPanel`, replace:

```tsx
              <p className="line-clamp-2 text-xl font-black leading-tight text-amb-ink">{recipe.title}</p>
              <p className="mt-1 line-clamp-2 text-base text-amb-muted">{recipe.summary}</p>
```

with:

```tsx
              {recipe.imageUrl ? <img src={recipe.imageUrl} alt="" loading="lazy" className="mb-3 aspect-[4/3] w-full rounded-xl object-cover" /> : null}
              <p className="line-clamp-2 text-xl font-black leading-tight text-amb-ink">{recipe.title}</p>
              <p className="mt-1 line-clamp-2 text-base text-amb-muted">{recipe.summary}</p>
              {recipe.sourceName ? <p className="mt-1 truncate text-sm font-semibold text-amb-muted">{recipe.sourceName}</p> : null}
```

- [ ] **Step 4: SlideQr takes a label**

Replace `function SlideQr({ url }: { url: string }) {` with `function SlideQr({ url, label = "Scan to open on your phone" }: { url: string; label?: string }) {`, and inside it replace `Scan to open on your phone</p>` with `{label}</p>`.

- [ ] **Step 5: The recipe dialog**

In `RecipeDialog`:

1. After `  const [confirming, setConfirming] = useState(false);` add `  const [moveMessage, setMoveMessage] = useState<string | null>(null);`
2. Replace:

```tsx
          <h2 className="text-4xl font-black leading-tight text-amb-ink">{recipe.title}</h2>
          <p className="mt-2 text-xl text-amb-muted">{recipe.summary}</p>
```

with:

```tsx
          <div className="flex gap-6">
            {recipe.imageUrl ? <img src={recipe.imageUrl} alt="" className="h-36 w-48 shrink-0 rounded-2xl object-cover" /> : null}
            <div className="min-w-0">
              <h2 className="text-4xl font-black leading-tight text-amb-ink">{recipe.title}</h2>
              {recipe.sourceName ? <p className="mt-1 text-lg font-semibold text-amb-muted">From {recipe.sourceName}</p> : null}
              <p className="mt-2 text-xl text-amb-muted">{recipe.summary}</p>
            </div>
          </div>
```

3. Replace `            <ol className="mt-4 space-y-4">` with:

```tsx
            {!recipe.steps.length ? <p className="mt-4 text-xl font-semibold text-amb-ink">Method: see the original post</p> : null}
            <ol className="mt-4 space-y-4">
```

4. Replace:

```tsx
            </ol>
          </div>
        </div>

        <div className="flex shrink-0 gap-3 border-t border-mirror-line p-6">
```

with:

```tsx
            </ol>
            {recipe.sourceUrl ? <div className="mt-6"><SlideQr url={recipe.sourceUrl} label="Open the original on your phone" /></div> : null}
          </div>
        </div>

        <div className="flex shrink-0 gap-3 border-t border-mirror-line p-6">
          {recipe.sourceUrl ? (
            <button
              onClick={() => moveSharedItem("recipe", recipe.id, "trip").then((result) => (result.status === "saved" ? onDeleted() : setMoveMessage(result.message))).catch((err: Error) => setMoveMessage(err.message))}
              className="min-h-16 w-64 rounded-2xl bg-amb-well text-xl font-bold text-amb-ink active:scale-95"
            >
              {moveMessage ?? "This is a trip idea"}
            </button>
          ) : null}
```

- [ ] **Step 6: Trip idea cards**

In `TravelHubPanel`, after the `removeInspiration` function add:

```ts
  async function moveInspiration(id: number) {
    const result = await moveSharedItem("trip", id, "recipe").catch((err: Error) => ({ status: "failed" as const, message: err.message }));
    setTravelMessage(result.message);
    if (result.status === "saved") setInspirations((current) => current.filter((entry) => entry.id !== id));
  }
```

In the inspiration card footer, directly before `<button type="button" onClick={() => removeInspiration(item.id)}` add:

```tsx
                        {item.source !== "manual" ? (
                          <button type="button" onClick={() => moveInspiration(item.id)} className="h-10 shrink-0 rounded-xl bg-amb-well px-3 text-sm font-bold text-amb-ink">
                            This is a recipe
                          </button>
                        ) : null}
```

- [ ] **Step 7: Recent shares in Settings**

Add this component directly above `function SettingsPanel(`:

```tsx
/** The last 10 shares from the phone, so a failed one can be seen and retried instead of vanishing. */
function RecentShares() {
  const [shares, setShares] = useState<ShareImport[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  const load = () => fetchRecentShares().then(setShares).catch(() => undefined);
  useEffect(() => {
    load();
  }, []);

  async function retry(id: number) {
    setBusy(id);
    try {
      await retryShare(id);
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (!shares.length) return null;
  return (
    <div className="mt-4 rounded-3xl bg-amb-card p-4 shadow-sm">
      <p className="text-lg font-black text-amb-ink">Recent shares</p>
      <ul className="mt-2 divide-y divide-amb-border">
        {shares.map((share) => (
          <li key={share.id} className="flex items-center gap-3 py-2">
            <span className={`h-3 w-3 shrink-0 rounded-full ${share.status === "saved" ? "bg-emerald-500" : share.status === "failed" ? "bg-rose-500" : "bg-amb-muted"}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-amb-ink">{share.title || share.url || "Shared text"}</p>
              <p className="truncate text-sm text-amb-muted">{share.message}</p>
            </div>
            <span className="shrink-0 text-sm text-amb-muted">
              {new Date(share.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>
            {share.status === "failed" ? (
              <button type="button" onClick={() => retry(share.id)} disabled={busy === share.id} className="h-10 shrink-0 rounded-xl bg-amb-accent px-4 text-sm font-bold text-amb-accent-ink disabled:opacity-50">
                Retry
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

In `SettingsPanel`, replace `      <SectionTitle icon={Settings} title="Settings" />` with:

```tsx
      <SectionTitle icon={Settings} title="Settings" />
      <RecentShares />
```

- [ ] **Step 8: Type check and build**

Run: `npm run typecheck` then `npm run build`
Expected: both clean.

- [ ] **Step 9: Commit**

```bash
git add mirror-dashboard-app/client/src/api.ts mirror-dashboard-app/client/src/App.tsx
git commit -m "Show shared photos, sources and share history on the wall" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 12: The "from your phone" banner

**Files:**
- Create: `client/src/ShareBanner.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `fetchRecentShares` (Task 11); `ShareImport` (shared)
- Produces: `ShareBanner({ onArrived, onOpen }: { onArrived: (share: ShareImport) => void; onOpen: (share: ShareImport) => void })`; `RecipesPanel` gains `refreshKey?: number` and `focusRecipeId?: number | null`; `TravelPanel` gains `refreshKey?: number` and `showSaved?: number`; `TravelHubPanel` gains `refreshKey?: number`

- [ ] **Step 1: The banner component**

Create `client/src/ShareBanner.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { ShareImport } from "@mirror-dashboard/shared";
import { fetchRecentShares } from "./api";

/**
 * Announces things saved from the phone's Share sheet. Asks the Pi for new
 * shares every 30 seconds (tabs only load their lists when opened, and the
 * dashboard refresh is every 5 minutes) and shows the newest saved one for
 * 20 seconds. Tapping it opens the item.
 */
export function ShareBanner({ onArrived, onOpen }: { onArrived: (share: ShareImport) => void; onOpen: (share: ShareImport) => void }) {
  const [current, setCurrent] = useState<ShareImport | null>(null);
  const lastId = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    async function poll() {
      try {
        if (lastId.current === null) {
          // First run: remember where history ends, so old shares are not announced.
          const latest = await fetchRecentShares();
          lastId.current = latest.reduce((max, share) => Math.max(max, share.id), 0);
          return;
        }
        const fresh = await fetchRecentShares(lastId.current);
        if (!live || !fresh.length) return;
        lastId.current = fresh.reduce((max, share) => Math.max(max, share.id), lastId.current);
        const saved = fresh.filter((share) => share.status === "saved");
        const newest = saved[saved.length - 1];
        if (newest) {
          setCurrent(newest);
          onArrived(newest);
        }
      } catch {
        // Offline for a moment: the next tick tries again.
      }
    }
    poll();
    const timer = window.setInterval(poll, 30_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [onArrived]);

  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(() => setCurrent(null), 20_000);
    return () => window.clearTimeout(timer);
  }, [current]);

  if (!current) return null;
  // The wrapper does the centring, because Motion's transform would override a translate class on the button.
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-8 z-40 flex justify-center">
      <motion.button
        type="button"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
        onClick={() => {
          onOpen(current);
          setCurrent(null);
        }}
        className="pointer-events-auto flex items-center gap-4 rounded-[26px] border border-amb-border bg-amb-sheet py-3 pl-3 pr-6 text-left shadow-ambient"
      >
        {current.imageUrl ? <img src={current.imageUrl} alt="" className="h-16 w-16 rounded-2xl object-cover" /> : null}
        <span className="text-xl text-amb-ink">
          From your phone: <b className="font-semibold">{current.title}</b>, saved to {current.kind === "trip" ? "Trips" : "Recipes"}
        </span>
      </motion.button>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the dashboard**

In `client/src/App.tsx`:

1. Replace `useEffect, useMemo, useRef, useState } from "react";` with `useCallback, useEffect, useMemo, useRef, useState } from "react";`.
2. After `import { greetingFor, useAmbient } from "./ambient";` add `import { ShareBanner } from "./ShareBanner";`.
3. After `  const [focusDealId, setFocusDealId] = useState<number | null>(null);` add:

```tsx
  // Shares from the phone: a counter the Recipes and Travel lists reload on,
  // and which item the banner asked to open.
  const [shareVersion, setShareVersion] = useState(0);
  const [focusRecipeId, setFocusRecipeId] = useState<number | null>(null);
  const [savedTripsKey, setSavedTripsKey] = useState(0);
  const handleShareArrived = useCallback(() => setShareVersion((version) => version + 1), []);
  const openShare = useCallback((share: ShareImport) => {
    if (share.kind === "trip") {
      setSavedTripsKey((key) => key + 1);
      setView("travel");
    } else {
      setFocusRecipeId(share.itemId);
      setView("recipes");
    }
  }, []);
```

4. Replace `    if (view === "recipes") return <RecipesPanel onChanged={refreshDashboard} />;` with:

```tsx
    if (view === "recipes") return <RecipesPanel onChanged={refreshDashboard} refreshKey={shareVersion} focusRecipeId={focusRecipeId} />;
```

5. Replace `    if (view === "travel") return <TravelPanel focusDealId={focusDealId} />;` with:

```tsx
    if (view === "travel") return <TravelPanel focusDealId={focusDealId} refreshKey={shareVersion} showSaved={savedTripsKey} />;
```

6. Replace `  }, [dashboard, now, view, focusDealId]);` with `  }, [dashboard, now, view, focusDealId, shareVersion, focusRecipeId, savedTripsKey]);`.
7. Directly before `      <OnScreenKeyboard` add `      <ShareBanner onArrived={handleShareArrived} onOpen={openShare} />`.

- [ ] **Step 3: Lists reload, and the banner opens the item**

In `RecipesPanel`:

1. Replace `function RecipesPanel({ onChanged }: { onChanged: () => void }) {` with:

```tsx
function RecipesPanel({ onChanged, refreshKey = 0, focusRecipeId = null }: { onChanged: () => void; refreshKey?: number; focusRecipeId?: number | null }) {
```

2. Replace:

```tsx
    setRecipes(allRecipes);
    setPlan(weekPlan);
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, []);
```

with:

```tsx
    setRecipes(allRecipes);
    setPlan(weekPlan);
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, [refreshKey]);

  // The share banner asked for this recipe: open it once the list has it.
  useEffect(() => {
    if (!focusRecipeId) return;
    const wanted = recipes.find((recipe) => recipe.id === focusRecipeId);
    if (wanted) setOpen(wanted);
  }, [focusRecipeId, recipes]);
```

In `TravelPanel`:

1. Replace `function TravelPanel({ focusDealId }: { focusDealId?: number | null }) {` with:

```tsx
function TravelPanel({ focusDealId, refreshKey = 0, showSaved = 0 }: { focusDealId?: number | null; refreshKey?: number; showSaved?: number }) {
```

2. After `  const [tab, setTab] = useState<"ideas" | "planner">("ideas");` add:

```tsx
  // Saved trip ideas live on the planner tab; the share banner opens it there.
  useEffect(() => {
    if (showSaved) setTab("planner");
  }, [showSaved]);
```

3. Replace `<TravelHubPanel />` with `<TravelHubPanel refreshKey={refreshKey} />`.

In `TravelHubPanel`:

1. Replace `function TravelHubPanel() {` with `function TravelHubPanel({ refreshKey = 0 }: { refreshKey?: number }) {`.
2. Replace:

```tsx
      .catch(() => setTravelMessage("Saved Instagram ideas could not load."));
  }, []);
```

with:

```tsx
      .catch(() => setTravelMessage("Saved Instagram ideas could not load."));
  }, [refreshKey]);
```

- [ ] **Step 4: Type check and build**

Run: `npm run typecheck` then `npm run build`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add mirror-dashboard-app/client/src/ShareBanner.tsx mirror-dashboard-app/client/src/App.tsx
git commit -m "Announce shares from the phone on the wall" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: Retire the ngrok tunnel and write the Shortcut guide

**Files:**
- Delete: `scripts/start-server-with-ngrok.sh`
- Modify: `package.json`, `CLAUDE.md`, `README.md`
- Create: `docs/share-shortcut.md`

- [ ] **Step 1: Remove the tunnel**

```bash
git rm mirror-dashboard-app/scripts/start-server-with-ngrok.sh
```

In `package.json`, delete the line `    "start:pi": "bash scripts/start-server-with-ngrok.sh",`.

- [ ] **Step 2: Docs that still mention it**

In `CLAUDE.md`:
- Replace `kiosk launcher (Chromium + xset no-blank), ngrok tunnel starter.` with `kiosk launcher (Chromium + xset no-blank), \`deploy.ps1\` and \`provision-pi.sh\`.`
- Replace the line `` - `npm run start:pi` — same but also starts an ngrok tunnel (Pi only). `` with `` - `npm test` — server unit tests (Node's test runner through tsx, files in `server/test/`). ``
- Replace `**Run this after changes; there are no automated tests.**` with `**Run this and \`npm test\` after changes.**`

In `README.md`, replace:

````markdown
On the Raspberry Pi, use this command when you also want the ngrok tunnel to start:

```bash
npm run start:pi
```

`start:pi` runs `scripts/start-server-with-ngrok.sh`, which starts `ngrok http 4174` in the background if it is not already running, then starts the Express server.
````

with:

```markdown
On the Raspberry Pi the systemd service runs `npm run start`. Deploy from Windows with `scripts/deploy.ps1`; the Pi never builds. Remote access is over Tailscale only, never a public tunnel: the server has no login.
```

- [ ] **Step 3: The Shortcut guide**

Create `docs/share-shortcut.md`:

```markdown
# Send to Home Scheduler: the iPhone Shortcut

Share anything from Instagram, Safari or another app, pick **Send to Home Scheduler**, and the Pi saves it as a recipe or a trip idea. A notification tells you where it went.

Tailscale must be connected on the phone. If it isn't, iOS shows its own "could not connect" error.

## Edit your existing Shortcut

Apple only installs signed shortcut files, and signing needs a Mac, so edit the one you already have (about 5 minutes).

1. Open **Shortcuts**, press and hold **Send to Home Scheduler**, and choose **Edit**.
2. Tap the **(i)** details button: turn on **Show in Share Sheet** and allow **URLs**, **Safari web pages** and **Text**.
3. Remove the old actions and add these, in order:
   1. **Get URLs from Input** (input: Shortcut Input). Then **Set Variable** `Link`.
   2. **Get Contents of URL** with URL `Link` and method **GET**. This downloads the page on your phone, which gets past sites that block the Pi. Then **Get Text from Input** and **Set Variable** `Page`.
   3. **Get Contents of URL** with:
      - URL: `http://100.81.206.101:4174/api/share`
      - Method: **POST**
      - Request Body: **JSON**, with three Text fields: `url` = `Link`, `html` = `Page`, `text` = `Shortcut Input`
   4. **Get Dictionary Value** for key `message` from the result.
   5. **Show Notification** with the Dictionary Value.
4. Tap **Done**.

If a site still refuses (Allrecipes, Serious Eats and their sister sites block anything that isn't a browser), share it from **Safari** instead. As a fallback, add **Run JavaScript on Web Page** with `completion(document.documentElement.outerHTML);` and send its result as `html`; that action only runs on Safari pages.

## What the notifications mean

| Notification | Meaning |
|---|---|
| Saved to Recipes: … / Saved to Trips: … | Saved; the wall shows a banner within 30 seconds |
| Already in Recipes: … | That link was saved before |
| That site blocked the Pi. Share it from Safari so your phone sends the page. | Share from Safari |
| Instagram hid that post. Copy the caption and share the text instead. | Private or hidden post |
| Couldn't read that one right now. It's in Recent shares to retry. | Claude was unavailable; retry from Settings on the wall |
| Couldn't find a recipe or trip idea in that post | Nothing to save |

A wrong guess is fixed on the wall: **This is a trip idea** on a recipe, or **This is a recipe** on a trip idea.

## Share it with family

In Shortcuts, press and hold the Shortcut, choose **Share**, then **Copy iCloud Link**.
```

- [ ] **Step 4: Check nothing still starts a tunnel**

Run (from `mirror-dashboard-app/`): `git grep -n -i ngrok -- . ':!docs/superpowers'`
Expected: only the README's Alexa section, which lists ways Alexa can reach an HTTPS URL; nothing that starts a tunnel.

- [ ] **Step 5: Commit**

```bash
git add mirror-dashboard-app/package.json mirror-dashboard-app/CLAUDE.md mirror-dashboard-app/README.md mirror-dashboard-app/docs/share-shortcut.md
git commit -m "Retire the ngrok tunnel and document the share Shortcut" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: Deploy and check it from the phone

**Files:**
- Modify: `docs/superpowers/specs/2026-09-13-share-to-home-scheduler-design.md` (record the open question's answer)

- [ ] **Step 1: Everything passes locally**

Run: `npm run typecheck`, `npm test`, `npm run build`
Expected: all clean.

- [ ] **Step 2: Deploy**

Run (PowerShell, from `mirror-dashboard-app/`): `.\scripts\deploy.ps1 -PiHost 192.168.1.185`
Expected: `service healthy` and `browser reloaded`.

- [ ] **Step 3: The migration ran on the Pi**

```bash
ssh -i /c/Users/mrsou/.ssh/id_rsa -o UserKnownHostsFile=/c/Users/mrsou/.ssh/known_hosts connor@192.168.1.185 "curl -s http://localhost:4174/api/share/recent; echo; ls -d ~/Home-Scheduler/mirror-dashboard-app/data"
```
Expected: `[]`, and the data folder exists.

- [ ] **Step 4: Update the Shortcut**

Follow `docs/share-shortcut.md` on the phone (the user does this).

- [ ] **Step 5: The four real-world checks**

From the phone, with Tailscale on:
1. Share the soup reel (`https://www.instagram.com/reel/DOmW6LTkqcq/`) from Instagram. Expected: "Saved to Recipes: Creamy Chicken Noodle Soup…", ingredients only; the recipe dialog shows "Method: see the original post" and the QR code.
2. Share an Allrecipes recipe from Safari. Expected: saved with full steps and a photo.
3. Share an Instagram travel post. Expected: "Saved to Trips: …", on the Travel planner tab with its photo.
4. Share a news article link. Expected: "Couldn't find a recipe or trip idea in that post".

After each, check the history and the wall:

```bash
ssh -i /c/Users/mrsou/.ssh/id_rsa -o UserKnownHostsFile=/c/Users/mrsou/.ssh/known_hosts connor@192.168.1.185 "curl -s http://localhost:4174/api/share/recent | head -c 1500"
```

and take a wall screenshot (`grim` over SSH) within 30 seconds of a save to confirm the banner.

- [ ] **Step 6: Record the answer to the spec's open question**

In the spec's "Feasibility findings", replace the "Open question to settle during the real-world check" bullet with what check 2 showed: whether the phone's own download got Allrecipes' recipe data (html containing `"@type":"Recipe"`), and whether the Pi received page HTML or plain text from **Get Text from Input**. If only plain text arrived, note that such shares go through Claude and add the Safari **Run JavaScript on Web Page** step to the guide as the main path for those sites.

- [ ] **Step 7: Commit**

```bash
git add mirror-dashboard-app/docs/superpowers/specs/2026-09-13-share-to-home-scheduler-design.md mirror-dashboard-app/docs/share-shortcut.md
git commit -m "Record how shares from the phone behaved on real sites" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
