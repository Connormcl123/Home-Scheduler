import { test } from "node:test";
import assert from "node:assert/strict";
import { groceryQuickCategories, twemojiCode } from "../src/grocery/quickAdd";

test("every quick add item has a name and a picture, with no repeats in a category", () => {
  for (const group of groceryQuickCategories) {
    assert.ok(group.icon, group.category);
    const names = group.items.map((item) => item.name.toLowerCase());
    assert.equal(new Set(names).size, names.length, `repeat in ${group.category}`);
    for (const item of group.items) {
      assert.ok(item.name.trim(), group.category);
      assert.ok(item.icon && twemojiCode(item.icon), item.name);
    }
  }
});

test("the categories stay the aisle names recipes and the texted list use", () => {
  const categories = groceryQuickCategories.map((group) => group.category);
  for (const aisle of ["Dairy", "Meat", "Vegetables", "Fruit", "Pantry", "Frozen"]) assert.ok(categories.includes(aisle), aisle);
});

test("Twemoji file names drop the variation selector", () => {
  assert.equal(twemojiCode("❄️"), "2744");
  assert.equal(twemojiCode("🌶️"), "1f336");
  assert.equal(twemojiCode("🥦"), "1f966");
});
