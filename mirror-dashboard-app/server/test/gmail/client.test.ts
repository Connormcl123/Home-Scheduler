import { test } from "node:test";
import assert from "node:assert/strict";
import { createGmailClient, GmailApiError } from "../../src/services/gmail/client.js";

function fakeFetch(responses: Array<{ status: number; body: unknown }>) {
  const seen: Array<{ url: string; auth: string | null }> = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), auth: new Headers(init?.headers).get("authorization") });
    const next = responses.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { impl, seen };
}

function tokens() {
  const forced: boolean[] = [];
  return { forced, source: { accessToken: async (force = false) => { forced.push(force); return force ? "fresh" : "cached"; } } };
}

test("search sends the query and returns message ids in Gmail's order", async () => {
  const { impl, seen } = fakeFetch([{ status: 200, body: { messages: [{ id: "m2" }, { id: "m1" }] } }]);
  const client = createGmailClient(tokens().source, impl);
  assert.deepEqual(await client.searchMessages("newer_than:14d subject:shipped", 50), ["m2", "m1"]);
  const url = new URL(seen[0].url);
  assert.equal(url.origin + url.pathname, "https://gmail.googleapis.com/gmail/v1/users/me/messages");
  assert.equal(url.searchParams.get("q"), "newer_than:14d subject:shipped");
  assert.equal(url.searchParams.get("maxResults"), "50");
  assert.equal(seen[0].auth, "Bearer cached");
});

test("an empty search returns no ids", async () => {
  const { impl } = fakeFetch([{ status: 200, body: { resultSizeEstimate: 0 } }]);
  assert.deepEqual(await createGmailClient(tokens().source, impl).searchMessages("x", 5), []);
});

test("a 401 refreshes the token once and retries", async () => {
  const { impl, seen } = fakeFetch([{ status: 401, body: {} }, { status: 200, body: { id: "m1" } }]);
  const t = tokens();
  const message = await createGmailClient(t.source, impl).getMessage("m1");
  assert.equal(message.id, "m1");
  assert.deepEqual(t.forced, [false, true]);
  assert.equal(seen[1].auth, "Bearer fresh");
  assert.ok(seen[1].url.endsWith("/users/me/messages/m1?format=full"));
});

test("other failures raise GmailApiError with the status", async () => {
  const { impl } = fakeFetch([{ status: 503, body: {} }]);
  await assert.rejects(createGmailClient(tokens().source, impl).getMessage("m1"), (error: unknown) => error instanceof GmailApiError && error.status === 503);
});

test("the profile gives the connected address", async () => {
  const { impl, seen } = fakeFetch([{ status: 200, body: { emailAddress: "family@example.com" } }]);
  assert.equal(await createGmailClient(tokens().source, impl).getProfileEmail(), "family@example.com");
  assert.ok(seen[0].url.endsWith("/users/me/profile"));
});
