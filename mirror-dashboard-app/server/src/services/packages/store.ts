import type { PackageEvent, PackageEventsResponse, PackageStatus, PackageView } from "@mirror-dashboard/shared";
import { getDb } from "../../db.js";
import { localDateIn } from "../../utils/dates.js";
import type { EventStatus, PackageFields, StoredPackage } from "./apply.js";

type PackageRow = {
  id: number;
  store: string | null;
  item: string;
  image_url: string | null;
  carrier: string | null;
  tracking_number: string | null;
  order_number: string | null;
  status: PackageStatus;
  arrival_start: string | null;
  arrival_end: string | null;
  issue: string | null;
  delivered_at: string | null;
  hidden: number;
  last_email_at: string;
  created_at: string;
  updated_at: string;
};

export type EmailOutcome = "package" | "skipped" | "hidden" | "pending" | "failed";

const DAY_MS = 24 * 60 * 60 * 1000;

// Column names come from this fixed map only, never from input.
const COLUMNS: Record<keyof PackageFields, string> = {
  store: "store",
  item: "item",
  carrier: "carrier",
  trackingNumber: "tracking_number",
  orderNumber: "order_number",
  status: "status",
  arrivalStart: "arrival_start",
  arrivalEnd: "arrival_end",
  issue: "issue",
  deliveredAt: "delivered_at",
  lastEmailAt: "last_email_at"
};

function toStored(row: PackageRow): StoredPackage {
  return {
    id: row.id, store: row.store, item: row.item, imageUrl: row.image_url, carrier: row.carrier,
    trackingNumber: row.tracking_number, orderNumber: row.order_number, status: row.status,
    arrivalStart: row.arrival_start, arrivalEnd: row.arrival_end, issue: row.issue,
    deliveredAt: row.delivered_at, hidden: row.hidden === 1, lastEmailAt: row.last_email_at
  };
}

function toView(row: PackageRow, subjects: string[]): PackageView {
  return {
    id: row.id, store: row.store, item: row.item, imageUrl: row.image_url, carrier: row.carrier,
    trackingNumber: row.tracking_number, orderNumber: row.order_number, status: row.status,
    arrivalStart: row.arrival_start, arrivalEnd: row.arrival_end, issue: row.issue,
    deliveredAt: row.delivered_at, updatedAt: row.last_email_at, subjects
  };
}

/** Every package, hidden ones included, for matching new emails. */
export async function allPackages(): Promise<StoredPackage[]> {
  const db = await getDb();
  return (await db.all<PackageRow[]>("SELECT * FROM packages ORDER BY id")).map(toStored);
}

