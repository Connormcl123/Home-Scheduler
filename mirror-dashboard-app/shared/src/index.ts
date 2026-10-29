export type Priority = "low" | "normal" | "high";
export type GroceryStatus = "low" | "out" | "ok";

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  location?: string;
  source: "ical" | "google" | "demo" | "local" | "voice";
  /** True when this event has been repositioned on the dashboard. */
  moved?: boolean;
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

/**
 * The spending categories budgets are built from: one list for the server's
 * sorting, the wall's pickers and the Siri commands.
 */
export const FINANCE_CATEGORIES = [
  "Groceries",
  "Dining & Drinks",
  "Shopping",
  "Gas & Auto",
  "Home",
  "Utilities",
  "Health",
  "Entertainment",
  "Subscriptions",
  "Travel",
  "Kids",
  "Pets",
  "Personal",
  "Fees",
  "Debt",
  "Income",
  "Transfers",
  "Other"
] as const;

export type FinanceCategory = (typeof FINANCE_CATEGORIES)[number];

export interface BudgetView extends FinanceBudget {
  /** Limit minus what has been spent; negative once the budget is blown. */
  remaining: number;
  percent: number;
  /** What this month ends at if spending carries on at today's pace. */
  projected: number;
  state: "under" | "ahead" | "over";
}

export interface BudgetSummary {
  monthLabel: string;
  dayOfMonth: number;
  daysInMonth: number;
  budgets: BudgetView[];
  totalLimit: number;
  totalSpent: number;
  /** Spending this month in categories with no budget. */
  unbudgetedSpent: number;
  /** Spending categories that have no budget yet. */
  available: string[];
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
  /** Meal-plan recipes this item was sent from; empty when added by hand. */
  recipes: string[];
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
  source: "instagram" | "manual" | "web";
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
  /** The saved conversation this turn landed in (created on a first message). */
  conversationId?: number;
  title?: string;
}

export interface AssistantStoredMessage extends AssistantMessage {
  id: number;
  actions: AssistantAction[];
  createdAt: string;
}

export interface AssistantConversationSummary {
  id: number;
  title: string;
  /** The latest message, for the Recents list. */
  preview: string;
  messageCount: number;
  updatedAt: string;
}

