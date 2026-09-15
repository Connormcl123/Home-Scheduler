import type { TokenSource } from "./tokens.js";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export type GmailPart = {
  mimeType?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
};

export type RawGmailMessage = { id: string; internalDate?: string; payload?: GmailPart };

export class GmailApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export type GmailClient = {
  /** Ids of messages matching a Gmail search, in Gmail's order (newest first). */
  searchMessages(query: string, max: number): Promise<string[]>;
  getMessage(id: string): Promise<RawGmailMessage>;
  getProfileEmail(): Promise<string>;
};

/** Read-only Gmail REST calls. Knows nothing about packages, so other features can use it. */
export function createGmailClient(tokens: Pick<TokenSource, "accessToken">, fetchImpl: typeof fetch = fetch): GmailClient {
  async function call<T>(pathAndQuery: string): Promise<T> {
    // A 401 means the access token went stale early: refresh once and retry.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = await tokens.accessToken(attempt > 0);
      let response: Response;
      try {
        response = await fetchImpl(`${BASE}${pathAndQuery}`, {
          headers: { authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(15_000)
        });
      } catch (error) {
        throw new GmailApiError(`Gmail could not be reached: ${error instanceof Error ? error.message : String(error)}`, 0);
      }
      if (response.status === 401 && attempt === 0) continue;
      if (!response.ok) throw new GmailApiError(`Gmail answered ${response.status}.`, response.status);
      return (await response.json()) as T;
    }
    throw new GmailApiError("Gmail refused the access token.", 401);
  }

  return {
    async searchMessages(query, max) {
      const params = new URLSearchParams({ q: query, maxResults: String(max) });
      const data = await call<{ messages?: Array<{ id: string }> }>(`/messages?${params}`);
      return (data.messages ?? []).map((message) => message.id);
    },
    getMessage(id) {
      return call<RawGmailMessage>(`/messages/${encodeURIComponent(id)}?format=full`);
    },
    async getProfileEmail() {
      const data = await call<{ emailAddress?: string }>("/profile");
      return data.emailAddress ?? "";
    }
  };
}
