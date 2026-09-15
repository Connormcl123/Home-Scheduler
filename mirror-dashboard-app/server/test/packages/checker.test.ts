import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { GmailConnection } from "@mirror-dashboard/shared";
import type { ReadableEmail } from "../../src/services/gmail/mime.js";
import type { CheckerDeps } from "../../src/services/packages/checker.js";
import type { PackageUpdate } from "../../src/services/packages/extract.js";

const dir = mkdtempSync(path.join(tmpdir(), "packages-checker-"));
process.env.DATABASE_PATH = path.join(dir, "test.sqlite");
const { getDb } = await import("../../src/db.js");
const store = await import("../../src/services/packages/store.js");
const { checkOnce, runCheck } = await import("../../src/services/packages/checker.js");

test.after(async () => {
  await (await getDb()).close();
  rmSync(dir, { recursive: true, force: true });
});

const now = new Date("2026-09-15T16:00:00.000Z");
const connected: GmailConnection = { configured: true, status: "connected", email: "family@example.com", lastCheckedAt: null, lastError: null };

function mail(id: string, receivedAt: string): ReadableEmail {
  return { id, from: "shipment-tracking@amazon.com", subject: `Subject ${id}`, receivedAt, text: "text", imageUrls: [] };
}

function update(overrides: Partial<PackageUpdate> = {}): PackageUpdate {
  return { isShipmentUpdate: true, store: "Amazon", item: "Kids' sneakers", imageUrl: null, carrier: null, trackingNumber: null, orderNumber: "112-1", status: "ordered", arrivalStart: null, arrivalEnd: null, issue: null, ...overrides };
}

function harness(options: { ids: string[]; emails?: Record<string, ReadableEmail>; updates?: Record<string, PackageUpdate | Error>; connection?: GmailConnection; searchError?: Error }) {
  const calls = { searches: [] as string[], extracted: [] as string[], checks: [] as Array<{ checkedAt: string | null; error: string | null }>, removed: [] as string[], saved: [] as string[] };
  const deps: CheckerDeps = {
    connection: async () => options.connection ?? connected,
    search: async (query) => {
      calls.searches.push(query);
      if (options.searchError) throw options.searchError;
      return [...options.ids];
    },
    read: async (id) => options.emails?.[id] ?? mail(id, now.toISOString()),
    extract: async (email) => {
      calls.extracted.push(email.id);
      const result = options.updates?.[email.id] ?? update({ isShipmentUpdate: false, status: null });
      if (result instanceof Error) throw result;
      return result;
    },
    savePhoto: async (url) => { calls.saved.push(url); return "/media/photo.jpg"; },
    removePhoto: async (url) => { calls.removed.push(url); },
    store,
    recordCheck: async (result) => { calls.checks.push(result); },
    now: () => now
  };
  return { deps, calls };
}

async function reset() {
  const db = await getDb();
  await db.exec("DELETE FROM package_events; DELETE FROM package_emails; DELETE FROM packages;");
}

test("nothing happens until Gmail is connected", async () => {
  await reset();
  const { deps, calls } = harness({ ids: ["m1"], connection: { ...connected, status: "needs_reconnect" } });
  assert.deepEqual(await runCheck(deps), { ran: false, processed: 0, error: null });
  assert.deepEqual(calls.searches, []);
});

test("emails are applied oldest first, and never twice", async () => {
  await reset();
  const { deps, calls } = harness({
    ids: ["m2", "m1"],
    emails: { m1: mail("m1", "2026-09-15T10:00:00.000Z"), m2: mail("m2", "2026-09-15T11:00:00.000Z") },
    updates: { m1: update(), m2: update({ status: "shipped", trackingNumber: "1Z9", imageUrl: "https://img.example/shoe.jpg" }) }
  });
  assert.deepEqual(await runCheck(deps), { ran: true, processed: 2, error: null });
  assert.deepEqual(calls.extracted, ["m1", "m2"]);
  assert.ok(calls.searches[0].startsWith("newer_than:14d "));
  const packages = await store.allPackages();
  assert.equal(packages.length, 1);
  assert.equal(packages[0].status, "shipped");
  assert.equal(packages[0].trackingNumber, "1Z9");
  assert.equal(packages[0].imageUrl, "/media/photo.jpg");
  assert.deepEqual(calls.saved, ["https://img.example/shoe.jpg"]);
  assert.deepEqual(await store.emailRecord("m1"), { outcome: "package", attempts: 1 });
  assert.deepEqual(calls.checks, [{ checkedAt: now.toISOString(), error: null }]);
  assert.equal((await runCheck(deps)).processed, 0);
  assert.deepEqual(calls.extracted, ["m1", "m2"]);
});

test("mail that is not a shipment is recorded as skipped", async () => {
  await reset();
  const { deps } = harness({ ids: ["ad"] });
  await runCheck(deps);
  assert.deepEqual(await store.emailRecord("ad"), { outcome: "skipped", attempts: 1 });
  assert.equal((await store.allPackages()).length, 0);
});

test("an email that cannot be read is retried up to three times, even when the search no longer finds it", async () => {
  await reset();
  const failing = { f1: new Error("Claude timeout") };
  await runCheck(harness({ ids: ["f1"], updates: failing }).deps);
  assert.deepEqual(await store.emailRecord("f1"), { outcome: "pending", attempts: 1 });
  const later = harness({ ids: [], updates: failing });
  await runCheck(later.deps);
  assert.deepEqual(await store.emailRecord("f1"), { outcome: "pending", attempts: 2 });
  await runCheck(later.deps);
  assert.deepEqual(await store.emailRecord("f1"), { outcome: "failed", attempts: 3 });
  await runCheck(later.deps);
  assert.deepEqual(later.calls.extracted, ["f1", "f1"]);
});

test("a failed search keeps the last check time and reports the error", async () => {
  await reset();
  const { deps, calls } = harness({ ids: [], searchError: new Error("Gmail answered 503.") });
  const result = await runCheck(deps);
  assert.equal(result.error, "Gmail answered 503.");
  assert.deepEqual(calls.checks, [{ checkedAt: null, error: "Gmail search failed: Gmail answered 503." }]);
});

test("clean-up after a check removes photos of packages it deletes", async () => {
  await reset();
  await store.createPackage({ store: "Amazon", item: "Old", carrier: null, trackingNumber: null, orderNumber: null, status: "delivered", arrivalStart: null, arrivalEnd: null, issue: null, deliveredAt: "2026-09-01T12:00:00.000Z", lastEmailAt: "2026-09-01T12:00:00.000Z" }, "/media/old.jpg", now);
  const { deps, calls } = harness({ ids: [] });
  await runCheck(deps);
  assert.deepEqual(calls.removed, ["/media/old.jpg"]);
});

test("only one check runs at a time", async () => {
  await reset();
  const { deps } = harness({ ids: [] });
  const first = checkOnce(deps);
  assert.equal(checkOnce(deps), first);
  await first;
  const next = checkOnce(deps);
  assert.notEqual(next, first);
  await next;
});
