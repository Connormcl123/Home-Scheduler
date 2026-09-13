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
