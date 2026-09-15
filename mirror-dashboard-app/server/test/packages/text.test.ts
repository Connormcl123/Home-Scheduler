import { test } from "node:test";
import assert from "node:assert/strict";
import type { PackageView } from "@mirror-dashboard/shared";
import { describePackages } from "../../src/services/packages/text.js";

function pkg(overrides: Partial<PackageView> = {}): PackageView {
  return { id: 1, store: "Amazon", item: "Kids' sneakers", imageUrl: null, carrier: null, trackingNumber: null, orderNumber: null, status: "shipped", arrivalStart: "2026-09-15", arrivalEnd: "2026-09-15", issue: null, deliveredAt: null, updatedAt: "2026-09-15T12:00:00.000Z", subjects: [], ...overrides };
}

test("the headline model hears what is coming and when", () => {
  assert.equal(describePackages([], "2026-09-15"), "Packages: none on the way.");
  assert.equal(
    describePackages([
      pkg(),
      pkg({ id: 2, store: null, item: "Printer ink", status: "ordered", arrivalStart: "2026-09-18" }),
      pkg({ id: 3, status: "delivered", arrivalStart: null }),
      pkg({ id: 4, item: "Lamp", status: "out_for_delivery", arrivalStart: null, issue: "Delivery attempted" })
    ], "2026-09-15"),
    [
      "Packages:",
      "- Kids' sneakers from Amazon: on its way, arriving today",
      "- Printer ink: ordered, arriving 2026-09-18",
      "- Kids' sneakers from Amazon: delivered today",
      "- Lamp from Amazon: out for delivery (Delivery attempted)"
    ].join("\n")
  );
});
