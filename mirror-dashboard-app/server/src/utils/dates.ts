export function todayIso(date = new Date()) {
  // Must be the LOCAL calendar date, not UTC. toISOString() rolls over in the
  // evening for western timezones, which made "today" and "tomorrow" land a day
  // early for notes, task filtering, and anything the assistant is told.
  // en-CA formats as YYYY-MM-DD.
  return date.toLocaleDateString("en-CA");
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** "today at 1:30 PM", "tomorrow, all day", "Fri, Dec 4 at 1:30 PM": always the day, so next week never reads as today. */
export function eventWhen(event: { start: string; end?: string }, now: Date) {
  const start = new Date(event.start);
  const day = todayIso(start);
  const label = day === todayIso(now)
    ? "today"
    : day === todayIso(addDays(now, 1))
      ? "tomorrow"
      : start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const fromMidnight = !start.getHours() && !start.getMinutes();
  // 20 hours rather than 24, as Home does, for the day the clocks change.
  if (fromMidnight && event.end && new Date(event.end).getTime() - start.getTime() >= 20 * 3_600_000) return `${label}, all day`;
  return `${label} at ${start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

export function toIsoDateTime(value: Date | string | number | undefined) {
  if (!value) return new Date().toISOString();
  return new Date(value).toISOString();
}

/** The calendar date (YYYY-MM-DD) in a given time zone, e.g. the household's WEATHER_TIMEZONE. */
export function localDateIn(date: Date, timeZone: string) {
  return date.toLocaleDateString("en-CA", { timeZone });
}
