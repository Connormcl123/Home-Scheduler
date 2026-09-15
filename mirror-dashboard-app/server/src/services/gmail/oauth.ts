import { createHash, randomBytes } from "node:crypto";
import { config } from "../../config.js";

/** Read-only: the Pi can search and read mail, never send, change or delete it. */
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";
const PENDING_MS = 10 * 60 * 1000;

export class GmailAuthError extends Error {
  /** True when Google no longer accepts the stored sign-in (invalid_grant). */
  constructor(message: string, readonly revoked = false) {
    super(message);
  }
}

export type Credentials = { clientId: string; clientSecret: string };

export function credentials(): Credentials | null {
  return config.gmail.clientId && config.gmail.clientSecret
    ? { clientId: config.gmail.clientId, clientSecret: config.gmail.clientSecret }
    : null;
}

/** True for the Pi itself and the SSH tunnel; false for anyone else on the LAN or tailnet. */
export function isLoopback(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

type Pending = { codeVerifier: string; redirectUri: string; expiresAt: number };

/** Sign-ins started but not finished, kept in memory for 10 minutes. */
export class PendingSignIns {
  private entries = new Map<string, Pending>();

  constructor(private now: () => number = Date.now) {}

  start(redirectUri: string): { state: string; codeVerifier: string } {
    this.prune();
    const state = randomBytes(24).toString("base64url");
    const codeVerifier = randomBytes(48).toString("base64url");
    this.entries.set(state, { codeVerifier, redirectUri, expiresAt: this.now() + PENDING_MS });
    return { state, codeVerifier };
  }

  /** One use only: a state is gone once taken, and an expired one never comes back. */
  take(state: string): Pending | null {
    this.prune();
    const entry = this.entries.get(state) ?? null;
    this.entries.delete(state);
    return entry;
  }

  private prune() {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}

export function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function consentUrl(creds: Credentials, redirectUri: string, state: string, codeVerifier: string): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    // Always show consent so Google always returns a refresh token.
    prompt: "consent",
    state,
    code_challenge: codeChallenge(codeVerifier),
    code_challenge_method: "S256"
  }).toString();
  return url.toString();
}

export type TokenResponse = { accessToken: string; expiresAt: number; refreshToken: string | null };

async function postToken(body: Record<string, string>, fetchImpl: typeof fetch, now: () => number): Promise<TokenResponse> {
  let response: Response;
  try {
    response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(15_000)
    });
  } catch (error) {
    throw new GmailAuthError(`Google could not be reached: ${error instanceof Error ? error.message : String(error)}`);
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const code = typeof data.error === "string" ? data.error : `HTTP ${response.status}`;
    throw new GmailAuthError(`Google refused the sign-in: ${code}`, code === "invalid_grant");
  }
  if (typeof data.access_token !== "string") throw new GmailAuthError("Google sent no access token.");
  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
  return {
    accessToken: data.access_token,
    expiresAt: now() + expiresIn * 1000,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null
  };
}

export function exchangeCode(
  creds: Credentials,
  code: string,
  codeVerifier: string,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now
): Promise<TokenResponse> {
  return postToken(
    { client_id: creds.clientId, client_secret: creds.clientSecret, code, code_verifier: codeVerifier, redirect_uri: redirectUri, grant_type: "authorization_code" },
    fetchImpl,
    now
  );
}

export function refreshAccessToken(
  creds: Credentials,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now
): Promise<TokenResponse> {
  return postToken(
    { client_id: creds.clientId, client_secret: creds.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" },
    fetchImpl,
    now
  );
}
