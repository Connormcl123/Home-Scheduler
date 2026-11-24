import { test } from "node:test";
import assert from "node:assert/strict";
import type { CalendarEvent } from "@mirror-dashboard/shared";
import { placeFeedEvents } from "../../src/services/calendar.js";

const on = (month: number, day: number) => new Date(2026, month, day, 9).toISOString();
const event = (id: string, start: string): CalendarEvent => ({ id, title: id, start, source: "ical" });
const window = { from: new Date(2026, 10, 21, 12), to: new Date(2027, 0, 6, 12), movedTo: new Date(2027, 10, 23, 12) };
const move = (id: string, start: string) => new Map([[id, { event_id: id, start, end: null }]]);

test("a moved event stays after its original day has passed", () => {
  assert.equal(placeFeedEvents([event("a", on(10, 2))], move("a", on(10, 28)), window)[0].start, on(10, 28));
});

test("a moved event stays when it lands beyond the feed's 45 days", () => {
  assert.equal(placeFeedEvents([event("a", on(10, 24))], move("a", new Date(2027, 4, 1).toISOString()), window).length, 1);
});

test("untouched events keep to the usual window", () => {
  const events = [event("old", on(10, 2)), event("soon", on(10, 24)), event("far", new Date(2027, 4, 1).toISOString())];
  assert.deepEqual(placeFeedEvents(events, new Map(), window).map((item) => item.id), ["soon"]);
});
