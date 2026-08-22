import yahooFinanceDefault from "yahoo-finance2";
import type { FinanceQuote } from "@mirror-dashboard/shared";
import type { FinanceProvider } from "./FinanceProvider.js";

/**
 * yahoo-finance2's default export is not the same shape everywhere: some builds
 * hand back a ready-made instance with .quote on it, others hand back the
 * YahooFinance class itself and expect you to construct it. The Pi and the dev
 * machine landed on different ones, which is why every quote came back null
 * with "yahoo.quote is not a function". Normalise instead of assuming.
 */
function resolveClient(): { quote(symbol: string): Promise<any> } | null {
  const mod = yahooFinanceDefault as any;
  if (typeof mod?.quote === "function") return mod;
  if (typeof mod?.default?.quote === "function") return mod.default;
  if (typeof mod === "function") {
    try {
      const instance = new mod();
      if (typeof instance?.quote === "function") return instance;
    } catch {
      // fall through to the null case below
    }
  }
  return null;
}

let client: ReturnType<typeof resolveClient> | undefined;
function getClient() {
  if (client === undefined) {
    client = resolveClient();
    if (!client) console.warn("yahoo-finance2 exposed no usable quote(); market data will be blank.");
  }
  return client;
}

export class YahooFinanceProvider implements FinanceProvider {
  readonly name = "yahoo-test";

  async getQuotes(symbols: string[]): Promise<FinanceQuote[]> {
    const unique = Array.from(new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)));
    return Promise.all(unique.map((symbol) => this.getQuote(symbol)));
  }

  private async getQuote(symbol: string): Promise<FinanceQuote> {
    const yahoo = getClient();
    if (!yahoo) return { symbol, name: symbol, price: null, change: null, changePercent: null };
    try {
      const quote: any = await yahoo.quote(symbol);
      return {
        symbol,
        name: quote.shortName || quote.longName || symbol,
        price: quote.regularMarketPrice ?? null,
        change: quote.regularMarketChange ?? null,
        changePercent: quote.regularMarketChangePercent ?? null
      };
    } catch (error) {
      console.warn(`Finance quote unavailable for ${symbol}:`, error instanceof Error ? error.message : error);
      return { symbol, name: symbol, price: null, change: null, changePercent: null };
    }
  }
}
