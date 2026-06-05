import ical from "ical";
import type { CalendarEvent } from "@mirror-dashboard/shared";
import { addDays } from "../utils/dates.js";
import { getSettings } from "./settings.js";

export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  const settings = await getSettings();
  if (!settings.calendarFeedUrl) return mockCalendarEvents();

  try {
    const response = await fetch(settings.calendarFeedUrl);
    if (!response.ok) throw new Error(`iCal fetch failed: ${response.status}`);

    const text = await response.text();
    const parsed = ical.parseICS(text);
    const now = new Date();
    const horizon = addDays(now, 45);

    const events = Object.values(parsed)
      .filter((item: any) => item.type === "VEVENT" && item.start)
      .map((item: any): CalendarEvent => ({
        id: item.uid || `${item.summary}-${item.start}`,
        title: item.summary || "Calendar event",
        start: toIsoDateTime(item.start),
        end: item.end ? toIsoDateTime(item.end) : undefined,
        location: item.location,
        source: "ical"
      }))
      .filter((event) => {
        const start = new Date(event.start);
        return start >= addDays(now, -1) && start <= horizon;
      })
      .sort((a, b) => a.start.localeCompare(b.start));

    return events.length ? events : mockCalendarEvents();
  } catch (error) {
    console.warn("Calendar feed unavailable, using mock events:", error);
    return mockCalendarEvents();
  }
}

export async function getCalendarProviderStatus() {
  const settings = await getSettings();
  return {
    provider: settings.calendarFeedUrl ? "ical" : "mock",
    configured: Boolean(settings.calendarFeedUrl),
    message: settings.calendarFeedUrl ? "iCal feed configured." : "No iCal feed configured; using mock calendar data."
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
