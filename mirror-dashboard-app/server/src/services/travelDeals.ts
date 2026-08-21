import Anthropic from "@anthropic-ai/sdk";
import type { TravelDeal, TravelDealDetail, TravelDealsResponse } from "@mirror-dashboard/shared";
import { config } from "../config.js";
import { getDb } from "../db.js";
import { listTravelInspirations } from "./travelInspirations.js";
import { todayIso } from "../utils/dates.js";

const DEALS_PER_DAY = 6;
const ACCENTS = ["sky", "amber", "emerald", "rose", "violet", "teal"];

type DealRow = {
  id: number;
  generated_for: string;
  destination: string;
  country: string | null;
  headline: string;
  hook: string;
  emoji: string;
  accent: string;
  best_months: string | null;
  trip_length: string | null;
  est_cost: string | null;
  image_url: string | null;
  detail: string;
  created_at: string;
};

const EMPTY_DETAIL: TravelDealDetail = {
  overview: "",
  highlights: [],
  itinerary: [],
  stay: "",
  gettingThere: "",
  familyTip: "",
  budgetBreakdown: []
};

function rowToDeal(row: DealRow): TravelDeal {
  let detail: TravelDealDetail = EMPTY_DETAIL;
  try {
    detail = { ...EMPTY_DETAIL, ...(JSON.parse(row.detail) as TravelDealDetail) };
  } catch {
    // A malformed row should show as a card with no breakdown, not crash the panel.
  }
  return {
    id: row.id,
    generatedFor: row.generated_for,
    destination: row.destination,
    country: row.country,
    headline: row.headline,
    hook: row.hook,
    emoji: row.emoji,
    accent: row.accent,
    bestMonths: row.best_months,
    tripLength: row.trip_length,
    estCost: row.est_cost,
    imageUrl: row.image_url,
    detail,
    createdAt: row.created_at
  };
}

export async function listTravelDeals(): Promise<TravelDealsResponse> {
  const db = await getDb();
  const latest = await db.get<{ generated_for: string }>(
    "SELECT generated_for FROM travel_deals ORDER BY generated_for DESC LIMIT 1"
  );

  if (!latest) {
    return {
      generatedFor: null,
      deals: [],
      status: config.anthropic.apiKey ? "empty" : "disabled",
      reason: config.anthropic.apiKey
        ? "No trip ideas yet. The next batch lands at 5am, or refresh now."
        : "Set ANTHROPIC_API_KEY in .env to generate daily trip ideas."
    };
  }

  const rows = await db.all<DealRow[]>(
    "SELECT * FROM travel_deals WHERE generated_for = ? ORDER BY id ASC",
    latest.generated_for
  );

  return { generatedFor: latest.generated_for, deals: rows.map(rowToDeal), status: "ready" };
}

const DEAL_SCHEMA = {
  type: "object",
  properties: {
    deals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          destination: { type: "string", description: "City or area, e.g. Asheville, North Carolina" },
          country: { type: "string" },
          headline: { type: "string", description: "Six words or fewer, the pitch for the trip." },
          hook: { type: "string", description: "One sentence on why it is worth going, readable across a room." },
          emoji: { type: "string", description: "A single emoji that suits the destination." },
          bestMonths: { type: "string", description: "When to go, e.g. April to June." },
          tripLength: { type: "string", description: "e.g. Long weekend, or 5 to 7 days." },
          estCost: { type: "string", description: "Rough all-in cost for a family of four, e.g. $2,400." },
          photoQuery: {
            type: "string",
            description: "The Wikipedia article title most likely to have a scenic photo of this place, e.g. Acadia National Park. Prefer a landmark or park over a town's administrative page."
          },
          overview: { type: "string", description: "Two or three sentences on the shape of the trip." },
          highlights: { type: "array", items: { type: "string" }, description: "Four to six specific things to do." },
          itinerary: {
            type: "array",
            items: {
              type: "object",
              properties: { day: { type: "string" }, plan: { type: "string" } },
              required: ["day", "plan"],
              additionalProperties: false
            }
          },
          stay: { type: "string", description: "Where to stay and roughly what it costs." },
          gettingThere: { type: "string", description: "How to get there from the US East Coast." },
          familyTip: { type: "string", description: "One practical tip for travelling with kids." },
          budgetBreakdown: {
            type: "array",
            items: {
              type: "object",
              properties: { label: { type: "string" }, amount: { type: "string" } },
              required: ["label", "amount"],
              additionalProperties: false
            }
          }
        },
        required: [
          "destination", "country", "headline", "hook", "emoji", "bestMonths", "tripLength",
          "estCost", "photoQuery", "overview", "highlights", "itinerary", "stay", "gettingThere",
          "familyTip", "budgetBreakdown"
        ],
        additionalProperties: false
      }
    }
  },
  required: ["deals"],
  additionalProperties: false
} as const;

type GeneratedDeal = {
  destination: string;
  country: string;
  headline: string;
  hook: string;
  emoji: string;
  bestMonths: string;
  tripLength: string;
  estCost: string;
  photoQuery: string;
} & TravelDealDetail;

/**
 * Wikipedia page images: no API key, no quota worth worrying about at six
 * lookups a day, and it already has good photography for most destinations.
 * Asks for a bounded thumbnail rather than the original, which can be many
 * megabytes and would stall the Pi.
 */
