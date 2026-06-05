import yahooFinance from "yahoo-finance2";
import type { FinanceQuote } from "@mirror-dashboard/shared";
import type { FinanceProvider } from "./FinanceProvider.js";

export class YahooFinanceProvider implements FinanceProvider {
  readonly name = "yahoo-test";

  async getQuotes(symbols: string[]): Promise<FinanceQuote[]> {
    const unique = Array.from(new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)));
    const quotes = await Promise.all(unique.map((symbol) => this.getQuote(symbol)));
    return quotes;
  }

  private async getQuote(symbol: string): Promise<FinanceQuote> {
    try {
      const quote: any = await yahooFinance.quote(symbol);
      return {
        symbol,
        name: quote.shortName || quote.longName || symbol,
        price: quote.regularMarketPrice ?? null,
        change: quote.regularMarketChange ?? null,
        changePercent: quote.regularMarketChangePercent ?? null
      };
    } catch (error) {
      console.warn(`Finance quote unavailable for ${symbol}:`, error);
      return { symbol, name: symbol, price: null, change: null, changePercent: null };
    }
  }
}
