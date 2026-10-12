import { readdir } from "node:fs/promises";
import path from "node:path";
import type { ScreensaverSettings } from "@mirror-dashboard/shared";
import { config } from "../config.js";

/**
 * Family photos for the idle screen. Next to the database, so they stay out of
 * git: the repo is public. Copy photos in with scp (docs/screensaver.md).
 */
export const SCREENSAVER_DIR = path.join(path.dirname(config.databasePath), "screensaver");

const PHOTO = /\.(jpe?g|png|webp|avif)$/i;

/** Photo files only, hidden files skipped, in name order so the slideshow is predictable. */
export function screensaverPhotoNames(files: string[]): string[] {
  return files.filter((file) => PHOTO.test(file) && !file.startsWith(".")).sort((a, b) => a.localeCompare(b));
}

export async function getScreensaverSettings(): Promise<ScreensaverSettings> {
  const files = await readdir(SCREENSAVER_DIR).catch(() => [] as string[]);
  return {
    idleMinutes: config.screensaver.idleMinutes,
    slideSeconds: config.screensaver.slideSeconds,
    photos: screensaverPhotoNames(files).map((file) => `/screensaver/${encodeURIComponent(file)}`)
  };
}
