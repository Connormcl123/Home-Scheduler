import type { PackageStatus } from "@mirror-dashboard/shared";
import type { PackageUpdate } from "./extract.js";

export type StoredPackage = {
  id: number;
  store: string | null;
  item: string;
  imageUrl: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  orderNumber: string | null;
  status: PackageStatus;
  arrivalStart: string | null;
  arrivalEnd: string | null;
  issue: string | null;
  deliveredAt: string | null;
  hidden: boolean;
  /** When the newest email about it arrived (ISO). */
  lastEmailAt: string;
};

export type PackageFields = Omit<StoredPackage, "id" | "imageUrl" | "hidden">;
export type EventStatus = "out_for_delivery" | "delivered";

export type Decision =
  | { kind: "skip" }
  | { kind: "hidden"; packageId: number }
  | { kind: "delete"; packageId: number }
  | { kind: "create"; fields: PackageFields; photoUrl: string | null; event: EventStatus | null }
  | { kind: "update"; packageId: number; fields: Partial<PackageFields>; photoUrl: string | null; event: EventStatus | null };

export const STEP: Record<PackageStatus, number> = { ordered: 0, shipped: 1, out_for_delivery: 2, delivered: 3 };

/** Only news from the last day is announced; the first check reads two weeks of old mail. */
const ANNOUNCE_WITHIN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ISSUE = { delayed: "Delayed", attempted: "Delivery attempted" } as const;
const GENERIC_ITEM = /^Package( from .+)?$/;

function tidy(value: string | null): string | null {
  return value ? value.replace(/\s+/g, "").toUpperCase() : null;
}

function sameText(a: string | null, b: string | null): boolean {
  return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
}

/** Same tracking number first; otherwise same store and order number, unless both have different tracking numbers. */
export function findMatch(update: PackageUpdate, packages: StoredPackage[]): StoredPackage | null {
  const tracking = tidy(update.trackingNumber);
  if (tracking) {
    const byTracking = packages.find((pkg) => tidy(pkg.trackingNumber) === tracking);
    if (byTracking) return byTracking;
  }
  const order = tidy(update.orderNumber);
  if (!order || !update.store) return null;
  return packages.find((pkg) =>
    sameText(pkg.store, update.store)
    && tidy(pkg.orderNumber) === order
    // A second box from the same order has its own tracking number: keep it separate.
    && !(pkg.trackingNumber && tracking && tidy(pkg.trackingNumber) !== tracking)
  ) ?? null;
}

function announce(status: PackageStatus, receivedAt: string, now: Date): EventStatus | null {
  if (status !== "out_for_delivery" && status !== "delivered") return null;
  return now.getTime() - new Date(receivedAt).getTime() <= ANNOUNCE_WITHIN_MS ? status : null;
}

function createDecision(update: PackageUpdate, status: PackageStatus, issue: string | null, receivedAt: string, now: Date): Decision {
  return {
    kind: "create",
    fields: {
      store: update.store,
      item: update.item ?? (update.store ? `Package from ${update.store}` : "Package"),
      carrier: update.carrier,
      trackingNumber: update.trackingNumber,
      orderNumber: update.orderNumber,
      status,
      arrivalStart: update.arrivalStart,
      arrivalEnd: update.arrivalEnd,
      issue,
      deliveredAt: status === "delivered" ? receivedAt : null,
      lastEmailAt: receivedAt
    },
    photoUrl: update.imageUrl,
    event: announce(status, receivedAt, now)
  };
}

/** Empty fields filled from this email; arrival dates from the newest email (or any, while there are none). */
function filledFields(match: StoredPackage, update: PackageUpdate, receivedAt: string): { fields: Partial<PackageFields>; newer: boolean } {
  const fields: Partial<PackageFields> = {};
  if (!match.store && update.store) fields.store = update.store;
  if (!match.carrier && update.carrier) fields.carrier = update.carrier;
  if (!match.trackingNumber && update.trackingNumber) fields.trackingNumber = update.trackingNumber;
  if (!match.orderNumber && update.orderNumber) fields.orderNumber = update.orderNumber;
  if (GENERIC_ITEM.test(match.item) && update.item) fields.item = update.item;
  const newer = receivedAt >= match.lastEmailAt;
  if (newer) fields.lastEmailAt = receivedAt;
  if (update.arrivalStart && (newer || !match.arrivalStart)) {
    fields.arrivalStart = update.arrivalStart;
    fields.arrivalEnd = update.arrivalEnd;
  }
  return { fields, newer };
}

export function decide(update: PackageUpdate, packages: StoredPackage[], receivedAt: string, now: Date): Decision {
  const status = update.status;
  if (!update.isShipmentUpdate || !status) return { kind: "skip" };
  const match = findMatch(update, packages);
  if (match?.hidden) return { kind: "hidden", packageId: match.id };
  if (status === "cancelled") return match ? { kind: "delete", packageId: match.id } : { kind: "skip" };

  // A delay or failed attempt keeps the step and sets a note.
  if (status === "delayed" || status === "attempted") {
    const issue = update.issue ?? DEFAULT_ISSUE[status];
    if (!match) return createDecision(update, "shipped", issue, receivedAt, now);
    const { fields, newer } = filledFields(match, update, receivedAt);
    if (newer) fields.issue = issue;
    return { kind: "update", packageId: match.id, fields, photoUrl: match.imageUrl ? null : update.imageUrl, event: null };
  }

  if (!match) return createDecision(update, status, null, receivedAt, now);
  const { fields } = filledFields(match, update, receivedAt);
  let event: EventStatus | null = null;
  // Forward only: a late "shipped" email never pulls a delivered package back.
  if (STEP[status] > STEP[match.status]) {
    fields.status = status;
    fields.issue = null;
    if (status === "delivered") fields.deliveredAt = receivedAt;
    event = announce(status, receivedAt, now);
  }
  return { kind: "update", packageId: match.id, fields, photoUrl: match.imageUrl ? null : update.imageUrl, event };
}
