import type { PackageStatus, PackageView } from "@mirror-dashboard/shared";

const WORDS: Record<PackageStatus, string> = {
  ordered: "ordered",
  shipped: "on its way",
  out_for_delivery: "out for delivery",
  delivered: "delivered today"
};

/** Lines for the Home headline prompt. The model may mention these; it never makes package cards. */
export function describePackages(active: PackageView[], today: string): string {
  if (!active.length) return "Packages: none on the way.";
  const lines = active.slice(0, 6).map((pkg) => {
    const when = pkg.status !== "delivered" && pkg.arrivalStart
      ? pkg.arrivalStart === today ? ", arriving today" : `, arriving ${pkg.arrivalStart}`
      : "";
    return `- ${pkg.item}${pkg.store ? ` from ${pkg.store}` : ""}: ${WORDS[pkg.status]}${when}${pkg.issue ? ` (${pkg.issue})` : ""}`;
  });
  return ["Packages:", ...lines].join("\n");
}