export interface AssistantConversation {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AssistantStoredMessage[];
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

export interface TripTravelers {
  adults: number;
  children: number;
}

export interface TripFlightOption {
  id: string;
  airline: string;
  route: string;
  departs: string;
  returns: string;
  stops: string;
  /** An estimate. The link opens the live fare. */
  pricePerPerson: number;
  note: string;
  link: string;
}

export interface TripStayOption {
  id: string;
  name: string;
  kind: "hotel" | "rental" | "boutique";
  area: string;
  nightlyPrice: number;
  note: string;
  link: string;
}

export interface TripActivityOption {
  id: string;
  name: string;
  when: string;
  pricePerPerson: number;
  note: string;
  link: string;
}

/** Everything needed to decide on a trip: the dates, the options and what each costs. */
export interface TripArrangements {
  dealId: number;
  destination: string;
  origin: string;
  startDate: string;
  endDate: string;
  nights: number;
  travelers: TripTravelers;
  flights: TripFlightOption[];
  stays: TripStayOption[];
  activities: TripActivityOption[];
  dailyFoodPerPerson: number;
  generatedAt: string;
  source: "ai" | "local";
}

export interface TripSelection {
  flightId: string;
  stayId: string;
  activityIds: string[];
}

export interface TripTotals {
  flights: number;
  stay: number;
  activities: number;
  food: number;
  total: number;
  perPerson: number;
}

/** A trip the family has decided to move on: held in the calendar, budgeted, and waiting on a phone. */
export interface TripPlan {
  id: number;
  dealId: number;
  destination: string;
  startDate: string;
  endDate: string;
  travelers: TripTravelers;
  selection: TripSelection;
  totals: TripTotals;
  /** Opened by scanning the wall: every booking link in one page. */
  phoneUrl: string;
  heldInCalendar: boolean;
  budgetCategory?: string | null;
  createdAt: string;
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

export interface RecipeIngredient {
  name: string;
  quantity?: string | null;
  category?: string | null;
}

export interface Recipe {
  id: number;
  title: string;
  summary?: string | null;
  servings?: number | null;
  totalMinutes?: number | null;
  tags: string[];
  ingredients: RecipeIngredient[];
  steps: string[];
  imageUrl?: string | null;
  source: string;
  /** The link it was shared from, tidied. */
  sourceUrl?: string | null;
  /** Who made it, e.g. "heresyourbite on Instagram". */
  sourceName?: string | null;
  createdAt: string;
}

export interface MealPlanEntry {
  id: number;
  date: string;
  slot: string;
  note?: string | null;
  recipe: Recipe | null;
}

export interface GroceryPushResult {
  added: number;
  skipped: number;
  items: string[];
}

export type HomeCardKind = "event" | "task" | "grocery" | "weather" | "news" | "note" | "travel" | "finance" | "meal";

export interface HomeCard {
  kind: HomeCardKind;
  title: string;
  detail: string;
  bullets?: string[];
  urgency: "now" | "soon" | "later";
  imageUrl?: string | null;
  link?: string;
  startsAt?: string;
  /** Set on travel cards so Home can open that specific trip. */
  dealId?: number;
  /** Set on meal cards so Home can open tonight's recipe. */
  recipeId?: number;
  /** Set on news cards so Home can show the article without leaving the kiosk. */
  source?: string;
}

export interface HomePulse {
  generatedAt: string;
  headline: string;
  cards: HomeCard[];
  source: "ai" | "local";
}

export type StorySlideKind =
  | "greeting" | "weather" | "schedule" | "tasks"
  | "news" | "markets" | "finance" | "travel" | "closing";

export interface StorySlide {
  kind: StorySlideKind;
  title: string;
  lines: string[];
  /** Everything below is attached from real data, never written by the model. */
  imageUrl?: string | null;
  link?: string | null;
  quotes?: FinanceQuote[];
  money?: Array<{ label: string; value: string; tone: "good" | "bad" | "neutral" }>;
  budget?: { spent: number; limit: number; label: string } | null;
  forecast?: Array<{ label: string; high: number; low: number; description: string }>;
  agenda?: Array<{ time: string; title: string }>;
  checklist?: Array<{ title: string; due?: string | null }>;
}

export interface MorningStory {
  forDate: string;
  slides: StorySlide[];
  createdAt: string;
}

export type ShareKind = "recipe" | "trip";
export type ShareStatus = "saved" | "duplicate" | "unrecognized" | "failed";

/** What POST /api/share returns; the phone shows `message` as a notification. */
export interface ShareResult {
  status: ShareStatus;
  kind: ShareKind | null;
  id: number | null;
  title: string | null;
  message: string;
  shareId: number | null;
  imageUrl: string | null;
}

/** One row of share history, for the wall banner and Settings. */
export interface ShareImport {
  id: number;
  url: string | null;
  kind: ShareKind | null;
  status: ShareStatus;
  itemId: number | null;
  title: string | null;
  message: string;
  imageUrl: string | null;
  createdAt: string;
}

/** A package's place on the wall's four-step meter. */
export type PackageStatus = "ordered" | "shipped" | "out_for_delivery" | "delivered";

/** One package as the wall shows it. Dates are YYYY-MM-DD; times are ISO. */
export interface PackageView {
  id: number;
  store: string | null;
  item: string;
  imageUrl: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  orderNumber: string | null;
  status: PackageStatus;
  arrivalStart: string | null;
  arrivalEnd: string | null;
  issue: string | null;
  deliveredAt: string | null;
  /** When the newest email about it arrived. */
  updatedAt: string;
  /** Subjects of the emails this package came from, oldest first. */
  subjects: string[];
}

export interface GmailConnection {
  /** GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET are set on the Pi. */
  configured: boolean;
  status: "not_connected" | "connected" | "needs_reconnect";
  email: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
}

export interface PackagesResponse {
  gmail: GmailConnection;
  /** On its way, plus anything delivered today. */
  active: PackageView[];
  /** Delivered in the last 7 days, newest first. */
  delivered: PackageView[];
}

export interface PackageEvent {
  id: number;
  status: "out_for_delivery" | "delivered";
  createdAt: string;
  package: PackageView;
}

export interface PackageEventsResponse {
  lastId: number;
  events: PackageEvent[];
}
