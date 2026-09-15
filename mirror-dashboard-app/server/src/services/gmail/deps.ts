import { clearAccount, getAccount, markNeedsReconnect, saveAccount } from "./account.js";
import { createGmailClient } from "./client.js";
import { credentials, exchangeCode, GmailAuthError, PendingSignIns, refreshAccessToken } from "./oauth.js";
import type { GmailRouteDeps } from "./routes.js";
import { createTokenSource } from "./tokens.js";

/** One token source for the whole server, so the access token is shared and renewed in one place. */
export const gmailTokens = createTokenSource({
  getAccount,
  refresh: async (refreshToken) => {
    const creds = credentials();
    if (!creds) throw new GmailAuthError("GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET are not set.");
    return refreshAccessToken(creds, refreshToken);
  },
  markNeedsReconnect
});

export const gmail = createGmailClient(gmailTokens);

export function createGmailRouteDeps(onConnected: () => void): GmailRouteDeps {
  return {
    credentials,
    pending: new PendingSignIns(),
    exchange: (creds, code, codeVerifier, redirectUri) => exchangeCode(creds, code, codeVerifier, redirectUri),
    // The new sign-in's own token, before it is stored.
    profileEmail: (accessToken) => createGmailClient({ accessToken: async () => accessToken }).getProfileEmail(),
    saveAccount: (email, refreshToken) => saveAccount(email, refreshToken),
    clearAccount,
    onConnected: () => {
      gmailTokens.forget();
      onConnected();
    }
  };
}
