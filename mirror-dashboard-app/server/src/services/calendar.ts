import ical from "ical";
import type { CalendarEvent } from "@mirror-dashboard/shared";
import { addDays } from "../utils/dates.js";
import { listLocalCalendarEvents } from "./localCalendar.js";
import { getSettings } from "./settings.js";
import { getDb } from "../db.js";

const FEED_DAYS = 45;
const EDITABLE_DAYS = 366;

/** By default, the days Home and the assistant care about; the Calendar tab asks for a wider range to page through. */
export async function getCalendarEvents(range?: { from: Date; to: Date }): Promise<CalendarEvent[]> {
  const settings = await getSettings();
  const feedUrls = settings.calendarFeedUrls.length ? settings.calendarFeedUrls : settings.calendarFeedUrl ? [settings.calendarFeedUrl] : [];

  const now = new Date();
  // Events made or moved here can be set up to a year out, so they are listed that far.
  const window: FeedWindow = range
    ? { ...range, movedTo: range.to }
    : { from: addDays(now, -1), to: addDays(now, FEED_DAYS), movedTo: addDays(now, EDITABLE_DAYS) };
  const [localEvents, eventGroups, overrides] = await Promise.all([
    listLocalCalendarEvents({ from: window.from, to: window.movedTo }),
    Promise.all(feedUrls.map((feedUrl, index) => fetchCalendarFeed(feedUrl, index))),
    loadOverrides()
  ]);
  const events = [...localEvents, ...placeFeedEvents(eventGroups.flat(), overrides, window)]
    .sort((a, b) => a.start.localeCompare(b.start));

  return events.length ? events : mockCalendarEvents();
}

/**
 * Calendar apps hand out subscription links as webcal://, which is a
 * convention rather than a real scheme - fetch() rejects it outright. Every
 * client is expected to swap it for https before requesting. Normalising here
 * rather than at the config layer means a URL pasted into Settings gets the
 * same treatment as one from .env.
 */
function normalizeFeedUrl(feedUrl: string) {
  return feedUrl.trim().replace(/^webcals?:\/\//i, "https://");
}

type OverrideRow = { event_id: string; start: string; end: string | null };

async function loadOverrides(): Promise<Map<string, OverrideRow>> {
  try {
    const db = await getDb();
    const rows = await db.all<OverrideRow[]>("SELECT event_id, start, end FROM calendar_event_overrides");
    return new Map(rows.map((row) => [row.event_id, row]));
  } catch {
    return new Map();
  }
}

/**
 * A subscribed calendar is read-only, so moving one of its events cannot be
 * written back to the source. The new time is kept here instead and reapplied
 * on every read, so the change survives a restart and a feed refresh while the
 * upstream calendar is left alone.
 */
function applyOverrides(events: CalendarEvent[], overrides: Map<string, OverrideRow>): CalendarEvent[] {
  if (!overrides.size) return events;
  return events.map((event) => {
    const override = overrides.get(event.id);
    if (!override) return event;
    return { ...event, start: override.start, end: override.end || undefined, moved: true };
  });
}

export type FeedWindow = { from: Date; to: Date; movedTo: Date };

/** The window applies to where an event is now, so a moved one does not vanish once its first day passes. */
export function placeFeedEvents(events: CalendarEvent[], overrides: Map<string, OverrideRow>, window: FeedWindow): CalendarEvent[] {
  return applyOverrides(events, overrides).filter((event) => {
    const start = new Date(event.start);
    return start >= window.from && start <= (event.moved ? window.movedTo : window.to);
  });
}

/** False when there is no such event to move. */
export async function moveCalendarEvent(id: string, start: string, end?: string | null): Promise<boolean> {
  const db = await getDb();
  const startIso = new Date(start).toISOString();
  const endIso = end ? new Date(end).toISOString() : null;

  // Local events are ours to edit outright; anything from a feed gets an override.
  const localMatch = /^local-(\d+)$/.exec(id);
  if (localMatch) {
    const result = await db.run("UPDATE local_calendar_events SET start = ?, end = ? WHERE id = ?", startIso, endIso, Number(localMatch[1]));
    return Boolean(result.changes);
  }

  await db.run(
    `INSERT INTO calendar_event_overrides (event_id, start, end, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(event_id) DO UPDATE SET start = excluded.start, end = excluded.end, updated_at = CURRENT_TIMESTAMP`,
    id, startIso, endIso
  );
  return true;
}

async function fetchCalendarFeed(feedUrl: string, feedIndex: number): Promise<CalendarEvent[]> {
  try {
    const response = await fetch(normalizeFeedUrl(feedUrl));
    if (!response.ok) throw new Error(`iCal fetch failed: ${response.status}`);

    return parseFeed(await response.text(), feedIndex, new Date());
  } catch (error) {
    console.warn(`Calendar feed unavailable (${feedIndex + 1}), skipping:`, error);
    return [];
  }
}

const DAY_MS = 86_400_000;
// Wider than any range the Calendar tab asks for (a year either way).
const REPEAT_DAYS = 400;
const MAX_REPEATS = 1500;

/** Every event in a feed, with each repeating one expanded into its dates around `now`. */
export function parseFeed(text: string, feedIndex: number, now: Date): CalendarEvent[] {
  const from = new Date(now.getTime() - REPEAT_DAYS * DAY_MS);
  const to = new Date(now.getTime() + REPEAT_DAYS * DAY_MS);
  return Object.values(ical.parseICS(text))
    .filter((item: any) => item.type === "VEVENT" && item.start && item.status !== "CANCELLED")
    .flatMap((item: any) => (item.rrule ? repeatsOf(item, feedIndex, from, to) : [feedEvent(item, `${feedIndex}-${item.uid || `${item.summary}-${item.start}`}`)]));
}

function feedEvent(item: any, id: string, start: Date = item.start, end: Date | undefined = item.end): CalendarEvent {
  return {
    id,
    title: item.summary || "Calendar event",
    start: toIsoDateTime(start),
    end: end ? toIsoDateTime(end) : undefined,
    location: item.location,
    source: "ical"
  };
}

// The rule is worked out on wall-clock time written as if it were UTC, so a
// weekly 8:45 am stays 8:45 am across the clock change and a late-evening
// event keeps its weekday, then each date is turned back into local time.
const floating = (date: Date) =>
  new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()));
