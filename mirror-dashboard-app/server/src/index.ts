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
import { createGroceryItem, deleteAllGroceryItems, deleteGroceryItem, groceryText, listGroceryItems, updateGroceryItem } from "./services/grocery.js";
import { BudgetError, deleteBudget, listBudgets, renameOldCategories, setBudget, updateBudget } from "./services/budgets.js";
import { FINANCE_CATEGORIES } from "./services/finance/categories.js";
import { arrangementsFor } from "./services/trips/arrange.js";
import { commitTrip, deleteTripPlan, listTripPlans, tripByToken } from "./services/trips/commit.js";
import { tripPage } from "./services/trips/page.js";
import { budgetsSpoken, budgetSaidBack } from "./services/voiceCommands.js";
import { getIntegrationStatus } from "./services/integrations.js";
import { getNews } from "./services/news.js";
import { deleteNoteByDate, getNoteByDate, getTodayNote, listNotes, upsertNote } from "./services/notes.js";
import { createCategoryRule, getPersonalFinanceSummary, listCategoryRules, updateTransactionCategory } from "./services/personalFinance.js";
import { createPlaidLinkToken, exchangePlaidPublicToken, getPlaidStatus, plaidErrorMessage, startPlaidSyncScheduler, syncAllPlaidItems } from "./services/plaidProvider.js";
import { createRssFeed, deleteRssFeed, listRssFeeds, updateRssFeed } from "./services/rssFeeds.js";
import { getSettings, patchSettings } from "./services/settings.js";
import { createTask, deleteTask, listTasks, updateTask } from "./services/tasks.js";
import { createEnrichedTravelInspiration, deleteTravelInspiration, generateTravelItinerary, listTravelInspirations, updateTravelInspiration } from "./services/travelInspirations.js";
import { todayIso } from "./utils/dates.js";
import { getWeather } from "./services/weather.js";
import { addGroceriesFromVoice, createCalendarEventFromVoice, createTaskFromVoice, openTasksForVoice, VoiceCommandError } from "./services/voiceCommands.js";
import { AssistantError, getAssistantStatus } from "./services/assistant.js";
import { chatInConversation, deleteConversation, getConversation, listConversations } from "./services/assistantHistory.js";
import { generateTravelDeals, listTravelDeals, startTravelDealScheduler } from "./services/travelDeals.js";
import { generateMorningStory, getHomePulse, getMorningStory } from "./services/homeBrief.js";
import { createRecipe, deleteRecipe, generateRecipe, getMealPlan, listRecipes, pushPlanToGrocery, setMeal, suggestWeek } from "./services/recipes.js";
import { createShareDeps } from "./services/share/deps.js";
import { SHARE_IMAGE_DIR } from "./services/share/images.js";
import { handleShare, moveSharedItem, retryShare } from "./services/share/pipeline.js";
import { listShares } from "./services/share/store.js";
import { createGmailRouteDeps } from "./services/gmail/deps.js";
import { createGmailRouter } from "./services/gmail/routes.js";
import { startPackageChecker } from "./services/packages/checker.js";
import { checkPackagesNow, createCheckerDeps, listPackages } from "./services/packages/deps.js";
import { createPackagesRouter } from "./services/packages/routes.js";
import { hidePackage, listEvents } from "./services/packages/store.js";

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

// Budgets: the wall creates and edits them, Home and Siri read them.
app.get("/api/finance/budgets", async (_req, res, next) => {
  try {
    res.json(await listBudgets());
  } catch (error) {
    next(error);
  }
});

app.get("/api/finance/categories", (_req, res) => {
  res.json({ categories: FINANCE_CATEGORIES });
});