async function findDestinationPhoto(query: string): Promise<string | null> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("prop", "pageimages");
  url.searchParams.set("piprop", "thumbnail");
  url.searchParams.set("pithumbsize", "900");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", query);
  url.searchParams.set("gsrlimit", "1");
  url.searchParams.set("origin", "*");

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "MirrorDashboard/1.0 (family wall display)" },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      query?: { pages?: Record<string, { thumbnail?: { source?: string } }> };
    };
    const pages = Object.values(payload.query?.pages || {});
    return pages[0]?.thumbnail?.source || null;
  } catch {
    // A missing photo just means the card keeps its gradient.
    return null;
  }
}

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: config.anthropic.apiKey });
  return client;
}

/**
 * Generates a fresh set of trip ideas and replaces the day's batch. Runs from the
 * 5am scheduler, and on demand from the Travel tab.
 */
export async function generateTravelDeals(forDate = todayIso()): Promise<TravelDealsResponse> {
  if (!config.anthropic.apiKey) {
    return { generatedFor: null, deals: [], status: "disabled", reason: "Set ANTHROPIC_API_KEY in .env to generate daily trip ideas." };
  }

  const db = await getDb();
  const [inspirations, recent] = await Promise.all([
    listTravelInspirations().catch(() => []),
    db.all<Array<{ destination: string }>>(
      "SELECT DISTINCT destination FROM travel_deals ORDER BY id DESC LIMIT 40"
    )
  ]);

  const tastes = inspirations
    .slice(0, 12)
    .map((item) => `- ${item.title}${item.location ? ` (${item.location})` : ""}`)
    .join("\n");
  const avoid = recent.map((row) => row.destination).join(", ");

  const prompt = [
    `Put together ${DEALS_PER_DAY} trip ideas for a family of four on the US East Coast, for ${forDate}.`,
    "Mix the range: one or two that work as a long weekend drive, a couple of bigger flights,",
    "and at least one that is genuinely unexpected. Favour places that are good value at this time of year.",
    "Give real, specific places and realistic prices rather than generic filler.",
    "",
    tastes ? `Trips they have saved before, for a sense of taste:\n${tastes}` : "No saved trips yet, so pick a broad spread.",
    "",
    avoid ? `Do not repeat these recent suggestions: ${avoid}.` : ""
  ].join("\n");

  const response = await getClient().messages.create({
    model: config.anthropic.model,
    max_tokens: 8192,
    output_config: { format: { type: "json_schema", schema: DEAL_SCHEMA } },
    messages: [{ role: "user", content: prompt }]
  });

  if (response.stop_reason === "refusal") throw new Error("The trip generator was declined by safety filters.");

  const text = response.content.find((block): block is Anthropic.TextBlock => block.type === "text")?.text;
  if (!text) throw new Error("The trip generator returned nothing.");

  const parsed = JSON.parse(text) as { deals: GeneratedDeal[] };
  if (!parsed.deals?.length) throw new Error("The trip generator returned no ideas.");

  // Look these up together rather than serially; six sequential round trips
  // would noticeably delay the morning refresh.
  const photos = await Promise.all(
    parsed.deals.map((deal) => findDestinationPhoto(deal.photoQuery || deal.destination))
  );

  await db.run("DELETE FROM travel_deals WHERE generated_for = ?", forDate);
  for (const [index, deal] of parsed.deals.entries()) {
    const detail: TravelDealDetail = {
      overview: deal.overview,
      highlights: deal.highlights || [],
      itinerary: deal.itinerary || [],
      stay: deal.stay,
      gettingThere: deal.gettingThere,
      familyTip: deal.familyTip,
      budgetBreakdown: deal.budgetBreakdown || []
    };
    await db.run(
      `INSERT INTO travel_deals
       (generated_for, destination, country, headline, hook, emoji, accent, best_months, trip_length, est_cost, image_url, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      forDate,
      deal.destination,
      deal.country || null,
      deal.headline,
      deal.hook,
      deal.emoji || "✈️",
      ACCENTS[index % ACCENTS.length],
      deal.bestMonths || null,
      deal.tripLength || null,
      deal.estCost || null,
      photos[index],
      JSON.stringify(detail)
    );
  }

  // Keep the table from growing without bound on a Pi.
  await db.run(
    "DELETE FROM travel_deals WHERE generated_for NOT IN (SELECT DISTINCT generated_for FROM travel_deals ORDER BY generated_for DESC LIMIT 7)"
  );

  return listTravelDeals();
}

let timer: NodeJS.Timeout | null = null;

function msUntilNextRun(hour: number, minute: number) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/**
 * Fires once a day at the configured local hour. Re-arms per run rather than
 * using a fixed interval so it stays correct across DST shifts and long uptimes.
 */
export function startTravelDealScheduler() {
  const [hour, minute] = (config.travelDeals.dailyAt || "05:00").split(":").map(Number);
  const safeHour = Number.isFinite(hour) ? hour : 5;
  const safeMinute = Number.isFinite(minute) ? minute : 0;

  function schedule() {
    const delay = msUntilNextRun(safeHour, safeMinute);
    timer = setTimeout(async () => {
      try {
        await generateTravelDeals();
        console.log(`Travel ideas refreshed for ${todayIso()}`);
      } catch (error) {
        console.error("Travel idea refresh failed:", error instanceof Error ? error.message : error);
      }
      schedule();
    }, delay);
    timer.unref?.();
    const hours = Math.round((delay / 3600000) * 10) / 10;
    console.log(`Next travel idea refresh in ${hours}h (${safeHour}:${String(safeMinute).padStart(2, "0")} local)`);
  }

  if (timer) clearTimeout(timer);
  schedule();
}
