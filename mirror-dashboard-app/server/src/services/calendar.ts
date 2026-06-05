import ical from "ical";
import type { CalendarEvent } from "@mirror-dashboard/shared";
import { addDays, toIsoDateTime } from "../utils/dates.js";
import { getSettings } from "./settings.js";

export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  const settings = await getSettings();
  if (!settings.calendarFeedUrl) return demoEvents();

  try {
    const response = await fetch(settings.calendarFeedUrl);
    if (!response.ok) throw new Error(`iCal fetch failed: ${response.status}`);
    const text = await response.text();
    const parsed = ical.parseICS(text);
    const now = new Date();
    const horizon = addDays(now, 45);

    return Object.values(parsed)
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
  } catch (error) {
    console.warn("Calendar feed unavailable, using demo events:", error);
    return demoEvents();
  }
}

function demoEvents(): CalendarEvent[] {
  const base = new Date();
  return [
    { id: "demo-1", title: "Breakfast reset", start: setTime(base, 8, 30), source: "demo" },
    { id: "demo-2", title: "School pickup", start: setTime(base, 15, 10), source: "demo" },
    { id: "demo-3", title: "Family dinner", start: setTime(addDays(base, 1), 18, 30), source: "demo" }
  ];
}

function setTime(date: Date, hours: number, minutes: number) {
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next.toISOString();
}
