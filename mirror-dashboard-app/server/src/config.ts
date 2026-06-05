import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");
const appRoot = path.resolve(serverRoot, "..");

export const config = {
  port: Number(process.env.PORT || 4174),
  databasePath: path.resolve(appRoot, process.env.DATABASE_PATH || "./data/mirror-dashboard.sqlite"),
  clientDistPath: path.resolve(appRoot, process.env.CLIENT_DIST_PATH || "./client/dist"),
  weather: {
    latitude: process.env.WEATHER_LATITUDE || "40.4406",
    longitude: process.env.WEATHER_LONGITUDE || "-79.9959",
    timezone: process.env.WEATHER_TIMEZONE || "America/New_York"
  },
  calendar: {
    icalFeedUrl: process.env.ICAL_FEED_URL || ""
  },
  rssFeeds: (process.env.DEFAULT_RSS_FEEDS || "https://feeds.npr.org/1001/rss.xml").split(",").map((feed) => feed.trim()).filter(Boolean),
  finance: {
    provider: process.env.FINANCE_PROVIDER || "mock",
    watchlist: (process.env.FINANCE_WATCHLIST || "AAPL,MSFT,SPY,QQQ").split(",").map((symbol) => symbol.trim()).filter(Boolean)
  }
};
