import Anthropic from "@anthropic-ai/sdk";
import type { HomeCard, HomePulse, MorningStory, StorySlide } from "@mirror-dashboard/shared";
import { config } from "../config.js";
import { getDb } from "../db.js";
import { getCalendarEvents } from "./calendar.js";
import { listGroceryItems } from "./grocery.js";
import { getNews } from "./news.js";
import { getNoteByDate } from "./notes.js";
import { listTasks } from "./tasks.js";
import { getWeather } from "./weather.js";
import { listTravelDeals } from "./travelDeals.js";
import { todayIso } from "../utils/dates.js";

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: config.anthropic.apiKey });
  return client;
}

/** Everything the model needs to judge what matters, gathered once. */
async function collectContext() {
  const now = new Date();
  const [events, tasks, grocery, weather, news, note, deals] = await Promise.all([
    getCalendarEvents().catch(() => []),
    listTasks().catch(() => []),
    listGroceryItems({ activeOnly: true }).catch(() => []),
    getWeather().catch(() => null),
    getNews().catch(() => []),
    getNoteByDate(todayIso()).catch(() => null),
    listTravelDeals().catch(() => ({ deals: [] as Awaited<ReturnType<typeof listTravelDeals>>["deals"] }))
  ]);

  const upcoming = events
    .filter((event) => new Date(event.start).getTime() >= now.getTime() - 30 * 60 * 1000)
    .slice(0, 8);
  const openTasks = tasks.filter((task) => !task.completed).slice(0, 10);

  return { now, events: upcoming, tasks: openTasks, grocery, weather, news, note, deal: deals.deals[0] || null };
}

function describeContext(ctx: Awaited<ReturnType<typeof collectContext>>) {
  const time = ctx.now.toLocaleString("en-US", {
    weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit"
  });
  return [
    `It is ${time}.`,
    "",
    "Upcoming events:",
    ctx.events.map((event) => `- ${new Date(event.start).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })} ${event.title}`).join("\n") || "- none",
    "",
    "Open tasks:",
    ctx.tasks.map((task) => `- ${task.title}${task.dueDate ? ` (due ${task.dueDate})` : ""} [${task.priority}]`).join("\n") || "- none",
    "",
    "Grocery items running low or out:",
    ctx.grocery.map((item) => `- ${item.name} (${item.status})`).join("\n") || "- none",
    "",
    ctx.weather
      ? `Weather: ${ctx.weather.current.temperature} degrees, ${ctx.weather.current.description}. Today ${ctx.weather.daily[0]?.high}/${ctx.weather.daily[0]?.low}.`
      : "Weather unavailable.",
    "",
    "Headlines:",
    ctx.news.slice(0, 5).map((article) => `- ${article.title} (${article.source})`).join("\n") || "- none",
    "",
    ctx.note ? `Today's note: ${ctx.note.body}` : "No note today.",
    ctx.deal ? `Trip idea of the day: ${ctx.deal.destination} - ${ctx.deal.headline}` : ""
  ].join("\n");
}

const PULSE_SCHEMA = {
  type: "object",
  properties: {
    headline: {
      type: "string",
      description: "One sentence naming the single most useful thing to know right now, readable from across a room. No greeting, no preamble."
    },
    cards: {
      type: "array",
      description: "Between three and six cards, most important first.",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["event", "task", "grocery", "weather", "news", "note", "travel", "finance"] },
          title: { type: "string", description: "Four to seven words." },
          detail: { type: "string", description: "One short supporting line." },
          bullets: {
            type: "array",
            items: { type: "string" },
            description: "Two or three very short supporting facts - names, times, amounts. These fill out the card, so prefer concrete specifics over restating the title."
          },
          urgency: { type: "string", enum: ["now", "soon", "later"] }
        },
        required: ["kind", "title", "detail", "bullets", "urgency"],
        additionalProperties: false
      }
    }
  },
  required: ["headline", "cards"],
  additionalProperties: false
} as const;

