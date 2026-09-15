import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptsDragScroll, flingStep, releaseVelocity } from "../src/dragScroll";

test("a finger reported as a left-button mouse can drag to scroll", () => {
  assert.equal(acceptsDragScroll({ isPrimary: true, pointerType: "mouse", button: 0 }), true);
  assert.equal(acceptsDragScroll({ isPrimary: true, pointerType: "touch", button: 0 }), true);
  assert.equal(acceptsDragScroll({ isPrimary: true, pointerType: "mouse", button: 2 }), false);
  assert.equal(acceptsDragScroll({ isPrimary: false, pointerType: "touch", button: 0 }), false);
});

test("release speed comes from the last 100 ms of the drag", () => {
  const flick = [{ time: 0, y: 500 }, { time: 950, y: 400 }, { time: 1000, y: 350 }];
  assert.equal(releaseVelocity(flick, 1000), -1);
  assert.equal(releaseVelocity(flick, 1300), 0, "a finger that stopped before lifting does not fling");
  assert.equal(releaseVelocity([{ time: 0, y: 0 }, { time: 100, y: 10 }], 100), 0, "a slow drag does not fling");
  assert.equal(releaseVelocity([{ time: 0, y: 0 }, { time: 10, y: 200 }], 10), 4, "a jittery sample is capped");
  assert.equal(releaseVelocity([{ time: 0, y: 0 }], 0), 0);
});

test("a fling travels with the finger's speed and slows to a stop", () => {
  const first = flingStep(-2, 1000 / 60);
  assert.ok(Math.abs(first.distance - -2 * (1000 / 60)) < 1e-9);
  assert.ok(first.velocity > -2 && first.velocity < 0);
  assert.deepEqual(flingStep(-2, 0), { distance: -0, velocity: -2 });
  assert.equal(flingStep(0.021, 1000 / 60).velocity, 0);
  assert.equal(flingStep(1, 5000).distance, 50, "a stalled frame is capped at 50 ms");
});
