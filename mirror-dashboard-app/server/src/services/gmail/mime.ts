import { readableText } from "../share/html.js";
import type { GmailPart, RawGmailMessage } from "./client.js";

export type ReadableEmail = {
  id: string;
  from: string;
  subject: string;
  receivedAt: string;
  text: string;
  imageUrls: string[];
};

/** Shorter plain parts are usually "view this email in your browser" stubs. */
export const MIN_PLAIN_TEXT = 200;

export function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function headerValue(part: GmailPart | undefined, name: string): string {
  return part?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** The first body of this type, depth first (multipart/alternative lists plain before HTML). */
function findBody(part: GmailPart | undefined, mimeType: string): string | null {
  if (!part) return null;
  if (part.mimeType?.toLowerCase() === mimeType && part.body?.data) return decodeBase64Url(part.body.data);
  for (const child of part.parts ?? []) {
    const found = findBody(child, mimeType);
    if (found !== null) return found;
  }
  return null;
}

/** https pictures in the email, in order, without tracking pixels or repeats. */
export function imageUrlsFrom(html: string, max = 30): string[] {
  const urls: string[] = [];
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const src = /\ssrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.replace(/&amp;/g, "&");
    if (!src || !src.startsWith("https://")) continue;
    if (/\s(width|height)\s*=\s*["']?1(px)?["'\s>]/i.test(tag)) continue;
    if (!urls.includes(src)) urls.push(src);
    if (urls.length >= max) break;
  }
  return urls;
}

export function parseGmailMessage(message: RawGmailMessage, maxChars = 12_000): ReadableEmail {
  const plain = findBody(message.payload, "text/plain")?.trim() ?? "";
  const html = findBody(message.payload, "text/html");
  const text = plain.length >= MIN_PLAIN_TEXT || !html ? plain.slice(0, maxChars) : readableText(html, maxChars);
  const received = Number(message.internalDate);
  return {
    id: message.id,
    from: headerValue(message.payload, "From"),
    subject: headerValue(message.payload, "Subject"),
    receivedAt: Number.isFinite(received) && received > 0 ? new Date(received).toISOString() : new Date().toISOString(),
    text,
    imageUrls: html ? imageUrlsFrom(html) : []
  };
}
