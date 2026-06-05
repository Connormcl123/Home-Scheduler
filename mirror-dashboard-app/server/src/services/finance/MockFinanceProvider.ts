import type { FinanceQuote } from "@mirror-dashboard/shared";
import type { FinanceProvider } from "./FinanceProvider.js";

export class MockFinanceProvider implements FinanceProvider {
  readonly name = "mock";

  async getQuotes(symbols: string[]): Promise<FinanceQuote[]> {
    const fallback = symbols.length ? symbols : ["SPY", "AAPL", "MSFT"];
    return fallback.map((symbol, index) => ({
      symbol: symbol.toUpperCase(),
      name: mockName(symbol),
      price: [542.31, 214.72, 424.52, 456.88][index] ?? 100 + index * 12.5,
      change: [2.44, -1.18, 3.72, 0.95][index] ?? 0.5,
      changePercent: [0.45, -0.55, 0.88, 0.21][index] ?? 0.1
    }));
  }
}

function mockName(symbol: string) {
  const names: Record<string, string> = {
    SPY: "S&P 500 ETF",
    QQQ: "Nasdaq 100 ETF",
    AAPL: "Apple",
    MSFT: "Microsoft"
  };
  return names[symbol.toUpperCase()] || symbol.toUpperCase();
}
