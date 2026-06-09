import type { CalendarEvent } from "@mirror-dashboard/shared";
import { getDb } from "../db.js";

type LocalCalendarRow = {
  id: number;
  title: string;
  start: string;
  end: string | null;
  location: string | null;
  source: "local" | "voice";
};

function rowToEvent(row: LocalCalendarRow): CalendarEvent {
  return {
    id: `local-${row.id}`,
    title: row.title,
    start: row.start,
    end: row.end || undefined,
    location: row.location || undefined,
    source: row.source
  };
}

export async function listLocalCalendarEvents(range: { from: Date; to: Date }): Promise<CalendarEvent[]> {
  const db = await getDb();
  const rows = await db.all<LocalCalendarRow[]>(
    "SELECT id, title, start, end, location, source FROM local_calendar_events WHERE start >= ? AND start <= ? ORDER BY start ASC",
    range.from.toISOString(),
    range.to.toISOString()
  );
  return rows.map(rowToEvent);
}

export async function createLocalCalendarEvent(input: { title: string; start: string; end?: string; location?: string; source?: "local" | "voice" }) {
  const db = await getDb();
  const result = await db.run(
    "INSERT INTO local_calendar_events (title, start, end, location, source) VALUES (?, ?, ?, ?, ?)",
    input.title.trim(),
    input.start,
    input.end || null,
    input.location?.trim() || null,
    input.source || "local"
  );
  const row = await db.get<LocalCalendarRow>("SELECT id, title, start, end, location, source FROM local_calendar_events WHERE id = ?", result.lastID);
  return row ? rowToEvent(row) : null;
}
