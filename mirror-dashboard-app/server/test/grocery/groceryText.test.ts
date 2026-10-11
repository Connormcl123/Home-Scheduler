import { test } from "node:test";
import assert from "node:assert/strict";
import type { GroceryItem } from "@mirror-dashboard/shared";
import { groceryText } from "../../src/services/grocery.js";

const item = (id: number, name: string, extra: Partial<GroceryItem> = {}): GroceryItem => ({
  id, name, quantity: null, category: null, supplier: null, status: "low", purchased: false, createdAt: "", updatedAt: "", ...extra
});
const now = new Date(2026, 8, 19, 10);

test("the text groups by aisle, marks what ran out, and puts Other last", () => {
  const text = groceryText([
    item(1, "parmesan cheese", { category: "Dairy", quantity: "1/2 cup" }),
    item(2, "Apples", { category: "Fruit", status: "out" }),
    item(3, "butter", { category: "Dairy" }),
    item(4, "Foil"),
    item(5, "Milk", { category: "Dairy", purchased: true })
  ], now);
  assert.equal(text, [
    "Groceries for Saturday, Sep 19 (4)",
    "",
    "Dairy",
    "- Butter",
    "- Parmesan cheese, 1/2 cup",
    "",
    "Fruit",
    "- Apples (out)",
    "",
    "Other",
    "- Foil"
  ].join("\n"));
});

test("an empty list says so", () => {
  assert.equal(groceryText([item(1, "Milk", { purchased: true })], now), "The grocery list is empty.");
});
