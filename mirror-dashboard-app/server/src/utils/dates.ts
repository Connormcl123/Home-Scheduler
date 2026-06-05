export function todayIso(date = new Date()) {
  return date.toISOString().slice(0, 10);
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
