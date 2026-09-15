/** Likely shipping mail from any store or carrier. Look-alikes are weeded out by the extraction. */
export const SHIPPING_FILTER =
  '-in:spam -in:trash (subject:(shipped OR "out for delivery" OR delivered OR arriving OR "on its way" OR "on the way" OR "order confirmed" OR "order confirmation" OR "your order" OR delivery) OR from:(amazon.com OR ups.com OR fedex.com OR usps.com OR target.com OR walmart.com))';

const FIRST_LOOKBACK = "newer_than:14d";

/** The first check reaches back 14 days; later ones overlap the last by an hour for late-indexed mail. */
export function shippingQuery(lastCheckedAt: string | null): string {
  const last = lastCheckedAt ? Date.parse(lastCheckedAt) : Number.NaN;
  if (!Number.isFinite(last)) return `${FIRST_LOOKBACK} ${SHIPPING_FILTER}`;
  return `after:${Math.floor(last / 1000) - 3600} ${SHIPPING_FILTER}`;
}
