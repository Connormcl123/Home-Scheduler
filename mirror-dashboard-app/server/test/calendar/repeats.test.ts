import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeed } from "../../src/services/calendar.js";

// The Pi runs on New York time; so do these tests (each test file is its own process).
process.env.TZ = "America/New_York";
const feed = (...events: string[]) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events.join("")}END:VCALENDAR\r\n`;
const event = (lines: string) => `BEGIN:VEVENT\r\n${lines.trim().split("\n").map((line) => line.trim()).join("\r\n")}\r\nEND:VEVENT\r\n`;
const now = new Date(2026, 10, 24, 12);
const local = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};

test("a weekly event shows on every week, minus a skipped one", () => {
  const events = parseFeed(feed(event(`
    UID:wee
    SUMMARY:wee peas
    DTSTART;TZID=America/New_York:20261114T084500
    DTEND;TZID=America/New_York:20261114T094500
    EXDATE;TZID=America/New_York:20261121T084500
    RRULE:FREQ=WEEKLY;COUNT=4`)), 0, now);
  assert.deepEqual(events.map((e) => local(e.start)), ["11/14 8:45", "11/28 8:45", "12/5 8:45"]);
  assert.equal(local(events[1].end!), "11/28 9:45");
  assert.equal(new Set(events.map((e) => e.id)).size, 3);
});

test("a weekly time stays put across the clock change, and UNTIL is the local day", () => {
  const events = parseFeed(feed(event(`
    UID:peas
    SUMMARY:wee peas
    DTSTART;TZID=America/New_York:20261024T094500
    DTEND;TZID=America/New_York:20261024T104500
    RRULE:FREQ=WEEKLY;UNTIL=20261108T045959Z`)), 0, now);
  assert.deepEqual(events.map((e) => local(e.start)), ["10/24 9:45", "10/31 9:45", "11/7 9:45"]);
});

test("a late-evening weekly event keeps its weekday", () => {
  const events = parseFeed(feed(event(`
    UID:late
    SUMMARY:Book club
    DTSTART;TZID=America/New_York:20261124T210000
    DTEND;TZID=America/New_York:20261124T220000
    RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=2`)), 0, now);
  assert.deepEqual(events.map((e) => local(e.start)), ["11/24 21:00", "12/1 21:00"]);
});

test("one changed date in a series takes its new time", () => {
  const events = parseFeed(feed(
    event(`
      UID:gym
      SUMMARY:Gym
      DTSTART;TZID=America/New_York:20261123T070000
      DTEND;TZID=America/New_York:20261123T080000
      RRULE:FREQ=DAILY;COUNT=3`),
    event(`
      UID:gym
      SUMMARY:Gym (late)
      RECURRENCE-ID;TZID=America/New_York:20261124T070000
      DTSTART;TZID=America/New_York:20261124T180000
      DTEND;TZID=America/New_York:20261124T190000`)
  ), 0, now);
  assert.deepEqual(events.map((e) => `${local(e.start)} ${e.title}`), ["11/23 7:00 Gym", "11/24 18:00 Gym (late)", "11/25 7:00 Gym"]);
});

test("one-off events are unchanged", () => {
  const events = parseFeed(feed(event(`
    UID:once
    SUMMARY:Luna follow up
    DTSTART;TZID=America/New_York:20261204T133000
    DTEND;TZID=America/New_York:20261204T143000`)), 0, now);
  assert.deepEqual(events.map((e) => [e.id, local(e.start)]), [["0-once", "12/4 13:30"]]);
});
