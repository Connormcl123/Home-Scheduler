import type { PackageStatus, PackageView } from "@mirror-dashboard/shared";

export const STEPS: Array<{ status: PackageStatus; label: string }> = [
  { status: "ordered", label: "Ordered" },
  { status: "shipped", label: "Shipped" },
  { status: "out_for_delivery", label: "Out for delivery" },
  { status: "delivered", label: "Delivered" }
];

export function stepIndex(status: PackageStatus): number {
  return STEPS.findIndex((step) => step.status === status);
}

/** Local YYYY-MM-DD, the same form as the Pi's arrival dates. */
export function dateKey(date: Date): string {
  return date.toLocaleDateString("en-CA");
}

function parseDay(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function daysBetween(fromKey: string, toKey: string): number {
  // Rounded, because a DST change makes a day 23 or 25 hours long.
  return Math.round((parseDay(toKey).getTime() - parseDay(fromKey).getTime()) / 86_400_000);
}

function monthDay(key: string): string {
  return parseDay(key).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type Arrival = Pick<PackageView, "status" | "arrivalStart" | "arrivalEnd" | "deliveredAt">;

/** "arriving today", "arrives Thursday", "arriving Sep 16 to 18", "delivered at 2:14 pm". */
export function arrivalPhrase(pkg: Arrival, now: Date): string {
  if (pkg.status === "delivered") {
    if (!pkg.deliveredAt) return "delivered";
    const at = new Date(pkg.deliveredAt);
    if (dateKey(at) === dateKey(now)) {
      // Newer ICU puts a narrow no-break space before PM; make it a plain space.
      return `delivered at ${at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s+/g, " ").toLowerCase()}`;
    }
    return `delivered ${at.toLocaleDateString("en-US", { weekday: "long" })}`;
  }
  const start = pkg.arrivalStart;
  if (!start) return pkg.status === "out_for_delivery" ? "out for delivery today" : pkg.status === "shipped" ? "on its way" : "ordered";
  const end = pkg.arrivalEnd && pkg.arrivalEnd !== start ? pkg.arrivalEnd : null;
  if (end) {
    const sameMonth = start.slice(0, 7) === end.slice(0, 7);
    return `arriving ${monthDay(start)} to ${sameMonth ? Number(end.slice(8)) : monthDay(end)}`;
  }
  const days = daysBetween(dateKey(now), start);
  if (days < 0) return `was due ${monthDay(start)}`;
  if (days === 0) return "arriving today";
  if (days === 1) return "arriving tomorrow";
  if (days <= 6) return `arrives ${parseDay(start).toLocaleDateString("en-US", { weekday: "long" })}`;
  return `arrives ${monthDay(start)}`;
}

/** "Amazon, arriving today", or "Arriving today" when the store is unknown. */
export function arrivalLine(pkg: Arrival & Pick<PackageView, "store">, now: Date): string {
  const phrase = arrivalPhrase(pkg, now);
  return pkg.store ? `${pkg.store}, ${phrase}` : phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

export type DayGroup = { heading: string; packages: PackageView[] };

function headingFor(key: string, today: string): string {
  if (key === "none") return "No date yet";
  const days = daysBetween(today, key);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return parseDay(key).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

/** Today (out for delivery, delivered, or overdue), Tomorrow, "Friday, Sep 18", then "No date yet". */
export function groupByDay(active: PackageView[], now: Date): DayGroup[] {
  const today = dateKey(now);
  const groups = new Map<string, PackageView[]>();
  for (const pkg of active) {
    let key = "none";
    if (pkg.status === "delivered" || pkg.status === "out_for_delivery") key = today;
    else if (pkg.arrivalStart) key = pkg.arrivalStart < today ? today : pkg.arrivalStart;
    groups.set(key, [...(groups.get(key) ?? []), pkg]);
  }
  const keys = [...groups.keys()].filter((key) => key !== "none").sort();
  if (groups.has("none")) keys.push("none");
  return keys.map((key) => ({ heading: headingFor(key, today), packages: groups.get(key) ?? [] }));
}

/** "Updated just now", "Updated 20 min ago", "Updated 3 h ago", "Updated yesterday", "Updated Sep 12". */
export function updatedAgo(iso: string, now: Date): string {
  const then = new Date(iso);
  const minutes = Math.round((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 2) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes} min ago`;
  if (dateKey(then) === dateKey(now)) return `Updated ${Math.round(minutes / 60)} h ago`;
  if (daysBetween(dateKey(then), dateKey(now)) === 1) return "Updated yesterday";
  return `Updated ${monthDay(dateKey(then))}`;
}

/** Where to follow a package on a phone; null when the carrier is unknown. */
export function trackingUrl(pkg: Pick<PackageView, "carrier" | "store" | "trackingNumber" | "orderNumber">): string | null {
  const carrier = (pkg.carrier ?? "").toLowerCase();
  const number = pkg.trackingNumber?.replace(/\s+/g, "");
  if (number) {
    const encoded = encodeURIComponent(number);
    if (carrier.includes("usps") || carrier.includes("postal")) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encoded}`;
    if (carrier.includes("ups")) return `https://www.ups.com/track?tracknum=${encoded}`;
    if (carrier.includes("fedex")) return `https://www.fedex.com/fedextrack/?trknbr=${encoded}`;
  }
  if ((pkg.store ?? "").toLowerCase().includes("amazon") && pkg.orderNumber) {
    return `https://www.amazon.com/gp/your-account/order-details?orderID=${encodeURIComponent(pkg.orderNumber)}`;
  }
  return null;
}

/** Home grid slots for the package card: one package fits one slot; more take the right-hand column. */
export function homeSlots(count: number): 0 | 1 | 2 {
  return count === 0 ? 0 : count === 1 ? 1 : 2;
}
