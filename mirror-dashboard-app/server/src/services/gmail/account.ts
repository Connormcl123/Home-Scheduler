import type { GmailConnection } from "@mirror-dashboard/shared";
import { getDb } from "../../db.js";
import { credentials } from "./oauth.js";

type AccountRow = {
  email: string;
  refresh_token: string;
  status: "connected" | "needs_reconnect";
  last_checked_at: string | null;
  last_error: string | null;
};

export type GmailAccount = {
  email: string;
  refreshToken: string;
  status: "connected" | "needs_reconnect";
  lastCheckedAt: string | null;
  lastError: string | null;
};

export async function getAccount(): Promise<GmailAccount | null> {
  const db = await getDb();
  const row = await db.get<AccountRow>("SELECT email, refresh_token, status, last_checked_at, last_error FROM gmail_account WHERE id = 1");
  return row
    ? { email: row.email, refreshToken: row.refresh_token, status: row.status, lastCheckedAt: row.last_checked_at, lastError: row.last_error }
    : null;
}

/** Signing in again with the same address keeps the check history; a different address starts over. */
export async function saveAccount(email: string, refreshToken: string, now = new Date()): Promise<void> {
  const existing = await getAccount();
  const lastChecked = existing && existing.email.toLowerCase() === email.toLowerCase() ? existing.lastCheckedAt : null;
  const db = await getDb();
  await db.run(
    `INSERT INTO gmail_account (id, email, refresh_token, status, connected_at, last_checked_at, last_error)
     VALUES (1, ?, ?, 'connected', ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET email = excluded.email, refresh_token = excluded.refresh_token, status = 'connected',
       connected_at = excluded.connected_at, last_checked_at = excluded.last_checked_at, last_error = NULL`,
    email, refreshToken, now.toISOString(), lastChecked
  );
}

export async function markNeedsReconnect(error: string): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE gmail_account SET status = 'needs_reconnect', last_error = ? WHERE id = 1", error);
}

/** `checkedAt` is set only when the Gmail search itself worked; `error` replaces the last one either way. */
export async function recordCheck(result: { checkedAt: string | null; error: string | null }): Promise<void> {
  const db = await getDb();
  if (result.checkedAt) {
    await db.run("UPDATE gmail_account SET last_checked_at = ?, last_error = ? WHERE id = 1", result.checkedAt, result.error);
  } else {
    await db.run("UPDATE gmail_account SET last_error = ? WHERE id = 1", result.error);
  }
}

export async function clearAccount(): Promise<void> {
  const db = await getDb();
  await db.run("DELETE FROM gmail_account WHERE id = 1");
}

export async function getConnection(): Promise<GmailConnection> {
  const account = await getAccount();
  return {
    configured: credentials() !== null,
    status: account ? account.status : "not_connected",
    email: account?.email ?? null,
    lastCheckedAt: account?.lastCheckedAt ?? null,
    lastError: account?.lastError ?? null
  };
}