export async function createPackage(fields: PackageFields, imageUrl: string | null, now: Date): Promise<number> {
  const db = await getDb();
  const stamp = now.toISOString();
  const result = await db.run(
    `INSERT INTO packages (store, item, image_url, carrier, tracking_number, order_number, status, arrival_start, arrival_end, issue, delivered_at, last_email_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    fields.store, fields.item, imageUrl, fields.carrier, fields.trackingNumber, fields.orderNumber, fields.status,
    fields.arrivalStart, fields.arrivalEnd, fields.issue, fields.deliveredAt, fields.lastEmailAt, stamp, stamp
  );
  return Number(result.lastID);
}

export async function updatePackage(id: number, fields: Partial<PackageFields>, now: Date): Promise<void> {
  const keys = (Object.keys(fields) as Array<keyof PackageFields>).filter((key) => key in COLUMNS);
  if (!keys.length) return;
  const db = await getDb();
  const assignments = keys.map((key) => `${COLUMNS[key]} = ?`).join(", ");
  await db.run(`UPDATE packages SET ${assignments}, updated_at = ? WHERE id = ?`, ...keys.map((key) => fields[key] ?? null), now.toISOString(), id);
}

/** The first photo wins. */
export async function setPhoto(id: number, imageUrl: string): Promise<void> {
  const db = await getDb();
  await db.run("UPDATE packages SET image_url = ? WHERE id = ? AND image_url IS NULL", imageUrl, id);
}

/** Returns the photo it leaves behind, for the caller to delete. */
export async function deletePackage(id: number): Promise<string | null> {
  const db = await getDb();
  const row = await db.get<{ image_url: string | null }>("SELECT image_url FROM packages WHERE id = ?", id);
  await db.run("DELETE FROM packages WHERE id = ?", id);
  return row?.image_url ?? null;
}

/** "Not a package": hidden for good; later emails about it stay hidden too. */
export async function hidePackage(id: number): Promise<boolean> {
  const db = await getDb();
  const result = await db.run("UPDATE packages SET hidden = 1 WHERE id = ?", id);
  return (result.changes ?? 0) > 0;
}

export async function addEvent(packageId: number, status: EventStatus, now: Date): Promise<void> {
  const db = await getDb();
  await db.run("INSERT INTO package_events (package_id, status, created_at) VALUES (?, ?, ?)", packageId, status, now.toISOString());
}

export async function emailRecord(gmailId: string): Promise<{ outcome: EmailOutcome; attempts: number } | null> {
  const db = await getDb();
  return (await db.get<{ outcome: EmailOutcome; attempts: number }>("SELECT outcome, attempts FROM package_emails WHERE gmail_id = ?", gmailId)) ?? null;
}

export async function pendingEmailIds(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.all<Array<{ gmail_id: string }>>("SELECT gmail_id FROM package_emails WHERE outcome = 'pending' ORDER BY received_at");
  return rows.map((row) => row.gmail_id);
}

export async function recordEmail(entry: {
  gmailId: string;
  packageId: number | null;
  receivedAt: string;
  subject: string | null;
  outcome: EmailOutcome;
  attempts: number;
}): Promise<void> {
  const db = await getDb();
  await db.run(
    `INSERT INTO package_emails (gmail_id, package_id, received_at, subject, outcome, attempts) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(gmail_id) DO UPDATE SET package_id = excluded.package_id, received_at = excluded.received_at,
       subject = COALESCE(excluded.subject, package_emails.subject), outcome = excluded.outcome, attempts = excluded.attempts`,
    entry.gmailId, entry.packageId, entry.receivedAt, entry.subject, entry.outcome, entry.attempts
  );
}

async function subjectsFor(ids: number[]): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  if (!ids.length) return map;
  const db = await getDb();
  const rows = await db.all<Array<{ package_id: number; subject: string }>>(
    `SELECT package_id, subject FROM package_emails WHERE subject IS NOT NULL AND package_id IN (${ids.map(() => "?").join(", ")}) ORDER BY received_at`,
    ...ids
  );
  for (const row of rows) map.set(row.package_id, [...(map.get(row.package_id) ?? []), row.subject]);
  return map;
}

// Out for delivery first, then the rest by step, then by arrival date (none last).
const ACTIVE_ORDER: Record<PackageStatus, number> = { out_for_delivery: 0, shipped: 1, ordered: 2, delivered: 3 };

function byActiveOrder(a: PackageRow, b: PackageRow): number {
  return ACTIVE_ORDER[a.status] - ACTIVE_ORDER[b.status]
    || (a.arrival_start ?? "9999").localeCompare(b.arrival_start ?? "9999")
    || a.id - b.id;
}

/** Active: on its way, or delivered today. Delivered: the last 7 days, newest first. Hidden packages never show. */
export async function listPackageViews(now: Date, timeZone: string): Promise<{ active: PackageView[]; delivered: PackageView[] }> {
  const db = await getDb();
  const rows = await db.all<PackageRow[]>("SELECT * FROM packages WHERE hidden = 0");
  const today = localDateIn(now, timeZone);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const deliveredToday = (row: PackageRow) => row.status === "delivered" && row.delivered_at !== null && localDateIn(new Date(row.delivered_at), timeZone) === today;
  const activeRows = rows.filter((row) => row.status !== "delivered" || deliveredToday(row)).sort(byActiveOrder);
  const deliveredRows = rows
    .filter((row) => row.status === "delivered" && row.delivered_at !== null && row.delivered_at >= weekAgo)
    .sort((a, b) => (b.delivered_at ?? "").localeCompare(a.delivered_at ?? ""));
  const subjects = await subjectsFor(rows.map((row) => row.id));
  return {
    active: activeRows.map((row) => toView(row, subjects.get(row.id) ?? [])),
    delivered: deliveredRows.map((row) => toView(row, subjects.get(row.id) ?? []))
  };
}

type EventRow = PackageRow & { event_id: number; event_status: EventStatus; event_created_at: string };

/** Without `after`: only where the list ends. With it: newer events for visible packages, oldest first. */
export async function listEvents(after?: number): Promise<PackageEventsResponse> {
  const db = await getDb();
  const lastId = (await db.get<{ id: number | null }>("SELECT MAX(id) AS id FROM package_events"))?.id ?? 0;
  if (after === undefined) return { lastId, events: [] };
  const rows = await db.all<EventRow[]>(
    `SELECT packages.*, package_events.id AS event_id, package_events.status AS event_status, package_events.created_at AS event_created_at
     FROM package_events JOIN packages ON packages.id = package_events.package_id
     WHERE package_events.id > ? AND packages.hidden = 0
     ORDER BY package_events.id LIMIT 20`,
    after
  );
  const subjects = await subjectsFor([...new Set(rows.map((row) => row.id))]);
  const events: PackageEvent[] = rows.map((row) => ({
    id: row.event_id,
    status: row.event_status,
    createdAt: row.event_created_at,
    package: toView(row, subjects.get(row.id) ?? [])
  }));
  return { lastId, events };
}

/** Deliveries leave after 7 days, silent packages after 30; email records after 60 days, events after 2. */
export async function cleanup(now: Date): Promise<string[]> {
  const db = await getDb();
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const where = "(status = 'delivered' AND delivered_at < ?) OR (status != 'delivered' AND last_email_at < ?)";
  const gone = await db.all<Array<{ image_url: string | null }>>(`SELECT image_url FROM packages WHERE ${where}`, weekAgo, monthAgo);
  await db.run(`DELETE FROM packages WHERE ${where}`, weekAgo, monthAgo);
  await db.run("DELETE FROM package_emails WHERE received_at < ?", new Date(now.getTime() - 60 * DAY_MS).toISOString());
  await db.run("DELETE FROM package_events WHERE created_at < ?", new Date(now.getTime() - 2 * DAY_MS).toISOString());
  return gone.map((row) => row.image_url).filter((url): url is string => Boolean(url));
}
