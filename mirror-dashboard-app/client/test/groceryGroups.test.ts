import { test } from "node:test";
import assert from "node:assert/strict";
import type { GroceryItem } from "@mirror-dashboard/shared";
import { groupByRecipe } from "../src/grocery/groceryGroups";

const item = (id: number, name: string, recipes: string[] = []) => ({ id, name, recipes, status: "low", purchased: false }) as GroceryItem;

test("items fold under their recipes and hand-added ones stay apart", () => {
  const { groups, other } = groupByRecipe([
    item(1, "Heavy cream", ["Carbonara", "Alfredo"]),
    item(2, "Bananas"),
    item(3, "Butter", ["Alfredo"]),
    item(4, "Eggs", ["Carbonara"])
  ]);
  assert.deepEqual(groups.map((group) => [group.recipe, group.items.map((i) => i.name)]), [
    ["Alfredo", ["Heavy cream", "Butter"]],
    ["Carbonara", ["Heavy cream", "Eggs"]]
  ]);
  assert.deepEqual(other.map((i) => i.name), ["Bananas"]);
});

test("items from before recipes were tracked count as hand-added", () => {
  const legacy = { id: 9, name: "Milk", status: "low", purchased: false } as unknown as GroceryItem;
  assert.deepEqual(groupByRecipe([legacy]), { groups: [], other: [legacy] });
});
