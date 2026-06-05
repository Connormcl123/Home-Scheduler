import type { FinanceQuote } from "@mirror-dashboard/shared";
import { config } from "../../config.js";
import { getSettings } from "../settings.js";
import type { FinanceProvider } from "./FinanceProvider.js";
import { MockFinanceProvider } from "./MockFinanceProvider.js";
import { YahooFinanceProvider } from "./YahooFinanceProvider.js";

function getProvider(): FinanceProvider {
  if (config.finance.provider === "yahoo") return new YahooFinanceProvider();
  return new MockFinanceProvider();
}

export async function getFinanceSummary(): Promise<{ provider: string; quotes: FinanceQuote[] }> {
  const settings = await getSettings();
  const provider = getProvider();
  const symbols = settings.financeWatchlist.length ? settings.financeWatchlist : config.finance.watchlist;
  const quotes = await provider.getQuotes(symbols);
  return { provider: provider.name, quotes };
}
