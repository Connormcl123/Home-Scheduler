export type Priority = "low" | "normal" | "high";
export type GroceryStatus = "low" | "out" | "ok";

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  location?: string;
  source: "ical" | "google" | "demo" | "local" | "voice";
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
  imageUrl?: string | null;
}

export interface FinanceQuote {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  /** Recent daily closes, oldest first, for drawing a sparkline. */
  spark?: number[];
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
  pending?: boolean;
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

export interface TravelInspiration {
  id: number;
  source: "instagram" | "manual";
  url: string;
  thumbnailUrl?: string | null;
  title: string;
  location?: string | null;
  notes?: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TravelItineraryDay {
  day: number;
  title: string;
  stops: string[];
  notes: string;
  details?: string;
  mapQuery?: string;
  mapUrl?: string;
}

export interface TravelItineraryLink {
  label: string;
  url: string;
}

export interface TravelItineraryOption {
  title: string;
  recommendation: string;
  estimatedCost?: string;
  timing?: string;
  bookingNotes?: string;
}

export interface TravelItineraryPlanning {
  travelOptions: TravelItineraryOption[];
  lodgingOptions: TravelItineraryOption[];
  foodAndStops: TravelItineraryOption[];
  familyNotes: string[];
  packingNotes: string[];
}

export type TravelAddOnCategory = "stays" | "food" | "activities";

export interface TravelAddOn {
  id: string;
  category: TravelAddOnCategory;
  title: string;
  description: string;
  provider?: "hotel" | "airbnb" | "vacation_rental" | "restaurant" | "activity" | "local";
  bookingUrl?: string | null;
  estimatedLow: number | null;
  estimatedHigh: number | null;
  priceLabel: string;
  unit: string;
  confidence: "researched" | "estimated" | "needs_quote";
}

export interface TravelPriceSummary {
  currency: string;
  estimatedLow: number | null;
  estimatedHigh: number | null;
  pricingNotes: string[];
}

export interface TravelItineraryResult {
  provider: "openai" | "local";
  generatedAt: string;
  title: string;
  summary: string;
  destination?: string;
  mapQuery?: string;
  mapUrl?: string;
  mapEmbedUrl?: string;
  lodgingLinks?: TravelItineraryLink[];
  travelLinks?: TravelItineraryLink[];
  planning?: TravelItineraryPlanning;
  addOns?: TravelAddOn[];
  priceSummary?: TravelPriceSummary;
  days: TravelItineraryDay[];
  sourceCount: number;
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

export interface ApiIntegrationStatusItem {
  key: string;
  label: string;
  configured: boolean;
  mode: "live" | "partial" | "mock" | "missing";
  detail: string;
  nextStep?: string;
}

export interface ApiIntegrationStatus {
  generatedAt: string;
  items: ApiIntegrationStatusItem[];
}

export type AssistantRole = "user" | "assistant";

export interface AssistantMessage {
  role: AssistantRole;
  content: string;
}

export interface AssistantAction {
  tool: string;
  summary: string;
}

export interface AssistantChatResponse {
  reply: string;
  actions: AssistantAction[];
  /** Panels touched by this turn, so the UI knows what to refresh. */
  refresh: Array<"tasks" | "grocery" | "notes" | "calendar" | "dashboard">;
}

export interface AssistantStatus {
  enabled: boolean;
  model: string;
  reason?: string;
}

export interface TravelDealDetail {
  overview: string;
  highlights: string[];
  itinerary: Array<{ day: string; plan: string }>;
  stay: string;
  gettingThere: string;
  familyTip: string;
  budgetBreakdown: Array<{ label: string; amount: string }>;
}

export interface TravelDeal {
  id: number;
  generatedFor: string;
  destination: string;
  country?: string | null;
  headline: string;
  hook: string;
  emoji: string;
  accent: string;
  bestMonths?: string | null;
  tripLength?: string | null;
  estCost?: string | null;
  imageUrl?: string | null;
  detail: TravelDealDetail;
  createdAt: string;
}

export interface TravelDealsResponse {
  generatedFor: string | null;
  deals: TravelDeal[];
  status: "ready" | "empty" | "disabled";
  reason?: string;
}

export type HomeCardKind = "event" | "task" | "grocery" | "weather" | "news" | "note" | "travel" | "finance";

export interface HomeCard {
  kind: HomeCardKind;
  title: string;
  detail: string;
  bullets?: string[];
  urgency: "now" | "soon" | "later";
  imageUrl?: string | null;
  link?: string;
  startsAt?: string;
}

export interface HomePulse {
  generatedAt: string;
  headline: string;
  cards: HomeCard[];
  source: "ai" | "local";
}

export interface StorySlide {
  kind: "greeting" | "weather" | "schedule" | "tasks" | "news" | "travel" | "closing";
  title: string;
  lines: string[];
  imageUrl?: string | null;
}

export interface MorningStory {
  forDate: string;
  slides: StorySlide[];
  createdAt: string;
}
