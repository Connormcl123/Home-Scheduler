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

test("classifyShare passes maxRetries: 0 so the SDK's own retries can't blow the 12s Claude budget", async () => {
  let options: unknown;
  const create = (async (_body: unknown, opts: unknown) => {
    options = opts;
    return { content: [{ type: "text", text: JSON.stringify(soup) }] };
  }) as never;
  await classifyShare({ url: null, text: "caption" }, create);
  assert.deepEqual(options, { timeout: 12_000, maxRetries: 0 });
});

test("classifyShare turns API failures and empty answers into ClassifyUnavailableError", async () => {
  const failing = (async () => { throw new Error("529 overloaded"); }) as never;
  await assert.rejects(classifyShare({ url: null, text: "x" }, failing), ClassifyUnavailableError);
  const empty = (async () => ({ content: [] })) as never;
  await assert.rejects(classifyShare({ url: null, text: "x" }, empty), ClassifyUnavailableError);
});
