import { test } from "node:test";
import assert from "node:assert/strict";
import type { PackageView } from "@mirror-dashboard/shared";
import { arrivalLine, arrivalPhrase, groupByDay, stepIndex, trackingUrl, updatedAgo } from "../src/packages/packageText";

// Tuesday 15 September 2026, 10:00 local time.
const now = new Date(2026, 8, 15, 10, 0);

function pkg(overrides: Partial<PackageView> = {}): PackageView {
  return { id: 1, store: "Amazon", item: "Kids' sneakers", imageUrl: null, carrier: null, trackingNumber: null, orderNumber: null, status: "shipped", arrivalStart: null, arrivalEnd: null, issue: null, deliveredAt: null, updatedAt: now.toISOString(), subjects: [], ...overrides };
}

test("the meter has four steps in order", () => {
  assert.deepEqual((["ordered", "shipped", "out_for_delivery", "delivered"] as const).map(stepIndex), [0, 1, 2, 3]);
});

test("arrival wording counts days from today", () => {
  const on = (day: string) => arrivalPhrase(pkg({ arrivalStart: day, arrivalEnd: day }), now);
  assert.equal(on("2026-09-15"), "arriving today");
  assert.equal(on("2026-09-16"), "arriving tomorrow");
  assert.equal(on("2026-09-17"), "arrives Thursday");
  assert.equal(on("2026-09-30"), "arrives Sep 30");
  assert.equal(on("2026-09-12"), "was due Sep 12");
  assert.equal(arrivalPhrase(pkg({ arrivalStart: "2026-09-16", arrivalEnd: "2026-09-18" }), now), "arriving Sep 16 to 18");
  assert.equal(arrivalPhrase(pkg({ arrivalStart: "2026-09-30", arrivalEnd: "2026-10-02" }), now), "arriving Sep 30 to Oct 2");
});

test("without a date the wording follows the status", () => {
  assert.equal(arrivalPhrase(pkg({ status: "ordered" }), now), "ordered");
  assert.equal(arrivalPhrase(pkg({ status: "shipped" }), now), "on its way");
  assert.equal(arrivalPhrase(pkg({ status: "out_for_delivery" }), now), "out for delivery today");
});

test("deliveries say when", () => {
  assert.equal(arrivalPhrase(pkg({ status: "delivered", deliveredAt: new Date(2026, 8, 15, 14, 14).toISOString() }), now), "delivered at 2:14 pm");
  assert.equal(arrivalPhrase(pkg({ status: "delivered", deliveredAt: new Date(2026, 8, 13, 9, 0).toISOString() }), now), "delivered Sunday");
});

test("the line leads with the store when there is one", () => {
  assert.equal(arrivalLine(pkg({ arrivalStart: "2026-09-15", arrivalEnd: "2026-09-15" }), now), "Amazon, arriving today");
  assert.equal(arrivalLine(pkg({ store: null }), now), "On its way");
});

test("packages group under Today, Tomorrow, a date, then No date yet", () => {
  const groups = groupByDay([
    pkg({ id: 1, status: "out_for_delivery" }),
    pkg({ id: 2, arrivalStart: "2026-09-18", arrivalEnd: "2026-09-18" }),
    pkg({ id: 3, arrivalStart: "2026-09-16", arrivalEnd: "2026-09-16" }),
    pkg({ id: 4 }),
    pkg({ id: 5, arrivalStart: "2026-09-10", arrivalEnd: "2026-09-10" }),
    pkg({ id: 6, status: "delivered", deliveredAt: now.toISOString() })
  ], now);
  assert.deepEqual(groups.map((group) => [group.heading, group.packages.map((entry) => entry.id)]), [
    ["Today", [1, 5, 6]],
    ["Tomorrow", [3]],
    ["Friday, Sep 18", [2]],
    ["No date yet", [4]]
  ]);
});

test("update times read naturally", () => {
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
  assert.equal(updatedAgo(ago(1), now), "Updated just now");
  assert.equal(updatedAgo(ago(20), now), "Updated 20 min ago");
  assert.equal(updatedAgo(ago(180), now), "Updated 3 h ago");
  assert.equal(updatedAgo(new Date(2026, 8, 14, 18, 0).toISOString(), now), "Updated yesterday");
  assert.equal(updatedAgo(new Date(2026, 8, 12, 18, 0).toISOString(), now), "Updated Sep 12");
});

test("tracking links go to the carrier, or the Amazon order", () => {
  assert.equal(trackingUrl({ carrier: "UPS", store: "Target", trackingNumber: "1Z 999", orderNumber: null }), "https://www.ups.com/track?tracknum=1Z999");
  assert.equal(trackingUrl({ carrier: "USPS", store: null, trackingNumber: "9400", orderNumber: null }), "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400");
  assert.equal(trackingUrl({ carrier: "FedEx", store: null, trackingNumber: "7777", orderNumber: null }), "https://www.fedex.com/fedextrack/?trknbr=7777");
  assert.equal(trackingUrl({ carrier: "Amazon", store: "Amazon", trackingNumber: "TBA1", orderNumber: "112-1" }), "https://www.amazon.com/gp/your-account/order-details?orderID=112-1");
  assert.equal(trackingUrl({ carrier: null, store: "Etsy", trackingNumber: null, orderNumber: "5" }), null);
});
