import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, findMatch, type StoredPackage } from "../../src/services/packages/apply.js";
import type { PackageUpdate } from "../../src/services/packages/extract.js";

const now = new Date("2026-09-15T16:00:00.000Z");
const recent = "2026-09-15T15:00:00.000Z";
const old = "2026-09-05T15:00:00.000Z";

function update(overrides: Partial<PackageUpdate> = {}): PackageUpdate {
  return { isShipmentUpdate: true, store: "Amazon", item: "Kids' sneakers", imageUrl: null, carrier: null, trackingNumber: null, orderNumber: "112-1", status: "ordered", arrivalStart: null, arrivalEnd: null, issue: null, ...overrides };
}

function stored(overrides: Partial<StoredPackage> = {}): StoredPackage {
  return { id: 1, store: "Amazon", item: "Kids' sneakers", imageUrl: null, carrier: null, trackingNumber: null, orderNumber: "112-1", status: "ordered", arrivalStart: null, arrivalEnd: null, issue: null, deliveredAt: null, hidden: false, lastEmailAt: "2026-09-14T12:00:00.000Z", ...overrides };
}

test("anything that is not a shipment is skipped", () => {
  assert.deepEqual(decide(update({ isShipmentUpdate: false }), [], recent, now), { kind: "skip" });
  assert.deepEqual(decide(update({ status: null }), [], recent, now), { kind: "skip" });
});

test("a new order becomes a package", () => {
  const decision = decide(update({ imageUrl: "https://img.example/shoe.jpg", arrivalStart: "2026-09-17", arrivalEnd: "2026-09-17" }), [], recent, now);
  assert.equal(decision.kind, "create");
  if (decision.kind !== "create") return;
  assert.equal(decision.fields.status, "ordered");
  assert.equal(decision.fields.item, "Kids' sneakers");
  assert.equal(decision.fields.arrivalStart, "2026-09-17");
  assert.equal(decision.fields.lastEmailAt, recent);
  assert.equal(decision.photoUrl, "https://img.example/shoe.jpg");
  assert.equal(decision.event, null);
});

test("an unnamed item is called after the store", () => {
  const named = decide(update({ item: null }), [], recent, now);
  assert.equal(named.kind === "create" && named.fields.item, "Package from Amazon");
  const plain = decide(update({ item: null, store: null, orderNumber: null }), [], recent, now);
  assert.equal(plain.kind === "create" && plain.fields.item, "Package");
});

test("updates match by tracking number first, ignoring case and spaces", () => {
  const packages = [stored({ id: 1 }), stored({ id: 2, orderNumber: "999", trackingNumber: "1Z 999 aa1" })];
  assert.equal(findMatch(update({ trackingNumber: "1z999AA1", orderNumber: null }), packages)?.id, 2);
});

test("then by store and order number", () => {
  assert.equal(findMatch(update({ store: "amazon" }), [stored({ id: 3 })])?.id, 3);
  assert.equal(findMatch(update({ store: "Target" }), [stored({ id: 3 })]), null);
  assert.equal(findMatch(update({ store: null }), [stored({ id: 3 })]), null);
});

test("a second box from the same order becomes its own package", () => {
  const first = stored({ id: 4, status: "shipped", trackingNumber: "TBA111" });
  const decision = decide(update({ status: "shipped", trackingNumber: "TBA222", item: "Water bottle" }), [first], recent, now);
  assert.equal(decision.kind, "create");
  assert.equal(decision.kind === "create" && decision.fields.item, "Water bottle");
});

test("the first shipping email joins the order and fills in what it knows", () => {
  const decision = decide(
    update({ status: "shipped", carrier: "UPS", trackingNumber: "1Z1", arrivalStart: "2026-09-17", arrivalEnd: "2026-09-18", imageUrl: "https://img.example/shoe.jpg" }),
    [stored({ id: 5 })], recent, now
  );
  assert.deepEqual(decision, {
    kind: "update",
    packageId: 5,
    fields: { carrier: "UPS", trackingNumber: "1Z1", lastEmailAt: recent, arrivalStart: "2026-09-17", arrivalEnd: "2026-09-18", status: "shipped", issue: null },
    photoUrl: "https://img.example/shoe.jpg",
    event: null
  });
});

