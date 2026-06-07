import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { config } from "./config.js";
import { getDb } from "./db.js";
import { getDashboard } from "./services/dashboard.js";
import { getCalendarEvents } from "./services/calendar.js";
import { getFinanceSummary } from "./services/finance/index.js";
import { createFinanceWatchlistItem, deleteFinanceWatchlistItem, listFinanceWatchlist, updateFinanceWatchlistItem } from "./services/financeWatchlist.js";
import { createGroceryItem, deleteGroceryItem, listGroceryItems, updateGroceryItem } from "./services/grocery.js";
import { getNews } from "./services/news.js";
import { deleteNoteByDate, getNoteByDate, getTodayNote, listNotes, upsertNote } from "./services/notes.js";
import { createCategoryRule, getPersonalFinanceSummary, listCategoryRules, updateTransactionCategory } from "./services/personalFinance.js";
import { createPlaidLinkToken, exchangePlaidPublicToken, getPlaidStatus, syncAllPlaidItems } from "./services/plaidProvider.js";
import { createRssFeed, deleteRssFeed, listRssFeeds, updateRssFeed } from "./services/rssFeeds.js";
import { getSettings, patchSettings } from "./services/settings.js";
import { createTask, deleteTask, listTasks, updateTask } from "./services/tasks.js";
import { todayIso } from "./utils/dates.js";
import { getWeather } from "./services/weather.js";

const app = express();

app.use(cors());
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
    res.json(await syncAllPlaidItems());
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

if (fs.existsSync(config.clientDistPath)) {
  app.use(express.static(config.clientDistPath));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    return res.sendFile(path.join(config.clientDistPath, "index.html"));
  });
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "Unexpected server error." });
});

app.listen(config.port, async () => {
  await getDb();
  console.log(`Mirror dashboard server listening on http://localhost:${config.port}`);
});
