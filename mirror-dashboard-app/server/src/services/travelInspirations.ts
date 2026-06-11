import type { TravelInspiration, TravelItineraryResult } from "@mirror-dashboard/shared";
import { config } from "../config.js";
import { getDb } from "../db.js";

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
      input: [
        {
          role: "system",
          content: "Create concise, family-friendly travel itineraries from saved Instagram travel posts. Treat the title, caption/notes, hashtags, URL metadata, and inferredPlaces as the source material. Identify the place or places being discussed, then build a realistic trip itinerary to visit them. Do not claim to have watched private video content. If the video itself is not accessible, say the plan is based on the post metadata/caption."
        },
        {
          role: "user",
          content: `Build a practical 3-day itinerary from these saved Instagram inspirations. For one saved item, focus the whole itinerary on that post's destination. Return JSON with keys title, summary, destination, mapQuery, lodgingLinks, travelLinks, and days. Each day needs day, title, stops array, notes, details, and mapQuery. lodgingLinks and travelLinks should each be arrays of { label, url }. Use direct Google Maps, Google Hotels, Airbnb search, and Google Flights/search URLs when helpful. Include travel context such as the destination, best-fit trip style, food/landmark ideas from the caption, and how to structure the visit.\n\n${JSON.stringify(travelSignals, null, 2)}`
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "travel_itinerary",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["title", "summary", "destination", "mapQuery", "lodgingLinks", "travelLinks", "days"],
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
  const destination = parsed.destination || parsed.mapQuery || inferDestination(inspirations[0]) || "Saved Destination";
  const mapQuery = parsed.mapQuery || destination;
  return {
    provider: "openai",
    generatedAt: new Date().toISOString(),
    title: parsed.title || "Instagram Ideas Itinerary",
    summary: parsed.summary || "Generated from your saved travel inspirations.",
    destination,
    mapQuery,
    mapUrl: googleMapsUrl(mapQuery),
    mapEmbedUrl: googleMapsEmbedUrl(mapQuery),
    lodgingLinks: sanitizeLinks(parsed.lodgingLinks, buildLodgingLinks(destination)),
    travelLinks: sanitizeLinks(parsed.travelLinks, buildTravelLinks(destination)),
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

function generateLocalItinerary(inspirations: TravelInspiration[]): TravelItineraryResult {
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

function generateSingleInspirationItinerary(item: TravelInspiration): TravelItineraryResult {
  const destination = item.location?.trim() || inferDestination(item) || "Saved Destination";
  const places = extractPlaceCandidates(item);
  const theme = inferTripTheme(item);
  const anchorStops = places.length ? places : [destination];
  const foodStops = extractFoodSignals(item);
  const lodgingLinks = buildLodgingLinks(destination);
  const travelLinks = buildTravelLinks(destination);
  const mapQuery = [destination, ...anchorStops.slice(0, 4)].join(" ");

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

function buildLodgingLinks(destination: string) {
  const encoded = encodeURIComponent(destination);
  return [
    { label: `Hotels near ${destination}`, url: `https://www.google.com/travel/hotels/${encoded}` },
    { label: `Airbnb stays in ${destination}`, url: `https://www.airbnb.com/s/${encoded}/homes` },
    { label: `Family-friendly stays`, url: `https://www.google.com/search?q=${encodeURIComponent(`${destination} family friendly hotel vacation rental`)}` }
  ];
}

function buildTravelLinks(destination: string) {
  return [
    { label: `Directions to ${destination}`, url: googleMapsUrl(destination) },
    { label: `Flights and airports`, url: `https://www.google.com/travel/flights/search?tfs=${encodeURIComponent(destination)}` },
    { label: `Road trip planning`, url: `https://www.google.com/search?q=${encodeURIComponent(`best way to travel to ${destination} road trip parking`)}` }
  ];
}

function sanitizeLinks(links: TravelItineraryResult["lodgingLinks"], fallback: NonNullable<TravelItineraryResult["lodgingLinks"]>) {
  if (!Array.isArray(links) || !links.length) return fallback;
  return links
    .filter((link) => link?.label && link?.url)
    .map((link) => ({ label: link.label, url: link.url }))
    .slice(0, 6);
}
