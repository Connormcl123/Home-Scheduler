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
