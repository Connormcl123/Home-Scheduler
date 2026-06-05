import type { FinanceQuote } from "@mirror-dashboard/shared";

export interface FinanceProvider {
  readonly name: string;
  getQuotes(symbols: string[]): Promise<FinanceQuote[]>;
}
