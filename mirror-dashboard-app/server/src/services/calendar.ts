import ical from "ical";
import type { CalendarEvent } from "@mirror-dashboard/shared";
import { addDays } from "../utils/dates.js";
import { listLocalCalendarEvents } from "./localCalendar.js";
import { getSettings } from "./settings.js";
import { getDb } from "../db.js";

export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  const settings = await getSettings();
  const feedUrls = settings.calendarFeedUrls.length ? settings.calendarFeedUrls : settings.calendarFeedUrl ? [settings.calendarFeedUrl] : [];

  const now = new Date();
  const horizon = addDays(now, 45);
  const [localEvents, eventGroups] = await Promise.all([
    listLocalCalendarEvents({ from: addDays(now, -1), to: horizon }),
    Promise.all(feedUrls.map((feedUrl, index) => fetchCalendarFeed(feedUrl, index, now, horizon)))
  ]);
  const events = applyOverrides([...localEvents, ...eventGroups.flat()], await loadOverrides())
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

export async function moveCalendarEvent(id: string, start: string, end?: string | null) {
  const db = await getDb();
  const startIso = new Date(start).toISOString();
  const endIso = end ? new Date(end).toISOString() : null;

  // Local events are ours to edit outright; anything from a feed gets an override.
  const localMatch = /^local-(\d+)$/.exec(id);
  if (localMatch) {
    await db.run("UPDATE local_calendar_events SET start = ?, end = ? WHERE id = ?", startIso, endIso, Number(localMatch[1]));
    return;
  }

  await db.run(
    `INSERT INTO calendar_event_overrides (event_id, start, end, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(event_id) DO UPDATE SET start = excluded.start, end = excluded.end, updated_at = CURRENT_TIMESTAMP`,
    id, startIso, endIso
  );
}

async function fetchCalendarFeed(feedUrl: string, feedIndex: number, now: Date, horizon: Date): Promise<CalendarEvent[]> {
  try {
    const response = await fetch(normalizeFeedUrl(feedUrl));
    if (!response.ok) throw new Error(`iCal fetch failed: ${response.status}`);

    const text = await response.text();
    const parsed = ical.parseICS(text);
    return Object.values(parsed)
      .filter((item: any) => item.type === "VEVENT" && item.start)
      .map((item: any): CalendarEvent => ({
        id: `${feedIndex}-${item.uid || `${item.summary}-${item.start}`}`,
        title: item.summary || "Calendar event",
        start: toIsoDateTime(item.start),
        end: item.end ? toIsoDateTime(item.end) : undefined,
        location: item.location,
        source: "ical"
      }))
      .filter((event) => {
        const start = new Date(event.start);
        return start >= addDays(now, -1) && start <= horizon;
      });
  } catch (error) {
    console.warn(`Calendar feed unavailable (${feedIndex + 1}), skipping:`, error);
    return [];
  }
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
