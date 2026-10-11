import type { CalendarEvent } from "@mirror-dashboard/shared";
import { dateKey } from "../packages/packageText";

const HOUR = 3_600_000;

function endOf(event: CalendarEvent): Date {
  const start = new Date(event.start);
  return event.end ? new Date(event.end) : new Date(start.getTime() + HOUR);
}

/** Feeds mark all-day events as midnight to midnight; anything 20 hours or longer counts. */
export function allDay(event: CalendarEvent): boolean {
  return endOf(event).getTime() - new Date(event.start).getTime() >= 20 * HOUR;
}

export function todays(events: CalendarEvent[], now: Date): CalendarEvent[] {
  const key = dateKey(now);
  return events.filter((event) => dateKey(new Date(event.start)) === key).sort((a, b) => a.start.localeCompare(b.start));
}

/** The rail runs 7 am to 10 pm, stretched to fit anything earlier or later. */
export function railHours(timed: CalendarEvent[]): { start: number; end: number } {
  let start = 7;
  let end = 22;
  for (const event of timed) {
    start = Math.min(start, new Date(event.start).getHours());
    const finish = endOf(event);
    const finishHour = finish.getHours() + (finish.getMinutes() ? 1 : 0);
    // An event running past midnight ends the rail at midnight.
    end = Math.max(end, dateKey(finish) === dateKey(new Date(event.start)) ? finishHour : 24);
  }
  return { start, end: Math.min(24, end) };
}

/** Two lanes: an event that overlaps the one before it drops to the second lane. */
export function laneOf(timed: CalendarEvent[]): number[] {
  const laneEnds = [0, 0];
  return timed.map((event) => {
    const start = new Date(event.start).getTime();
    const lane = start >= laneEnds[0] ? 0 : start >= laneEnds[1] ? 1 : laneEnds[0] <= laneEnds[1] ? 0 : 1;
    laneEnds[lane] = endOf(event).getTime();
    return lane;
  });
}

/** The next few events after today, within two weeks. */
export function coming(events: CalendarEvent[], now: Date, limit: number): CalendarEvent[] {
  const today = dateKey(now);
  const horizon = now.getTime() + 14 * 24 * HOUR;
  return events
    .filter((event) => dateKey(new Date(event.start)) > today && new Date(event.start).getTime() <= horizon)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, limit);
}

/** "9:45 am" */
export function timeOf(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s+/g, " ").toLowerCase();
}

/** "Due today", "Due tomorrow", "Due Friday", "Due Sep 30", or "Overdue since Sep 9". */
export function dueLabel(dueDate: string | null | undefined, now: Date): { text: string; late: boolean } | null {
  if (!dueDate) return null;
  const today = dateKey(now);
  const day = new Date(`${dueDate}T12:00:00`);
  const monthDay = day.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (dueDate < today) return { text: `Overdue since ${monthDay}`, late: true };
  if (dueDate === today) return { text: "Due today", late: false };
  const days = Math.round((day.getTime() - new Date(`${today}T12:00:00`).getTime()) / (24 * HOUR));
  if (days === 1) return { text: "Due tomorrow", late: false };
  if (days <= 6) return { text: `Due ${day.toLocaleDateString("en-US", { weekday: "long" })}`, late: false };
  return { text: `Due ${monthDay}`, late: false };
}

/** Where spending sits in the budget, and where an even pace would have it by today. */
export function moneyPace(spent: number, limit: number, now: Date): { spentPercent: number; expectedPercent: number; over: boolean } {
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const expected = (now.getDate() / days) * limit;
  return {
    spentPercent: limit > 0 ? Math.min(100, (spent / limit) * 100) : 0,
    expectedPercent: Math.min(100, (now.getDate() / days) * 100),
    over: spent > expected
  };
}
