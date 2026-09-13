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