const unfloat = (date: Date) =>
  new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds());
// The parser keys skipped and changed dates by the UTC day of the local time.
const dayKey = (date: Date) => date.toISOString().slice(0, 10);

function repeatsOf(item: any, feedIndex: number, from: Date, to: Date): CalendarEvent[] {
  // The parser marks an all-day start with `dateOnly`.
  const start: Date & { dateOnly?: boolean } = item.start;
  const length = item.end ? item.end.getTime() - start.getTime() : 0;
  const options = { ...item.rrule.origOptions, dtstart: floating(start) };
  // A timed UNTIL is a real instant; an all-day one is already a plain date.
  if (options.until && !start.dateOnly) options.until = floating(options.until);
  // The parser builds the rule with the rrule package's own class; a second copy is not needed.
  const RRule = item.rrule.constructor;
  const skipped: Record<string, unknown> = item.exdate || {};
  const changed: Record<string, any> = item.recurrences || {};
  return (new RRule(options).between(floating(from), floating(to), true) as Date[])
    .slice(0, MAX_REPEATS)
    .map(unfloat)
    .filter((date) => !skipped[dayKey(date)])
    .map((date) => {
      const id = `${feedIndex}-${item.uid}-${dateKeyOf(date)}`;
      const moved = changed[dayKey(date)];
      if (moved?.start) return moved.status === "CANCELLED" ? null : feedEvent({ ...item, ...moved }, id, moved.start, moved.end);
      return feedEvent(item, id, date, item.end ? new Date(date.getTime() + length) : undefined);
    })
    .filter((event): event is CalendarEvent => Boolean(event));
}

function dateKeyOf(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export async function getCalendarProviderStatus() {
  const settings = await getSettings();
  const feedCount = settings.calendarFeedUrls.length || (settings.calendarFeedUrl ? 1 : 0);
  return {
    provider: feedCount ? "ical" : "mock",
    configured: feedCount > 0,
    message: feedCount ? `${feedCount} iCal feed${feedCount === 1 ? "" : "s"} configured.` : "No iCal feed configured; using mock calendar data."
  };
}

function mockCalendarEvents(): CalendarEvent[] {
  const base = new Date();
  return [
    { id: "demo-1", title: "Breakfast reset", start: setTime(base, 8, 30), end: setTime(base, 9, 0), source: "demo" },
    { id: "demo-2", title: "School pickup", start: setTime(base, 15, 10), end: setTime(base, 15, 40), source: "demo" },
    { id: "demo-3", title: "Family dinner", start: setTime(addDays(base, 1), 18, 30), end: setTime(addDays(base, 1), 19, 30), source: "demo" },
    { id: "demo-4", title: "Grocery pickup", start: setTime(addDays(base, 2), 17, 0), end: setTime(addDays(base, 2), 17, 30), source: "demo" },
    { id: "demo-5", title: "Weekend planning", start: setTime(addDays(base, 5), 10, 0), end: setTime(addDays(base, 5), 11, 0), source: "demo" }
  ];
}

function setTime(date: Date, hours: number, minutes: number) {
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next.toISOString();
}

function toIsoDateTime(value: Date | string | number | undefined) {
  if (!value) return new Date().toISOString();
  return new Date(value).toISOString();
}
