import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { PendingSignIns } from "../../src/services/gmail/oauth.js";
import { createGmailRouter, type GmailRouteDeps } from "../../src/services/gmail/routes.js";

async function serve(overrides: Partial<GmailRouteDeps> = {}) {
  const saved: Array<[string, string]> = [];
  let connected = 0;
  let cleared = 0;
  const deps: GmailRouteDeps = {
    credentials: () => ({ clientId: "client-1", clientSecret: "secret-1" }),
    pending: new PendingSignIns(),
    exchange: async (_creds, code) => ({ accessToken: `access-for-${code}`, expiresAt: Date.now() + 3_600_000, refreshToken: "refresh-1" }),
    profileEmail: async () => "family@example.com",
    saveAccount: async (email, refreshToken) => { saved.push([email, refreshToken]); },
    clearAccount: async () => { cleared += 1; },
    onConnected: () => { connected += 1; },
    ...overrides
  };
  const app = express();
  app.use("/gmail", createGmailRouter(deps));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    base,
    saved,
    connected: () => connected,
    cleared: () => cleared,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
}

async function startSignIn(base: string) {
  const response = await fetch(`${base}/gmail/connect`, { redirect: "manual" });
  assert.equal(response.status, 302);
  return new URL(response.headers.get("location") ?? "");
}

test("connect sends the browser to Google's read-only consent page, returning to this host", async () => {
  const app = await serve();
  try {
    const google = await startSignIn(app.base);
    assert.equal(google.hostname, "accounts.google.com");
    assert.equal(google.searchParams.get("scope"), "https://www.googleapis.com/auth/gmail.readonly");
    assert.equal(google.searchParams.get("redirect_uri"), `${app.base}/gmail/callback`);
    assert.ok(google.searchParams.get("state"));
  } finally {
    await app.close();
  }
});

test("the callback saves the account once, and a used link is refused", async () => {
  const app = await serve();
  try {
    const state = (await startSignIn(app.base)).searchParams.get("state");
    const done = await fetch(`${app.base}/gmail/callback?state=${state}&code=abc`);
    assert.equal(done.status, 200);
    assert.match(await done.text(), /Connected as family@example\.com/);
    assert.deepEqual(app.saved, [["family@example.com", "refresh-1"]]);
    assert.equal(app.connected(), 1);
    const again = await fetch(`${app.base}/gmail/callback?state=${state}&code=abc`);
    assert.equal(again.status, 400);
    assert.equal(app.saved.length, 1);
  } finally {
    await app.close();
  }
});

test("missing credentials, a cancelled sign-in and a missing refresh token are explained", async () => {
  const noCreds = await serve({ credentials: () => null });
  try {
    const response = await fetch(`${noCreds.base}/gmail/connect`, { redirect: "manual" });
    assert.equal(response.status, 503);
    assert.match(await response.text(), /GMAIL_CLIENT_ID/);
  } finally {
    await noCreds.close();
  }
  const app = await serve({ exchange: async () => ({ accessToken: "a", expiresAt: 0, refreshToken: null }) });
  try {
    assert.equal((await fetch(`${app.base}/gmail/callback?error=access_denied`)).status, 400);
    const state = (await startSignIn(app.base)).searchParams.get("state");
    const response = await fetch(`${app.base}/gmail/callback?state=${state}&code=abc`);
    assert.equal(response.status, 502);
    assert.equal(app.saved.length, 0);
  } finally {
    await app.close();
  }
});

test("disconnect clears the account", async () => {
  const app = await serve();
  try {
    const response = await fetch(`${app.base}/gmail/disconnect`, { method: "POST" });
    assert.equal(response.status, 200);
    assert.equal(app.cleared(), 1);
  } finally {
    await app.close();
  }
});