// The model call is the slow part, so hold the result briefly. The dashboard
// polls every five minutes and ranking does not meaningfully change that fast.
let pulseCache: { at: number; value: HomePulse } | null = null;
const PULSE_TTL_MS = 25 * 60 * 1000;

/** Ranking that works with no API key, and catches a model failure. */
function fallbackPulse(ctx: Awaited<ReturnType<typeof collectContext>>): HomePulse {
  const cards: HomeCard[] = [];
  const next = ctx.events[0];
  if (next) {
    cards.push({
      kind: "event",
      title: next.title,
      detail: new Date(next.start).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }),
      bullets: ctx.events.slice(1, 3).map((event) => `${new Date(event.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} ${event.title}`),
      urgency: "soon"
    });
  }
  const urgent = ctx.tasks.find((task) => task.priority === "high") || ctx.tasks[0];
  if (urgent) {
    cards.push({
      kind: "task",
      title: urgent.title,
      detail: urgent.dueDate ? `Due ${urgent.dueDate}` : "No due date",
      bullets: ctx.tasks.slice(1, 4).map((task) => task.title),
      urgency: "soon"
    });
  }
  const out = ctx.grocery.find((item) => item.status === "out");
  if (out) {
    cards.push({
      kind: "grocery",
      title: `${out.name} is out`,
      detail: "Add it to the run",
      bullets: ctx.grocery.slice(0, 3).map((item) => `${item.name} - ${item.status}`),
      urgency: "soon"
    });
  }
  if (ctx.news[0]) {
    cards.push({
      kind: "news",
      title: ctx.news[0].title,
      detail: ctx.news[0].source,
      bullets: ctx.news.slice(1, 3).map((article) => article.title),
      urgency: "later",
      imageUrl: ctx.news[0].imageUrl || null
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    headline: next
      ? `Next up: ${next.title} at ${new Date(next.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.`
      : "Nothing scheduled right now.",
    cards,
    source: "local"
  };
}

/** Attaches real imagery and live data to whatever the model chose to surface. */
function decorate(cards: HomeCard[], ctx: Awaited<ReturnType<typeof collectContext>>): HomeCard[] {
  return cards.map((card) => {
    if (card.kind === "news") {
      const match = ctx.news.find((article) => article.title.toLowerCase().includes(card.title.toLowerCase().slice(0, 20)))
        || ctx.news[0];
      return { ...card, imageUrl: match?.imageUrl || null, link: match?.link };
    }
    if (card.kind === "travel" && ctx.deal) {
      return { ...card, imageUrl: ctx.deal.imageUrl || null };
    }
    if (card.kind === "event") {
      const match = ctx.events.find((event) => event.title.toLowerCase() === card.title.toLowerCase()) || ctx.events[0];
      return { ...card, startsAt: match?.start };
    }
    return card;
  });
}

export async function getHomePulse(force = false): Promise<HomePulse> {
  if (!force && pulseCache && Date.now() - pulseCache.at < PULSE_TTL_MS) return pulseCache.value;

  const ctx = await collectContext();
  if (!config.anthropic.apiKey) return fallbackPulse(ctx);

  try {
    const response = await getClient().messages.create({
      model: config.anthropic.model,
      max_tokens: 1500,
      output_config: { format: { type: "json_schema", schema: PULSE_SCHEMA } },
      system:
        "You choose what a family sees on their kitchen wall display. Rank by what is genuinely useful in the next few hours, " +
        "not by category. Something happening soon beats something interesting. Be concrete and specific; never pad with filler. " +
        "Unless something genuinely urgent crowds it out, include one news card and one travel card - those carry photographs, " +
        "and a wall of text-only cards is hard to read at a glance.",
      messages: [{ role: "user", content: describeContext(ctx) }]
    });

    const text = response.content.find((block): block is Anthropic.TextBlock => block.type === "text")?.text;
    if (!text) throw new Error("empty pulse");
    const parsed = JSON.parse(text) as { headline: string; cards: HomeCard[] };

    const value: HomePulse = {
      generatedAt: new Date().toISOString(),
      headline: parsed.headline,
      cards: decorate(parsed.cards || [], ctx),
      source: "ai"
    };
    pulseCache = { at: Date.now(), value };
    return value;
  } catch (error) {
    console.warn("Home pulse fell back to local ranking:", error instanceof Error ? error.message : error);
    return fallbackPulse(ctx);
  }
}

const STORY_SCHEMA = {
  type: "object",
  properties: {
    slides: {
      type: "array",
      description: "One entry per requested slide kind, in the order given.",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["greeting", "weather", "schedule", "tasks", "news", "travel", "closing"] },
          title: { type: "string", description: "Under six words. This is set very large." },
          lines: {
            type: "array",
            items: { type: "string" },
            description: "One to four short lines. Each reads on its own from across the room."
          }
        },
        required: ["kind", "title", "lines"],
        additionalProperties: false
      }
    }
  },
  required: ["slides"],
  additionalProperties: false
} as const;

