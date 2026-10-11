import { test } from "node:test";
import assert from "node:assert/strict";
import type { CalendarEvent } from "@mirror-dashboard/shared";
import { allDay, coming, dueLabel, laneOf, moneyPace, railHours, timeOf, todays } from "../src/home/homeText";

const at = (day: number, hour: number, minute = 0) => new Date(2026, 8, day, hour, minute).toISOString();
const event = (id: string, start: string, end?: string): CalendarEvent => ({ id, title: id, start, end, source: "ical" });
const now = new Date(2026, 8, 18, 15, 30);

test("today's events are picked out and all-day ones recognised", () => {
  const events = [event("later", at(18, 17)), event("tomorrow", at(19, 9)), event("early", at(18, 8)), event("holiday", at(18, 0), at(19, 0))];
  assert.deepEqual(todays(events, now).map((e) => e.id), ["holiday", "early", "later"]);
  assert.equal(allDay(events[3]), true);
  assert.equal(allDay(events[0]), false);
});

test("the rail runs 7 am to 10 pm and stretches for early or late events", () => {
  assert.deepEqual(railHours([]), { start: 7, end: 22 });
  assert.deepEqual(railHours([event("run", at(18, 5, 30), at(18, 6, 30)), event("late", at(18, 22), at(18, 23, 15))]), { start: 5, end: 24 });
});

test("overlapping events drop to the second lane", () => {
  const events = [event("a", at(18, 9), at(18, 11)), event("b", at(18, 10), at(18, 12)), event("c", at(18, 11), at(18, 12)), event("d", at(18, 13))];
  assert.deepEqual(laneOf(events), [0, 1, 0, 0]);
});

test("coming up skips today and anything past two weeks", () => {
  const events = [event("today", at(18, 18)), event("far", at(30, 12) as string), event("sat", at(19, 9)), event("tue", at(22, 11))];
  assert.deepEqual(coming(events, now, 3).map((e) => e.id), ["sat", "tue", "far"]);
  assert.deepEqual(coming([event("oct", new Date(2026, 9, 19, 12).toISOString())], now, 3), []);
});

test("due labels read naturally and flag overdue tasks", () => {
  assert.equal(dueLabel(null, now), null);
  assert.deepEqual(dueLabel("2026-09-09", now), { text: "Overdue since Sep 9", late: true });
  assert.equal(dueLabel("2026-09-18", now)?.text, "Due today");
  assert.equal(dueLabel("2026-09-19", now)?.text, "Due tomorrow");
  assert.equal(dueLabel("2026-09-22", now)?.text, "Due Tuesday");
  assert.equal(dueLabel("2026-10-02", now)?.text, "Due Oct 2");
});

test("budget pace compares spending with an even month", () => {
  const pace = moneyPace(587, 2360, now);
  assert.equal(pace.over, false);
  assert.equal(Math.round(pace.expectedPercent), 60);
  assert.equal(moneyPace(2000, 2360, now).over, true);
  assert.equal(moneyPace(3000, 2360, now).spentPercent, 100);
});

test("times are short and lower case", () => {
  assert.equal(timeOf(new Date(2026, 8, 18, 9, 45)), "9:45 am");
});
