import crypto from "node:crypto";
import Parser from "rss-parser";
import type { NewsArticle } from "@mirror-dashboard/shared";
import { getSettings } from "./settings.js";

const parser = new Parser();

export async function getNews(): Promise<NewsArticle[]> {
  const settings = await getSettings();
  const results: NewsArticle[] = [];

  for (const feedUrl of settings.rssFeeds.slice(0, 5)) {
    try {
      const feed = await parser.parseURL(feedUrl);
      for (const item of feed.items.slice(0, 5)) {
        const link = item.link || feedUrl;
        results.push({
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

  return results.length ? results.sort((a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || ""))).slice(0, 8) : demoNews();
}

function demoNews(): NewsArticle[] {
  return [
    { id: "demo-news-1", title: "Local dashboard ready for the morning", source: "Demo Feed", link: "https://example.com", publishedAt: new Date().toISOString() },
    { id: "demo-news-2", title: "Touchscreen command center enters testing", source: "Demo Feed", link: "https://example.com", publishedAt: new Date().toISOString() }
  ];
}
