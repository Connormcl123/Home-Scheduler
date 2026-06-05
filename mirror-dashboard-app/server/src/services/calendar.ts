import type { CalendarEvent } from "@mirror-dashboard/shared";
import { addDays } from "../utils/dates.js";

export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  return mockCalendarEvents();
}

export async function getCalendarProviderStatus() {
  return {
    provider: "mock",
    configured: false,
    message: "Phase 1 uses mock calendar data. iCal and Google Calendar adapters will be added later."
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
