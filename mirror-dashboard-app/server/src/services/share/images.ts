import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../../config.js";
import { BROWSER_UA, safeFetch, type Resolver } from "./safeFetch.js";

/** Next to the database, so it moves with it and stays out of git (data/ is ignored). */
export const SHARE_IMAGE_DIR = path.join(path.dirname(config.databasePath), "share-images");

// No SVG: it can carry script, and the wall shows these images directly.
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif"
};

/**
 * Downloads a cover photo and keeps our own copy. Instagram's image links stop
 * working after a few days, so the Pi cannot just store the link. Returns the
 * /media path to store on the recipe or trip, or null; a missing photo never
 * stops a share from saving.
 */
export async function saveShareImage(
  imageUrl: string | null,
  options: { dir?: string; fetchImpl?: typeof fetch; resolve?: Resolver } = {}
): Promise<string | null> {
  if (!imageUrl) return null;
  try {
    const result = await safeFetch(imageUrl, {
      timeoutMs: 12_000,
      maxBytes: 5 * 1024 * 1024,
      headers: { "user-agent": BROWSER_UA },
      fetchImpl: options.fetchImpl,
      resolve: options.resolve
    });
    const extension = EXTENSIONS[result.contentType.split(";")[0].trim().toLowerCase()];
    if (result.status !== 200 || !extension || !result.body.length) return null;
    const dir = options.dir ?? SHARE_IMAGE_DIR;
    await mkdir(dir, { recursive: true });
    const file = `${randomBytes(12).toString("hex")}.${extension}`;
    await writeFile(path.join(dir, file), result.body);
    return `/media/${file}`;
  } catch {
    return null;
  }
}