test("status never moves backwards", () => {
  const decision = decide(update({ status: "shipped" }), [stored({ id: 6, status: "delivered", deliveredAt: old })], recent, now);
  assert.equal(decision.kind, "update");
  assert.equal(decision.kind === "update" && decision.fields.status, undefined);
});

test("out for delivery and delivered are announced only when recent", () => {
  const out = decide(update({ status: "out_for_delivery" }), [stored({ id: 7, status: "shipped" })], recent, now);
  assert.equal(out.kind === "update" && out.event, "out_for_delivery");
  const delivered = decide(update({ status: "delivered" }), [stored({ id: 7, status: "out_for_delivery" })], recent, now);
  assert.equal(delivered.kind === "update" && delivered.event, "delivered");
  assert.equal(delivered.kind === "update" && delivered.fields.deliveredAt, recent);
  const oldNews = decide(update({ status: "delivered" }), [], old, now);
  assert.equal(oldNews.kind, "create");
  assert.equal(oldNews.kind === "create" && oldNews.event, null);
});

test("a delay sets a note that the next step clears", () => {
  const delayed = decide(update({ status: "delayed", issue: "Delayed: now arriving Friday" }), [stored({ id: 8, status: "shipped" })], recent, now);
  assert.equal(delayed.kind === "update" && delayed.fields.issue, "Delayed: now arriving Friday");
  assert.equal(delayed.kind === "update" && delayed.fields.status, undefined);
  const attempted = decide(update({ status: "attempted" }), [stored({ id: 8, status: "out_for_delivery" })], recent, now);
  assert.equal(attempted.kind === "update" && attempted.fields.issue, "Delivery attempted");
  const next = decide(update({ status: "delivered" }), [stored({ id: 8, status: "out_for_delivery", issue: "Delivery attempted" })], recent, now);
  assert.equal(next.kind === "update" && next.fields.issue, null);
});

test("a delay for a package not seen before starts it at Shipped", () => {
  const decision = decide(update({ status: "delayed" }), [], recent, now);
  assert.equal(decision.kind === "create" && decision.fields.status, "shipped");
  assert.equal(decision.kind === "create" && decision.fields.issue, "Delayed");
});

test("cancelling removes a package; an unknown cancellation is skipped", () => {
  assert.deepEqual(decide(update({ status: "cancelled" }), [stored({ id: 9 })], recent, now), { kind: "delete", packageId: 9 });
  assert.deepEqual(decide(update({ status: "cancelled" }), [], recent, now), { kind: "skip" });
});

test("a hidden package stays hidden", () => {
  assert.deepEqual(decide(update({ status: "delivered" }), [stored({ id: 10, hidden: true })], recent, now), { kind: "hidden", packageId: 10 });
});

test("an older email does not replace newer dates, but fills empty ones", () => {
  const withDates = stored({ id: 11, status: "shipped", arrivalStart: "2026-09-18", arrivalEnd: "2026-09-18", lastEmailAt: "2026-09-15T15:30:00.000Z" });
  const older = decide(update({ status: "shipped", arrivalStart: "2026-09-17", arrivalEnd: "2026-09-17" }), [withDates], recent, now);
  assert.deepEqual(older.kind === "update" && older.fields, {});
  const empty = decide(update({ status: "shipped", arrivalStart: "2026-09-17", arrivalEnd: "2026-09-17" }), [{ ...withDates, arrivalStart: null, arrivalEnd: null }], recent, now);
  assert.equal(empty.kind === "update" && empty.fields.arrivalStart, "2026-09-17");
});

test("a photo is offered only while the package has none, and a generic name is replaced", () => {
  const decision = decide(update({ status: "shipped", imageUrl: "https://img.example/b.jpg" }), [stored({ id: 12, imageUrl: "/media/a.jpg", item: "Package from Amazon" })], recent, now);
  assert.equal(decision.kind === "update" && decision.photoUrl, null);
  assert.equal(decision.kind === "update" && decision.fields.item, "Kids' sneakers");
});
