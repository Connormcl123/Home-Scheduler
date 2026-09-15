import type { GmailConnection } from "@mirror-dashboard/shared";
import type { ReadableEmail } from "../gmail/mime.js";
import { decide, type Decision } from "./apply.js";
import type { PackageUpdate } from "./extract.js";
import { shippingQuery } from "./query.js";
import type * as Store from "./store.js";

export const MAX_EMAILS_PER_CHECK = 50;
export const MAX_ATTEMPTS = 3;

export type CheckerDeps = {
  connection: () => Promise<GmailConnection>;
  search: (query: string, max: number) => Promise<string[]>;
  read: (id: string) => Promise<ReadableEmail>;
  extract: (email: ReadableEmail) => Promise<PackageUpdate>;
  savePhoto: (url: string) => Promise<string | null>;
  removePhoto: (url: string) => Promise<void>;
  store: Pick<typeof Store,
    "allPackages" | "createPackage" | "updatePackage" | "setPhoto" | "deletePackage" | "addEvent"
    | "emailRecord" | "pendingEmailIds" | "recordEmail" | "cleanup">;
  recordCheck: (result: { checkedAt: string | null; error: string | null }) => Promise<void>;
  now: () => Date;
};

export type CheckResult = { ran: boolean; processed: number; error: string | null };

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function applyDecision(decision: Decision, deps: CheckerDeps): Promise<{ outcome: Store.EmailOutcome; packageId: number | null }> {
  const now = deps.now();
  switch (decision.kind) {
    case "skip":
      return { outcome: "skipped", packageId: null };
    case "hidden":
      return { outcome: "hidden", packageId: decision.packageId };
    case "delete": {
      const photo = await deps.store.deletePackage(decision.packageId);
      if (photo) await deps.removePhoto(photo);
      return { outcome: "package", packageId: null };
    }
    case "create": {
      const photo = decision.photoUrl ? await deps.savePhoto(decision.photoUrl) : null;
      const id = await deps.store.createPackage(decision.fields, photo, now);
      if (decision.event) await deps.store.addEvent(id, decision.event, now);
      return { outcome: "package", packageId: id };
    }
    case "update": {
      await deps.store.updatePackage(decision.packageId, decision.fields, now);
      if (decision.photoUrl) {
        const photo = await deps.savePhoto(decision.photoUrl);
        if (photo) await deps.store.setPhoto(decision.packageId, photo);
      }
      if (decision.event) await deps.store.addEvent(decision.packageId, decision.event, now);
      return { outcome: "package", packageId: decision.packageId };
    }
  }
}

/** One check: search, read and extract each new email, apply it, then clean up. */
export async function runCheck(deps: CheckerDeps): Promise<CheckResult> {
  const connection = await deps.connection();
  if (connection.status !== "connected") return { ran: false, processed: 0, error: null };
  const startedAt = deps.now().toISOString();
  let found: string[];
  try {
    found = await deps.search(shippingQuery(connection.lastCheckedAt), MAX_EMAILS_PER_CHECK);
  } catch (error) {
    await deps.recordCheck({ checkedAt: null, error: `Gmail search failed: ${message(error)}` });
    return { ran: true, processed: 0, error: message(error) };
  }
  // Gmail lists newest first; apply oldest first so later news wins. Earlier failures get another go.
  const ids = [...new Set([...(await deps.store.pendingEmailIds()), ...[...found].reverse()])];
  let processed = 0;
  for (const id of ids) {
    const previous = await deps.store.emailRecord(id);
    if (previous && previous.outcome !== "pending") continue;
    const attempts = (previous?.attempts ?? 0) + 1;
    let email: ReadableEmail;
    let update: PackageUpdate;
    try {
      email = await deps.read(id);
      update = await deps.extract(email);
    } catch (error) {
      await deps.store.recordEmail({ gmailId: id, packageId: null, receivedAt: startedAt, subject: null, outcome: attempts >= MAX_ATTEMPTS ? "failed" : "pending", attempts });
      console.error(`Package email ${id} not read (attempt ${attempts}): ${message(error)}`);
      continue;
    }
    const decision = decide(update, await deps.store.allPackages(), email.receivedAt, deps.now());
    const result = await applyDecision(decision, deps);
    await deps.store.recordEmail({ gmailId: id, packageId: result.packageId, receivedAt: email.receivedAt, subject: email.subject || null, outcome: result.outcome, attempts });
    processed += 1;
  }
  for (const photo of await deps.store.cleanup(deps.now())) await deps.removePhoto(photo);
  await deps.recordCheck({ checkedAt: startedAt, error: null });
  return { ran: true, processed, error: null };
}

let running: Promise<CheckResult> | null = null;

/** One check at a time: asking while one runs returns that one. */
export function checkOnce(deps: CheckerDeps): Promise<CheckResult> {
  if (!running) {
    running = runCheck(deps).finally(() => {
      running = null;
    });
  }
  return running;
}

/** First check 30 seconds after start-up, then every `minutes`. */
export function startPackageChecker(makeDeps: () => CheckerDeps, minutes: number): void {
  const tick = () => {
    checkOnce(makeDeps()).catch((error) => console.error("Package check failed:", message(error)));
  };
  setTimeout(tick, 30_000).unref?.();
  setInterval(tick, minutes * 60_000).unref?.();
}
