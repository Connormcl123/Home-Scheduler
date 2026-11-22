import { test } from "node:test";
import assert from "node:assert/strict";
import { eventWhen } from "../../src/utils/dates.js";

const now = new Date(2026, 10, 22, 14);
const at = (month: number, day: number, hour = 0, minute = 0) => new Date(2026, month, day, hour, minute).toISOString();

test("an event later than tomorrow carries its date", () => {
  assert.equal(eventWhen({ start: at(11, 4, 13, 30) }, now), "Fri, Dec 4 at 1:30 PM");
});

test("today and tomorrow are named", () => {
  assert.equal(eventWhen({ start: at(10, 22, 18) }, now), "today at 6:00 PM");
  assert.equal(eventWhen({ start: at(10, 23, 9, 5) }, now), "tomorrow at 9:05 AM");
});

test("an all-day event gives no time", () => {
  assert.equal(eventWhen({ start: at(10, 23), end: at(10, 24) }, now), "tomorrow, all day");
});
