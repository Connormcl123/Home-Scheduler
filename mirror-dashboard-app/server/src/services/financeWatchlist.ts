import type { FinanceWatchlistItem } from "@mirror-dashboard/shared";
import { getDb } from "../db.js";

function rowToWatchlistItem(row: any): FinanceWatchlistItem {
  return {
    id: row.id,
    symbol: row.symbol,
    enabled: Boolean(row.enabled)
  };
}

export async function listFinanceWatchlist() {
  const db = await getDb();
  const rows = await db.all("SELECT * FROM finance_watchlist ORDER BY id ASC");
  return rows.map(rowToWatchlistItem);
}

export async function createFinanceWatchlistItem(input: { symbol: string; enabled?: boolean }) {
  const db = await getDb();
  const result = await db.run(
    "INSERT INTO finance_watchlist (symbol, enabled) VALUES (?, ?)",
    input.symbol.trim().toUpperCase(),
    input.enabled === undefined ? 1 : Number(input.enabled)
  );
  const row = await db.get("SELECT * FROM finance_watchlist WHERE id = ?", result.lastID);
  return rowToWatchlistItem(row);
}

export async function updateFinanceWatchlistItem(id: number, input: Partial<{ symbol: string; enabled: boolean }>) {
  const db = await getDb();
  const current = await db.get("SELECT * FROM finance_watchlist WHERE id = ?", id);
  if (!current) return null;

  await db.run(
    "UPDATE finance_watchlist SET symbol = ?, enabled = ? WHERE id = ?",
    input.symbol === undefined ? current.symbol : input.symbol.trim().toUpperCase(),
    input.enabled === undefined ? current.enabled : Number(input.enabled),
    id
  );

  const row = await db.get("SELECT * FROM finance_watchlist WHERE id = ?", id);
  return rowToWatchlistItem(row);
}

export async function deleteFinanceWatchlistItem(id: number) {
  const db = await getDb();
  await db.run("DELETE FROM finance_watchlist WHERE id = ?", id);
}
