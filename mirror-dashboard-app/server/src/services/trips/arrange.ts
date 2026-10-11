import Anthropic from "@anthropic-ai/sdk";
import type { TravelDeal, TripActivityOption, TripArrangements, TripFlightOption, TripStayOption, TripTravelers } from "@mirror-dashboard/shared";
import { config } from "../../config.js";
import { getDb } from "../../db.js";
import { activityLink, flightSearchUrl, hotelSearchUrl, rentalSearchUrl, stayLink, tripWindow } from "./links.js";

/**
 * The deep dive behind a trip idea: real dates, a few ways to fly, places to
 * stay and things to do, each with an estimate and a link that opens the live
 * price. The model proposes; this file fixes the dates, the maths and the
 * links, so a hallucinated URL can never reach the wall.
 */

// The API takes no minItems or maxItems, so the counts are asked for in the
// prompt and enforced when the answer is shaped.
const SCHEMA = {
  type: "object",
  properties: {
    flights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          airline: { type: "string" },
          route: { type: "string", description: "e.g. PBI to SAV, or PBI to JAX then a 2 hour drive" },
          arriveAirport: { type: "string", description: "The 3 letter code actually flown into, e.g. SAV" },
          departs: { type: "string", description: "e.g. Friday morning" },
          returns: { type: "string", description: "e.g. Tuesday evening" },
          stops: { type: "string", description: "Nonstop, or 1 stop in Atlanta" },
          pricePerPerson: { type: "number", description: "Typical round trip fare in US dollars" },
          note: { type: "string", description: "One short line on why this option" }
        },
        required: ["airline", "route", "arriveAirport", "departs", "returns", "stops", "pricePerPerson", "note"],
        additionalProperties: false
      }
    },
    stays: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "A real, well known property, or the kind of place if unsure" },
          kind: { type: "string", enum: ["hotel", "rental", "boutique"] },
          area: { type: "string", description: "The neighbourhood and why it suits a family" },
          nightlyPrice: { type: "number" },
          note: { type: "string" }
        },
        required: ["name", "kind", "area", "nightlyPrice", "note"],
        additionalProperties: false
      }
    },
    activities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          when: { type: "string", description: "e.g. Saturday morning" },
          pricePerPerson: { type: "number", description: "0 when it is free" },
          note: { type: "string" }
        },
        required: ["name", "when", "pricePerPerson", "note"],
        additionalProperties: false
      }
    },
    dailyFoodPerPerson: { type: "number", description: "A realistic daily food figure per person for this destination" }
  },
  required: ["flights", "stays", "activities", "dailyFoodPerPerson"],
  additionalProperties: false
} as const;

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: config.anthropic.apiKey });
  return client;
}

function prompt(deal: TravelDeal, window: { startDate: string; endDate: string; nights: number }, travelers: TripTravelers, origin: string) {
  return `Plan the real arrangements for a family trip already chosen from a home dashboard.

Destination: ${deal.destination}${deal.country ? `, ${deal.country}` : ""}
The pitch on the wall: ${deal.headline}. ${deal.hook}
Leaving from: ${origin}
Dates: out ${weekdayOf(window.startDate)} ${window.startDate}, back ${weekdayOf(window.endDate)} ${window.endDate} (${window.nights} nights). Use those two weekdays when you say when a flight leaves and returns.
Travelling: ${travelers.adults} adults and ${travelers.children} children

Give two or three ways to fly, two or three places to stay and three to five things to do on those exact dates. Prices are US dollar estimates for these dates and this party: fares round trip per person, stays per night for the whole party, activities per person. Name real airlines that fly this route and real places to stay where you are confident they exist; where you are not, describe the kind of place instead of inventing a name. Keep every note to one short line a parent can read across a kitchen. Do not invent booking links or phone numbers.`;
}

/**
 * The airport flown into makes a better search than the town name, but only
 * when the model says the same code twice - once on its own and once in the
 * route it wrote. A code that appears nowhere else is a guess, and a guess can
 * point at the wrong state, so the town name is used instead.
 */
function arrivalAirport(option: { arriveAirport?: unknown; route?: unknown }, origin: string): string | null {
  const code = String(option?.arriveAirport ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code) || code === origin.toUpperCase()) return null;
  const route = String(option?.route ?? "").toUpperCase();
  return route.includes(code) ? code : null;
}

function weekdayOf(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
}

function slug(prefix: string, index: number) {
  return `${prefix}-${index + 1}`;
}

