import { timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PostedClip } from "@mirror-dashboard/shared";
import { config } from "../config.js";
import { getDb } from "../db.js";

/** Next to the database, so it moves with it and stays out of git (data/ is ignored). */
export const CLIP_DIR = path.join(path.dirname(config.databasePath), "clips");

/** The wall shows a handful; older ones are deleted as new ones arrive. */
export const KEEP_CLIPS = 12;

export type ClipFile = "video" | "poster";
const EXTENSION: Record<ClipFile, string> = { video: "mp4", poster: "jpg" };

/** The clipper names clips after their source file; nothing else may reach the disk. */
export function isClipId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,120}$/.test(id);
}

/** Checks the bytes really are what the route says, since the wall plays them directly. */
export function looksLike(kind: ClipFile, body: Buffer): boolean {
  if (kind === "video") return body.length > 12 && body.subarray(4, 8).toString("latin1") === "ftyp";
  return body.length > 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
}

/** Uploads come from the clipper on the PC, with the token both .env files share. */
export function clipUploadAllowed(authorization: string | undefined): boolean {
  const token = config.clips.token;
  if (!token || !authorization?.toLowerCase().startsWith("bearer ")) return false;
  const given = Buffer.from(authorization.slice(7));
  const wanted = Buffer.from(token);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

function fileFor(id: string, kind: ClipFile) {
  return path.join(CLIP_DIR, `${id}.${EXTENSION[kind]}`);
}

export async function saveClipFile(id: string, kind: ClipFile, body: Buffer) {
  await mkdir(CLIP_DIR, { recursive: true });
  // Written aside and renamed, so the wall never serves half a video.
  const partial = `${fileFor(id, kind)}.part`;
  await writeFile(partial, body);
  await rename(partial, fileFor(id, kind));
}

type ClipRow = { id: string; caption: string; show: string | null; posted_at: string };

function rowToClip(row: ClipRow): PostedClip {
  return {
    id: row.id,
    caption: row.caption,
    show: row.show || null,
    postedAt: row.posted_at,
    videoUrl: `/clips/${row.id}.mp4`,
    posterUrl: `/clips/${row.id}.jpg`
  };
}

export async function listClips(): Promise<PostedClip[]> {
  const db = await getDb();
  const rows = await db.all<ClipRow[]>("SELECT id, caption, show, posted_at FROM posted_clips ORDER BY posted_at DESC LIMIT ?", KEEP_CLIPS);
  return rows.map(rowToClip);
}

/** False until both files are in: the clip is listed only once it can play. */
export async function publishClip(id: string, input: { caption: string; show?: string | null; postedAt: string }): Promise<boolean> {
  if (!existsSync(fileFor(id, "video")) || !existsSync(fileFor(id, "poster"))) return false;
  const db = await getDb();
  await db.run(
    `INSERT INTO posted_clips (id, caption, show, posted_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET caption = excluded.caption, show = excluded.show, posted_at = excluded.posted_at`,
    id, input.caption.trim(), input.show?.trim() || null, new Date(input.postedAt).toISOString()
  );
  const old = await db.all<{ id: string }[]>("SELECT id FROM posted_clips ORDER BY posted_at DESC LIMIT -1 OFFSET ?", KEEP_CLIPS);
  for (const { id: gone } of old) {
    await db.run("DELETE FROM posted_clips WHERE id = ?", gone);
    await Promise.all((["video", "poster"] as const).map((kind) => rm(fileFor(gone, kind), { force: true })));
  }
  return true;
}
