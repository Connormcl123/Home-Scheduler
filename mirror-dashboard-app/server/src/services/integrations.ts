import type { ApiIntegrationStatus } from "@mirror-dashboard/shared";
import { config } from "../config.js";
import { getPlaidStatus } from "./plaidProvider.js";
import { getSettings } from "./settings.js";

export async function getIntegrationStatus(): Promise<ApiIntegrationStatus> {
  const [settings, plaid] = await Promise.all([
    getSettings(),
    getPlaidStatus().catch(() => ({ configured: false, itemCount: 0, environment: config.plaid.env, items: [] }))
  ]);

  const calendarFeedCount = settings.calendarFeedUrls.length || (settings.calendarFeedUrl ? 1 : 0);
  const amadeusConfigured = Boolean(config.travelProviders.amadeusClientId && config.travelProviders.amadeusClientSecret);

  return {
    generatedAt: new Date().toISOString(),
    items: [
      {
        key: "openai",
        label: "OpenAI trip planner",
        configured: Boolean(config.openai.apiKey),
        mode: config.openai.apiKey ? "live" : "missing",
        detail: config.openai.apiKey
          ? `Using ${config.openai.model}${config.openai.travelWebSearch ? " with web search enabled" : ""}.`
          : "The itinerary builder will use local fallback text.",
        nextStep: config.openai.apiKey && !config.openai.travelWebSearch
          ? "Set OPENAI_TRAVEL_WEB_SEARCH=true for researched trip packages."
          : undefined
      },
      {
        key: "google-maps",
        label: "Google Places and Maps",
        configured: Boolean(config.google.mapsApiKey),
        mode: config.google.mapsApiKey ? "live" : "missing",
        detail: config.google.mapsApiKey
          ? "Places search can populate restaurants, activities, lodging, ratings, and map links."
          : "Trip planning will use generic map/search links without real place candidates.",
        nextStep: config.google.mapsApiKey ? undefined : "Add GOOGLE_MAPS_API_KEY with Places API (New) enabled."
      },
      {
        key: "plaid",
        label: "Plaid finance sync",
        configured: plaid.configured,
        mode: plaid.configured && plaid.itemCount > 0 ? "live" : plaid.configured ? "partial" : "missing",
        detail: plaid.configured
          ? `${plaid.itemCount} linked item${plaid.itemCount === 1 ? "" : "s"} in ${plaid.environment}.`
          : "Finance tab will use local/demo data until Plaid credentials are present.",
        nextStep: plaid.configured && plaid.itemCount === 0 ? "Use Link Bank in the Finance tab to connect accounts." : undefined
      },
      {
        key: "ical",
        label: "iCal calendar feeds",
        configured: calendarFeedCount > 0,
        mode: calendarFeedCount > 0 ? "live" : "missing",
        detail: calendarFeedCount > 0
          ? `${calendarFeedCount} calendar feed${calendarFeedCount === 1 ? "" : "s"} configured.`
          : "Calendar will show local/demo events until an iCloud or Google iCal feed is added.",
        nextStep: calendarFeedCount > 0 ? undefined : "Add ICAL_FEED_URLS or configure feeds in Settings."
      },
      {
        key: "rss",
        label: "RSS news feeds",
        configured: settings.rssFeeds.length > 0,
        mode: settings.rssFeeds.length > 0 ? "live" : "missing",
        detail: settings.rssFeeds.length > 0
          ? `${settings.rssFeeds.length} RSS feed${settings.rssFeeds.length === 1 ? "" : "s"} configured.`
          : "News will be empty until feeds are added.",
        nextStep: settings.rssFeeds.length > 0 ? undefined : "Add one or more RSS sources in Settings."
      },
      {
        key: "amadeus",
        label: "Flight search provider",
        configured: amadeusConfigured,
        mode: amadeusConfigured ? "partial" : "missing",
        detail: amadeusConfigured
          ? "Credentials are present; flight search adapter can be implemented next."
          : "No flight pricing/search provider is connected yet.",
        nextStep: amadeusConfigured ? "Next build phase: add flight offer search and quote endpoints." : "Add AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET when ready."
      },
      {
        key: "booking",
        label: "Lodging booking provider",
        configured: Boolean(config.travelProviders.bookingProvider),
        mode: config.travelProviders.bookingProvider ? "partial" : "missing",
        detail: config.travelProviders.bookingProvider
          ? `${config.travelProviders.bookingProvider} is selected as the future lodging provider.`
          : "The app can suggest stays, but it cannot quote or book rooms yet.",
        nextStep: config.travelProviders.bookingProvider ? "Next build phase: add lodging quote/search adapter." : "Choose a paid/affiliate lodging API before real booking."
      }
    ]
  };
}
