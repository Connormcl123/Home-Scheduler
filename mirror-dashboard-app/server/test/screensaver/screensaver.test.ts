import { test } from "node:test";
import assert from "node:assert/strict";
import { screensaverPhotoNames } from "../../src/services/screensaver.js";

test("only photos are shown, hidden files skipped, in name order", () => {
  assert.deepEqual(
    screensaverPhotoNames(["b-family.JPG", ".DS_Store", "notes.txt", "a-beach.webp", "c.png", "clip.mov", "._a-beach.webp"]),
    ["a-beach.webp", "b-family.JPG", "c.png"]
  );
  assert.deepEqual(screensaverPhotoNames([]), []);
});
