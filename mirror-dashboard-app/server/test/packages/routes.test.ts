import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import type { PackagesResponse } from "@mirror-dashboard/shared";
import { createPackagesRouter, type PackagesRouteDeps } from "../../src/services/packages/routes.js";

const empty: PackagesResponse = {
  gmail: { configured: true, status: "connected", email: "family@example.com", lastCheckedAt: null, lastError: null },
  active: [],
  delivered: []
};

async function serve(overrides: Partial<PackagesRouteDeps> = {}) {
  const calls = { events: [] as Array<number | undefined>, checks: 0, hidden: [] as number[] };
  const deps: PackagesRouteDeps = {
    list: async () => empty,
    events: async (after) => { calls.events.push(after); return { lastId: 7, events: [] }; },
    checkNow: async () => { calls.checks += 1; },
    hide: async (id) => { calls.hidden.push(id); return id === 5; },
    ...overrides
  };
  const app = express();
  app.use(express.json());
  app.use("/api/packages", createPackagesRouter(deps));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/packages`;
  return { base, calls, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

test("lists packages and events", async () => {
  const app = await serve();
  try {
    assert.deepEqual(await (await fetch(app.base)).json(), empty);
    await fetch(`${app.base}/events`);
    await fetch(`${app.base}/events?after=0`);
    await fetch(`${app.base}/events?after=3`);
    await fetch(`${app.base}/events?after=abc`);
    assert.deepEqual(app.calls.events, [undefined, 0, 3, undefined]);
  } finally {
    await app.close();
  }
});

test("check now runs a check and returns the list, even when the check fails", async () => {
  const app = await serve();
  try {
    const response = await fetch(`${app.base}/check`, { method: "POST" });
    assert.equal(response.status, 200);
    assert.equal(app.calls.checks, 1);
  } finally {
    await app.close();
  }
  const failing = await serve({ checkNow: async () => { throw new Error("database locked"); } });
  try {
    assert.equal((await fetch(`${failing.base}/check`, { method: "POST" })).status, 200);
  } finally {
    await failing.close();
  }
});

test("hiding a package returns the list, or 404 when it is gone", async () => {
  const app = await serve();
  try {
    assert.equal((await fetch(`${app.base}/5/hide`, { method: "POST" })).status, 200);
    assert.equal((await fetch(`${app.base}/6/hide`, { method: "POST" })).status, 404);
    assert.equal((await fetch(`${app.base}/abc/hide`, { method: "POST" })).status, 404);
    assert.deepEqual(app.calls.hidden, [5, 6]);
  } finally {
    await app.close();
  }
});
