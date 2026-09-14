import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { config } from "./config.js";
import { getDb } from "./db.js";
import { getDashboard } from "./services/dashboard.js";
import { getCalendarEvents, moveCalendarEvent } from "./services/calendar.js";
import { getFinanceSummary } from "./services/finance/index.js";
import { createFinanceWatchlistItem, deleteFinanceWatchlistItem, listFinanceWatchlist, updateFinanceWatchlistItem } from "./services/financeWatchlist.js";
import { createGroceryItem, deleteGroceryItem, listGroceryItems, updateGroceryItem } from "./services/grocery.js";
import { getIntegrationStatus } from "./services/integrations.js";
import { getNews } from "./services/news.js";
import { deleteNoteByDate, getNoteByDate, getTodayNote, listNotes, upsertNote } from "./services/notes.js";
import { createCategoryRule, getPersonalFinanceSummary, listCategoryRules, updateTransactionCategory } from "./services/personalFinance.js";
import { createPlaidLinkToken, exchangePlaidPublicToken, getPlaidStatus, syncAllPlaidItems } from "./services/plaidProvider.js";
import { createRssFeed, deleteRssFeed, listRssFeeds, updateRssFeed } from "./services/rssFeeds.js";
import { getSettings, patchSettings } from "./services/settings.js";
import { createTask, deleteTask, listTasks, updateTask } from "./services/tasks.js";
import { createEnrichedTravelInspiration, deleteTravelInspiration, generateTravelItinerary, listTravelInspirations, updateTravelInspiration } from "./services/travelInspirations.js";
import { todayIso } from "./utils/dates.js";
import { getWeather } from "./services/weather.js";
import { createCalendarEventFromVoice, createTaskFromVoice, VoiceCommandError } from "./services/voiceCommands.js";
import { AssistantError, getAssistantStatus } from "./services/assistant.js";
import { chatInConversation, deleteConversation, getConversation, listConversations } from "./services/assistantHistory.js";
import { generateTravelDeals, listTravelDeals, startTravelDealScheduler } from "./services/travelDeals.js";
import { generateMorningStory, getHomePulse, getMorningStory } from "./services/homeBrief.js";
import { createRecipe, deleteRecipe, generateRecipe, getMealPlan, listRecipes, pushPlanToGrocery, setMeal, suggestWeek } from "./services/recipes.js";
import { createShareDeps } from "./services/share/deps.js";
import { SHARE_IMAGE_DIR } from "./services/share/images.js";
import { handleShare, moveSharedItem, retryShare } from "./services/share/pipeline.js";
import { listShares } from "./services/share/store.js";

const app = express();

app.use(cors());
// Shares carry the whole page the phone downloaded, so this one route takes up
// to 8 MB. It runs first; the global parser then sees the body already parsed.
app.use("/api/share", express.json({ limit: "8mb" }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", async (_req, res) => {
  await getDb();
  res.json({ ok: true, service: "mirror-dashboard", timestamp: new Date().toISOString() });
});

app.get("/api/dashboard", async (_req, res, next) => {
  try {
    res.json(await getDashboard());
  } catch (error) {
    next(error);
  }
});

app.patch("/api/calendar/events/:id", async (req, res, next) => {
  try {
    const { start, end } = req.body || {};
    if (!start) return res.status(400).json({ error: "start is required." });
    if (Number.isNaN(new Date(start).getTime())) return res.status(400).json({ error: "start must be a valid timestamp." });
    await moveCalendarEvent(req.params.id, start, end);
    res.json(await getCalendarEvents());
  } catch (error) {
    next(error);
  }
});

app.get("/api/calendar/events", async (_req, res, next) => {
  try {
    res.json(await getCalendarEvents());
  } catch (error) {
    next(error);
  }
});

app.get("/api/tasks", async (req, res, next) => {
  try {
    const today = req.query.today === "true" ? todayIso() : req.query.today as string | undefined;
    res.json(await listTasks({ today }));
  } catch (error) {
    next(error);
  }
});

