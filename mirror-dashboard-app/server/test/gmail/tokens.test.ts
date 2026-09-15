import { test } from "node:test";
import assert from "node:assert/strict";
import type { GmailAccount } from "../../src/services/gmail/account.js";
import { GmailAuthError } from "../../src/services/gmail/oauth.js";
import { createTokenSource, REVOKED_MESSAGE } from "../../src/services/gmail/tokens.js";

const account: GmailAccount = { email: "family@example.com", refreshToken: "refresh-1", status: "connected", lastCheckedAt: null, lastError: null };

function source(options: { account?: GmailAccount | null; fail?: Error } = {}) {
  let clock = 0;
  let refreshes = 0;
  const marked: string[] = [];
  const tokens = createTokenSource({
    getAccount: async () => (options.account === undefined ? account : options.account),
    refresh: async () => {
      refreshes += 1;
      if (options.fail) throw options.fail;
      return { accessToken: `access-${refreshes}`, expiresAt: clock + 3_600_000, refreshToken: null };
    },
    markNeedsReconnect: async (error) => { marked.push(error); },
    now: () => clock
  });
  return { tokens, marked, refreshes: () => refreshes, advance: (ms: number) => { clock += ms; } };
}

test("the access token is reused until a minute before it expires", async () => {
  const s = source();
  assert.equal(await s.tokens.accessToken(), "access-1");
  s.advance(3_600_000 - 61_000);
  assert.equal(await s.tokens.accessToken(), "access-1");
  s.advance(2_000);
  assert.equal(await s.tokens.accessToken(), "access-2");
});

test("forcing and forgetting both fetch a new token", async () => {
  const s = source();
  await s.tokens.accessToken();
  assert.equal(await s.tokens.accessToken(true), "access-2");
  s.tokens.forget();
  assert.equal(await s.tokens.accessToken(), "access-3");
});

test("no connected account is an error, without asking Google", async () => {
  for (const entry of [null, { ...account, status: "needs_reconnect" as const }]) {
    const s = source({ account: entry });
    await assert.rejects(s.tokens.accessToken(), GmailAuthError);
    assert.equal(s.refreshes(), 0);
  }
});

test("a revoked sign-in marks the account for reconnecting; other failures do not", async () => {
  const revoked = source({ fail: new GmailAuthError("Google refused the sign-in: invalid_grant", true) });
  await assert.rejects(revoked.tokens.accessToken());
  assert.deepEqual(revoked.marked, [REVOKED_MESSAGE]);
  const offline = source({ fail: new GmailAuthError("Google could not be reached: timeout") });
  await assert.rejects(offline.tokens.accessToken());
  assert.deepEqual(offline.marked, []);
});
