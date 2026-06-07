export type Priority = "low" | "normal" | "high";
export type GroceryStatus = "low" | "out" | "ok";

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  location?: string;
  source: "ical" | "google" | "demo";
}

export interface Task {
  id: number;
  title: string;
  notes?: string | null;
  dueDate?: string | null;
  priority: Priority;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: number;
  date: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface WeatherSummary {
  locationName: string;
  current: {
    temperature: number;
    apparentTemperature: number;
    windSpeed: number;
    weatherCode: number;
    description: string;
  };
  daily: Array<{
    date: string;
    high: number;
    low: number;
    weatherCode: number;
    description: string;
  }>;
}

export interface NewsArticle {
  id: string;
  title: string;
  source: string;
  link: string;
  publishedAt?: string;
}

export interface FinanceQuote {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
}

export interface FinanceAccount {
  id: number;
  providerAccountId?: string | null;
  name: string;
  institution: string;
  type: "checking" | "savings" | "credit" | "investment" | "other";
  balance: number;
  currency: string;
  lastSyncedAt?: string | null;
}

export interface FinanceBudget {
  id: number;
  category: string;
  limitAmount: number;
  spentAmount: number;
  color: string;
}

export interface FinanceTransaction {
  id: number;
  accountId?: number | null;
  merchant: string;
  category: string;
  amount: number;
  transactionDate: string;
  notes?: string | null;
  categorizedBy?: "provider" | "rule" | "manual" | "demo";
}

export interface FinanceCategoryRule {
  id: number;
  matchText: string;
  category: string;
  enabled: boolean;
  createdAt: string;
}

export interface FinanceTrendPoint {
  label: string;
  income: number;
  spending: number;
}

export interface PersonalFinanceSummary {
  provider: string;
  monthLabel: string;
  totalCash: number;
  totalDebt: number;
  monthlyIncome: number;
  monthlySpending: number;
  cashFlow: number;
  budgetLimit: number;
  budgetSpent: number;
  accounts: FinanceAccount[];
  budgets: FinanceBudget[];
  recentTransactions: FinanceTransaction[];
  uncategorizedTransactions: FinanceTransaction[];
  categoryRules: FinanceCategoryRule[];
  trend: FinanceTrendPoint[];
  insights: string[];
}

export interface PlaidConnectionStatus {
  configured: boolean;
  environment: string;
  itemCount: number;
  items: Array<{
    itemId: string;
    institutionName?: string | null;
    status: string;
    lastSyncedAt?: string | null;
  }>;
}

export interface RssFeed {
  id: number;
  title: string;
  url: string;
  enabled: boolean;
}

export interface FinanceWatchlistItem {
  id: number;
  symbol: string;
  enabled: boolean;
}

export interface GroceryItem {
  id: number;
  name: string;
  quantity?: string | null;
  category?: string | null;
  supplier?: string | null;
  status: GroceryStatus;
  purchased: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardSummary {
  generatedAt: string;
  calendar: CalendarEvent[];
  tasks: Task[];
  todayNote: Note | null;
  weather: WeatherSummary;
  news: NewsArticle[];
  finance: {
    provider: string;
    quotes: FinanceQuote[];
    personal: PersonalFinanceSummary;
  };
}

export interface AppSettings {
  calendarFeedUrl: string;
  calendarFeedUrls: string[];
  weatherLatitude: string;
  weatherLongitude: string;
  weatherTimezone: string;
  rssFeeds: string[];
  financeWatchlist: string[];
}
