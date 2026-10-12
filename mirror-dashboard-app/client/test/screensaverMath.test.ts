import { test } from "node:test";
import assert from "node:assert/strict";
import { nextSlide, screensaverDrift } from "../src/screensaver/screensaverMath.js";

test("the photo drifts a little each minute and stays within about 24px", () => {
  const spots = new Set<string>();
  for (let minute = 0; minute < 120; minute += 1) {
    const { x, y } = screensaverDrift(new Date(Date.UTC(2026, 9, 11, 0, minute)));
    assert.ok(Math.hypot(x, y) <= 25, `${x},${y}`);
    spots.add(`${x},${y}`);
  }
  assert.ok(spots.size > 20);
});

test("slides loop back to the first photo", () => {
  assert.equal(nextSlide(0, 3), 1);
  assert.equal(nextSlide(2, 3), 0);
  assert.equal(nextSlide(0, 0), 0);
});
