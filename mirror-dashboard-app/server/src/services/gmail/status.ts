import type { ApiIntegrationStatusItem, GmailConnection } from "@mirror-dashboard/shared";

/** The Gmail row on the Settings status board. */
export function gmailStatusItem(connection: GmailConnection): ApiIntegrationStatusItem {
  const base = { key: "gmail", label: "Gmail package tracking" };
  if (connection.status === "connected") {
    return {
      ...base,
      configured: true,
      mode: "live",
      detail: `Reading shipping emails for ${connection.email}.${connection.lastError ? ` Last problem: ${connection.lastError}` : ""}`
    };
  }
  if (connection.status === "needs_reconnect") {
    return {
      ...base,
      configured: true,
      mode: "partial",
      detail: `Google stopped accepting the sign-in for ${connection.email}. Packages show what they last knew.`,
      nextStep: "Sign in again: see docs/gmail-setup.md."
    };
  }
  if (connection.configured) {
    return {
      ...base,
      configured: true,
      mode: "partial",
      detail: "Google credentials are set, but no Gmail account is connected.",
      nextStep: "Sign in through the SSH tunnel: see docs/gmail-setup.md."
    };
  }
  return {
    ...base,
    configured: false,
    mode: "missing",
    detail: "Packages stay hidden until Gmail is set up.",
    nextStep: "Add GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET: see docs/gmail-setup.md."
  };
}
