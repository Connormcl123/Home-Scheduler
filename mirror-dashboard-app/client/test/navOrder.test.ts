import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeNavOrder } from "../src/navOrder";

const defaults = ["home", "calendar", "travel", "packages", "settings"] as const;

test("a new tab lands where it sits in the default order", () => {
  assert.deepEqual(mergeNavOrder(["home", "calendar", "travel", "settings"], defaults), ["home", "calendar", "travel", "packages", "settings"]);
});

test("a rearranged order keeps its shape, and the new tab goes before its default neighbour", () => {
  assert.deepEqual(mergeNavOrder(["settings", "travel", "home", "calendar"], defaults), ["packages", "settings", "travel", "home", "calendar"]);
});

test("unknown and repeated entries are dropped and everything missing comes back", () => {
  assert.deepEqual(mergeNavOrder(["home", "home", "bogus", 7, "packages"], defaults), ["home", "calendar", "travel", "packages", "settings"]);
  assert.deepEqual(mergeNavOrder([], defaults), [...defaults]);
});
