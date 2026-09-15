import { test } from "node:test";
import assert from "node:assert/strict";
import { codeChallenge, consentUrl, exchangeCode, GMAIL_SCOPE, GmailAuthError, isLoopback, PendingSignIns, refreshAccessToken, TOKEN_URL } from "../../src/services/gmail/oauth.js";

const creds = { clientId: "client-1", clientSecret: "secret-1" };

function tokenFetch(status: number, body: unknown) {
  const seen: Array<{ url: string; body: URLSearchParams }> = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), body: new URLSearchParams(String(init?.body ?? "")) });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { impl, seen };
}

test("the PKCE challenge matches the RFC 7636 example", () => {
  assert.equal(codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("the consent link asks for read-only Gmail, offline access, a state and a PKCE challenge", () => {
  const url = new URL(consentUrl(creds, "http://localhost:4175/gmail/callback", "state-1", "verifier-1"));
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(GMAIL_SCOPE, "https://www.googleapis.com/auth/gmail.readonly");
  const params = url.searchParams;
  assert.equal(params.get("scope"), GMAIL_SCOPE);
  assert.equal(params.get("access_type"), "offline");
  assert.equal(params.get("prompt"), "consent");
  assert.equal(params.get("state"), "state-1");
  assert.equal(params.get("code_challenge"), codeChallenge("verifier-1"));
  assert.equal(params.get("code_challenge_method"), "S256");
  assert.equal(params.get("redirect_uri"), "http://localhost:4175/gmail/callback");
  assert.equal(params.get("client_id"), "client-1");
  assert.equal(params.get("response_type"), "code");
});

test("a sign-in state works once and expires after 10 minutes", () => {
  let clock = 1_000_000;
  const pending = new PendingSignIns(() => clock);
  const first = pending.start("http://localhost:4175/gmail/callback");
  assert.equal(pending.take(first.state)?.codeVerifier, first.codeVerifier);
  assert.equal(pending.take(first.state), null, "used once");
  const second = pending.start("http://localhost:4175/gmail/callback");
  clock += 10 * 60 * 1000 + 1;
  assert.equal(pending.take(second.state), null, "expired");
  assert.equal(pending.take("made-up"), null);
});

test("only the Pi itself and the SSH tunnel count as loopback", () => {
  for (const address of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) assert.equal(isLoopback(address), true, address);
  for (const address of ["192.168.1.20", "100.81.206.5", "::ffff:192.168.1.20", undefined]) assert.equal(isLoopback(address), false, String(address));
});

test("exchanging a code sends the verifier and returns the tokens", async () => {
  const { impl, seen } = tokenFetch(200, { access_token: "access-1", expires_in: 3599, refresh_token: "refresh-1" });
  const tokens = await exchangeCode(creds, "code-1", "verifier-1", "http://localhost:4175/gmail/callback", impl, () => 1_000);
  assert.deepEqual(tokens, { accessToken: "access-1", expiresAt: 1_000 + 3_599_000, refreshToken: "refresh-1" });
  assert.equal(seen[0].url, TOKEN_URL);
  assert.equal(seen[0].body.get("grant_type"), "authorization_code");
  assert.equal(seen[0].body.get("code_verifier"), "verifier-1");
  assert.equal(seen[0].body.get("client_secret"), "secret-1");
});

test("a refused refresh token is reported as revoked", async () => {
  const { impl, seen } = tokenFetch(400, { error: "invalid_grant" });
  await assert.rejects(refreshAccessToken(creds, "refresh-1", impl), (error: unknown) => error instanceof GmailAuthError && error.revoked === true);
  assert.equal(seen[0].body.get("grant_type"), "refresh_token");
});

test("other token failures are not treated as revoked", async () => {
  const { impl } = tokenFetch(500, {});
  await assert.rejects(refreshAccessToken(creds, "refresh-1", impl), (error: unknown) => error instanceof GmailAuthError && error.revoked === false);
});
