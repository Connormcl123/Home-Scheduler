import type { GmailAccount } from "./account.js";
import { GmailAuthError, type TokenResponse } from "./oauth.js";

export type TokenSource = {
  /** A usable access token; `forceRefresh` skips the cached one (after a 401). */
  accessToken(forceRefresh?: boolean): Promise<string>;
  /** Drop the cached token, e.g. after a new sign-in. */
  forget(): void;
};

export const REVOKED_MESSAGE = "Google no longer accepts the Pi's sign-in. Sign in again: see docs/gmail-setup.md.";

/** Keeps the short-lived access token in memory and renews it a minute before it expires. */
export function createTokenSource(deps: {
  getAccount: () => Promise<GmailAccount | null>;
  refresh: (refreshToken: string) => Promise<TokenResponse>;
  markNeedsReconnect: (error: string) => Promise<void>;
  now?: () => number;
}): TokenSource {
  const now = deps.now ?? Date.now;
  let cached: { token: string; expiresAt: number } | null = null;
  return {
    async accessToken(forceRefresh = false) {
      if (!forceRefresh && cached && cached.expiresAt - 60_000 > now()) return cached.token;
      const account = await deps.getAccount();
      if (!account || account.status !== "connected") throw new GmailAuthError("Gmail is not connected.");
      try {
        const fresh = await deps.refresh(account.refreshToken);
        cached = { token: fresh.accessToken, expiresAt: fresh.expiresAt };
        return fresh.accessToken;
      } catch (error) {
        cached = null;
        // Stop checking until someone signs in again; no retry loop.
        if (error instanceof GmailAuthError && error.revoked) await deps.markNeedsReconnect(REVOKED_MESSAGE);
        throw error;
      }
    },
    forget() {
      cached = null;
    }
  };
}
