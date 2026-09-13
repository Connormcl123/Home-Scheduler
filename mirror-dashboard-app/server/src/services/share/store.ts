import type { ShareImport, ShareKind, ShareStatus } from "@mirror-dashboard/shared";
import { getDb } from "../../db.js";

type ShareRow = {
  id: number;
  url: string | null;
  kind: ShareKind | null;
  status: ShareStatus;
  item_id: number | null;
  title: string | null;
  message: string;
  content: string | null;
  image_url: string | null;
  created_at: string;
};

export type ShareRecord = {
  url: string | null;
  kind: ShareKind | null;
  status: ShareStatus;
  itemId: number | null;
  title: string | null;
  message: string;
  content: string | null;
  imageUrl: string | null;
};

// SQLite's CURRENT_TIMESTAMP is UTC with no zone marker; give the client ISO.
function iso(value: string) {
  return value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
}

function toRecord(row: ShareRow): ShareRecord & { id: number } {
  return { id: row.id, url: row.url, kind: row.kind, status: row.status, itemId: row.item_id, title: row.title, message: row.message, content: row.content, imageUrl: row.image_url };
}

function toShareImport(row: ShareRow): ShareImport {
  return { id: row.id, url: row.url, kind: row.kind, status: row.status, itemId: row.item_id, title: row.title, message: row.message, imageUrl: row.image_url, createdAt: iso(row.created_at) };
}

export async function recordShare(entry: ShareRecord): Promise<number> {
  const db = await getDb();
  const result = await db.run(
    "INSERT INTO share_imports (url, kind, status, item_id, title, message, content, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    entry.url, entry.kind, entry.status, entry.itemId, entry.title, entry.message, entry.content, entry.imageUrl
  );
  return Number(result.lastID);
}

export async function updateShare(id: number, entry: ShareRecord): Promise<void> {
  const db = await getDb();
  await db.run(
    "UPDATE share_imports SET url = ?, kind = ?, status = ?, item_id = ?, title = ?, message = ?, content = ?, image_url = ? WHERE id = ?",
    entry.url, entry.kind, entry.status, entry.itemId, entry.title, entry.message, entry.content, entry.imageUrl, id
  );
}

export async function getShare(id: number) {
  const db = await getDb();
  const row = await db.get<ShareRow>("SELECT * FROM share_imports WHERE id = ?", id);
  return row ? toRecord(row) : null;
}

/** The most recent share that produced this recipe or trip, so the wall can move it. */
export async function findShareByItem(kind: ShareKind, itemId: number) {
  const db = await getDb();
  const row = await db.get<ShareRow>("SELECT * FROM share_imports WHERE kind = ? AND item_id = ? ORDER BY id DESC LIMIT 1", kind, itemId);
  return row ? toRecord(row) : null;
}

/** Shares newer than `after`, oldest first (for the banner), or the latest 10, newest first (for Settings). */
export async function listShares(after?: number): Promise<ShareImport[]> {
  const db = await getDb();
  const rows = after
    ? await db.all<ShareRow[]>("SELECT * FROM share_imports WHERE id > ? ORDER BY id ASC LIMIT 20", after)
    : await db.all<ShareRow[]>("SELECT * FROM share_imports ORDER BY id DESC LIMIT 10");
  return rows.map(toShareImport);
}

export async function findDuplicate(url: string): Promise<{ kind: ShareKind; id: number; title: string } | null> {
  const db = await getDb();
  const recipe = await db.get<{ id: number; title: string }>("SELECT id, title FROM recipes WHERE source_url = ?", url);
  if (recipe) return { kind: "recipe", ...recipe };
  const trip = await db.get<{ id: number; title: string }>("SELECT id, title FROM travel_inspirations WHERE url = ?", url);
  return trip ? { kind: "trip", ...trip } : null;
}
