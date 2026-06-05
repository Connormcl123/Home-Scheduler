import type { RssFeed } from "@mirror-dashboard/shared";
import { getDb } from "../db.js";

function rowToRssFeed(row: any): RssFeed {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    enabled: Boolean(row.enabled)
  };
}

export async function listRssFeeds() {
  const db = await getDb();
  const rows = await db.all("SELECT * FROM rss_feeds ORDER BY id ASC");
  return rows.map(rowToRssFeed);
}

export async function createRssFeed(input: { title?: string; url: string; enabled?: boolean }) {
  const db = await getDb();
  const title = input.title?.trim() || new URL(input.url).hostname;
  const result = await db.run(
    "INSERT INTO rss_feeds (title, url, enabled) VALUES (?, ?, ?)",
    title,
    input.url,
    input.enabled === undefined ? 1 : Number(input.enabled)
  );
  const row = await db.get("SELECT * FROM rss_feeds WHERE id = ?", result.lastID);
  return rowToRssFeed(row);
}

export async function updateRssFeed(id: number, input: Partial<{ title: string; url: string; enabled: boolean }>) {
  const db = await getDb();
  const current = await db.get("SELECT * FROM rss_feeds WHERE id = ?", id);
  if (!current) return null;

  await db.run(
    `UPDATE rss_feeds
     SET title = ?, url = ?, enabled = ?
     WHERE id = ?`,
    input.title ?? current.title,
    input.url ?? current.url,
    input.enabled === undefined ? current.enabled : Number(input.enabled),
    id
  );

  const row = await db.get("SELECT * FROM rss_feeds WHERE id = ?", id);
  return rowToRssFeed(row);
}

export async function deleteRssFeed(id: number) {
  const db = await getDb();
  await db.run("DELETE FROM rss_feeds WHERE id = ?", id);
}
