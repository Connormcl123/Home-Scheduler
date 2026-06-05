import crypto from "node:crypto";
import Parser from "rss-parser";
import type { NewsArticle } from "@mirror-dashboard/shared";
import { getSettings } from "./settings.js";

const parser = new Parser();

export async function getNews(): Promise<NewsArticle[]> {
  const settings = await getSettings();
  const articles: NewsArticle[] = [];

  for (const feedUrl of settings.rssFeeds.slice(0, 6)) {
    try {
      const feed = await parser.parseURL(feedUrl);
      for (const item of feed.items.slice(0, 5)) {
        const link = item.link || feedUrl;
        articles.push({
          id: crypto.createHash("sha1").update(link).digest("hex"),
          title: item.title || "Untitled article",
          source: feed.title || new URL(feedUrl).hostname,
          link,
          publishedAt: item.isoDate || item.pubDate
        });
      }
    } catch (error) {
      console.warn(`RSS feed unavailable (${feedUrl}):`, error);
    }
  }

  return articles.length ? articles.sort((a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || ""))).slice(0, 8) : mockNews();
}

export async function getNewsProviderStatus() {
  const settings = await getSettings();
  return {
    provider: "rss",
    configured: settings.rssFeeds.length > 0,
    message: "RSS reader enabled with mock fallback."
  };
}

function mockNews(): NewsArticle[] {
  return [
    { id: "demo-news-1", title: "Local dashboard ready for the morning", source: "Mock Local", link: "https://example.com", publishedAt: new Date().toISOString() },
    { id: "demo-news-2", title: "Touchscreen command center provider fallbacks are ready", source: "Mock Home", link: "https://example.com", publishedAt: new Date().toISOString() },
    { id: "demo-news-3", title: "Family calendar view planned for next phase", source: "Mock Product", link: "https://example.com", publishedAt: new Date().toISOString() }
  ];
}
