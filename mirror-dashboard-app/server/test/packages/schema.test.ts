import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Point the app at a throwaway database before anything imports config.ts.
const dir = mkdtempSync(path.join(tmpdir(), "packages-schema-"));
process.env.DATABASE_PATH = path.join(dir, "test.sqlite");
const { getDb } = await import("../../src/db.js");
const { config } = await import("../../src/config.js");

test.after(async () => {
  await (await getDb()).close();
  rmSync(dir, { recursive: true, force: true });
});

const at = "2026-09-15T12:00:00.000Z";

test("the Gmail account table holds one row only", async () => {
  const db = await getDb();
  await db.run("INSERT INTO gmail_account (id, email, refresh_token, connected_at) VALUES (1, 'a@example.com', 'r', ?)", at);
  await assert.rejects(db.run("INSERT INTO gmail_account (id, email, refresh_token, connected_at) VALUES (2, 'b@example.com', 'r', ?)", at));
});

test("deleting a package keeps its emails but drops its events", async () => {
  const db = await getDb();
  const { lastID } = await db.run("INSERT INTO packages (item, status, last_email_at, created_at, updated_at) VALUES ('Sneakers', 'shipped', ?, ?, ?)", at, at, at);
  await db.run("INSERT INTO package_emails (gmail_id, package_id, received_at, outcome) VALUES ('m1', ?, ?, 'package')", lastID, at);
  await db.run("INSERT INTO package_events (package_id, status, created_at) VALUES (?, 'delivered', ?)", lastID, at);
  await db.run("DELETE FROM packages WHERE id = ?", lastID);
  assert.equal((await db.get<{ package_id: number | null }>("SELECT package_id FROM package_emails WHERE gmail_id = 'm1'"))?.package_id, null);
  assert.equal((await db.get<{ count: number }>("SELECT COUNT(*) AS count FROM package_events"))?.count, 0);
});

test("package statuses are limited to the four steps", async () => {
  const db = await getDb();
  await assert.rejects(db.run("INSERT INTO packages (item, status, last_email_at, created_at, updated_at) VALUES ('X', 'delayed', ?, ?, ?)", at, at, at));
});

test("Gmail and package settings have safe defaults", () => {
  assert.equal(config.gmail.clientId, process.env.GMAIL_CLIENT_ID || "");
  assert.ok(config.packages.checkMinutes >= 5);
});
