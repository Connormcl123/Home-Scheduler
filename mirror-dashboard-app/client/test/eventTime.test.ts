import { test } from "node:test";
import assert from "node:assert/strict";
import { flipHalfDay, lastDay, monthDays, moveToDay, setLastDay, setStart, setWholeDay, spanOf, stepMinutes, type EventSpan } from "../src/calendar/eventTime";

const at = (day: number, hour = 0, minute = 0, month = 10) => new Date(2026, month, day, hour, minute);
const span = (start: Date, end: Date, whole = false): EventSpan => ({ start, end, whole });

test("a new day keeps the times, even across a clock change", () => {
  const moved = moveToDay(span(at(30, 13, 30, 9), at(30, 14, 15, 9)), at(4));
  assert.deepEqual(moved, span(at(4, 13, 30), at(4, 14, 15)));
});

test("a new start keeps the length", () => {
  assert.deepEqual(setStart(span(at(4, 9), at(4, 10, 30)), at(4, 14)), span(at(4, 14), at(4, 15, 30)));
});

test("all day is recognised only from midnight", () => {
  const event = (start: Date, end: Date) => spanOf({ id: "e", title: "e", source: "ical", start: start.toISOString(), end: end.toISOString() });
  assert.equal(event(at(4), at(5)).whole, true);
  assert.equal(event(at(4, 9), at(5, 9)).whole, false);
});

test("all day covers every day the event touches and ends on the midnight after", () => {
  assert.deepEqual(setWholeDay(span(at(4, 9), at(6, 12)), true), span(at(4), at(7), true));
  assert.deepEqual(setWholeDay(span(at(4, 22), at(5)), true), span(at(4), at(5), true));
  assert.deepEqual(setWholeDay(span(at(4), at(5), true), false), span(at(4, 9), at(4, 10)));
});

test("the last day of an all-day event is the one before its end", () => {
  const whole = span(at(4), at(5), true);
  assert.deepEqual(lastDay(whole), at(4));
  assert.deepEqual(setLastDay(whole, at(6)), span(at(4), at(7), true));
});

test("minutes step on the fives and AM flips to PM on the same day", () => {
  assert.deepEqual(stepMinutes(at(4, 9, 47), 1), at(4, 9, 50));
  assert.deepEqual(stepMinutes(at(4, 9, 47), -1), at(4, 9, 45));
  assert.deepEqual(stepMinutes(at(4, 9), -1), at(4, 8, 55));
  assert.deepEqual(flipHalfDay(at(4, 21, 15)), at(4, 9, 15));
});

test("a month that needs six rows gets them", () => {
  const days = monthDays(at(1, 0, 0, 7));
  assert.equal(days.length, 42);
  assert.ok(days.some((day) => day.getMonth() === 7 && day.getDate() === 31));
});
