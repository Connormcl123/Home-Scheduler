import express from "express";
import { consentUrl, isLoopback, type Credentials, type PendingSignIns, type TokenResponse } from "./oauth.js";

export type GmailRouteDeps = {
  credentials: () => Credentials | null;
  pending: PendingSignIns;
  exchange: (creds: Credentials, code: string, codeVerifier: string, redirectUri: string) => Promise<TokenResponse>;
  profileEmail: (accessToken: string) => Promise<string>;
  saveAccount: (email: string, refreshToken: string) => Promise<void>;
  clearAccount: () => Promise<void>;
  /** Runs after a sign-in is saved, e.g. to drop a cached token and check mail. */
  onConnected: () => void;
};

// Google only returns desktop-app sign-ins to a loopback address.
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/i;

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function page(res: express.Response, status: number, message: string) {
  res
    .status(status)
    .type("html")
    .send(`<!doctype html><meta charset="utf-8"><title>Home Scheduler: Gmail</title><body style="font:20px system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem"><p>${escapeHtml(message)}</p></body>`);
}

/** The one-time sign-in pages, reached from a PC through `ssh -L 4175:localhost:4174`. */
export function createGmailRouter(deps: GmailRouteDeps): express.Router {
  const router = express.Router();

  // The Pi itself and the SSH tunnel arrive from loopback; anyone else on the LAN or tailnet does not.
  router.use((req, res, next) => {
    if (isLoopback(req.socket.remoteAddress)) return next();
    page(res, 403, "Open this through the SSH tunnel; see docs/gmail-setup.md.");
  });

  router.get("/connect", (req, res) => {
    const creds = deps.credentials();
    if (!creds) {
      return page(res, 503, "Add GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET to the Pi's .env, restart the dashboard, then open this page again. See docs/gmail-setup.md.");
    }
    const host = req.get("host") ?? "";
    if (!LOOPBACK_HOST.test(host)) {
      return page(res, 400, "Open this as http://localhost:4175/gmail/connect through the SSH tunnel; see docs/gmail-setup.md.");
    }
    const redirectUri = `http://${host}/gmail/callback`;
    const { state, codeVerifier } = deps.pending.start(redirectUri);
    res.redirect(consentUrl(creds, redirectUri, state, codeVerifier));
  });

  router.get("/callback", async (req, res) => {
    if (typeof req.query.error === "string") return page(res, 400, "Google sign-in was cancelled. Open /gmail/connect to try again.");
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const pending = state ? deps.pending.take(state) : null;
    if (!pending || !code) return page(res, 400, "That sign-in link has expired or was already used. Open /gmail/connect to start again.");
    const creds = deps.credentials();
    if (!creds) return page(res, 503, "GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET are missing on the Pi.");
    try {
      const tokens = await deps.exchange(creds, code, pending.codeVerifier, pending.redirectUri);
      if (!tokens.refreshToken) {
        return page(res, 502, "Google did not send a long-lived key. Remove Home Scheduler at myaccount.google.com/permissions, then open /gmail/connect again.");
      }
      const email = await deps.profileEmail(tokens.accessToken);
      await deps.saveAccount(email, tokens.refreshToken);
      deps.onConnected();
      page(res, 200, `Connected as ${email}. You can close this tab and the SSH session.`);
    } catch (error) {
      page(res, 502, `Sign-in failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  router.post("/disconnect", async (_req, res) => {
    await deps.clearAccount();
    page(res, 200, "Gmail disconnected. Packages keep what they last knew.");
  });

  return router;
}
