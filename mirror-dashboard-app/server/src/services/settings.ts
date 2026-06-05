import type { AppSettings } from "@mirror-dashboard/shared";
import { config } from "../config.js";
import { getDb } from "../db.js";

const keys = {
  calendarFeedUrl: "calendar.feedUrl",
  weatherLatitude: "weather.latitude",
  weatherLongitude: "weather.longitude",
  weatherTimezone: "weather.timezone"
};

async function getSetting(key: string, fallback: string) {
  const db = await getDb();
  const row = await db.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key);
  return row?.value ?? fallback;
}

async function setSetting(key: string, value: string) {
  const db = await getDb();
  await db.run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
}

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb();
  const rssRows = await db.all("SELECT url FROM rss_feeds WHERE enabled = 1 ORDER BY id") as Array<{ url: string }>;
  const watchRows = await db.all("SELECT symbol FROM finance_watchlist WHERE enabled = 1 ORDER BY id") as Array<{ symbol: string }>;

  return {
    calendarFeedUrl: await getSetting(keys.calendarFeedUrl, config.calendar.icalFeedUrl),
    weatherLatitude: await getSetting(keys.weatherLatitude, config.weather.latitude),
    weatherLongitude: await getSetting(keys.weatherLongitude, config.weather.longitude),
    weatherTimezone: await getSetting(keys.weatherTimezone, config.weather.timezone),
    rssFeeds: rssRows.length ? rssRows.map((row) => row.url) : config.rssFeeds,
    financeWatchlist: watchRows.length ? watchRows.map((row) => row.symbol) : config.finance.watchlist
  };
}

export async function patchSettings(input: Partial<AppSettings>) {
  const db = await getDb();
  if (input.calendarFeedUrl !== undefined) await setSetting(keys.calendarFeedUrl, input.calendarFeedUrl);
  if (input.weatherLatitude !== undefined) await setSetting(keys.weatherLatitude, input.weatherLatitude);
  if (input.weatherLongitude !== undefined) await setSetting(keys.weatherLongitude, input.weatherLongitude);
  if (input.weatherTimezone !== undefined) await setSetting(keys.weatherTimezone, input.weatherTimezone);

  if (input.rssFeeds) {
    await db.run("DELETE FROM rss_feeds");
    for (const url of input.rssFeeds) {
      await db.run("INSERT INTO rss_feeds (title, url, enabled) VALUES (?, ?, 1)", new URL(url).hostname, url);
    }
  }

  if (input.financeWatchlist) {
    await db.run("DELETE FROM finance_watchlist");
    for (const symbol of input.financeWatchlist) {
      await db.run("INSERT INTO finance_watchlist (symbol, enabled) VALUES (?, 1)", symbol.toUpperCase());
    }
  }

  return getSettings();
}