/** Whatever the model returns, the numbers and links are rebuilt here. */
function shape(
  raw: { flights?: any[]; stays?: any[]; activities?: any[]; dailyFoodPerPerson?: number },
  deal: TravelDeal,
  window: { startDate: string; endDate: string; nights: number },
  travelers: TripTravelers,
  origin: string,
  source: "ai" | "local"
): TripArrangements {
  const destination = deal.country && !deal.destination.includes(deal.country) ? `${deal.destination}, ${deal.country}` : deal.destination;
  const money = (value: unknown, fallback: number) => {
    const number = Math.round(Number(value));
    return Number.isFinite(number) && number >= 0 ? Math.min(20_000, number) : fallback;
  };
  const text = (value: unknown, fallback: string) => (typeof value === "string" && value.trim() ? value.trim() : fallback);

  const flights: TripFlightOption[] = (raw.flights ?? []).slice(0, 3).map((option, index) => ({
    id: slug("flight", index),
    airline: text(option?.airline, "Several airlines"),
    route: text(option?.route, `${origin} to ${deal.destination}`),
    departs: text(option?.departs, "Friday"),
    returns: text(option?.returns, "Tuesday"),
    stops: text(option?.stops, "Check both"),
    pricePerPerson: money(option?.pricePerPerson, 280),
    note: text(option?.note, ""),
    link: flightSearchUrl({
      origin,
      destination: arrivalAirport(option, origin) ?? deal.destination,
      startDate: window.startDate,
      endDate: window.endDate,
      travelers
    })
  }));

  const stays: TripStayOption[] = (raw.stays ?? []).slice(0, 3).map((option, index) => {
    const kind = ["hotel", "rental", "boutique"].includes(option?.kind) ? option.kind : "hotel";
    const name = text(option?.name, kind === "rental" ? "A rental near the centre" : "A hotel in town");
    return {
      id: slug("stay", index),
      name,
      kind,
      area: text(option?.area, ""),
      nightlyPrice: money(option?.nightlyPrice, 180),
      note: text(option?.note, ""),
      link: stayLink({ name, kind, destination, startDate: window.startDate, endDate: window.endDate, travelers })
    };
  });

  const activities: TripActivityOption[] = (raw.activities ?? []).slice(0, 5).map((option, index) => {
    const name = text(option?.name, "Something to do");
    return {
      id: slug("activity", index),
      name,
      when: text(option?.when, ""),
      pricePerPerson: money(option?.pricePerPerson, 0),
      note: text(option?.note, ""),
      link: activityLink({ name, destination, startDate: window.startDate })
    };
  });

  return {
    dealId: deal.id,
    destination,
    origin,
    startDate: window.startDate,
    endDate: window.endDate,
    nights: window.nights,
    travelers,
    flights: flights.length ? flights : fallbackFlights(deal, window, travelers, origin),
    stays: stays.length ? stays : fallbackStays(destination, window, travelers),
    activities,
    dailyFoodPerPerson: money(raw.dailyFoodPerPerson, 55),
    generatedAt: new Date().toISOString(),
    source
  };
}

function fallbackFlights(deal: TravelDeal, window: { startDate: string; endDate: string }, travelers: TripTravelers, origin: string): TripFlightOption[] {
  return [{
    id: "flight-1",
    airline: "Compare all airlines",
    route: `${origin} to ${deal.destination}`,
    departs: "Your dates",
    returns: "Your dates",
    stops: "Nonstop and one stop",
    pricePerPerson: 300,
    note: "Open the search for live fares.",
    link: flightSearchUrl({ origin, destination: deal.destination, startDate: window.startDate, endDate: window.endDate, travelers })
  }];
}

function fallbackStays(destination: string, window: { startDate: string; endDate: string }, travelers: TripTravelers): TripStayOption[] {
  return [
    {
      id: "stay-1",
      name: "Hotels in town",
      kind: "hotel",
      area: destination,
      nightlyPrice: 180,
      note: "Compare what is free on these dates.",
      link: hotelSearchUrl({ destination, startDate: window.startDate, endDate: window.endDate, travelers })
    },
    {
      id: "stay-2",
      name: "Whole homes",
      kind: "rental",
      area: destination,
      nightlyPrice: 210,
      note: "More room and a kitchen for the family.",
      link: rentalSearchUrl({ destination, startDate: window.startDate, endDate: window.endDate, travelers })
    }
  ];
}

/** Arrangements for a trip idea, generated once per deal, dates and party, then kept. */
export async function arrangementsFor(deal: TravelDeal, options: { travelers: TripTravelers; weekShift?: number; origin: string; refresh?: boolean }): Promise<TripArrangements> {
  const window = tripWindow({ bestMonths: deal.bestMonths, tripLength: deal.tripLength, weekShift: options.weekShift });
  const db = await getDb();
  const key = `${deal.id}:${window.startDate}:${options.travelers.adults}a${options.travelers.children}c`;

  if (!options.refresh) {
    const cached = await db.get<{ payload: string }>("SELECT payload FROM trip_arrangements WHERE cache_key = ?", key);
    if (cached) {
      try {
        return JSON.parse(cached.payload) as TripArrangements;
      } catch {
        // A corrupted row is simply replaced below.
      }
    }
  }

  let arrangements: TripArrangements;
  if (!config.anthropic.apiKey) {
    arrangements = shape({}, deal, window, options.travelers, options.origin, "local");
  } else {
    try {
      const response = await getClient().messages.create({
        model: config.anthropic.model,
        max_tokens: 4096,
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
        messages: [{ role: "user", content: prompt(deal, window, options.travelers, options.origin) }]
      } as never);
      const block = (response as { content: Array<{ type: string; text?: string }> }).content.find((entry) => entry.type === "text");
      arrangements = shape(JSON.parse(block?.text || "{}"), deal, window, options.travelers, options.origin, "ai");
    } catch (error) {
      console.error("Trip arrangements failed:", error instanceof Error ? error.message : error);
      arrangements = shape({}, deal, window, options.travelers, options.origin, "local");
    }
  }

  await db.run(
    `INSERT INTO trip_arrangements (cache_key, deal_id, payload) VALUES (?, ?, ?)
     ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, created_at = CURRENT_TIMESTAMP`,
    key,
    deal.id,
    JSON.stringify(arrangements)
  );
  return arrangements;
}

/** Exposed for the tests: the rule that keeps a guessed code out of a booking link. */
export const arrivalAirportForTest = arrivalAirport;
