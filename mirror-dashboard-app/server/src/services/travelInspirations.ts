import type { TravelInspiration, TravelItineraryResult } from "@mirror-dashboard/shared";
import { config } from "../config.js";
import { getDb } from "../db.js";
import { researchTravelPlaces, type TravelPlaceResearch } from "./travelPlaces.js";

type TravelRow = {
  id: number;
  source: "instagram" | "manual";
  url: string;
  thumbnail_url: string | null;
  title: string;
  location: string | null;
  notes: string | null;
  tags: string;
  created_at: string;
  updated_at: string;
};

type TravelInput = {
  source?: "instagram" | "manual";
  url: string;
  thumbnailUrl?: string | null;
  title?: string;
  location?: string | null;
  notes?: string | null;
  tags?: string[] | string;
};

type TravelMetadata = {
  title?: string;
  description?: string;
  siteName?: string;
  image?: string;
};

type TravelEnrichment = {
  title: string;
  location?: string | null;
  notes?: string | null;
  tags?: string[];
};

function toTravelInspiration(row: TravelRow): TravelInspiration {
  return {
    id: row.id,
    source: row.source,
    url: row.url,
    thumbnailUrl: row.thumbnail_url,
    title: row.title,
    location: row.location,
    notes: row.notes,
    tags: row.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeTags(tags: TravelInput["tags"]) {
  if (Array.isArray(tags)) return tags.map((tag) => tag.trim()).filter(Boolean).join(", ");
  return (tags || "").split(",").map((tag) => tag.trim()).filter(Boolean).join(", ");
}

export async function listTravelInspirations(): Promise<TravelInspiration[]> {
  const db = await getDb();
  const rows = await db.all<TravelRow[]>("SELECT * FROM travel_inspirations ORDER BY updated_at DESC, id DESC");
  return rows.map(toTravelInspiration);
}

export async function createTravelInspiration(input: TravelInput): Promise<TravelInspiration> {
  const db = await getDb();
  const now = new Date().toISOString();
  const title = meaningfulText(input.title, ["title", "instagram travel idea"]) || "Instagram travel idea";
  const result = await db.run(
    `INSERT INTO travel_inspirations (source, url, thumbnail_url, title, location, notes, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET
      source = excluded.source,
      thumbnail_url = COALESCE(excluded.thumbnail_url, travel_inspirations.thumbnail_url),
      title = excluded.title,
      location = excluded.location,
      notes = excluded.notes,
      tags = excluded.tags,
      updated_at = excluded.updated_at`,
    input.source || "instagram",
    input.url.trim(),
    input.thumbnailUrl?.trim() || null,
    title,
    input.location?.trim() || null,
    input.notes?.trim() || null,
    normalizeTags(input.tags),
    now,
    now
  );
  const id = result.lastID || (await db.get<{ id: number }>("SELECT id FROM travel_inspirations WHERE url = ?", input.url.trim()))?.id;
  return getTravelInspiration(id || 0) as Promise<TravelInspiration>;
}

export async function createEnrichedTravelInspiration(input: TravelInput): Promise<TravelInspiration> {
  const url = input.url.trim();
  const hasUsefulDetails = Boolean(
    meaningfulText(input.title, ["title", "instagram travel idea"]) ||
    meaningfulText(input.location, ["location"]) ||
    meaningfulText(input.notes, ["notes"])
  );

  if (hasUsefulDetails) return createTravelInspiration(input);

  const metadata = await fetchTravelMetadata(url);
  const enrichment = config.openai.apiKey
    ? await enrichWithOpenAI(url, metadata).catch((error) => {
        console.warn("OpenAI travel inspiration enrichment failed, using metadata fallback.", error);
        return enrichFromMetadata(url, metadata);
      })
    : enrichFromMetadata(url, metadata);

  return createTravelInspiration({
    ...input,
    url,
    thumbnailUrl: metadata.image,
    title: enrichment.title,
    location: enrichment.location,
    notes: enrichment.notes,
    tags: enrichment.tags
  });
}

export async function updateTravelInspiration(id: number, input: Partial<TravelInput>): Promise<TravelInspiration | null> {
  const existing = await getTravelInspiration(id);
  if (!existing) return null;

  const db = await getDb();
  await db.run(
    `UPDATE travel_inspirations
     SET source = ?, url = ?, thumbnail_url = ?, title = ?, location = ?, notes = ?, tags = ?, updated_at = ?
     WHERE id = ?`,
    input.source || existing.source,
    input.url?.trim() || existing.url,
    input.thumbnailUrl === undefined ? existing.thumbnailUrl : input.thumbnailUrl?.trim() || null,
    input.title?.trim() || existing.title,
    input.location === undefined ? existing.location : input.location?.trim() || null,
    input.notes === undefined ? existing.notes : input.notes?.trim() || null,
    input.tags === undefined ? existing.tags.join(", ") : normalizeTags(input.tags),
    new Date().toISOString(),
    id
  );
  return getTravelInspiration(id);
}

export async function deleteTravelInspiration(id: number) {
  const db = await getDb();
  await db.run("DELETE FROM travel_inspirations WHERE id = ?", id);
}

export async function generateTravelItinerary(): Promise<TravelItineraryResult> {
  const inspirations = await listTravelInspirations();
  if (!inspirations.length) {
    return {
      provider: "local",
      generatedAt: new Date().toISOString(),
      title: "Saved Ideas Itinerary",
      summary: "Add a few Instagram travel links and notes first, then generate an itinerary from them.",
      days: [],
      sourceCount: 0
    };
  }

  if (config.openai.apiKey) {
    try {
      return await generateWithOpenAI(inspirations);
    } catch (error) {
      console.warn("OpenAI itinerary generation failed, using local fallback.", error);
    }
  }

  return generateLocalItinerary(inspirations);
}

async function getTravelInspiration(id: number): Promise<TravelInspiration | null> {
  const db = await getDb();
  const row = await db.get<TravelRow>("SELECT * FROM travel_inspirations WHERE id = ?", id);
  return row ? toTravelInspiration(row) : null;
}

async function generateWithOpenAI(inspirations: TravelInspiration[]): Promise<TravelItineraryResult> {
  const destination = inferDestination(inspirations[0]) || inspirations[0]?.location || "Saved Destination";
  const placeResearch = await researchTravelPlaces(destination);
  const travelSignals = inspirations.map((item) => ({
    ...item,
    inferredPlaces: extractPlaceCandidates(item),
    tripTheme: inferTripTheme(item)
  }));

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openai.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.openai.model,
      ...(config.openai.travelWebSearch ? {
        tools: [{ type: "web_search", search_context_size: "medium" }]
      } : {}),
      input: [
        {
          role: "system",
          content: `Create concise, family-friendly travel trip packages from saved Instagram travel posts.

Treat the title, caption/notes, hashtags, URL metadata, and inferredPlaces as the source material. Identify the place or places being discussed.

When web search is available, research concrete current options for:
- neighborhoods or areas to stay
- hotels or vacation-rental style stays
- restaurants and food stops
- activities and scenic stops
- drive/fly/train logistics
- rough price ranges and timing

Do not fabricate exact availability or guaranteed prices. Use language like "estimated", "typically", "check before booking", or "current search result suggests" when appropriate. Do not claim to have booked anything. Do not claim to have watched private video content. If the video itself is not accessible, say the plan is based on public post metadata/caption plus web research.`
        },
        {
          role: "user",
          content: `Build a practical 3-day itinerary from these saved Instagram inspirations. For one saved item, focus the whole itinerary on that post's destination.

Return JSON with keys title, summary, destination, mapQuery, lodgingLinks, travelLinks, planning, and days.

The planning object is the most important part. Brainstorm and organize actual options the family can compare before clicking anything:
- travelOptions: 3 realistic ways to get there, including drive/fly/train when relevant, rough timing, pros/cons, booking notes, and rough cost language when possible. If web search is available, make these realistic for the destination and likely origin if inferable; otherwise say what must be checked.
- lodgingOptions: 3 concrete stay options or stay areas. If web search is available, include named hotels/inns/rental areas when available, rough nightly price language, walkability/parking notes, and booking cautions.
- foodAndStops: specific restaurants, food stops, attractions, scenic stops, beaches, parks, walks, or activities. If web search is available, include named options and rough timing/pricing where possible.
- familyNotes: practical family/touchscreen command-center notes.
- packingNotes: destination-specific packing reminders.

Each day needs day, title, stops array, notes, details, and mapQuery. lodgingLinks and travelLinks should each be arrays of { label, url }. Use direct Google Maps, Google Hotels, Airbnb search, and Google Flights/search URLs when helpful, but do not make links the main answer. The main answer should be organized information already brainstormed for the user.

The end goal is a trip that can later become bookable with buttons. For now, return a researched trip package with enough detail for the UI to show likely stays, restaurants, activities, rough costs, route/time guidance, and next booking actions.

Use travel context such as the destination, best-fit trip style, food/landmark ideas from the caption, and how to structure the visit. If you cannot access private video frames, be clear that the plan is based on the public post metadata/caption${config.openai.travelWebSearch ? " and web research" : ""}.

App-provided place research from Google Places, if available, should be preferred for named restaurants, lodging, activities, ratings, and Google Maps links. If no place research is available, use web search if enabled or clearly mark estimates as needing verification.

Saved inspiration signals:
${JSON.stringify(travelSignals, null, 2)}

App place research:
${JSON.stringify(placeResearch, null, 2)}`
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "travel_itinerary",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["title", "summary", "destination", "mapQuery", "lodgingLinks", "travelLinks", "planning", "days"],
            properties: {
              title: { type: "string" },
              summary: { type: "string" },
              destination: { type: "string" },
              mapQuery: { type: "string" },
              lodgingLinks: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["label", "url"],
                  properties: {
                    label: { type: "string" },
                    url: { type: "string" }
                  }
                }
              },
              travelLinks: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["label", "url"],
                  properties: {
                    label: { type: "string" },
                    url: { type: "string" }
                  }
                }
              },
              planning: {
                type: "object",
                additionalProperties: false,
                required: ["travelOptions", "lodgingOptions", "foodAndStops", "familyNotes", "packingNotes"],
                properties: {
                  travelOptions: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["title", "recommendation", "estimatedCost", "timing", "bookingNotes"],
                      properties: {
                        title: { type: "string" },
                        recommendation: { type: "string" },
                        estimatedCost: { type: "string" },
                        timing: { type: "string" },
                        bookingNotes: { type: "string" }
                      }
                    }
                  },
                  lodgingOptions: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["title", "recommendation", "estimatedCost", "timing", "bookingNotes"],
                      properties: {
                        title: { type: "string" },
                        recommendation: { type: "string" },
                        estimatedCost: { type: "string" },
                        timing: { type: "string" },
                        bookingNotes: { type: "string" }
                      }
                    }
                  },
                  foodAndStops: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["title", "recommendation", "estimatedCost", "timing", "bookingNotes"],
                      properties: {
                        title: { type: "string" },
                        recommendation: { type: "string" },
                        estimatedCost: { type: "string" },
                        timing: { type: "string" },
                        bookingNotes: { type: "string" }
                      }
                    }
                  },
                  familyNotes: { type: "array", items: { type: "string" } },
                  packingNotes: { type: "array", items: { type: "string" } }
                }
              },
              days: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["day", "title", "stops", "notes", "details", "mapQuery"],
                  properties: {
                    day: { type: "number" },
                    title: { type: "string" },
                    stops: { type: "array", items: { type: "string" } },
                    notes: { type: "string" },
                    details: { type: "string" },
                    mapQuery: { type: "string" }
                  }
                }
              }
            }
          },
          strict: true
        }
      }
    })
  });

  if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
  const payload = await response.json() as { output_text?: string };
  type OpenAIItineraryDay = {
    day: number;
    title: string;
    stops: string[];
    notes: string;
    details: string;
    mapQuery: string;
  };
  type OpenAIItinerary = Omit<TravelItineraryResult, "provider" | "generatedAt" | "sourceCount" | "mapUrl" | "mapEmbedUrl" | "days"> & {
    days?: OpenAIItineraryDay[];
  };
  const parsed = JSON.parse(payload.output_text || "{}") as OpenAIItinerary;
  const parsedDestination = parsed.destination || parsed.mapQuery || destination || "Saved Destination";
  const mapQuery = parsed.mapQuery || parsedDestination;
  return {
    provider: "openai",
    generatedAt: new Date().toISOString(),
    title: parsed.title || "Instagram Ideas Itinerary",
    summary: parsed.summary || "Generated from your saved travel inspirations.",
    destination: parsedDestination,
    mapQuery,
    mapUrl: googleMapsUrl(mapQuery),
    mapEmbedUrl: googleMapsEmbedUrl(mapQuery),
    lodgingLinks: sanitizeLinks(parsed.lodgingLinks, buildLodgingLinks(parsedDestination, placeResearch)),
    travelLinks: sanitizeLinks(parsed.travelLinks, buildTravelLinks(parsedDestination)),
    planning: parsed.planning || buildLocalPlanning(parsedDestination, extractPlaceCandidates(inspirations[0]), extractFoodSignals(inspirations[0]), inferTripTheme(inspirations[0]), placeResearch),
    days: Array.isArray(parsed.days) ? parsed.days.map((day) => ({
      day: day.day,
      title: day.title,
      stops: day.stops,
      notes: day.notes,
      details: day.details,
      mapQuery: day.mapQuery || [destination, ...day.stops].join(" "),
      mapUrl: googleMapsUrl(day.mapQuery || [destination, ...day.stops].join(" "))
    })) : [],
    sourceCount: inspirations.length
  };
}


