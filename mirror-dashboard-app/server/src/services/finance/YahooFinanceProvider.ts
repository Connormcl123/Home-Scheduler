import type { FinanceQuote } from "@mirror-dashboard/shared";
import type { FinanceProvider } from "./FinanceProvider.js";

/**
 * Talks to Yahoo's public chart endpoint directly rather than going through
 * yahoo-finance2. That library is unmaintained, its default export has an
 * inconsistent shape across builds, and its quote() path needs a cookie/crumb
 * handshake that the Pi was getting 429ed on for every symbol. The chart
 * endpoint needs no handshake, and it returns a price series as well as the
 * current price, so the dashboard can draw a sparkline instead of a bare number.
 */
const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

type ChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        shortName?: string;
        longName?: string;
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
      };
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
    error?: unknown;
  };
};

export class YahooFinanceProvider implements FinanceProvider {
  readonly name = "yahoo-chart";

  async getQuotes(symbols: string[]): Promise<FinanceQuote[]> {
    const unique = Array.from(new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)));
    return Promise.all(unique.map((symbol) => this.getQuote(symbol)));
  }

  private async getQuote(symbol: string): Promise<FinanceQuote> {
    const empty: FinanceQuote = { symbol, name: symbol, price: null, change: null, changePercent: null };
    try {
      const url = `${CHART_URL}/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
      const response = await fetch(url, {
        // Yahoo rejects the default undici agent string.
        headers: { "User-Agent": "Mozilla/5.0 (compatible; MirrorDashboard/1.0)" },
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) throw new Error(`chart request failed: ${response.status}`);

      const payload = (await response.json()) as ChartResponse;
      const result = payload.chart?.result?.[0];
      const meta = result?.meta;
      if (!meta || typeof meta.regularMarketPrice !== "number") throw new Error("no price in chart response");

      const closes = (result?.indicators?.quote?.[0]?.close || []).filter(
        (value): value is number => typeof value === "number"
      );
      const previous = meta.chartPreviousClose ?? meta.previousClose ?? closes[closes.length - 2] ?? null;
      const price = meta.regularMarketPrice;
      const change = previous === null ? null : price - previous;

      return {
        symbol,
        name: meta.shortName || meta.longName || symbol,
        price,
        change,
        changePercent: previous ? (change! / previous) * 100 : null,
        // Trimmed to a month so the payload stays small on a Pi.
        spark: closes.slice(-30)
      };
    } catch (error) {
      console.warn(`Finance quote unavailable for ${symbol}:`, error instanceof Error ? error.message : error);
      return empty;
    }
  }
}