app.post("/api/finance/budgets", async (req, res, next) => {
  try {
    if (!req.body?.category) return res.status(400).json({ error: "A category is required." });
    res.status(201).json(await setBudget({ category: req.body.category, limitAmount: req.body.limitAmount, color: req.body.color }));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/finance/budgets/:id", async (req, res, next) => {
  try {
    const budget = await updateBudget(Number(req.params.id), req.body || {});
    if (!budget) return res.status(404).json({ error: "That budget no longer exists." });
    res.json(budget);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/finance/budgets/:id", async (req, res, next) => {
  try {
    const removed = await deleteBudget(Number(req.params.id));
    if (!removed) return res.status(404).json({ error: "That budget no longer exists." });
    res.status(204).end();
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

// The iPhone "Grocery list" Shortcut texts `message` to the phone.
app.get("/api/grocery/text", async (req, res, next) => {
  try {
    if (!isVoiceRequestAllowed(req)) return res.status(401).json({ error: "Voice webhook token is required." });
    const items = await listGroceryItems({ activeOnly: true });
    res.json({ ok: true, count: items.length, message: groceryText(items, new Date()) });
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

// The Grocery tab's Clear list button, after the wall asks to confirm.
app.delete("/api/grocery", async (_req, res, next) => {
  try {
    res.json({ ok: true, deleted: await deleteAllGroceryItems() });
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

// "Hey Siri, add groceries" - `items` can name several: "milk, eggs and bread".
app.post("/api/voice/grocery", async (req, res, next) => {
  try {
    if (!isVoiceRequestAllowed(req)) return res.status(401).json({ error: "Voice webhook token is required." });
    const result = await addGroceriesFromVoice(req.body || {});
    res.status(201).json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

// "Hey Siri, set my grocery budget to 600".
app.post("/api/voice/budget", async (req, res, next) => {
  try {
    if (!isVoiceRequestAllowed(req)) return res.status(401).json({ error: "Voice webhook token is required." });
    const budget = await setBudget({ category: req.body?.category, limitAmount: req.body?.amount ?? req.body?.limitAmount });
    res.status(201).json({ ok: true, message: budgetSaidBack(budget), budget });
  } catch (error) {
    next(error);
  }
});

// "Hey Siri, how are my budgets" - spoken, so it names only what needs attention.
app.get("/api/voice/budgets", async (req, res, next) => {
  try {
    if (!isVoiceRequestAllowed(req)) return res.status(401).json({ error: "Voice webhook token is required." });
    res.json({ ok: true, message: budgetsSpoken(await listBudgets()) });
  } catch (error) {
    next(error);
  }
});

// Siri reads `message` aloud: open tasks due today or earlier, plus any without a date.
app.get("/api/voice/tasks", async (req, res, next) => {
  try {
    if (!isVoiceRequestAllowed(req)) return res.status(401).json({ error: "Voice webhook token is required." });
    res.json({ ok: true, message: await openTasksForVoice(todayIso()) });
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

// The deep dive behind a trip idea: dates, flights, stays, things to do, and what each costs.
app.get("/api/travel/deals/:id/arrangements", async (req, res, next) => {
  try {
    const deals = await listTravelDeals();
    const deal = deals.deals.find((entry) => entry.id === Number(req.params.id));
    if (!deal) return res.status(404).json({ error: "That trip idea is no longer on the board." });
    res.json(await arrangementsFor(deal, {
      travelers: travelersFrom(req.query),
      weekShift: Number(req.query.weekShift) || 0,
      origin: config.trips.homeAirport,
      refresh: req.query.refresh === "true"
    }));
  } catch (error) {
    next(error);
  }
});

// One tap on the wall: hold the dates, budget the cost, and put the booking links on a phone.
app.post("/api/travel/trips", async (req, res, next) => {
  try {
    const deals = await listTravelDeals();
    const deal = deals.deals.find((entry) => entry.id === Number(req.body?.dealId));
    if (!deal) return res.status(404).json({ error: "That trip idea is no longer on the board." });
    const selection = req.body?.selection;
    if (!selection?.flightId || !selection?.stayId) return res.status(400).json({ error: "Choose a flight and a place to stay first." });
    const arrangements = await arrangementsFor(deal, {
      travelers: travelersFrom(req.body?.travelers ?? {}),
      weekShift: Number(req.body?.weekShift) || 0,
      origin: config.trips.homeAirport
    });
    res.status(201).json(await commitTrip({
      arrangements,
      selection: { flightId: selection.flightId, stayId: selection.stayId, activityIds: Array.isArray(selection.activityIds) ? selection.activityIds : [] },
      holdInCalendar: req.body?.holdInCalendar !== false,
      addToBudget: req.body?.addToBudget !== false
    }));
  } catch (error) {
    next(error);
  }
});

app.get("/api/travel/trips", async (_req, res, next) => {
  try {
    res.json(await listTripPlans());
  } catch (error) {
    next(error);
  }
});

app.delete("/api/travel/trips/:id", async (req, res, next) => {
  try {
    const removed = await deleteTripPlan(Number(req.params.id));
    if (!removed) return res.status(404).json({ error: "That trip is no longer saved." });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// Scanned from the wall. No API shape, just the page a phone books from.
app.get("/trips/:token", async (req, res, next) => {
  try {
    const trip = await tripByToken(req.params.token);
    if (!trip) return res.status(404).type("html").send("<h1>That trip link has expired.</h1>");
    res.type("html").send(tripPage(trip));
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

app.use("/api/packages", createPackagesRouter({ list: listPackages, events: listEvents, checkNow: checkPackagesNow, hide: hidePackage }));

// Gmail sign-in pages. Loopback only: the Pi itself or the SSH tunnel (docs/gmail-setup.md).
// A new sign-in reads mail straight away rather than waiting for the next check.
app.use("/gmail", createGmailRouter(createGmailRouteDeps(() => {
  checkPackagesNow().catch((error) => console.error("Package check failed:", error instanceof Error ? error.message : error));
})));

if (fs.existsSync(config.clientDistPath)) {
  app.use(express.static(config.clientDistPath));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    return res.sendFile(path.join(config.clientDistPath, "index.html"));
  });
}

app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Plaid's own reason names what to fix, so pass it through on the finance routes.
  if (req.path.startsWith("/api/finance/plaid")) {
    const message = plaidErrorMessage(error);
    if (message) return res.status(400).json({ error: message });
  }

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
  if (error instanceof BudgetError) return res.status(error.status).json({ error: error.message });
  if (error instanceof VoiceCommandError) return res.status(error.status).json({ error: error.message });
  if (error instanceof AssistantError) return res.status(error.status).json({ error: error.message });
  console.error(error);
  res.status(500).json({ error: "Unexpected server error." });
});

app.listen(config.port, async () => {
  await getDb();
  startTravelDealScheduler();
  startPackageChecker(createCheckerDeps, config.packages.checkMinutes);
  startPlaidSyncScheduler(config.plaid.syncMinutes);
  renameOldCategories().catch((error) => console.error("Category rename failed:", error));
  console.log(`Mirror dashboard server listening on http://localhost:${config.port}`);
});

function isVoiceRequestAllowed(req: express.Request) {
  if (!config.voice.webhookToken) return false;
  const authorization = req.get("authorization") || "";
  const headerToken = req.get("x-alexa-token") || "";
  const bearerToken = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7) : "";
  return [headerToken, bearerToken].some((token) => token && token === config.voice.webhookToken);
}

/** Who is going: the wall remembers the family, and the defaults suit this house. */
function travelersFrom(source: Record<string, unknown>) {
  const count = (value: unknown, fallback: number) => {
    const number = Math.round(Number(value));
    return Number.isFinite(number) && number >= 0 && number <= 12 ? number : fallback;
  };
  return { adults: Math.max(1, count(source.adults, 2)), children: count(source.children, 2) };
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
