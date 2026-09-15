import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PackageFields } from "../../src/services/packages/apply.js";

const dir = mkdtempSync(path.join(tmpdir(), "packages-store-"));
process.env.DATABASE_PATH = path.join(dir, "test.sqlite");
const { getDb } = await import("../../src/db.js");
const store = await import("../../src/services/packages/store.js");
const { localDateIn } = await import("../../src/utils/dates.js");

test.after(async () => {
  await (await getDb()).close();
  rmSync(dir, { recursive: true, force: true });
});

const TZ = "America/New_York";
// Noon in New York.
const now = new Date("2026-09-15T16:00:00.000Z");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();

function fields(overrides: Partial<PackageFields> = {}): PackageFields {
  return { store: "Amazon", item: "Kids' sneakers", carrier: null, trackingNumber: null, orderNumber: "112-1", status: "shipped", arrivalStart: null, arrivalEnd: null, issue: null, deliveredAt: null, lastEmailAt: hoursAgo(2), ...overrides };
}

async function reset() {
  const db = await getDb();
  await db.exec("DELETE FROM package_events; DELETE FROM package_emails; DELETE FROM packages;");
}

test("dates follow the household's time zone", () => {
  assert.equal(localDateIn(new Date("2026-09-16T02:00:00.000Z"), TZ), "2026-09-15");
  assert.equal(localDateIn(new Date("2026-09-16T05:00:00.000Z"), TZ), "2026-09-16");
});

test("packages are created, updated and given a photo once", async () => {
  await reset();
  const id = await store.createPackage(fields(), null, now);
  await store.updatePackage(id, { status: "out_for_delivery", carrier: "UPS" }, now);
  await store.updatePackage(id, {}, now);
  await store.setPhoto(id, "/media/a.jpg");
  await store.setPhoto(id, "/media/b.jpg");
  const [pkg] = await store.allPackages();
  assert.equal(pkg.status, "out_for_delivery");
  assert.equal(pkg.carrier, "UPS");
  assert.equal(pkg.imageUrl, "/media/a.jpg");
  assert.equal(pkg.hidden, false);
  assert.equal(pkg.lastEmailAt, hoursAgo(2));
});

test("the wall lists what is on its way, today's deliveries and a week of history", async () => {
  await reset();
  const later = await store.createPackage(fields({ item: "Shipped later", arrivalStart: "2026-09-18", arrivalEnd: "2026-09-18" }), null, now);
  const out = await store.createPackage(fields({ item: "Out now", status: "out_for_delivery" }), null, now);
  const sooner = await store.createPackage(fields({ item: "Shipped sooner", arrivalStart: "2026-09-16", arrivalEnd: "2026-09-16" }), null, now);
  const today = await store.createPackage(fields({ item: "Came today", status: "delivered", deliveredAt: hoursAgo(1) }), null, now);
  const yesterday = await store.createPackage(fields({ item: "Came yesterday", status: "delivered", deliveredAt: hoursAgo(24) }), null, now);
  const hidden = await store.createPackage(fields({ item: "Not a package" }), null, now);
  assert.equal(await store.hidePackage(hidden), true);
  await store.recordEmail({ gmailId: "m1", packageId: out, receivedAt: hoursAgo(3), subject: "Shipped: Out now", outcome: "package", attempts: 1 });
  await store.recordEmail({ gmailId: "m2", packageId: out, receivedAt: hoursAgo(1), subject: "Out for delivery: Out now", outcome: "package", attempts: 1 });
  const { active, delivered } = await store.listPackageViews(now, TZ);
  assert.deepEqual(active.map((pkg) => pkg.id), [out, sooner, later, today]);
  assert.deepEqual(delivered.map((pkg) => pkg.id), [today, yesterday]);
  assert.deepEqual(active[0].subjects, ["Shipped: Out now", "Out for delivery: Out now"]);
  assert.equal(active[0].updatedAt, hoursAgo(2));
});

test("hiding a package that does not exist reports false", async () => {
  await reset();
  assert.equal(await store.hidePackage(123456), false);
});

test("events: first the end of the list, then newer events for visible packages", async () => {
  await reset();
  const before = await store.listEvents();
  const shown = await store.createPackage(fields({ status: "delivered", deliveredAt: hoursAgo(1) }), "/media/a.jpg", now);
  const hidden = await store.createPackage(fields({ item: "Hidden" }), null, now);
  await store.addEvent(shown, "delivered", now);
  await store.addEvent(hidden, "out_for_delivery", now);
  await store.hidePackage(hidden);
  const start = await store.listEvents();
  assert.deepEqual(start.events, []);
  assert.ok(start.lastId > before.lastId);
  const newer = await store.listEvents(before.lastId);
  assert.equal(newer.events.length, 1);
  assert.equal(newer.events[0].status, "delivered");
  assert.equal(newer.events[0].package.id, shown);
  assert.equal(newer.events[0].package.imageUrl, "/media/a.jpg");
});

test("emails are recorded once and pending ones can be retried", async () => {
  await reset();
  await store.recordEmail({ gmailId: "a", packageId: null, receivedAt: hoursAgo(1), subject: "Your order", outcome: "pending", attempts: 1 });
  await store.recordEmail({ gmailId: "b", packageId: null, receivedAt: hoursAgo(2), subject: null, outcome: "skipped", attempts: 1 });
  assert.deepEqual(await store.pendingEmailIds(), ["a"]);
  await store.recordEmail({ gmailId: "a", packageId: null, receivedAt: hoursAgo(1), subject: null, outcome: "failed", attempts: 3 });
  assert.deepEqual(await store.emailRecord("a"), { outcome: "failed", attempts: 3 });
  assert.equal(await store.emailRecord("missing"), null);
  assert.deepEqual(await store.pendingEmailIds(), []);
  const db = await getDb();
  assert.equal((await db.get<{ subject: string }>("SELECT subject FROM package_emails WHERE gmail_id = 'a'"))?.subject, "Your order");
});

test("clean-up drops old deliveries, stale packages, old emails and old events", async () => {
  await reset();
  await store.createPackage(fields({ status: "delivered", deliveredAt: hoursAgo(8 * 24) }), "/media/old.jpg", now);
  await store.createPackage(fields({ lastEmailAt: hoursAgo(31 * 24) }), null, now);
  const keptDelivery = await store.createPackage(fields({ status: "delivered", deliveredAt: hoursAgo(6 * 24) }), "/media/kept.jpg", now);
  const kept = await store.createPackage(fields(), null, now);
  await store.recordEmail({ gmailId: "old", packageId: null, receivedAt: hoursAgo(61 * 24), subject: null, outcome: "skipped", attempts: 1 });
  await store.recordEmail({ gmailId: "new", packageId: null, receivedAt: hoursAgo(1), subject: null, outcome: "skipped", attempts: 1 });
  await store.addEvent(kept, "out_for_delivery", new Date(now.getTime() - 3 * 24 * 3_600_000));
  await store.addEvent(kept, "delivered", now);
  assert.deepEqual(await store.cleanup(now), ["/media/old.jpg"]);
  assert.deepEqual((await store.allPackages()).map((pkg) => pkg.id), [keptDelivery, kept]);
  assert.equal(await store.emailRecord("old"), null);
  assert.ok(await store.emailRecord("new"));
  const db = await getDb();
  assert.equal((await db.get<{ count: number }>("SELECT COUNT(*) AS count FROM package_events"))?.count, 1);
});
