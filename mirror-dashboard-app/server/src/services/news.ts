import type { NewsArticle } from "@mirror-dashboard/shared";

export async function getNews(): Promise<NewsArticle[]> {
  return mockNews();
}

export async function getNewsProviderStatus() {
  return {
    provider: "mock",
    configured: false,
    message: "Phase 1 uses mock news data. RSS adapters will be added later."
  };
}

function mockNews(): NewsArticle[] {
  return [
    { id: "demo-news-1", title: "Local dashboard ready for the morning", source: "Mock Local", link: "https://example.com", publishedAt: new Date().toISOString() },
    { id: "demo-news-2", title: "Touchscreen command center enters Phase 1 testing", source: "Mock Home", link: "https://example.com", publishedAt: new Date().toISOString() },
    { id: "demo-news-3", title: "Family calendar view planned for next phase", source: "Mock Product", link: "https://example.com", publishedAt: new Date().toISOString() }
  ];
}
