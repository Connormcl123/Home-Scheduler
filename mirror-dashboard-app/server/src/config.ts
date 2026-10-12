import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");
const appRoot = path.resolve(serverRoot, "..");
const calendarFeedUrls = [
  ...(process.env.ICAL_FEED_URLS || "").split(","),
  process.env.ICAL_FEED_URL || ""
].map((feed) => feed.trim()).filter(Boolean);

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
    icalFeedUrl: process.env.ICAL_FEED_URL || "",
    icalFeedUrls: calendarFeedUrls
  },
  rssFeeds: (process.env.DEFAULT_RSS_FEEDS || "https://feeds.npr.org/1001/rss.xml").split(",").map((feed) => feed.trim()).filter(Boolean),
  finance: {
    provider: process.env.FINANCE_PROVIDER || "mock",
    watchlist: (process.env.FINANCE_WATCHLIST || "AAPL,MSFT,SPY,QQQ").split(",").map((symbol) => symbol.trim()).filter(Boolean)
  },
  plaid: {
    clientId: process.env.PLAID_CLIENT_ID || "",
    secret: process.env.PLAID_SECRET || "",
    env: process.env.PLAID_ENV || "sandbox",
    clientName: process.env.PLAID_CLIENT_NAME || "Home Scheduler",
    products: (process.env.PLAID_PRODUCTS || "transactions").split(",").map((product) => product.trim()).filter(Boolean),
    countryCodes: (process.env.PLAID_COUNTRY_CODES || "US").split(",").map((country) => country.trim()).filter(Boolean),
    userId: process.env.PLAID_USER_ID || "home-scheduler-local-user",
    // Banks post transactions a few times a day; hourly at most.
    syncMinutes: Math.max(60, Number(process.env.PLAID_SYNC_MINUTES) || 360)
  },
  google: {
    mapsApiKey: process.env.GOOGLE_MAPS_API_KEY || ""
  },
  gmail: {
    clientId: process.env.GMAIL_CLIENT_ID || "",
    clientSecret: process.env.GMAIL_CLIENT_SECRET || ""
  },
  packages: {
    // Never more often than every 5 minutes: each check is a Gmail search.
    checkMinutes: Math.max(5, Number(process.env.PACKAGES_CHECK_MINUTES) || 10)
  },
  screensaver: {
    /** Minutes without a touch before the wall shows photos. */
    idleMinutes: Math.max(1, Number(process.env.SCREENSAVER_IDLE_MINUTES) || 5),
    /** How long each photo stays up when there are several. */
    slideSeconds: Math.max(10, Number(process.env.SCREENSAVER_SLIDE_SECONDS) || 60)
  },
  trips: {
    /** Flights are priced from here; PBI is the family's airport. */
    homeAirport: process.env.HOME_AIRPORT || "PBI",
    /** Where a scanned trip page opens: the Pi's tailnet address, so it works away from home. */
    publicBase: process.env.TRIPS_PUBLIC_BASE || "http://100.81.206.101:4174"
  },
  travelProviders: {
    amadeusClientId: process.env.AMADEUS_CLIENT_ID || "",
    amadeusClientSecret: process.env.AMADEUS_CLIENT_SECRET || "",
    bookingProvider: process.env.TRAVEL_BOOKING_PROVIDER || ""
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    travelWebSearch: process.env.OPENAI_TRAVEL_WEB_SEARCH === "true"
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5",
    effort: process.env.ANTHROPIC_EFFORT || "low"
  },
  travelDeals: {
    dailyAt: process.env.TRAVEL_DEALS_DAILY_AT || "05:00"
  },
  voice: {
    webhookToken: process.env.ALEXA_WEBHOOK_TOKEN || ""
  }
};