async function fetchTravelMetadata(url: string): Promise<TravelMetadata> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 HomeSchedulerBot/1.0"
      }
    });
    if (!response.ok) return {};
    const html = await response.text();
    return {
      title: firstMetaContent(html, ["og:title", "twitter:title"]) || firstTitle(html),
      description: firstMetaContent(html, ["og:description", "description", "twitter:description"]),
      siteName: firstMetaContent(html, ["og:site_name"]),
      image: firstMetaContent(html, ["og:image", "twitter:image"])
    };
  } catch {
    return {};
  } finally {
    clearTimeout(timeout);
  }
}

async function enrichWithOpenAI(url: string, metadata: TravelMetadata): Promise<TravelEnrichment> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openai.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.openai.model,
      input: [
        {
          role: "system",
          content: "Extract a concise travel inspiration card from public URL metadata. Do not claim to have watched a video. Use only the supplied URL, title, description, and site name. If a location is unclear, leave location empty."
        },
        {
          role: "user",
          content: JSON.stringify({ url, metadata }, null, 2)
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "travel_inspiration_enrichment",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["title", "location", "notes", "tags"],
            properties: {
              title: { type: "string" },
              location: { type: "string" },
              notes: { type: "string" },
              tags: { type: "array", items: { type: "string" } }
            }
          },
          strict: true
        }
      }
    })
  });
  if (!response.ok) throw new Error(`OpenAI enrichment request failed: ${response.status}`);
  const payload = await response.json() as { output_text?: string };
  const parsed = JSON.parse(payload.output_text || "{}") as TravelEnrichment;
  const fallback = enrichFromMetadata(url, metadata);
  return {
    title: meaningfulText(parsed.title, ["instagram", "instagram travel idea"]) || fallback.title,
    location: meaningfulText(parsed.location, ["unknown", "unclear"]) || null,
    notes: meaningfulText(parsed.notes, [""]) || fallback.notes,
    tags: Array.isArray(parsed.tags) ? parsed.tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 6) : fallback.tags
  };
}

