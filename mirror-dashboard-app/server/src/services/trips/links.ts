import type { TripArrangements, TripSelection, TripTotals, TripTravelers } from "@mirror-dashboard/shared";

/**
 * Every option on a trip ends in a real booking page, opened on a phone with
 * the dates, airports and party already filled in. The Pi quotes estimates;
 * these links are where the actual price and the payment happen.
 */

const iso = (date: Date) => date.toLocaleDateString("en-CA");

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "3 to 4 days" or "a week" becomes a number of nights. */
export function nightsFrom(tripLength?: string | null, fallback = 4): number {
  const text = (tripLength || "").toLowerCase();
  if (/week/.test(text)) return /two|2/.test(text) ? 14 : 7;
  const numbers = text.match(/\d+/g);
  if (!numbers?.length) return fallback;
  // "3 to 4 days" plans for the longer stay, and days include the night between them.
  const days = Math.max(...numbers.map(Number));
  return Math.min(21, Math.max(2, days - 1));
}

/**
 * The next window that suits the destination: a departure in the first of the
 * suggested months still ahead, leaving four weeks to book, and landing on a
 * Friday so the trip runs over a weekend.
 */
export function tripWindow(input: { bestMonths?: string | null; tripLength?: string | null; now?: Date; weekShift?: number }): { startDate: string; endDate: string; nights: number } {
  const now = input.now ?? new Date();
  const nights = nightsFrom(input.tripLength);
  const earliest = addDays(now, 28);
  const wanted = MONTHS
    .map((month, index) => ({ index, matched: (input.bestMonths || "").toLowerCase().includes(month.slice(0, 3)) }))
    .filter((month) => month.matched)
    .map((month) => month.index);

  let start = earliest;
  if (wanted.length) {
    const candidates = wanted
      .flatMap((month) => [new Date(now.getFullYear(), month, 1), new Date(now.getFullYear() + 1, month, 1)])
      .filter((date) => date.getTime() >= earliest.getTime())
      .sort((a, b) => a.getTime() - b.getTime());
    start = candidates[0] ?? earliest;
    if (start.getTime() < earliest.getTime()) start = earliest;
  }
  // Slide to the first Friday on or after that date.
  start = addDays(start, (5 - start.getDay() + 7) % 7);
  start = addDays(start, (input.weekShift ?? 0) * 7);
  if (start.getTime() < addDays(now, 3).getTime()) start = addDays(now, 3);
  return { startDate: iso(start), endDate: iso(addDays(start, nights)), nights };
}

export function travelerCount(travelers: TripTravelers): number {
  return Math.max(1, travelers.adults + travelers.children);
}

/** Google Flights takes a written query and fills the search in from it. */
export function flightSearchUrl(input: { origin: string; destination: string; startDate: string; endDate: string; travelers: TripTravelers }): string {
  const people = `${input.travelers.adults} adult${input.travelers.adults === 1 ? "" : "s"}${input.travelers.children ? ` ${input.travelers.children} child${input.travelers.children === 1 ? "" : "ren"}` : ""}`;
  const query = `Flights from ${input.origin} to ${input.destination} on ${input.startDate} through ${input.endDate} for ${people}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}`;
}

export function hotelSearchUrl(input: { destination: string; startDate: string; endDate: string; travelers: TripTravelers }): string {
  const params = new URLSearchParams({
    ss: input.destination,
    checkin: input.startDate,
    checkout: input.endDate,
    group_adults: String(input.travelers.adults),
    group_children: String(input.travelers.children),
    no_rooms: "1"
  });
  for (let child = 0; child < input.travelers.children; child += 1) params.append("age", "8");
  return `https://www.booking.com/searchresults.html?${params.toString()}`;
}

export function rentalSearchUrl(input: { destination: string; startDate: string; endDate: string; travelers: TripTravelers }): string {
  const params = new URLSearchParams({
    checkin: input.startDate,
    checkout: input.endDate,
    adults: String(input.travelers.adults),
    children: String(input.travelers.children)
  });
  return `https://www.airbnb.com/s/${encodeURIComponent(input.destination)}/homes?${params.toString()}`;
}

/** A named hotel goes to that hotel; anything else searches the town. */
export function stayLink(input: { name: string; kind: string; destination: string; startDate: string; endDate: string; travelers: TripTravelers }): string {
  if (input.kind === "rental") return rentalSearchUrl(input);
  // "A hotel in the old town" is a kind of place, not a property to search by name.
  const GENERIC = /^(an?|the)?\s*(hotel|rental|apartment|home|house|condo|resort|inn|bed and breakfast|whole home|vacation rental)s?(\s|$)/i;
  const named = input.name.trim().length > 2 && !GENERIC.test(input.name.trim());
  return hotelSearchUrl({ ...input, destination: named ? `${input.name}, ${input.destination}` : input.destination });
}

export function activityLink(input: { name: string; destination: string; startDate: string }): string {
  const params = new URLSearchParams({ q: `${input.name} ${input.destination}`, date_from: input.startDate });
  return `https://www.getyourguide.com/s/?${params.toString()}`;
}

/** What the trip costs as chosen, with food at a daily rate per person. */
export function tripTotals(arrangements: TripArrangements, selection: TripSelection): TripTotals {
  const people = travelerCount(arrangements.travelers);
  const flight = arrangements.flights.find((option) => option.id === selection.flightId);
  const stay = arrangements.stays.find((option) => option.id === selection.stayId);
  const activities = arrangements.activities.filter((option) => selection.activityIds.includes(option.id));

  const flights = Math.round((flight?.pricePerPerson ?? 0) * people);
  const stayCost = Math.round((stay?.nightlyPrice ?? 0) * arrangements.nights);
  const activityCost = Math.round(activities.reduce((sum, option) => sum + option.pricePerPerson * people, 0));
  const food = Math.round(arrangements.dailyFoodPerPerson * people * (arrangements.nights + 1));
  const total = flights + stayCost + activityCost + food;
  return {
    flights,
    stay: stayCost,
    activities: activityCost,
    food,
    total,
    perPerson: Math.round(total / people)
  };
}
