import { unlink } from "node:fs/promises";
import path from "node:path";
import type { PackagesResponse } from "@mirror-dashboard/shared";
import { config } from "../../config.js";
import { getConnection, recordCheck } from "../gmail/account.js";
import { gmail } from "../gmail/deps.js";
import { parseGmailMessage } from "../gmail/mime.js";
import { SHARE_IMAGE_DIR, saveShareImage } from "../share/images.js";
import { checkOnce, type CheckResult, type CheckerDeps } from "./checker.js";
import { extractPackageUpdate } from "./extract.js";
import * as store from "./store.js";

export function createCheckerDeps(): CheckerDeps {
  return {
    connection: getConnection,
    search: (query, max) => gmail.searchMessages(query, max),
    read: async (id) => parseGmailMessage(await gmail.getMessage(id)),
    extract: (email) => extractPackageUpdate(email),
    // Same safe downloader as shared recipes: images only, no SVG, 5 MB, served from /media.
    savePhoto: (url) => saveShareImage(url),
    removePhoto: async (url) => {
      // Only our own /media files, by file name; never a path from anywhere else.
      if (!url.startsWith("/media/")) return;
      await unlink(path.join(SHARE_IMAGE_DIR, path.basename(url))).catch(() => undefined);
    },
    store,
    recordCheck,
    now: () => new Date()
  };
}

export async function listPackages(): Promise<PackagesResponse> {
  // `connection`, not `gmail`: that name is the imported Gmail client.
  const [connection, lists] = await Promise.all([getConnection(), store.listPackageViews(new Date(), config.weather.timezone)]);
  return { gmail: connection, ...lists };
}

export function checkPackagesNow(): Promise<CheckResult> {
  return checkOnce(createCheckerDeps());
}