function enrichFromMetadata(url: string, metadata: TravelMetadata): TravelEnrichment {
  const title = meaningfulText(cleanInstagramText(metadata.title), ["instagram"]) || titleFromUrl(url);
  const description = cleanInstagramText(metadata.description);
  return {
    title,
    location: inferLocation(`${title} ${description}`),
    notes: description || "Saved from Instagram. Add details later if the post metadata was private or unavailable.",
    tags: ["instagram"]
  };
}

function meaningfulText(value: string | null | undefined, placeholders: string[]) {
  const text = value?.trim();
  if (!text) return "";
  const normalized = text.toLowerCase();
  if (placeholders.some((placeholder) => normalized === placeholder.toLowerCase())) return "";
  return text;
}

function firstMetaContent(html: string, names: string[]) {
  for (const name of names) {
    const pattern = new RegExp(`<meta\\s+[^>]*(?:property|name)=["']${escapeRegex(name)}["'][^>]*content=["']([^"']*)["'][^>]*>`, "i");
    const reversePattern = new RegExp(`<meta\\s+[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${escapeRegex(name)}["'][^>]*>`, "i");
    const match = html.match(pattern) || html.match(reversePattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return "";
}

function firstTitle(html: string) {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match?.[1] ? decodeHtml(match[1]) : "";
}

function cleanInstagramText(value: string | undefined) {
  return (value || "")
    .replace(/\s*?\s*Instagram\s*photos and videos\s*/i, "")
    .replace(/\s*on Instagram:?\s*/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const id = parsed.pathname.split("/").filter(Boolean).pop();
    return id ? `Instagram idea ${id}` : "Instagram travel idea";
  } catch {
    return "Instagram travel idea";
  }
}

function inferLocation(text: string) {
  return inferDestinationFromText(text);
}

function decodeHtml(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function generateLocalItinerary(inspirations: TravelInspiration[]): Promise<TravelItineraryResult> {
  if (inspirations.length === 1) {
    return generateSingleInspirationItinerary(inspirations[0]);
  }

  const grouped = inspirations.reduce<Record<string, TravelInspiration[]>>((acc, item) => {
    const key = item.location?.trim() || inferDestination(item) || "Saved Places";
    acc[key] = [...(acc[key] || []), item];
    return acc;
  }, {});

  const days = Object.entries(grouped).slice(0, 3).map(([location, items], index) => ({
    day: index + 1,
    title: location,
    stops: items.slice(0, 5).map((item) => item.title),
    notes: items.map((item) => item.notes).filter(Boolean).slice(0, 2).join(" ") || "Use this day to cluster nearby saved spots and keep meal stops flexible."
  }));

  return {
    provider: "local",
    generatedAt: new Date().toISOString(),
    title: "Instagram Ideas Itinerary",
    summary: "A draft route grouped from your saved Instagram links and notes. Add locations and tags to make the next draft sharper.",
    days,
    sourceCount: inspirations.length
  };
}

async function generateSingleInspirationItinerary(item: TravelInspiration): Promise<TravelItineraryResult> {
  const destination = item.location?.trim() || inferDestination(item) || "Saved Destination";
  const placeResearch = await researchTravelPlaces(destination);
  const places = extractPlaceCandidates(item);
  const theme = inferTripTheme(item);
  const anchorStops = places.length ? places : [destination];
  const foodStops = extractFoodSignals(item);
  const lodgingLinks = buildLodgingLinks(destination, placeResearch);
  const travelLinks = buildTravelLinks(destination);
  const mapQuery = [destination, ...anchorStops.slice(0, 4)].join(" ");
  const planning = buildLocalPlanning(destination, anchorStops, foodStops, theme, placeResearch);

  return {
    provider: "local",
    generatedAt: new Date().toISOString(),
    title: `${destination} Trip From Saved Post`,
    summary: `Built from the saved Instagram title/caption for ${destination}. The app cannot inspect private video frames yet, so this uses the post metadata, caption text, hashtags, and visible travel clues.`,
    destination,
    mapQuery,
    mapUrl: googleMapsUrl(mapQuery),
    mapEmbedUrl: googleMapsEmbedUrl(mapQuery),
    lodgingLinks,
    travelLinks,
    planning,
    days: [
      {
        day: 1,
        title: `Arrive and get oriented in ${destination}`,
        stops: uniqueStrings([destination, ...anchorStops.slice(0, 3)]),
        notes: `Use this first day for arrival, an easy walk, and the most obvious place cues from the post. Trip style: ${theme}.`,
        details: `Travel into ${destination}, check into a nearby stay, and keep the first outing simple. Use the saved post as the anchor: walk the main area, note photo spots, and save dinner for a local seafood or casual restaurant if the post points toward coastal food.`,
        mapQuery: [destination, ...anchorStops.slice(0, 3)].join(" "),
        mapUrl: googleMapsUrl([destination, ...anchorStops.slice(0, 3)].join(" "))
      },
      {
        day: 2,
        title: "Main creator-inspired day",
        stops: uniqueStrings([...anchorStops, ...foodStops]).slice(0, 6),
        notes: `Follow the saved post as the anchor for the day. Prioritize named places, caption clues, and food references such as ${foodStops.join(", ") || "local restaurants or cafes from the post"}.`,
        details: `Make this the fullest day. Start with the most recognizable stop from the creator post, build lunch around ${foodStops[0] || "a local food stop"}, and leave time for nearby shops, beach/coastal views, or a scenic walk. Add more saved posts to turn this into a precise route.`,
        mapQuery: uniqueStrings([...anchorStops, ...foodStops]).join(" "),
        mapUrl: googleMapsUrl(uniqueStrings([...anchorStops, ...foodStops]).join(" "))
      },
      {
        day: 3,
        title: "Flexible add-ons and return",
        stops: uniqueStrings([`${destination} scenic stop`, `${destination} local shops`, "Photo stop", "Return travel"]).slice(0, 5),
        notes: "Keep the last day lighter: one nearby scenic stop, one meal, then travel home. Add more saved posts to make this itinerary more specific.",
        details: `Use the final morning for a relaxed breakfast, one scenic stop, and any missed photos. Keep the map route short so checkout and return travel do not feel rushed.`,
        mapQuery: `${destination} scenic stop local shops`,
        mapUrl: googleMapsUrl(`${destination} scenic stop local shops`)
      }
    ],
    sourceCount: 1
  };
}

function extractPlaceCandidates(item: TravelInspiration) {
  const text = travelText(item);
  const candidates = [
    ...hashtagWords(text),
    ...knownPlaceSignals(text),
    ...(item.location ? [item.location] : [])
  ];
  return uniqueStrings(candidates.map(formatPlaceCandidate).filter(Boolean)).slice(0, 8);
}

function inferDestination(item: TravelInspiration) {
  return item.location?.trim() || inferDestinationFromText(travelText(item));
}

function inferDestinationFromText(text: string) {
  const candidates = uniqueStrings([...knownPlaceSignals(text), ...hashtagWords(text).map(formatPlaceCandidate).filter(Boolean)]);
  const priority = candidates.find((place) => /maine|ogunquit|bar harbor|acadia|portland|cape cod|boston|paris|rome|london|tokyo|hawaii/i.test(place));
  return priority || candidates[0] || null;
}

function inferTripTheme(item: TravelInspiration) {
  const text = travelText(item).toLowerCase();
  const themes = [];
  if (/cozy|small town|charming|new england|fall|autumn/.test(text)) themes.push("cozy small-town getaway");
  if (/beach|coast|ocean|lobster|seafood|harbor/.test(text)) themes.push("coastal food and views");
  if (/roadtrip|road trip|drive/.test(text)) themes.push("road trip");
  if (/family|kid|baby/.test(text)) themes.push("family-friendly");
  return themes.length ? themes.join(", ") : "creator-inspired weekend trip";
}

function extractFoodSignals(item: TravelInspiration) {
  const text = travelText(item).toLowerCase();
  const foods = [
    ["lobsterroll", "Lobster roll"],
    ["lobster roll", "Lobster roll"],
    ["seafood", "Seafood stop"],
    ["coffee", "Coffee shop"],
    ["brunch", "Brunch"],
    ["bakery", "Bakery"]
  ];
  return foods.filter(([needle]) => text.includes(needle)).map(([, label]) => label);
}

function travelText(item: TravelInspiration) {
  return [item.title, item.location, item.notes, item.tags.join(" "), item.url].filter(Boolean).join(" ");
}

function hashtagWords(text: string) {
  return [...text.matchAll(/#([a-z0-9_]+)/gi)].map((match) => match[1]);
}

function knownPlaceSignals(text: string) {
  const signals = [
    ["ogunquit", "Ogunquit"],
    ["visitmaine", "Maine"],
    ["maine", "Maine"],
    ["newengland", "New England"],
    ["new england", "New England"],
    ["barharbor", "Bar Harbor"],
    ["bar harbor", "Bar Harbor"],
    ["acadia", "Acadia National Park"],
    ["portlandmaine", "Portland, Maine"],
    ["portland maine", "Portland, Maine"],
    ["capecod", "Cape Cod"],
    ["cape cod", "Cape Cod"],
    ["boston", "Boston"]
  ];
  const normalized = text.toLowerCase();
  return signals.filter(([needle]) => normalized.includes(needle)).map(([, place]) => place);
}

function formatPlaceCandidate(value: string | null | undefined) {
  const text = value?.replace(/_/g, " ").trim();
  if (!text) return "";
  const mapped = knownPlaceSignals(text)[0];
  if (mapped) return mapped;
  if (/lobster|roll|roadtrip|road trip|usa|travel|trip|reel|instagram|save|visit/i.test(text)) return "";
  return text.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (char) => char.toUpperCase());
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function googleMapsUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function googleMapsEmbedUrl(query: string) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

function buildLodgingLinks(destination: string, research?: TravelPlaceResearch) {
  const encoded = encodeURIComponent(destination);
  const researchedLinks = (research?.lodging || [])
    .filter((place) => place.googleMapsUri || place.websiteUri)
    .slice(0, 3)
    .map((place) => ({
      label: place.name,
      url: place.websiteUri || place.googleMapsUri || googleMapsUrl(`${place.name} ${destination}`)
    }));
  return [
    ...researchedLinks,
    { label: `Hotels near ${destination}`, url: `https://www.google.com/travel/hotels/${encoded}` },
    { label: `Airbnb stays in ${destination}`, url: `https://www.airbnb.com/s/${encoded}/homes` },
    { label: `Family-friendly stays`, url: `https://www.google.com/search?q=${encodeURIComponent(`${destination} family friendly hotel vacation rental`)}` }
  ].slice(0, 6);
}

function buildTravelLinks(destination: string) {
  return [
    { label: `Directions to ${destination}`, url: googleMapsUrl(destination) },
    { label: `Flights and airports`, url: `https://www.google.com/travel/flights/search?tfs=${encodeURIComponent(destination)}` },
    { label: `Road trip planning`, url: `https://www.google.com/search?q=${encodeURIComponent(`best way to travel to ${destination} road trip parking`)}` }
  ];
}

function buildLocalPlanning(destination: string, places: string[], foodStops: string[], theme: string, research?: TravelPlaceResearch): NonNullable<TravelItineraryResult["planning"]> {
  const foodIdea = foodStops[0] || "a local food stop from the creator post";
  const researchedLodging = (research?.lodging || []).slice(0, 3).map((place) => ({
    title: place.name,
    recommendation: `${place.address || destination}${place.rating ? `, rated ${place.rating}/5` : ""}. Use this as a candidate stay and confirm availability, cancellation policy, parking, and final nightly rate before booking.`,
    estimatedCost: place.priceLevel ? priceLevelText(place.priceLevel) : "Check current nightly rates.",
    timing: "Compare for your travel dates.",
    bookingNotes: place.googleMapsUri || place.websiteUri ? "Open the linked listing/maps result to verify current details." : "Search directly before booking."
  }));
  const researchedFoodAndStops = [
    ...(research?.restaurants || []).slice(0, 3),
    ...(research?.activities || []).slice(0, 3)
  ].map((place) => ({
    title: place.name,
    recommendation: `${place.address || destination}${place.rating ? `, rated ${place.rating}/5` : ""}. Add this as a candidate stop and verify hours/reservations before the trip.`,
    estimatedCost: place.priceLevel ? priceLevelText(place.priceLevel) : "Check current menu/ticket pricing.",
    timing: "Place into the route based on opening hours.",
    bookingNotes: place.googleMapsUri || place.websiteUri ? "Use the linked result to check current hours and reviews." : "Verify details before going."
  }));

  return {
    travelOptions: [
      {
        title: `Drive to ${destination}`,
        recommendation: `Best if this is reachable as a regional trip. It gives you flexibility for beach/coastal stops, stroller gear, groceries, and timing around naps or weather.`,
        estimatedCost: "Fuel, tolls, parking, and one flexible meal stop.",
        timing: "Use this for a long weekend or road-trip style visit.",
        bookingNotes: "Check parking near the main area before choosing lodging; a stay with included parking is worth prioritizing."
      },
      {
        title: `Fly near ${destination}`,
        recommendation: `Best if drive time is too long. Fly into the closest practical airport, then rent a car so the saved-post stops are easy to reach.`,
        estimatedCost: "Flights plus rental car; usually higher than driving but faster for longer distances.",
        timing: "Works best for 4+ days so travel time does not dominate the trip.",
        bookingNotes: "Compare nearby airports and choose arrival times that leave enough daylight for check-in."
      },
      {
        title: "Hybrid train or city connection",
        recommendation: `Good if ${destination} is near a larger city or rail corridor. Use public transit for the long leg and a rental/car service for the last stretch.`,
        estimatedCost: "Train or bus fares plus short rental/car-share segments.",
        timing: "Best for adults-only or lighter-packing versions of the trip.",
        bookingNotes: "Only choose this if lodging is walkable to the main stops."
      }
    ],
    lodgingOptions: researchedLodging.length ? researchedLodging : [
      {
        title: `Central stay in ${destination}`,
        recommendation: `Pick a hotel or rental close to the main walkable area so the itinerary feels easy and you can return midday.`,
        estimatedCost: "Usually mid to high depending on season and walkability.",
        timing: "Best for a 2-3 night first visit.",
        bookingNotes: "Filter for parking, kitchenette/fridge, and flexible cancellation."
      },
      {
        title: "Airbnb or vacation rental",
        recommendation: `Best if you want more space, laundry, and easier breakfasts. This works well for a family command-center style trip plan.`,
        estimatedCost: "Can be better value for 3+ nights, but watch cleaning fees.",
        timing: "Best for slower trips or when traveling with family.",
        bookingNotes: "Prioritize recent reviews, driveway/parking clarity, and distance to the main stops."
      },
      {
        title: "Nearby budget base",
        recommendation: `Stay just outside ${destination} if central prices are high, then drive in for the creator-inspired day.`,
        estimatedCost: "Often lower nightly cost but adds parking/drive time.",
        timing: "Best if you are comfortable using the car daily.",
        bookingNotes: "Check parking costs and whether the savings beat the added friction."
      }
    ],
    foodAndStops: researchedFoodAndStops.length ? researchedFoodAndStops : [
      {
        title: foodIdea,
        recommendation: `Make this the anchor meal because it came directly from the saved-post clues. Build the day around it instead of treating it as an afterthought.`,
        estimatedCost: "Casual meal budget unless the post points to a specific upscale spot.",
        timing: "Put it on the main exploration day.",
        bookingNotes: "Search the exact food and destination together before leaving."
      },
      {
        title: places.slice(0, 3).join(", ") || destination,
        recommendation: `Use these as the first map cluster. Keep stops close together so the trip feels polished rather than scattered.`,
        estimatedCost: "Mostly activity, parking, snacks, and meal costs.",
        timing: "Best in the morning through early afternoon.",
        bookingNotes: "Save all stops into a Google Maps list before the trip."
      },
      {
        title: `${destination} scenic buffer`,
        recommendation: `Leave room for one unplanned scenic stop, photo stop, or local shop. Creator-post trips work best with some breathing room.`,
        estimatedCost: "Low cost unless it becomes a shopping stop.",
        timing: "Use as a late afternoon flex block.",
        bookingNotes: "Keep this optional so weather or tiredness does not derail the plan."
      }
    ],
    familyNotes: [
      `Trip theme: ${theme}.`,
      "Keep the first and last days lighter than the main creator-inspired day.",
      "Choose lodging based on parking, walkability, and easy return breaks."
    ],
    packingNotes: [
      "Portable charger and saved offline map area.",
      "Layers for changing weather and comfortable walking shoes.",
      "Small day bag for snacks, water, and quick beach/scenic stops."
    ]
  };
}

function priceLevelText(priceLevel: string) {
  const labels: Record<string, string> = {
    PRICE_LEVEL_FREE: "Free",
    PRICE_LEVEL_INEXPENSIVE: "$",
    PRICE_LEVEL_MODERATE: "$$",
    PRICE_LEVEL_EXPENSIVE: "$$$",
    PRICE_LEVEL_VERY_EXPENSIVE: "$$$$"
  };
  return labels[priceLevel] || "Check current pricing.";
}

function sanitizeLinks(links: TravelItineraryResult["lodgingLinks"], fallback: NonNullable<TravelItineraryResult["lodgingLinks"]>) {
  if (!Array.isArray(links) || !links.length) return fallback;
  return links
    .filter((link) => link?.label && link?.url)
    .map((link) => ({ label: link.label, url: link.url }))
    .slice(0, 6);
}