export async function getMorningStory(): Promise<MorningStory | null> {
  const db = await getDb();
  const row = await db.get<{ for_date: string; slides: string; created_at: string }>(
    "SELECT for_date, slides, created_at FROM daily_briefs ORDER BY for_date DESC LIMIT 1"
  );
  if (!row) return null;
  try {
    return { forDate: row.for_date, slides: JSON.parse(row.slides) as StorySlide[], createdAt: row.created_at };
  } catch {
    return null;
  }
}

/**
 * Written once each morning by the scheduler rather than on open, so the story
 * plays instantly when someone walks up instead of waiting on the model.
 */
export async function generateMorningStory(forDate = todayIso()): Promise<MorningStory | null> {
  if (!config.anthropic.apiKey) return null;

  const ctx = await collectContext();
  const kinds = ["greeting", "weather", "schedule", "tasks", "news", "travel", "closing"];

  const response = await getClient().messages.create({
    model: config.anthropic.model,
    max_tokens: 2000,
    output_config: { format: { type: "json_schema", schema: STORY_SCHEMA } },
    system:
      "You write a short morning briefing for a family, shown as full-screen cards on a kitchen wall display. " +
      "Warm but not saccharine, and specific rather than generic - name the actual event, the actual errand. " +
      "Every line must be readable at a glance from across the room, so keep them short. No emoji.",
    messages: [{
      role: "user",
      content: `${describeContext(ctx)}\n\nWrite one slide for each of these, in order: ${kinds.join(", ")}. ` +
        "Skip nothing, but if a section has no content say so briefly and pleasantly rather than inventing any."
    }]
  });

  const text = response.content.find((block): block is Anthropic.TextBlock => block.type === "text")?.text;
  if (!text) return null;
  const parsed = JSON.parse(text) as { slides: StorySlide[] };

  // Imagery comes from real data, not from the model.
  const slides: StorySlide[] = (parsed.slides || []).map((slide) => {
    if (slide.kind === "news") return { ...slide, imageUrl: ctx.news.find((a) => a.imageUrl)?.imageUrl || null };
    if (slide.kind === "travel") return { ...slide, imageUrl: ctx.deal?.imageUrl || null };
    return { ...slide, imageUrl: null };
  });

  const db = await getDb();
  await db.run("DELETE FROM daily_briefs WHERE for_date = ?", forDate);
  await db.run("INSERT INTO daily_briefs (for_date, slides) VALUES (?, ?)", forDate, JSON.stringify(slides));
  await db.run("DELETE FROM daily_briefs WHERE for_date NOT IN (SELECT for_date FROM daily_briefs ORDER BY for_date DESC LIMIT 5)");

  // A new morning invalidates yesterday's ranking.
  pulseCache = null;
  return { forDate, slides, createdAt: new Date().toISOString() };
}
