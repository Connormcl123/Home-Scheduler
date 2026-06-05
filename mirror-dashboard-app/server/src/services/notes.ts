import type { Note } from "@mirror-dashboard/shared";
import { getDb } from "../db.js";
import { todayIso } from "../utils/dates.js";

function rowToNote(row: any): Note {
  return {
    id: row.id,
    date: row.date,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function getNoteByDate(date: string) {
  const db = await getDb();
  const row = await db.get("SELECT * FROM notes WHERE date = ?", date);
  return row ? rowToNote(row) : null;
}

export async function getTodayNote() {
  return getNoteByDate(todayIso());
}

export async function upsertNote(date: string, body: string) {
  const db = await getDb();
  await db.run(
    `INSERT INTO notes (date, body) VALUES (?, ?)
     ON CONFLICT(date) DO UPDATE SET body = excluded.body, updated_at = CURRENT_TIMESTAMP`,
    date,
    body
  );
  return getNoteByDate(date);
}
