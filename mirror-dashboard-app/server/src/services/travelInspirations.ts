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
          content: "Create concise, family-friendly travel itinerary ideas from user-saved travel inspiration links and notes. Do not claim to have watched private videos; use only the supplied titles, locations, tags, notes, and URLs."
        },
        {
          role: "user",
          content: `Build a practical 3-day itinerary from these saved Instagram inspirations. Return JSON with keys title, summary, and days. Each day needs day, title, stops array, and notes.\n\n${JSON.stringify(inspirations, null, 2)}`
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "travel_itinerary",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["title", "summary", "days"],
            properties: {
              title: { type: "string" },
              summary: { type: "string" },
              days: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["day", "title", "stops", "notes"],
                  properties: {
                    day: { type: "number" },
                    title: { type: "string" },
                    stops: { type: "array", items: { type: "string" } },
                    notes: { type: "string" }
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
  const parsed = JSON.parse(payload.output_text || "{}") as Omit<TravelItineraryResult, "provider" | "generatedAt" | "sourceCount">;
  return {
    provider: "openai",
    generatedAt: new Date().toISOString(),
    title: parsed.title || "Instagram Ideas Itinerary",
    summary: parsed.summary || "Generated from your saved travel inspirations.",
    days: Array.isArray(parsed.days) ? parsed.days : [],
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
  const hashtag = text.match(/#([A-Z][A-Za-z]+(?:Travel|Trip|Beach|City|Italy|France|Spain|Greece|Japan|Mexico|Hawaii|CapeCod|Boston|Paris|Rome|London|Tokyo|Miami|Orlando))/);
  if (hashtag?.[1]) return hashtag[1].replace(/([a-z])([A-Z])/g, "$1 $2");
  return null;
}

function decodeHtml(value: string) {
  return value
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
  const grouped = inspirations.reduce<Record<string, TravelInspiration[]>>((acc, item) => {
    const key = item.location?.trim() || "Saved Places";
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
