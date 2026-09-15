import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "gmail-account-"));
process.env.DATABASE_PATH = path.join(dir, "test.sqlite");
// Set before config.ts loads, so a developer's .env cannot change the result.
process.env.GMAIL_CLIENT_ID = "";
process.env.GMAIL_CLIENT_SECRET = "";
const { getDb } = await import("../../src/db.js");
const account = await import("../../src/services/gmail/account.js");

test.after(async () => {
  await (await getDb()).close();
  rmSync(dir, { recursive: true, force: true });
});

test("no account means not connected", async () => {
  assert.deepEqual(await account.getConnection(), { configured: false, status: "not_connected", email: null, lastCheckedAt: null, lastError: null });
});

test("saving, checking, needing a reconnect and clearing", async () => {
  await account.saveAccount("family@example.com", "refresh-1", new Date("2026-09-15T10:00:00.000Z"));
  assert.equal((await account.getAccount())?.refreshToken, "refresh-1");
  await account.recordCheck({ checkedAt: "2026-09-15T10:10:00.000Z", error: null });
  await account.recordCheck({ checkedAt: null, error: "Gmail search failed: 503" });
  let connection = await account.getConnection();
  assert.equal(connection.status, "connected");
  assert.equal(connection.email, "family@example.com");
  assert.equal(connection.lastCheckedAt, "2026-09-15T10:10:00.000Z");
  assert.equal(connection.lastError, "Gmail search failed: 503");
  await account.markNeedsReconnect("Sign in again.");
  connection = await account.getConnection();
  assert.equal(connection.status, "needs_reconnect");
  assert.equal(connection.lastError, "Sign in again.");
  await account.clearAccount();
  assert.equal((await account.getConnection()).status, "not_connected");
});

test("signing in again keeps the check history for the same address only", async () => {
  await account.saveAccount("family@example.com", "refresh-1");
  await account.recordCheck({ checkedAt: "2026-09-15T10:10:00.000Z", error: null });
  await account.markNeedsReconnect("Sign in again.");
  await account.saveAccount("Family@Example.com", "refresh-2");
  let connection = await account.getConnection();
  assert.equal(connection.status, "connected");
  assert.equal(connection.lastError, null);
  assert.equal(connection.lastCheckedAt, "2026-09-15T10:10:00.000Z");
  await account.saveAccount("someone-else@example.com", "refresh-3");
  connection = await account.getConnection();
  assert.equal(connection.lastCheckedAt, null);
  assert.equal((await account.getAccount())?.refreshToken, "refresh-3");
});
