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

export function toIsoDateTime(value: Date | string | number | undefined) {
  if (!value) return new Date().toISOString();
  return new Date(value).toISOString();
}