app.post("/api/tasks", async (req, res, next) => {
  try {
    if (!req.body?.title?.trim()) return res.status(400).json({ error: "Task title is required." });
    const task = await createTask({
      title: req.body.title.trim(),
      notes: req.body.notes,
      dueDate: req.body.dueDate,
      priority: req.body.priority
    });
    res.status(201).json(task);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/tasks/:id", async (req, res, next) => {
  try {
    const task = await updateTask(Number(req.params.id), req.body);
    if (!task) return res.status(404).json({ error: "Task not found." });
    res.json(task);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/tasks/:id", async (req, res, next) => {
  try {
    await deleteTask(Number(req.params.id));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/notes/today", async (_req, res, next) => {
  try {
    res.json(await getTodayNote());
  } catch (error) {
    next(error);
  }
});

app.get("/api/notes", async (req, res, next) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 30;
    res.json(await listNotes(limit));
  } catch (error) {
    next(error);
  }
});

app.get("/api/notes/:date", async (req, res, next) => {
  try {
    res.json(await getNoteByDate(req.params.date));
  } catch (error) {
    next(error);
  }
});

app.post("/api/notes", async (req, res, next) => {
  try {
    if (!req.body?.date) return res.status(400).json({ error: "Note date is required." });
    res.json(await upsertNote(req.body.date, req.body.body || ""));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/notes/:date", async (req, res, next) => {
  try {
    res.json(await upsertNote(req.params.date, req.body?.body || ""));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/notes/:date", async (req, res, next) => {
  try {
    await deleteNoteByDate(req.params.date);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/weather", async (_req, res, next) => {
  try {
    res.json(await getWeather());
  } catch (error) {
    next(error);
  }
});

app.get("/api/news", async (_req, res, next) => {
  try {
    res.json(await getNews());
  } catch (error) {
    next(error);
  }
});

app.get("/api/finance/summary", async (_req, res, next) => {
  try {
    res.json(await getFinanceSummary());
  } catch (error) {
    next(error);
  }
});

app.get("/api/finance/personal", async (_req, res, next) => {
  try {
    res.json(await getPersonalFinanceSummary());
  } catch (error) {
    next(error);
  }
});

app.get("/api/finance/plaid/status", async (_req, res, next) => {
  try {
    res.json(await getPlaidStatus());
  } catch (error) {
    next(error);
  }
});

app.post("/api/finance/plaid/link-token", async (_req, res, next) => {
  try {
    res.json(await createPlaidLinkToken());
  } catch (error) {
    next(error);
  }
});

app.post("/api/finance/plaid/exchange-public-token", async (req, res, next) => {
  try {
    if (!req.body?.publicToken) return res.status(400).json({ error: "Plaid public token is required." });
    res.status(201).json(await exchangePlaidPublicToken(req.body.publicToken, req.body.institutionName));
  } catch (error) {
    next(error);
  }
});

app.post("/api/finance/plaid/sync", async (_req, res, next) => {
  try {
    res.json(await syncAllPlaidItems({ forceFull: Boolean(_req.body?.forceFull) }));
  } catch (error) {
    next(error);
  }
});

app.get("/api/finance/category-rules", async (_req, res, next) => {
  try {
    res.json(await listCategoryRules());
  } catch (error) {
    next(error);
  }
});

app.post("/api/finance/category-rules", async (req, res, next) => {
  try {
    if (!req.body?.matchText?.trim() || !req.body?.category?.trim()) return res.status(400).json({ error: "Rule match text and category are required." });
    res.status(201).json(await createCategoryRule(req.body));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/finance/transactions/:id/category", async (req, res, next) => {
  try {
    if (!req.body?.category?.trim()) return res.status(400).json({ error: "Category is required." });
    const transaction = await updateTransactionCategory(Number(req.params.id), req.body);
    if (!transaction) return res.status(404).json({ error: "Transaction not found." });
    res.json(transaction);
  } catch (error) {
    next(error);
  }
});

app.get("/api/settings", async (_req, res, next) => {
  try {
    res.json(await getSettings());
  } catch (error) {
    next(error);
  }
});

app.get("/api/integrations/status", async (_req, res, next) => {
  try {
    res.json(await getIntegrationStatus());
  } catch (error) {
    next(error);
  }
});

app.patch("/api/settings", async (req, res, next) => {
  try {
    res.json(await patchSettings(req.body));
  } catch (error) {
    next(error);
  }
});

app.get("/api/rss-feeds", async (_req, res, next) => {
  try {
    res.json(await listRssFeeds());
  } catch (error) {
    next(error);
  }
});

app.post("/api/rss-feeds", async (req, res, next) => {
  try {
    if (!req.body?.url) return res.status(400).json({ error: "RSS feed URL is required." });
    res.status(201).json(await createRssFeed(req.body));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/rss-feeds/:id", async (req, res, next) => {
  try {
    const feed = await updateRssFeed(Number(req.params.id), req.body);
    if (!feed) return res.status(404).json({ error: "RSS feed not found." });
    res.json(feed);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/rss-feeds/:id", async (req, res, next) => {
  try {
    await deleteRssFeed(Number(req.params.id));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/finance/watchlist", async (_req, res, next) => {
  try {
    res.json(await listFinanceWatchlist());
  } catch (error) {
    next(error);
  }
});

app.post("/api/finance/watchlist", async (req, res, next) => {
  try {
    if (!req.body?.symbol?.trim()) return res.status(400).json({ error: "Watchlist symbol is required." });
    res.status(201).json(await createFinanceWatchlistItem(req.body));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/finance/watchlist/:id", async (req, res, next) => {
  try {
    const item = await updateFinanceWatchlistItem(Number(req.params.id), req.body);
    if (!item) return res.status(404).json({ error: "Watchlist item not found." });
    res.json(item);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/finance/watchlist/:id", async (req, res, next) => {
  try {
    await deleteFinanceWatchlistItem(Number(req.params.id));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/grocery", async (req, res, next) => {
  try {
    res.json(await listGroceryItems({ activeOnly: req.query.activeOnly === "true" }));
  } catch (error) {
    next(error);
  }
});

app.post("/api/grocery", async (req, res, next) => {
  try {
    if (!req.body?.name?.trim()) return res.status(400).json({ error: "Grocery item name is required." });
    res.status(201).json(await createGroceryItem(req.body));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/grocery/:id", async (req, res, next) => {
  try {
    const item = await updateGroceryItem(Number(req.params.id), req.body);
    if (!item) return res.status(404).json({ error: "Grocery item not found." });
    res.json(item);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/grocery/:id", async (req, res, next) => {
  try {
    await deleteGroceryItem(Number(req.params.id));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/travel/inspirations", async (_req, res, next) => {
  try {
    res.json(await listTravelInspirations());
  } catch (error) {
    next(error);
  }
});

app.post("/api/travel/inspirations", async (req, res, next) => {
  try {
    const url = firstText(req.body, ["url", "URL", "link", "Link", "postUrl", "Post URL"]);
    if (!url) return res.status(400).json({ error: "Travel inspiration URL is required." });
    res.status(201).json(await createEnrichedTravelInspiration({
      ...req.body,
      url,
      title: firstText(req.body, ["title", "Title", "name", "Name"]) || "Instagram travel idea",
      location: firstText(req.body, ["location", "Location", "place", "Place"]) || req.body?.location,
      notes: firstText(req.body, ["notes", "Notes", "note", "Note"]) || req.body?.notes
    }));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/travel/inspirations/:id", async (req, res, next) => {
  try {
    const item = await updateTravelInspiration(Number(req.params.id), req.body);
    if (!item) return res.status(404).json({ error: "Travel inspiration not found." });
    res.json(item);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/travel/inspirations/:id", async (req, res, next) => {
  try {
    await deleteTravelInspiration(Number(req.params.id));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/travel/itinerary", async (_req, res, next) => {
  try {
    res.json(await generateTravelItinerary());
  } catch (error) {
    next(error);
  }
});

app.post("/api/voice/task", async (req, res, next) => {
  try {
    if (!isVoiceRequestAllowed(req)) return res.status(401).json({ error: "Voice webhook token is required." });
    const task = await createTaskFromVoice(req.body || {});
    res.status(201).json({ ok: true, message: `Added task: ${task.title}`, task });
  } catch (error) {
    next(error);
  }
});

app.post("/api/voice/calendar-event", async (req, res, next) => {
  try {
    if (!isVoiceRequestAllowed(req)) return res.status(401).json({ error: "Voice webhook token is required." });
    const event = await createCalendarEventFromVoice(req.body || {});
    res.status(201).json({ ok: true, message: `Added calendar event: ${event.title}`, event });
  } catch (error) {
    next(error);
  }
});

app.get("/api/recipes", async (_req, res, next) => {
  try {
    res.json(await listRecipes());
  } catch (error) {
    next(error);
  }
});

app.post("/api/recipes", async (req, res, next) => {
  try {
    if (!req.body?.title) return res.status(400).json({ error: "A title is required." });
    res.status(201).json(await createRecipe(req.body));
  } catch (error) {
    next(error);
  }
});

app.post("/api/recipes/generate", async (req, res, next) => {
  try {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    if (!prompt) return res.status(400).json({ error: "Describe the meal you want." });
    res.status(201).json(await generateRecipe(prompt));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/recipes/:id", async (req, res, next) => {
  try {
    await deleteRecipe(Number(req.params.id));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/meal-plan", async (req, res, next) => {
  try {
    res.json(await getMealPlan(typeof req.query.from === "string" ? req.query.from : undefined));
  } catch (error) {
    next(error);
  }
});

app.put("/api/meal-plan/:date", async (req, res, next) => {
  try {
    const recipeId = req.body?.recipeId === null ? null : Number(req.body?.recipeId);
    await setMeal(req.params.date, recipeId === null || Number.isNaN(recipeId) ? null : recipeId);
    res.json(await getMealPlan());
  } catch (error) {
    next(error);
  }
});

app.post("/api/meal-plan/suggest", async (_req, res, next) => {
  try {
    res.json(await suggestWeek());
  } catch (error) {
    next(error);
  }
});

app.post("/api/meal-plan/grocery", async (_req, res, next) => {
  try {
    res.json(await pushPlanToGrocery());
  } catch (error) {
    next(error);
  }
});

app.get("/api/home/pulse", async (req, res, next) => {
  try {
    res.json(await getHomePulse(req.query.force === "1"));
  } catch (error) {
    next(error);
  }
});

app.get("/api/home/story", async (_req, res, next) => {
  try {
    res.json(await getMorningStory());
  } catch (error) {
    next(error);
  }
});

app.post("/api/home/story/refresh", async (_req, res, next) => {
  try {
    res.json(await generateMorningStory());
  } catch (error) {
    next(error);
  }
});

app.get("/api/travel/deals", async (_req, res, next) => {
  try {
    res.json(await listTravelDeals());
  } catch (error) {
    next(error);
  }
});

app.post("/api/travel/deals/refresh", async (_req, res, next) => {
  try {
    res.json(await generateTravelDeals());
  } catch (error) {
    next(error);
  }
});

app.get("/api/assistant/status", (_req, res) => {
  res.json(getAssistantStatus());
});

app.post("/api/assistant/chat", async (req, res, next) => {
  try {
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message) return res.status(400).json({ error: "A message is required." });
    const conversationId = Number.isInteger(req.body?.conversationId) ? Number(req.body.conversationId) : null;
    res.json(await chatInConversation(message, conversationId));
  } catch (error) {
    next(error);
  }
});

app.get("/api/assistant/conversations", async (_req, res, next) => {
  try {
    res.json(await listConversations());
  } catch (error) {
    next(error);
  }
});

app.get("/api/assistant/conversations/:id", async (req, res, next) => {
  try {
    const conversation = await getConversation(Number(req.params.id));
    if (!conversation) return res.status(404).json({ error: "Chat not found." });
    res.json(conversation);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/assistant/conversations/:id", async (req, res, next) => {
  try {
    await deleteConversation(Number(req.params.id));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

const NOTHING_TO_SAVE = "Nothing to save: share a link or some text.";

app.post("/api/share", async (req, res, next) => {
  try {
    const url = firstText(req.body, ["url", "URL", "link", "Link", "postUrl", "Post URL"]) || null;
    const text = firstText(req.body, ["text", "Text"]) || null;
    const html = typeof req.body?.html === "string" ? req.body.html : null;
    if (!url && !text) {
      return res.status(400).json({ status: "failed", kind: null, id: null, title: null, shareId: null, imageUrl: null, message: NOTHING_TO_SAVE });
    }
    res.json(await handleShare({ url, html, text }, createShareDeps()));
  } catch (error) {
    next(error);
  }
});

app.get("/api/share/recent", async (req, res, next) => {
  try {
    const after = Number(req.query.after);
    res.json(await listShares(Number.isInteger(after) && after > 0 ? after : undefined));
  } catch (error) {
    next(error);
  }
});

app.post("/api/share/move", async (req, res, next) => {
  try {
    const { from, to } = req.body ?? {};
    const id = Number(req.body?.id);
    const kinds = ["recipe", "trip"];
    if (!kinds.includes(from) || !kinds.includes(to) || !Number.isInteger(id)) {
      return res.status(400).json({ status: "failed", kind: null, id: null, title: null, shareId: null, imageUrl: null, message: "Say what to move and where: recipe or trip." });
    }
    res.json(await moveSharedItem(from, id, to, createShareDeps()));
  } catch (error) {
    next(error);
  }
});

app.post("/api/share/:id/retry", async (req, res, next) => {
  try {
    res.json(await retryShare(Number(req.params.id), createShareDeps()));
  } catch (error) {
    next(error);
  }
});

// Cover photos saved from shares. fallthrough: false turns a missing file into a 404 instead of the app shell.
// The file type is trusted from the remote server's Content-Type, so nosniff stops the browser guessing another one.
app.use("/media", express.static(SHARE_IMAGE_DIR, { fallthrough: false, maxAge: "30d", setHeaders: (res) => res.set("X-Content-Type-Options", "nosniff") }));

if (fs.existsSync(config.clientDistPath)) {
  app.use(express.static(config.clientDistPath));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    return res.sendFile(path.join(config.clientDistPath, "index.html"));
  });
}

app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // The Shortcut shows `message` as a notification, so a share must never come back without one.
  if (req.path.startsWith("/api/share")) {
    const failure = { status: "failed", kind: null, id: null, title: null, shareId: null, imageUrl: null };
    if (isBodyParserError(error)) {
      const tooBig = error.type === "entity.too.large";
      return res.status(tooBig ? 413 : 400).json({ ...failure, message: tooBig ? "That page was too big to send. Try sharing the link only." : NOTHING_TO_SAVE });
    }
    console.error(error);
    return res.status(500).json({ ...failure, message: "Something went wrong on the Pi saving that share." });
  }
  // Saved photos: a missing file is a plain 404, not a server error.
  if (req.path.startsWith("/media")) {
    const status = error && typeof error === "object" && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    if (status >= 500) console.error(error);
    return res.sendStatus(status);
  }
  if (error instanceof VoiceCommandError) return res.status(error.status).json({ error: error.message });
  if (error instanceof AssistantError) return res.status(error.status).json({ error: error.message });
  console.error(error);
  res.status(500).json({ error: "Unexpected server error." });
});

app.listen(config.port, async () => {
  await getDb();
  startTravelDealScheduler();
  console.log(`Mirror dashboard server listening on http://localhost:${config.port}`);
});

function isVoiceRequestAllowed(req: express.Request) {
  if (!config.voice.webhookToken) return false;
  const authorization = req.get("authorization") || "";
  const headerToken = req.get("x-alexa-token") || "";
  const bearerToken = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7) : "";
  return [headerToken, bearerToken].some((token) => token && token === config.voice.webhookToken);
}

function firstText(body: unknown, keys: string[]) {
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function isBodyParserError(error: unknown): error is { type: string; status: number } {
  return Boolean(
    error && typeof error === "object"
    && typeof (error as { type?: unknown }).type === "string"
    && typeof (error as { status?: unknown }).status === "number"
  );
}
