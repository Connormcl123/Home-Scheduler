import type { CalendarEvent } from "@mirror-dashboard/shared";
import { dateKey } from "../packages/packageText";
import { allDay } from "../home/homeText";

const MINUTE = 60_000;

/** An event's times while they are being edited. An all-day span ends at the midnight after its last day, as feeds have it. */
export interface EventSpan {
  start: Date;
  end: Date;
  whole: boolean;
}

export function addDaysTo(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function midnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(from: Date, to: Date): number {
  // Rounded, since a day the clocks change is 23 or 25 hours long.
  return Math.round((midnight(to).getTime() - midnight(from).getTime()) / (24 * 60 * MINUTE));
}

/** All day means 20 hours or more from midnight; a long event that starts mid-morning keeps its times. */
export function isWholeDay(event: CalendarEvent): boolean {
  const start = new Date(event.start);
  return !start.getHours() && !start.getMinutes() && allDay(event);
}

export function spanOf(event: CalendarEvent): EventSpan {
  const start = new Date(event.start);
  const end = event.end ? new Date(event.end) : new Date(start.getTime() + 60 * MINUTE);
  return { start, end, whole: isWholeDay(event) };
}

/** The last day the event is on. */
export function lastDay(span: EventSpan): Date {
  return span.whole ? addDaysTo(span.end, -1) : span.end;
}

/** Moves the whole event to another day, keeping its times and how many days it runs. */
export function moveToDay(span: EventSpan, day: Date): EventSpan {
  const shift = daysBetween(span.start, day);
  return { ...span, start: addDaysTo(span.start, shift), end: addDaysTo(span.end, shift) };
}

/** A new start carries the end along, so the event keeps its length. */
export function setStart(span: EventSpan, start: Date): EventSpan {
  return { ...span, start, end: new Date(start.getTime() + span.end.getTime() - span.start.getTime()) };
}

export function setLastDay(span: EventSpan, day: Date): EventSpan {
  const end = new Date(span.end);
  const target = span.whole ? addDaysTo(day, 1) : day;
  end.setFullYear(target.getFullYear(), target.getMonth(), target.getDate());
  return { ...span, end };
}

/** Five-minute steps land on the fives, so 9:47 steps to 9:50 or 9:45. */
export function stepMinutes(date: Date, direction: 1 | -1): Date {
  const extra = date.getMinutes() % 5;
  const by = direction > 0 ? 5 - extra : -(extra || 5);
  return new Date(date.getTime() + by * MINUTE);
}

export function flipHalfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours((date.getHours() + 12) % 24);
  return next;
}

export function setWholeDay(span: EventSpan, whole: boolean): EventSpan {
  if (whole === span.whole) return span;
  const first = midnight(span.start);
  if (whole) {
    // A timed event ending at midnight does not take up the day it ends on.
    const last = new Date(span.end.getTime() - 1);
    return { whole, start: first, end: addDaysTo(first, Math.max(0, daysBetween(first, last)) + 1) };
  }
  const start = new Date(first);
  start.setHours(9);
  const end = new Date(lastDay(span));
  end.setHours(10, 0, 0, 0);
  return { whole, start, end };
}

/** Six weeks from a Sunday, so every month fits whichever day it starts on. */
export function monthDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  return Array.from({ length: 42 }, (_, index) => addDaysTo(first, index - first.getDay()));
}

export function sameDay(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b);
}
