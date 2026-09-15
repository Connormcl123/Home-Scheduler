import { test } from "node:test";
import assert from "node:assert/strict";
import { gmailStatusItem } from "../../src/services/gmail/status.js";

const base = { configured: true, email: "family@example.com", lastCheckedAt: null, lastError: null };

test("the status row follows the connection", () => {
  assert.equal(gmailStatusItem({ ...base, status: "connected" }).mode, "live");
  const reconnect = gmailStatusItem({ ...base, status: "needs_reconnect" });
  assert.equal(reconnect.mode, "partial");
  assert.match(reconnect.nextStep ?? "", /docs\/gmail-setup\.md/);
  assert.equal(gmailStatusItem({ ...base, email: null, status: "not_connected" }).mode, "partial");
  const missing = gmailStatusItem({ ...base, configured: false, email: null, status: "not_connected" });
  assert.equal(missing.mode, "missing");
  assert.equal(missing.configured, false);
  assert.match(missing.nextStep ?? "", /GMAIL_CLIENT_ID/);
  assert.equal(missing.key, "gmail");
});
