import { test } from "node:test";
import assert from "node:assert/strict";
import { SHIPPING_FILTER, shippingQuery } from "../../src/services/packages/query.js";

test("the first check looks back 14 days", () => {
  assert.equal(shippingQuery(null), `newer_than:14d ${SHIPPING_FILTER}`);
  assert.equal(shippingQuery("not a date"), `newer_than:14d ${SHIPPING_FILTER}`);
});

test("later checks overlap the last one by an hour", () => {
  const seconds = Date.parse("2026-09-15T12:00:00.000Z") / 1000 - 3600;
  assert.equal(shippingQuery("2026-09-15T12:00:00.000Z"), `after:${seconds} ${SHIPPING_FILTER}`);
});

test("the filter skips spam and trash and names shipping words and senders", () => {
  for (const part of ["-in:spam", "-in:trash", "subject:(shipped", '"out for delivery"', '"order confirmed"', "from:(amazon.com", "ups.com", "fedex.com", "usps.com", "target.com", "walmart.com"]) {
    assert.ok(SHIPPING_FILTER.includes(part), part);
  }
});
