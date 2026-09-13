const TRACKING_PARAMS = new Set(["stkn", "igsh", "igshid", "fbclid", "gclid", "si", "mc_cid", "mc_eid"]);

/**
 * The canonical form of a shared link: https, lower-case host, no tracking
 * parameters, no fragment, no trailing slash. The same page shared twice must
 * tidy to the same string, because that string is how duplicates are found.
 * Returns null for anything that is not an http(s) link.
 */
export function tidyUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.protocol = "https:";
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  const text = url.toString();
  return url.pathname === "/" && !url.search ? text.replace(/\/$/, "") : text;
}

export type InstagramPost = { kind: "p" | "reel" | "tv"; code: string };

export function instagramPost(url: string): InstagramPost | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/^(www\.)?instagram\.com$/i.test(parsed.hostname)) return null;
  const match = parsed.pathname.match(/^\/(p|reels?|tv)\/([A-Za-z0-9_-]+)/);
  if (!match) return null;
  const kind = match[1] === "reels" ? "reel" : (match[1] as InstagramPost["kind"]);
  return { kind, code: match[2] };
}

/** Instagram's public embed page: the one websites use to embed a post. It carries the full caption without a login. */
export function instagramEmbedUrl(post: InstagramPost): string {
  return `https://www.instagram.com/${post.kind}/${post.code}/embed/captioned/`;
}
