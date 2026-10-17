import { test } from "node:test";
import assert from "node:assert/strict";
import { ingredientsByRecipe, mergeRecipeTitles } from "../../src/services/recipes.js";

const entry = (title: string, ...names: string[]) => ({
  recipe: { title, ingredients: names.map((name) => ({ name, quantity: "1", category: "Dairy" })) }
}) as any;

test("each ingredient is asked for once but remembers every recipe that needs it", () => {
  const wanted = ingredientsByRecipe([entry("Alfredo", "Heavy cream", "Butter"), entry("Carbonara", "heavy cream ", "Eggs"), { recipe: null } as any]);
  assert.deepEqual([...wanted.keys()], ["heavy cream", "butter", "eggs"]);
  assert.deepEqual(wanted.get("heavy cream")!.recipes, ["Alfredo", "Carbonara"]);
  assert.deepEqual(wanted.get("eggs")!.recipes, ["Carbonara"]);
});

test("the same recipe twice in a week is listed once", () => {
  const wanted = ingredientsByRecipe([entry("Tacos", "Tortillas"), entry("Tacos", "Tortillas")]);
  assert.deepEqual(wanted.get("tortillas")!.recipes, ["Tacos"]);
});

test("merging keeps existing recipes first and adds only new ones", () => {
  assert.deepEqual(mergeRecipeTitles(["Alfredo"], ["Alfredo", "Carbonara"]), ["Alfredo", "Carbonara"]);
  assert.deepEqual(mergeRecipeTitles([], []), []);
});
