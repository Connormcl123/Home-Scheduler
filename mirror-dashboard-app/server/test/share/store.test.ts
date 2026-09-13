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
