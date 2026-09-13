import { test } from "node:test";
import assert from "node:assert/strict";
import { FetchBlockedError, assertPublicUrl, isPrivateAddress, safeFetch } from "../../src/services/share/safeFetch.js";

const publicDns = async () => ["93.184.216.34"];

test("recognises private, loopback, tailnet and link-local addresses", () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "172.16.0.9", "172.31.255.1", "192.168.1.185", "100.81.206.101", "169.254.1.1", "0.0.0.0", "224.0.0.1", "::1", "fd7a:115c:a1e0::1", "fe80::1", "::ffff:192.168.1.1"]) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  for (const address of ["93.184.216.34", "172.32.0.1", "100.128.0.1", "2606:4700::1111"]) {
    assert.equal(isPrivateAddress(address), false, address);
  }
});

test("refuses hosts that resolve inside the home network", async () => {
  await assert.rejects(assertPublicUrl(new URL("https://sneaky.example"), async () => ["192.168.1.1"]), FetchBlockedError);
  await assert.rejects(assertPublicUrl(new URL("http://127.0.0.1:4174/api/tasks")), FetchBlockedError);
  await assert.rejects(assertPublicUrl(new URL("file:///etc/passwd")), FetchBlockedError);
  await assertPublicUrl(new URL("https://example.com"), publicDns);
});

test("returns the body of a public page", async () => {
  const fetchImpl = (async () => new Response("<html>ok</html>", { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch;
  const result = await safeFetch("https://example.com/recipe", { timeoutMs: 1000, maxBytes: 1000, fetchImpl, resolve: publicDns });
  assert.equal(result.status, 200);
  assert.equal(result.contentType, "text/html");
  assert.equal(result.body.toString("utf8"), "<html>ok</html>");
});

test("re-checks redirects and refuses one that points inside the house", async () => {
  const fetchImpl = (async () => new Response(null, { status: 302, headers: { location: "http://192.168.1.1/admin" } })) as typeof fetch;
  const resolve = async (host: string) => (host === "192.168.1.1" ? ["192.168.1.1"] : ["93.184.216.34"]);
  await assert.rejects(safeFetch("https://example.com/r", { timeoutMs: 1000, maxBytes: 1000, fetchImpl, resolve }), FetchBlockedError);
});

test("gives up after three redirects", async () => {
  const fetchImpl = (async () => new Response(null, { status: 301, headers: { location: "https://example.com/again" } })) as typeof fetch;
  await assert.rejects(safeFetch("https://example.com/loop", { timeoutMs: 1000, maxBytes: 1000, fetchImpl, resolve: publicDns }), FetchBlockedError);
});

test("stops reading once the size cap is passed", async () => {
  const fetchImpl = (async () => new Response("x".repeat(5000), { status: 200 })) as typeof fetch;
  await assert.rejects(safeFetch("https://example.com/big", { timeoutMs: 1000, maxBytes: 100, fetchImpl, resolve: publicDns }), FetchBlockedError);
});
