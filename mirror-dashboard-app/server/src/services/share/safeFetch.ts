import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const BROWSER_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

export class FetchBlockedError extends Error {}

export type Resolver = (host: string) => Promise<string[]>;

const systemResolver: Resolver = async (host) => (await lookup(host, { all: true })).map((entry) => entry.address);

/** True for anything that is not a public internet address, including the tailnet (100.64/10). */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127);
  }
  if (version === 6) {
    const value = address.toLowerCase();
    if (value === "::" || value === "::1") return true;
    if (value.startsWith("::ffff:")) return isPrivateAddress(value.slice(7));
    return /^(fc|fd|fe[89ab]|ff)/.test(value);
  }
  return true;
}

export async function assertPublicUrl(url: URL, resolve: Resolver = systemResolver): Promise<void> {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new FetchBlockedError("Only web links can be fetched.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : await resolve(host);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new FetchBlockedError("That link points inside the home network.");
}

export type SafeFetchResult = { url: string; status: number; contentType: string; body: Buffer };

async function readCapped(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new FetchBlockedError("That download was too large.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * fetch() for links other people's pages hand us: public hosts only, every
 * redirect re-checked, at most 3 redirects, a size cap and a timeout. This is
 * what stops a crafted link from making the Pi poke at devices in the house.
 */
export async function safeFetch(
  rawUrl: string,
  options: { timeoutMs: number; maxBytes: number; headers?: Record<string, string>; fetchImpl?: typeof fetch; resolve?: Resolver }
): Promise<SafeFetchResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  let url = new URL(rawUrl);
  try {
    for (let hop = 0; hop <= 3; hop += 1) {
      await assertPublicUrl(url, options.resolve);
      const response = await fetchImpl(url, { redirect: "manual", signal: controller.signal, headers: options.headers });
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        url = new URL(location, url);
        continue;
      }
      if (Number(response.headers.get("content-length") || 0) > options.maxBytes) throw new FetchBlockedError("That download was too large.");
      const body = await readCapped(response, options.maxBytes);
      return { url: url.toString(), status: response.status, contentType: response.headers.get("content-type") || "", body };
    }
    throw new FetchBlockedError("That link redirected too many times.");
  } finally {
    clearTimeout(timer);
  }
}
