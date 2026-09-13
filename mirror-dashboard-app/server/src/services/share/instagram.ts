import { decodeEntities } from "./html.js";

export type InstagramEmbed = { caption: string; author: string | null; imageUrl: string | null };

/**
 * Reads Instagram's public embed page (/embed/captioned/). That page is meant
 * for other websites to embed a post, so it carries the full caption without a
 * login, unlike the normal post page, which only has a truncated preview.
 */
export function parseInstagramEmbed(html: string): InstagramEmbed | null {
  const block = html.match(/<div class="Caption"[^>]*>([\s\S]*?)(?:<div class="CaptionComments"|<\/div>)/i);
  if (!block) return null;

  const authorMatch = block[1].match(/class="CaptionUsername"[^>]*>([^<]+)</i);
  const author = authorMatch ? decodeEntities(authorMatch[1]).trim() : null;

  let caption = decodeEntities(
    block[1]
      .replace(/<a[^>]*class="CaptionUsername"[^>]*>[^<]*<\/a>/i, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (author && caption.startsWith(author)) caption = caption.slice(author.length).trim();
  if (!caption) return null;

  const imageTag = (html.match(/<img\b[^>]*>/gi) || []).find((tag) => /EmbeddedMediaImage/.test(tag));
  const src = imageTag?.match(/\bsrc="([^"]+)"/i)?.[1];
  return { caption, author, imageUrl: src ? decodeEntities(src) : null };
}
