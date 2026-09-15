import { type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { motion } from "motion/react";
import { greetingFor, useAmbient } from "./ambient";
import { ShareBanner } from "./ShareBanner";
import { guardWindowOpen } from "./kioskGuard";
import { acceptsDragScroll, dragAxis, flingStep, releaseVelocity, type ScrollSample } from "./dragScroll";
import type { ShareImport, ApiIntegrationStatus, HomeCard, HomeCardKind, MealPlanEntry, Recipe, StorySlideKind, HomePulse, MorningStory, StorySlide, TravelDeal, TravelDealsResponse, AssistantAction, AssistantConversationSummary, AssistantStatus, CalendarEvent, DashboardSummary, FinanceQuote, FinanceTransaction, FinanceWatchlistItem, GroceryItem, GroceryStatus, NewsArticle, Note, PersonalFinanceSummary, PlaidConnectionStatus, Priority, RssFeed, Task, TravelInspiration, TravelItineraryResult } from "@mirror-dashboard/shared";
import { ArrowDownRight, ArrowUp, ArrowUpRight, BedDouble, Bot, ChefHat, UtensilsCrossed, Send, CalendarDays, Car, CheckCircle2, ChevronLeft, ChevronRight, Clock3, CloudSun, CreditCard, DollarSign, ExternalLink, Home, Landmark, Luggage, MapPinned, Moon, PieChart, Plane, Route, type LucideIcon, Newspaper, Plus, RefreshCw, Save, Settings, ShoppingBasket, Sparkles, StickyNote, SunMedium, Trash2, Utensils, Wallet, WifiOff, X } from "lucide-react";
import {
  createGroceryItem,
  createPlaidLinkToken,
  createRssFeed,
  createTask,
  createTravelInspiration,
  createWatchlistItem,
  deleteGroceryItem,
  deleteNote,
  deleteRssFeed,
  deleteTask,
  deleteTravelInspiration,
  deleteWatchlistItem,
  fetchDashboard,
  fetchGroceryItems,
  fetchIntegrationStatus,
  fetchNote,
  fetchNotes,
  fetchPersonalFinanceSummary,
  fetchPlaidStatus,
  fetchRssFeeds,
  fetchTasks,
  fetchTravelInspirations,
  fetchRecentShares,
  moveSharedItem,
  retryShare,
  fetchWatchlist,
  generateTravelItinerary,
  saveNote,
  exchangePlaidPublicToken,
  syncPlaidFinance,
  updateFinanceTransactionCategory,
  updateGroceryItem,
  updateRssFeed,
  updateTask,
  updateWatchlistItem,
  fetchAssistantStatus,
  fetchAssistantConversation,
  fetchAssistantConversations,
  deleteAssistantConversation,
  fetchCalendarEvents,
  fetchRecipes,
  fetchMealPlan,
  setMealPlan,
  generateRecipe,
  deleteRecipe,
  pushPlanToGrocery,
  moveCalendarEvent,
  fetchHomePulse,
  fetchMorningStory,
  fetchTravelDeals,
  refreshTravelDeals,
  sendAssistantMessage,
} from "./api";

type View = "home" | "calendar" | "grocery" | "recipes" | "tasks" | "notes" | "finance" | "travel" | "assistant" | "settings";
type CalendarMode = "Day" | "Week" | "Month" | "Schedule";
type TravelTripType = "low-effort" | "beach" | "new-england" | "city" | "nature" | "splurge";

type TravelCandidate = {
  id: string;
  name: string;
  location: string;
  types: TravelTripType[];
  durationFit: number[];
  flightHours: number;
  estimatedCost: number;
  ease: number;
  babyFit: number;
  deal: number;
  weather: number;
  tags: string[];
  summary: string;
  visual: string;
  route: string[];
};

type ItinerarySelectedDetail = {
  title: string;
  eyebrow: string;
  body: string;
  chips?: string[];
};

declare global {
  interface Window {
    Plaid?: {
      create: (options: {
        token: string;
        onSuccess: (publicToken: string, metadata: { institution?: { name?: string } }) => void;
        onExit?: (error: unknown) => void;
      }) => { open: () => void };
    };
  }
}

const demoPersonalFinance: PersonalFinanceSummary = {
  provider: "demo",
  monthLabel: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date()),
  totalCash: 17120.92,
  totalDebt: 1950.58,
  monthlyIncome: 4900,
  monthlySpending: 1559.69,
  cashFlow: 3340.31,
  budgetLimit: 2410,
  budgetSpent: 1519.1,
  accounts: [
    { id: 1, name: "Everyday Checking", institution: "Local Bank", type: "checking", balance: 4280.22, currency: "USD", lastSyncedAt: new Date().toISOString() },
    { id: 2, name: "Family Savings", institution: "Local Bank", type: "savings", balance: 12840.7, currency: "USD", lastSyncedAt: new Date().toISOString() },
    { id: 3, name: "Rewards Card", institution: "Credit Card", type: "credit", balance: -1430.18, currency: "USD", lastSyncedAt: new Date().toISOString() }
  ],
  budgets: [
    { id: 1, category: "Groceries", limitAmount: 850, spentAmount: 310.5, color: "#10b981" },
    { id: 2, category: "Dining", limitAmount: 300, spentAmount: 75.63, color: "#f97316" },
    { id: 3, category: "Gas", limitAmount: 260, spentAmount: 48.2, color: "#0ea5e9" },
    { id: 4, category: "Home", limitAmount: 500, spentAmount: 91.33, color: "#8b5cf6" },
    { id: 5, category: "Shopping", limitAmount: 450, spentAmount: 192.59, color: "#ec4899" }
  ],
  recentTransactions: [
    { id: 1, merchant: "Grocery Market", category: "Groceries", amount: -126.4, transactionDate: today() },
    { id: 2, merchant: "Gas Station", category: "Gas", amount: -48.2, transactionDate: today() },
    { id: 3, merchant: "Paycheck", category: "Income", amount: 2450, transactionDate: today() }
  ],
  uncategorizedTransactions: [],
  categoryRules: [],
  trend: [
    { label: "W1", income: 2450, spending: 360 },
    { label: "W2", income: 0, spending: 420 },
    { label: "W3", income: 2450, spending: 515 },
    { label: "W4", income: 0, spending: 265 }
  ],
  insights: ["Groceries are tracking comfortably under budget.", "Cash flow is positive this month.", "AI analysis can be enabled once a data provider is connected."]
};

const demoDashboard: DashboardSummary = {
  generatedAt: new Date().toISOString(),
  calendar: [
    { id: "1", title: "School pickup", start: new Date().toISOString(), source: "demo" },
    { id: "2", title: "Dinner prep", start: tomorrowAt(18, 0), source: "demo" },
    { id: "3", title: "Weekend planning", start: tomorrowAt(10, 30), source: "demo" }
  ],
  tasks: [
    { id: 1, title: "Pack lunches", priority: "high", completed: false, dueDate: today(), createdAt: "", updatedAt: "" },
    { id: 2, title: "Pay water bill", priority: "normal", completed: false, dueDate: today(), createdAt: "", updatedAt: "" },
    { id: 3, title: "Order groceries", priority: "low", completed: true, dueDate: today(), createdAt: "", updatedAt: "" }
  ],
  todayNote: { id: 1, date: today(), body: "Remember early pickup and check the family budget after dinner.", createdAt: "", updatedAt: "" },
  weather: {
    locationName: "Home",
    current: { temperature: 72, apparentTemperature: 74, windSpeed: 6, weatherCode: 2, description: "Partly cloudy" },
    daily: [
      { date: today(), high: 76, low: 61, weatherCode: 2, description: "Partly cloudy" },
      { date: tomorrowDate(), high: 73, low: 58, weatherCode: 1, description: "Mostly clear" }
    ]
  },
  news: [
    { id: "n1", title: "Local morning briefing", source: "NPR", link: "#", publishedAt: new Date().toISOString() },
    { id: "n2", title: "Markets open steady ahead of earnings", source: "Finance", link: "#", publishedAt: new Date().toISOString() }
  ],
  finance: {
    provider: "demo",
    quotes: [
      { symbol: "SPY", name: "S&P 500 ETF", price: 542.31, change: 2.44, changePercent: 0.45 },
      { symbol: "AAPL", name: "Apple", price: 214.72, change: -1.18, changePercent: -0.55 }
    ],
    personal: demoPersonalFinance
  }
};

const navItems: Array<{ view: View; label: string; icon: LucideIcon }> = [
  { view: "home", label: "Home", icon: Home },
  { view: "calendar", label: "Calendar", icon: CalendarDays },
  { view: "grocery", label: "Grocery", icon: ShoppingBasket },
  { view: "recipes", label: "Recipes", icon: ChefHat },
  { view: "tasks", label: "Tasks", icon: CheckCircle2 },
  { view: "notes", label: "Notes", icon: StickyNote },
  { view: "finance", label: "Finance", icon: Landmark },
  { view: "travel", label: "Travel", icon: Plane },
  { view: "assistant", label: "Assistant", icon: Bot },
  { view: "settings", label: "Settings", icon: Settings }
];

const defaultNavOrder = navItems.map((item) => item.view);

const burnInOffsets = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 4 },
  { x: 0, y: 4 },
  { x: -4, y: 4 },
  { x: -4, y: 0 },
  { x: -4, y: -4 },
  { x: 0, y: -4 }
];

const profilePalette = [
  { name: "Family", color: "#3b82f6", soft: "#dbeafe", text: "#1d4ed8" },
  { name: "Home", color: "#f59e0b", soft: "#fef3c7", text: "#b45309" },
  { name: "School", color: "#10b981", soft: "#d1fae5", text: "#047857" },
  { name: "Personal", color: "#ec4899", soft: "#fce7f3", text: "#be185d" },
  { name: "Work", color: "#8b5cf6", soft: "#ede9fe", text: "#6d28d9" }
];

const travelCandidates: TravelCandidate[] = [
  {
    id: "bermuda",
    name: "Bermuda Beach Reset",
    location: "Bermuda",
    types: ["beach", "splurge", "low-effort"],
    durationFit: [5, 7],
    flightHours: 2.2,
    estimatedCost: 6200,
    ease: 90,
    babyFit: 86,
    deal: 74,
    weather: 82,
    tags: ["Direct from BOS", "Short flight", "Beach"],
    summary: "A short international hop with real vacation energy and a sane travel day.",
    visual: "linear-gradient(135deg, #0f766e, #3572a5)",
    route: ["BOS airport buffer", "Prebooked transfer", "Beach-first arrival day"]
  },
  {
    id: "cape",
    name: "Cape Cod Slow Week",
    location: "Chatham, MA",
    types: ["new-england", "beach", "low-effort"],
    durationFit: [5, 7, 10],
    flightHours: 0,
    estimatedCost: 3900,
    ease: 95,
    babyFit: 92,
    deal: 64,
    weather: 78,
    tags: ["Driveable", "Kitchen-friendly", "Flexible"],
    summary: "Low logistics, classic summer rhythm, and easy recovery if plans change.",
    visual: "linear-gradient(135deg, #2f7d5c, #d49b3a)",
    route: ["Plymouth halfway stop", "Chatham home base", "Short beach blocks"]
  },
  {
    id: "montreal",
    name: "Montreal City Break",
    location: "Montreal, QC",
    types: ["city", "low-effort"],
    durationFit: [3, 5],
    flightHours: 1.3,
    estimatedCost: 3100,
    ease: 82,
    babyFit: 78,
    deal: 81,
    weather: 80,
    tags: ["Short flight", "Walkable", "Food"],
    summary: "A cultural reset that still keeps travel time and daily ambition under control.",
    visual: "linear-gradient(135deg, #a23d6d, #3572a5)",
    route: ["Nonstop to YUL", "Old Montreal base", "One outing per day"]
  },
  {
    id: "maine",
    name: "Coastal Maine Cottage",
    location: "Kennebunkport, ME",
    types: ["new-england", "nature", "low-effort"],
    durationFit: [3, 5, 7],
    flightHours: 0,
    estimatedCost: 3400,
    ease: 91,
    babyFit: 88,
    deal: 69,
    weather: 76,
    tags: ["Driveable", "Quiet", "Sea air"],
    summary: "A gentle change of scene with beaches, short outings, and flexible days.",
    visual: "linear-gradient(135deg, #315f72, #7aa66a)",
    route: ["Portsmouth coffee stop", "Dock Square stroll", "Goose Rocks Beach"]
  },
  {
    id: "asheville",
    name: "Blue Ridge Recharge",
    location: "Asheville, NC",
    types: ["nature", "city"],
    durationFit: [5, 7],
    flightHours: 2.4,
    estimatedCost: 4200,
    ease: 74,
    babyFit: 73,
    deal: 77,
    weather: 74,
    tags: ["Mountains", "Cabins", "Food"],
    summary: "Soft adventure, rental-home comfort, and good food between naps.",
    visual: "linear-gradient(135deg, #25695a, #6d7e36)",
    route: ["Fly to AVL", "Grocery stop before check-in", "Blue Ridge overlook loop"]
  },
  {
    id: "dc",
    name: "DC Museum Loop",
    location: "Washington, DC",
    types: ["city"],
    durationFit: [3, 5],
    flightHours: 1.5,
    estimatedCost: 2800,
    ease: 78,
    babyFit: 70,
    deal: 79,
    weather: 55,
    tags: ["Museums", "Direct", "Value"],
    summary: "Strong value and easy flights, with indoor backup plans for hot days.",
    visual: "linear-gradient(135deg, #8f354f, #456c8a)",
    route: ["Fly into DCA", "Central hotel base", "Morning museum rhythm"]
  }
];

const groceryQuickCategories = [
  {
    category: "Dairy",
    color: "#38bdf8",
    icon: "🥛",
    items: [
      { name: "Milk", icon: "🥛" },
      { name: "Eggs", icon: "🥚" },
      { name: "Butter", icon: "🧈" },
      { name: "Cheese", icon: "🧀" },
      { name: "Yogurt", icon: "🥣" },
      { name: "Creamer", icon: "☕" }
    ]
  },
  {
    category: "Fruit",
    color: "#fb7185",
    icon: "🍎",
    items: [
      { name: "Apples", icon: "🍎" },
      { name: "Bananas", icon: "🍌" },
      { name: "Berries", icon: "🫐" },
      { name: "Grapes", icon: "🍇" },
      { name: "Oranges", icon: "🍊" },
      { name: "Lemons", icon: "🍋" }
    ]
  },
  {
    category: "Meat",
    color: "#f97316",
    icon: "🥩",
    items: [
      { name: "Chicken", icon: "🍗" },
      { name: "Ground beef", icon: "🥩" },
      { name: "Steak", icon: "🥩" },
      { name: "Bacon", icon: "🥓" },
      { name: "Turkey", icon: "🍖" },
      { name: "Fish", icon: "🐟" }
    ]
  },
  {
    category: "Vegetables",
    color: "#22c55e",
    icon: "🥕",
    items: [
      { name: "Lettuce", icon: "🥬" },
      { name: "Carrots", icon: "🥕" },
      { name: "Onions", icon: "🧅" },
      { name: "Peppers", icon: "🫑" },
      { name: "Potatoes", icon: "🥔" },
      { name: "Broccoli", icon: "🥦" }
    ]
  },
  {
    category: "Spices",
    color: "#a855f7",
    icon: "🧂",
    items: [
      { name: "Salt", icon: "🧂" },
      { name: "Pepper", icon: "🧂" },
      { name: "Garlic powder", icon: "🧄" },
      { name: "Paprika", icon: "🌶️" },
      { name: "Cinnamon", icon: "🥄" },
      { name: "Italian seasoning", icon: "🌿" }
    ]
  },
  {
    category: "Pantry",
    color: "#eab308",
    icon: "🍞",
    items: [
      { name: "Bread", icon: "🍞" },
      { name: "Rice", icon: "🍚" },
      { name: "Pasta", icon: "🍝" },
      { name: "Cereal", icon: "🥣" },
      { name: "Flour", icon: "🌾" },
      { name: "Sugar", icon: "🍚" }
    ]
  },
  {
    category: "Frozen",
    color: "#06b6d4",
    icon: "❄️",
    items: [
      { name: "Frozen pizza", icon: "🍕" },
      { name: "Frozen veggies", icon: "🥦" },
      { name: "Ice cream", icon: "🍨" },
      { name: "Waffles", icon: "🧇" },
      { name: "Fries", icon: "🍟" },
      { name: "Smoothie fruit", icon: "🫐" }
    ]
  },
  {
    category: "Household",
    color: "#64748b",
    icon: "🧼",
    items: [
      { name: "Paper towels", icon: "🧻" },
      { name: "Toilet paper", icon: "🧻" },
      { name: "Dish soap", icon: "🧼" },
      { name: "Trash bags", icon: "🗑️" },
      { name: "Laundry soap", icon: "🧺" },
      { name: "Batteries", icon: "🔋" }
    ]
  }
];

const groceryIconCodes: Record<string, string> = {
  Dairy: "1f95b",
  Milk: "1f95b",
  Eggs: "1f95a",
  Butter: "1f9c8",
  Cheese: "1f9c0",
  Yogurt: "1f963",
  Creamer: "2615",
  Fruit: "1f34e",
  Apples: "1f34e",
  Bananas: "1f34c",
  Berries: "1fad0",
  Grapes: "1f347",
  Oranges: "1f34a",
  Lemons: "1f34b",
  Meat: "1f969",
  Chicken: "1f357",
  "Ground beef": "1f969",
  Steak: "1f969",
  Bacon: "1f953",
  Turkey: "1f356",
  Fish: "1f41f",
  Vegetables: "1f955",
  Lettuce: "1f96c",
  Carrots: "1f955",
  Onions: "1f9c5",
  Peppers: "1fad1",
  Potatoes: "1f954",
  Broccoli: "1f966",
  Spices: "1f9c2",
  Salt: "1f9c2",
  Pepper: "1f9c2",
  "Garlic powder": "1f9c4",
  Paprika: "1f336-fe0f",
  Cinnamon: "1f944",
  "Italian seasoning": "1f33f",
  Pantry: "1f35e",
  Bread: "1f35e",
  Rice: "1f35a",
  Pasta: "1f35d",
  Cereal: "1f963",
  Flour: "1f33e",
  Sugar: "1f35a",
  Frozen: "2744-fe0f",
  "Frozen pizza": "1f355",
  "Frozen veggies": "1f966",
  "Ice cream": "1f368",
  Waffles: "1f9c7",
  Fries: "1f35f",
  "Smoothie fruit": "1fad0",
  Household: "1f9fc",
  "Paper towels": "1f9fb",
  "Toilet paper": "1f9fb",
  "Dish soap": "1f9fc",
  "Trash bags": "1f5d1-fe0f",
  "Laundry soap": "1f9fa",
  Batteries: "1f50b"
};

const groceryWhatsappPhone = "17742650686";

export default function App() {
  if (typeof window !== "undefined" && window.location.pathname === "/share/grocery") return <GroceryDocumentPage />;
  return <DashboardApp />;
}

function DashboardApp() {
  const [dashboard, setDashboard] = useState<DashboardSummary>(demoDashboard);
  const [view, setView] = useState<View>("home");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  // The moon button pins the night palette; otherwise it follows the clock.
  const [darkMode, setDarkMode] = useState(() => safeStorageGet("mirror-dashboard-force-night") === "yes");
  const [burnInStep, setBurnInStep] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [externalLink, setExternalLink] = useState<string | null>(null);
  // Set when Home hands off to another tab, so that tab can open the exact item.
  const [focusDealId, setFocusDealId] = useState<number | null>(null);
  // Shares from the phone: a counter the Recipes and Travel lists reload on,
  // and which item the banner asked to open.
  const [shareVersion, setShareVersion] = useState(0);
  const [focusRecipeId, setFocusRecipeId] = useState<number | null>(null);
  const [savedTripsKey, setSavedTripsKey] = useState(0);
  const handleShareArrived = useCallback(() => setShareVersion((version) => version + 1), []);
  const openShare = useCallback((share: ShareImport) => {
    if (share.kind === "trip") {
      setSavedTripsKey((key) => key + 1);
      setView("travel");
    } else {
      setFocusRecipeId(share.itemId);
      setView("recipes");
    }
  }, []);
  const clearFocusRecipe = useCallback(() => setFocusRecipeId(null), []);
  const clearShowSaved = useCallback(() => setSavedTripsKey(0), []);
  const [navOrder, setNavOrder] = useState<View[]>(() => readNavOrder());
  const [navEditMode, setNavEditMode] = useState(false);
  const [draggingView, setDraggingView] = useState<View | null>(null);
  const [navDrag, setNavDrag] = useState<{ x: number; y: number; startX: number; startY: number; offsetX: number; offsetY: number; width: number; height: number; startedAt: number } | null>(null);
  const keyboardTargetRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const ignoreNextClickRef = useRef(false);
  const lastNavTapRef = useRef<{ view: View; time: number } | null>(null);

  const refreshDashboard = () => {
    fetchDashboard()
      .then((data) => {
        setDashboard(data);
        setError(null);
        setLastRefresh(new Date());
        safeStorageSet("mirror-dashboard-last-dashboard", JSON.stringify(data));
      })
      .catch((err: Error) => {
        setError(err.message);
        const cached = safeStorageGet("mirror-dashboard-last-dashboard");
        if (cached) {
          try {
            setDashboard(JSON.parse(cached));
          } catch {
            setDashboard(demoDashboard);
          }
        }
      });
  };

  // Chromium runs with --kiosk, so there is no back button or address bar: any
  // link that leaves the dashboard strands the wall display on a page nobody can
  // close. Intercept those and show the destination instead of navigating.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const link = target?.closest?.("a");
      if (!link) return;
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin === window.location.origin) return;
      event.preventDefault();
      event.stopPropagation();
      setExternalLink(url.href);
    }
    document.addEventListener("click", onClick, true);
    const restoreOpen = guardWindowOpen(window, setExternalLink);
    return () => {
      document.removeEventListener("click", onClick, true);
      restoreOpen();
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    refreshDashboard();
    const refreshTimer = window.setInterval(refreshDashboard, 5 * 60 * 1000);
    return () => window.clearInterval(refreshTimer);
  }, []);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  useEffect(() => {
    safeStorageSet("mirror-dashboard-force-night", darkMode ? "yes" : "no");
  }, [darkMode]);

  useEffect(() => {
    safeStorageSet("mirror-dashboard-nav-order", JSON.stringify(navOrder));
  }, [navOrder]);

  useEffect(() => {
    const timer = window.setInterval(() => setBurnInStep((step) => (step + 1) % 8), 10 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function onFocus(event: FocusEvent) {
      const target = event.target;
      if (!isKeyboardField(target)) return;
      keyboardTargetRef.current = target;
      setKeyboardVisible(true);
    }

    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, []);

  // labwc runs the touchscreen with mouseEmulation="yes", so a finger arrives
  // as a left-button mouse and Chromium never scrolls it natively. Drag to
  // scroll here for touch and mouse alike, with a short fling on release.
  useEffect(() => {
    let activeScroll: {
      pointerId: number;
      lastY: number;
      startY: number;
      startX: number;
      element: HTMLElement;
      moved: boolean;
      samples: ScrollSample[];
    } | null = null;
    let suppressNextClick = false;
    let flingFrame = 0;

    function stopFling() {
      if (flingFrame) window.cancelAnimationFrame(flingFrame);
      flingFrame = 0;
    }

    function startFling(element: HTMLElement, velocity: number) {
      let last = performance.now();
      const frame = (now: number) => {
        const step = flingStep(velocity, now - last);
        last = now;
        velocity = step.velocity;
        element.scrollTop -= step.distance;
        const atEdge = velocity > 0
          ? element.scrollTop <= 0
          : element.scrollTop >= element.scrollHeight - element.clientHeight - 1;
        flingFrame = velocity !== 0 && !atEdge ? window.requestAnimationFrame(frame) : 0;
      };
      flingFrame = window.requestAnimationFrame(frame);
    }

    function onPointerDown(event: PointerEvent) {
      // A touch during a fling catches the list, like a phone.
      stopFling();
      if (!acceptsDragScroll(event)) return;
      const target = event.target;
      if (!(target instanceof HTMLElement) || shouldSkipTouchScroll(target)) return;
      const element = findScrollableParent(target);
      if (!element) return;
      activeScroll = {
        pointerId: event.pointerId,
        lastY: event.clientY,
        startY: event.clientY,
        startX: event.clientX,
        element,
        moved: false,
        samples: [{ time: event.timeStamp, y: event.clientY }]
      };
    }

    function onPointerMove(event: PointerEvent) {
      if (!activeScroll || event.pointerId !== activeScroll.pointerId) return;
      // A component that has taken this drag over (a held calendar event)
      // marks the move handled; stop scrolling underneath it.
      if (event.defaultPrevented) {
        activeScroll = null;
        return;
      }
      if (!activeScroll.moved) {
        const axis = dragAxis(event.clientX - activeScroll.startX, event.clientY - activeScroll.startY);
        if (axis === "pending") return;
        // Sideways belongs to swipes, such as changing weeks on the calendar.
        if (axis === "horizontal") {
          activeScroll = null;
          return;
        }
        activeScroll.moved = true;
      }
      event.preventDefault();
      const deltaY = event.clientY - activeScroll.lastY;
      if (Math.abs(deltaY) < 1) return;
      activeScroll.element.scrollTop -= deltaY;
      activeScroll.lastY = event.clientY;
      activeScroll.samples.push({ time: event.timeStamp, y: event.clientY });
      if (activeScroll.samples.length > 12) activeScroll.samples.shift();
    }

    function endScroll(event: PointerEvent) {
      if (activeScroll?.pointerId !== event.pointerId) return;
      if (activeScroll.moved) {
        suppressNextClick = true;
        window.setTimeout(() => {
          suppressNextClick = false;
        }, 120);
        if (event.type === "pointerup") {
          const velocity = releaseVelocity(activeScroll.samples, event.timeStamp);
          if (velocity) startFling(activeScroll.element, velocity);
        }
      }
      activeScroll = null;
    }

    function onClick(event: MouseEvent) {
      if (!suppressNextClick) return;
      event.preventDefault();
      event.stopPropagation();
      suppressNextClick = false;
    }

    // With emulated touch, pressing an image or link starts a native drag that
    // cancels the scroll. Nothing on the dashboard uses drag and drop.
    function onDragStart(event: DragEvent) {
      event.preventDefault();
    }

    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("pointermove", onPointerMove, { passive: false });
    document.addEventListener("pointerup", endScroll, { passive: true });
    document.addEventListener("pointercancel", endScroll, { passive: true });
    document.addEventListener("click", onClick, true);
    document.addEventListener("dragstart", onDragStart, true);
    return () => {
      stopFling();
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", endScroll);
      document.removeEventListener("pointercancel", endScroll);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("dragstart", onDragStart, true);
    };
  }, []);

  const content = useMemo(() => {
    if (view === "calendar") return <CalendarPanel events={dashboard.calendar} />;
    if (view === "grocery") return <GroceryPanel />;
    if (view === "recipes") return <RecipesPanel onChanged={refreshDashboard} refreshKey={shareVersion} focusRecipeId={focusRecipeId} onFocusHandled={clearFocusRecipe} />;
    if (view === "tasks") return <TaskPanel initialTasks={dashboard.tasks} onChanged={refreshDashboard} />;
    if (view === "notes") return <NotesPanel onChanged={refreshDashboard} />;
    if (view === "finance") return <FinancePanel quotes={dashboard.finance.quotes} initialSummary={dashboard.finance.personal} />;
    if (view === "travel") return <TravelPanel focusDealId={focusDealId} refreshKey={shareVersion} showSaved={savedTripsKey} onShowSavedHandled={clearShowSaved} />;
    if (view === "assistant") return <AssistantPanel onChanged={refreshDashboard} />;
    if (view === "settings") return <SettingsPanel onChanged={refreshDashboard} />;
    return (
      <HomePanel
        dashboard={dashboard}
        now={now}
        onNavigate={(nextView, dealId) => {
          setFocusDealId(dealId ?? null);
          setView(nextView);
        }}
      />
    );
  }, [dashboard, now, view, focusDealId, shareVersion, focusRecipeId, savedTripsKey, clearFocusRecipe, clearShowSaved]);

  const clock = useMemo(() => {
    const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(now);
    const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
    return {
      time: `${part("hour")}:${part("minute")}`,
      period: part("dayPeriod"),
      date: now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    };
  }, [now]);

  const ambient = useAmbient(now, darkMode);

  // Dusk and night palettes are dark, so the dark: styles switch on with them.
  // Mirrored onto <html> as well: shadcn/Radix dialogs portal into <body>,
  // outside <main>, and would otherwise always open light.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", ambient.palette.dark);
  }, [ambient.palette.dark]);

  const shift = burnInOffsets[burnInStep];
  const orderedNavItems = useMemo(() => {
    return navOrder
      .map((navView) => navItems.find((item) => item.view === navView))
      .filter((item): item is (typeof navItems)[number] => Boolean(item));
  }, [navOrder]);

  function beginNavPress(event: ReactPointerEvent<HTMLButtonElement>, navView: View) {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some kiosk touch drivers can reject pointer capture during rapid taps.
    }
    clearNavLongPress();
    const initialDrag = getNavDragState(event);
    if (navEditMode) {
      ignoreNextClickRef.current = true;
      setDraggingView(navView);
      setNavDrag(initialDrag);
      return;
    }
    longPressTimerRef.current = window.setTimeout(() => {
      ignoreNextClickRef.current = true;
      setNavEditMode(true);
      setDraggingView(navView);
      setNavDrag(initialDrag);
    }, 520);
  }

  function moveNavPress(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!navEditMode || !draggingView) return;
    setNavDrag((current) => current ? { ...current, x: event.clientX, y: event.clientY } : getNavDragState(event));
    const targetView = getNavViewAtPoint(event.clientX, event.clientY);
    if (!targetView || targetView === draggingView) return;
    setNavOrder((current) => moveNavView(current, draggingView, targetView));
  }

  function finishNavPress(event: ReactPointerEvent<HTMLButtonElement>, navView: View) {
    clearNavLongPress();
    const currentDrag = navDrag;
    if (navEditMode && currentDrag) {
      const distance = Math.hypot(event.clientX - currentDrag.startX, event.clientY - currentDrag.startY);
      const duration = Date.now() - currentDrag.startedAt;
      const lastTap = lastNavTapRef.current;
      if (distance < 10 && duration < 360 && lastTap?.view === navView && Date.now() - lastTap.time < 430) {
        exitNavEditMode();
        return;
      }
      if (distance < 10 && duration < 360) {
        lastNavTapRef.current = { view: navView, time: Date.now() };
      }
    }
    if (draggingView) {
      window.setTimeout(() => {
        ignoreNextClickRef.current = false;
      }, 80);
    }
    setDraggingView(null);
    setNavDrag(null);
  }

  function clickNavItem(event: ReactMouseEvent<HTMLButtonElement>, navView: View) {
    if (ignoreNextClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      ignoreNextClickRef.current = false;
      return;
    }
    if (!navEditMode) setView(navView);
  }

  function doubleClickNavItem(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    exitNavEditMode();
  }

  function clearNavLongPress() {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function exitNavEditMode() {
    clearNavLongPress();
    ignoreNextClickRef.current = false;
    lastNavTapRef.current = null;
    setNavEditMode(false);
    setDraggingView(null);
    setNavDrag(null);
  }

  function getNavDragState(event: ReactPointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      startedAt: Date.now()
    };
  }

  return (
    <main
      className={`relative min-h-screen overflow-hidden text-amb-ink ${ambient.palette.dark ? "dark" : ""}`}
      style={{ ...ambient.style, background: "var(--amb-bg)" }}
    >
      {/* The sun (or moon). One static gradient: no blur, nothing animated. */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-[120px] top-[-260px] h-[760px] w-[760px] rounded-full"
        style={{ background: "var(--amb-sun)" }}
      />
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center">
        {(!isOnline || error) && (
          <div className="mt-3 flex items-center gap-3 rounded-full bg-amber-100 px-5 py-3 text-lg font-bold text-amber-900 shadow-lg">
            <WifiOff className="h-5 w-5" />
            {!isOnline ? "Offline - showing last saved dashboard" : "Provider issue - fallback data is active"}
          </div>
        )}
      </div>
      <div className={`mx-auto flex h-screen max-h-screen max-w-[1920px] gap-4 overflow-hidden px-5 py-4 transition-transform duration-700 ${keyboardVisible ? "pb-80" : ""}`} style={{ transform: `translate(${shift.x}px, ${shift.y}px)` }}>
        <aside className="flex w-32 shrink-0 flex-col items-center gap-2 rounded-[32px] border border-amb-border bg-amb-rail p-3">
          <div className="w-full pb-1 text-center">
            <p className="font-display text-4xl leading-none">{clock.time}</p>
            <p className="text-sm font-semibold leading-tight text-amb-muted">{clock.period}</p>
            <p className="mt-1 text-xs font-medium leading-tight text-amb-muted">{clock.date}</p>
          </div>
          <div className="h-px w-14 bg-amb-border" />
          <button onClick={() => setDarkMode((value) => !value)} className="touch-button w-full border border-amb-border bg-amb-card text-amb-ink" aria-label="Toggle dark mode">
            {darkMode ? <SunMedium className="h-8 w-8" /> : <Moon className="h-8 w-8" />}
          </button>
          <div className="h-px w-14 bg-amb-border" />
          {orderedNavItems.map((item) => {
            const Icon = item.icon;
            const active = view === item.view;
            const dragging = draggingView === item.view;
            return (
              <button
                key={item.view}
                data-nav-view={item.view}
                onPointerDown={(event) => beginNavPress(event, item.view)}
                onPointerMove={moveNavPress}
                onPointerUp={(event) => finishNavPress(event, item.view)}
                onPointerCancel={(event) => finishNavPress(event, item.view)}
                onClick={(event) => clickNavItem(event, item.view)}
                onDoubleClick={doubleClickNavItem}
                className={`nav-app-button flex h-20 w-full flex-col items-center justify-center gap-1 rounded-2xl text-sm font-semibold transition active:scale-95 ${
                  active ? "bg-amb-card text-amb-ink shadow-ambient" : "text-amb-muted"
                } ${navEditMode ? "nav-app-edit cursor-grab shadow-xl" : ""} ${dragging ? "nav-app-dragging z-10" : ""} ${
                  navEditMode && !dragging ? "scale-[1.03]" : ""
                }`}
                aria-label={item.label}
              >
                <Icon className="h-7 w-7" />
                <span>{item.label}</span>
              </button>
            );
          })}
          {navEditMode && (
            <button
              onClick={exitNavEditMode}
              className="mt-auto min-h-14 rounded-2xl bg-amb-accent px-3 text-base font-black text-amb-accent-ink active:scale-95"
            >
              Done
            </button>
          )}
          {draggingView && navDrag && (
            <NavDragPreview
              item={navItems.find((entry) => entry.view === draggingView)}
              drag={navDrag}
              active={view === draggingView}
            />
          )}
        </aside>
        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {content}
          </div>
        </section>
      </div>
      {externalLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-8">
          <div className="w-full max-w-3xl rounded-[28px] bg-amb-sheet p-8">
            <h2 className="text-3xl font-bold text-amb-ink">Opens outside the dashboard</h2>
            <p className="mt-3 text-xl text-amb-muted">
              The wall display stays on the dashboard. Open this on your phone instead:
            </p>
            <p className="mt-4 break-all rounded-2xl bg-amb-well p-5 text-2xl font-semibold text-sky-700 dark:text-sky-300">
              {externalLink}
            </p>
            <button
              onClick={() => setExternalLink(null)}
              className="mt-6 min-h-16 w-full rounded-2xl bg-sky-600 text-2xl font-black text-white active:scale-95"
            >
              Back to dashboard
            </button>
          </div>
        </div>
      )}
      <ShareBanner onArrived={handleShareArrived} onOpen={openShare} />
      <OnScreenKeyboard
        visible={keyboardVisible}
        getTarget={() => keyboardTargetRef.current}
        onClose={() => setKeyboardVisible(false)}
      />
    </main>
  );
}

/** Which tab owns each kind of card. news is handled in place instead. */
const CARD_TARGET: Partial<Record<HomeCardKind, View>> = {
  event: "calendar",
  task: "tasks",
  grocery: "grocery",
  note: "notes",
  finance: "finance",
  travel: "travel",
  meal: "recipes"
};

const CARD_LOOK: Record<HomeCardKind, { icon: LucideIcon; tint: string; label: string }> = {
  event: { icon: CalendarDays, tint: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", label: "Calendar" },
  task: { icon: CheckCircle2, tint: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", label: "Task" },
  grocery: { icon: ShoppingBasket, tint: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", label: "Grocery" },
  weather: { icon: CloudSun, tint: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300", label: "Weather" },
  news: { icon: Newspaper, tint: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300", label: "News" },
  note: { icon: StickyNote, tint: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300", label: "Note" },
  travel: { icon: Plane, tint: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300", label: "Travel" },
  finance: { icon: Landmark, tint: "bg-slate-200 text-amb-ink dark:bg-slate-700", label: "Finance" },
  meal: { icon: UtensilsCrossed, tint: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300", label: "Tonight" }
};

/** "in 25 min" / "in 2h 10m" — the thing you actually want from a wall display. */
function countdownTo(iso: string, now: Date) {
  const ms = new Date(iso).getTime() - now.getTime();
  if (Number.isNaN(ms)) return null;
  if (ms < -60000) return null;
  const minutes = Math.round(ms / 60000);
  if (minutes <= 0) return "now";
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `in ${hours}h ${rest}m` : `in ${hours}h`;
}

/**
 * Shared entrance: a short rise, staggered by position. Transform and opacity
 * only, so the Pi composites it rather than repainting.
 */
const rise = (step: number) => ({ duration: 0.76, ease: [0.2, 0.7, 0.2, 1] as const, delay: step * 0.1 });

function HomePanel({
  dashboard,
  now,
  onNavigate
}: {
  dashboard: DashboardSummary;
  now: Date;
  onNavigate: (view: View, dealId?: number) => void;
}) {
  const [article, setArticle] = useState<HomeCard | null>(null);
  const [pulse, setPulse] = useState<HomePulse | null>(null);
  const [story, setStory] = useState<MorningStory | null>(null);
  const [storyOpen, setStoryOpen] = useState(false);

  useEffect(() => {
    fetchHomePulse().then(setPulse).catch(() => setPulse(null));
  }, []);

  // Auto-play once per day, and only in the morning, so it never ambushes
  // anyone walking past at dinner time.
  useEffect(() => {
    fetchMorningStory()
      .then((data) => {
        if (!data?.slides?.length) return;
        setStory(data);
        const seen = safeStorageGet("mirror-dashboard-story-seen");
        const today = new Date().toLocaleDateString("en-CA");
        if (seen !== today && data.forDate === today && new Date().getHours() < 10) {
          setStoryOpen(true);
          safeStorageSet("mirror-dashboard-story-seen", today);
        }
      })
      .catch(() => undefined);
  }, []);

  const weather = dashboard.weather;
  const today = weather.daily[0];
  const cards = pulse?.cards ?? [];
  const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  const dateLine = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 px-2 pt-2">
      <div className="flex shrink-0 items-end justify-between gap-8">
        <motion.div className="flex flex-col gap-1.5" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={rise(0)}>
          <p className="text-[26px] font-medium text-amb-muted">{greetingFor(now)}, it&rsquo;s {dateLine}</p>
          <p className="font-display text-[184px] leading-[0.86] tracking-[-0.02em]">
            {part("hour")}:{part("minute")}
            <span className="ml-3.5 text-[66px] italic tracking-normal">{part("dayPeriod")}</span>
          </p>
        </motion.div>
        <motion.div className="flex items-center gap-7" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={rise(1)}>
          <div className="flex flex-col items-end gap-1">
            <p className="font-display text-[120px] leading-[0.9]">{Math.round(weather.current.temperature)}&deg;</p>
            <p className="text-[22px] font-medium text-amb-muted">
              {weather.current.description}
              {today ? `, high ${Math.round(today.high)}°, low ${Math.round(today.low)}°` : ""}
            </p>
          </div>
          {story && (
            <button
              onClick={() => setStoryOpen(true)}
              className="flex h-16 items-center gap-2.5 rounded-full border border-amb-border bg-amb-card px-6 text-xl font-semibold active:scale-95"
              aria-label="Play the morning briefing"
            >
              <Sparkles className="h-5 w-5" />
              Morning briefing
            </button>
          )}
        </motion.div>
      </div>

      {/* The one line worth walking over for. */}
      <motion.div className="flex max-w-[1480px] shrink-0 flex-col gap-2.5" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={rise(2)}>
        <p className="text-xl font-medium text-amb-muted">Right now</p>
        <p className="text-pretty text-[46px] font-semibold leading-[1.12] tracking-[-0.01em]">{pulse?.headline ?? "Reading the day..."}</p>
      </motion.div>

      {/* Ranked cards. The model decides what appears and in what order. */}
      <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-2 gap-6">
        {cards.slice(0, 6).map((card, index) => {
          const look = CARD_LOOK[card.kind] || CARD_LOOK.note;
          const Icon = look.icon;
          const countdown = card.startsAt ? countdownTo(card.startsAt, now) : null;
          return (
            <motion.button
              key={`${card.kind}-${index}`}
              type="button"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...rise(0), delay: 0.32 + index * 0.06 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                // News opens here rather than navigating: the kiosk has no way
                // back from an external site.
                if (card.kind === "news") { setArticle(card); return; }
                const target = CARD_TARGET[card.kind];
                if (target) onNavigate(target, card.dealId);
              }}
              className="flex min-h-0 flex-col gap-3 overflow-hidden rounded-[30px] border border-amb-border bg-amb-card px-[30px] py-7 text-left shadow-ambient"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2.5 text-lg font-semibold text-amb-muted">
                  <Icon className="h-5 w-5" />
                  {look.label}
                </span>
                {card.urgency === "now" && (
                  <span className="rounded-full bg-amb-accent px-3.5 py-1.5 text-sm font-bold text-amb-accent-ink">Now</span>
                )}
              </div>
              <p className="line-clamp-3 font-display text-[44px] leading-[1.02]">{card.title}</p>
              {countdown && <p className="text-[21px] font-semibold text-amb-ink first-letter:uppercase">{countdown}</p>}
              <p className="line-clamp-3 text-[21px] leading-[1.4] text-amb-muted">{card.detail}</p>
            </motion.button>
          );
        })}

        {!cards.length && (
          <div className="col-span-3 row-span-2 flex items-center justify-center rounded-[30px] border border-amb-border bg-amb-card text-2xl text-amb-muted">
            Working out what matters today...
          </div>
        )}
      </div>

      {article && <ArticleReader card={article} onClose={() => setArticle(null)} />}
      {storyOpen && story && <MorningStoryPlayer story={story} onClose={() => setStoryOpen(false)} />}
    </div>
  );
}

/**
 * Opens a headline without leaving the dashboard. The kiosk deliberately blocks
 * outbound navigation - there is no back button on a wall display - so the
 * article is presented here with a QR code to carry it to a phone.
 */
function ArticleReader({ card, onClose }: { card: HomeCard; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-10" onClick={onClose}>
      <div
        className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-[28px] bg-amb-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        {card.imageUrl && (
          <img
            src={card.imageUrl}
            alt=""
            className="h-72 w-full shrink-0 object-cover"
            onError={(event) => { event.currentTarget.style.display = "none"; }}
          />
        )}
        <div className="flex min-h-0 flex-1 gap-8 overflow-y-auto p-8">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black uppercase tracking-widest text-violet-600 dark:text-violet-400">
              {card.source || "News"}
            </p>
            <h2 className="mt-3 text-4xl font-black leading-tight text-amb-ink">{card.title}</h2>
            <p className="mt-4 text-2xl leading-snug text-amb-muted">{card.detail}</p>
            {card.bullets && card.bullets.length > 0 && (
              <ul className="mt-6 space-y-3 border-t border-mirror-line pt-5">
                {card.bullets.map((bullet, position) => (
                  <li key={position} className="flex gap-3 text-xl leading-snug text-amb-muted">
                    <span className="text-violet-500">&middot;</span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {card.link && (
            <div className="shrink-0">
              <SlideQr url={card.link} />
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="m-8 mt-0 min-h-16 shrink-0 rounded-2xl bg-sky-600 text-2xl font-black text-white active:scale-95"
        >
          Back to dashboard
        </button>
      </div>
    </div>
  );
}

const SLIDE_TINT: Record<StorySlideKind, string> = {
  greeting: "from-sky-600 to-indigo-800",
  weather: "from-cyan-600 to-sky-800",
  schedule: "from-violet-600 to-purple-900",
  tasks: "from-emerald-600 to-teal-800",
  news: "from-slate-700 to-slate-900",
  markets: "from-slate-800 to-slate-950",
  finance: "from-emerald-700 to-slate-900",
  travel: "from-amber-500 to-orange-700",
  closing: "from-indigo-600 to-slate-900"
};

const SLIDE_MS = 6400;

/** Sparkline as a plain SVG path — no chart library, and it scales crisply. */
function Sparkline({ points, positive }: { points: number[]; positive: boolean }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const path = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 30 - ((value - min) / span) * 28;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-10 w-40">
      <path
        d={path}
        fill="none"
        strokeWidth={2.5}
        vectorEffect="non-scaling-stroke"
        className={`story-spark ${positive ? "stroke-emerald-400" : "stroke-rose-400"}`}
      />
    </svg>
  );
}

/** Scan-to-open: the kiosk deliberately refuses to navigate away, so the phone is the way out. */
function SlideQr({ url, label = "Scan to open on your phone" }: { url: string; label?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: "#0f172a", light: "#ffffff" } })
      .then((data) => { if (live) setSrc(data); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [url]);
  if (!src) return null;
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-white/95 p-4">
      <img src={src} alt="" className="h-28 w-28" />
      <p className="max-w-[9rem] text-lg font-bold leading-tight text-amb-ink">{label}</p>
    </div>
  );
}

function MorningStoryPlayer({ story, onClose }: { story: MorningStory; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // The budget bar grows on a transition rather than a keyframe: var() inside
  // @keyframes is not reliably interpolated, and the bar rendered stuck at zero.
  const [revealed, setRevealed] = useState(false);
  const slides = story.slides;

  useEffect(() => {
    setRevealed(false);
    const timer = window.setTimeout(() => setRevealed(true), 80);
    return () => window.clearTimeout(timer);
  }, [index]);

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => {
      if (index >= slides.length - 1) onClose();
      else setIndex((current) => current + 1);
    }, SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [index, paused, slides.length, onClose]);

  const slide = slides[index];
  if (!slide) return null;

  const money = slide.money || [];
  const quotes = slide.quotes || [];

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col bg-gradient-to-br ${SLIDE_TINT[slide.kind] || SLIDE_TINT.greeting}`}
      onClick={() => (index >= slides.length - 1 ? onClose() : setIndex(index + 1))}
    >
      {slide.imageUrl && (
        <>
          <img
            key={slide.imageUrl}
            src={slide.imageUrl}
            alt=""
            decoding="async"
            className="story-kenburns absolute inset-0 h-full w-full object-cover"
            onError={(event) => { event.currentTarget.style.display = "none"; }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/65 to-black/35" />
        </>
      )}

      <div className="relative flex shrink-0 gap-2 p-6">
        {slides.map((_, position) => (
          <div key={position} className="h-2 flex-1 overflow-hidden rounded-full bg-white/25">
            <div
              className={`h-full rounded-full bg-white ${position === index && !paused ? "story-progress" : ""}`}
              style={{ width: position < index ? "100%" : position === index ? undefined : "0%" }}
            />
          </div>
        ))}
      </div>

      <div className="relative flex min-h-0 flex-1 gap-12 px-16 pb-20">
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <p key={`t-${index}`} className="story-rise text-7xl font-black leading-none text-white">{slide.title}</p>
          <div className="mt-7 space-y-3">
            {slide.lines.map((line, position) => (
              <p
                key={`${index}-${position}`}
                className="story-rise text-3xl font-semibold leading-snug text-white/90"
                style={{ animationDelay: `${140 + position * 100}ms` }}
              >
                {line}
              </p>
            ))}
          </div>
          {slide.link && (
            <div key={`q-${index}`} className="story-rise mt-8 w-fit" style={{ animationDelay: "420ms" }}>
              <SlideQr url={slide.link} />
            </div>
          )}
        </div>

        {/* Data panel: real figures rendered beside the narrative. */}
        {(quotes.length > 0 || money.length > 0 || slide.forecast?.length || slide.agenda?.length || slide.checklist?.length) && (
          <div key={`d-${index}`} className="story-rise flex w-[38%] shrink-0 flex-col justify-center" style={{ animationDelay: "220ms" }}>
            {quotes.length > 0 && (
              <div className="space-y-3">
                {quotes.map((quote) => {
                  const up = (quote.changePercent ?? 0) >= 0;
                  return (
                    <div key={quote.symbol} className="flex items-center gap-4 rounded-2xl bg-white/10 p-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-2xl font-black text-white">{quote.symbol}</p>
                        <p className="text-lg text-white/70">{quote.price?.toFixed(2)}</p>
                      </div>
                      <Sparkline points={quote.spark || []} positive={up} />
                      <p className={`w-24 text-right text-2xl font-black ${up ? "text-emerald-300" : "text-rose-300"}`}>
                        {up ? "+" : ""}{(quote.changePercent ?? 0).toFixed(1)}%
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {money.length > 0 && (
              <div className="space-y-4">
                {money.map((entry) => (
                  <div key={entry.label} className="rounded-2xl bg-white/10 p-5">
                    <p className="text-lg font-bold uppercase tracking-widest text-white/60">{entry.label}</p>
                    <p className={`text-5xl font-black ${
                      entry.tone === "good" ? "text-emerald-300" : entry.tone === "bad" ? "text-rose-300" : "text-white"
                    }`}>
                      {entry.value}
                    </p>
                  </div>
                ))}
                {slide.budget && slide.budget.limit > 0 && (
                  <div className="rounded-2xl bg-white/10 p-5">
                    <div className="flex justify-between text-lg font-bold text-white/70">
                      <span>Budget</span>
                      <span>{Math.round((slide.budget.spent / slide.budget.limit) * 100)}%</span>
                    </div>
                    <div className="mt-3 h-4 overflow-hidden rounded-full bg-white/20">
                      <div
                        className="h-full rounded-full bg-amber-300 transition-[width] duration-700 ease-out"
                        style={{ width: revealed ? `${Math.min(100, (slide.budget.spent / slide.budget.limit) * 100)}%` : "0%" }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {slide.forecast && slide.forecast.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {slide.forecast.map((day) => (
                  <div key={day.label} className="rounded-2xl bg-white/10 p-5">
                    <p className="text-xl font-black text-white">{day.label}</p>
                    <p className="text-4xl font-black text-white">{day.high}&deg;</p>
                    <p className="text-lg text-white/70">Low {day.low}&deg;, {day.description.charAt(0).toLowerCase() + day.description.slice(1)}</p>
                  </div>
                ))}
              </div>
            )}

            {slide.agenda && slide.agenda.length > 0 && (
              <div className="space-y-3">
                {slide.agenda.map((entry, position) => (
                  <div key={position} className="flex items-center gap-4 rounded-2xl bg-white/10 p-4">
                    <span className="w-24 shrink-0 text-xl font-black text-white/80">{entry.time}</span>
                    <span className="min-w-0 flex-1 truncate text-2xl font-bold text-white">{entry.title}</span>
                  </div>
                ))}
              </div>
            )}

            {slide.checklist && slide.checklist.length > 0 && (
              <div className="space-y-3">
                {slide.checklist.map((entry, position) => (
                  <div key={position} className="flex items-center gap-4 rounded-2xl bg-white/10 p-4">
                    <span className="h-6 w-6 shrink-0 rounded-full border-4 border-amb-border" />
                    <span className="min-w-0 flex-1 truncate text-2xl font-bold text-white">{entry.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="absolute bottom-8 right-8 flex gap-3">
        <button
          onClick={(event) => { event.stopPropagation(); setPaused((value) => !value); }}
          className="min-h-16 rounded-2xl bg-white/20 px-8 text-xl font-black text-white active:scale-95"
        >
          {paused ? "Play" : "Pause"}
        </button>
        <button
          onClick={(event) => { event.stopPropagation(); onClose(); }}
          className="min-h-16 rounded-2xl bg-white/20 px-8 text-xl font-black text-white active:scale-95"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

function NavDragPreview({ item, drag, active }: { item?: { view: View; label: string; icon: LucideIcon }; drag: { x: number; y: number; offsetX: number; offsetY: number; width: number; height: number }; active: boolean }) {
  if (!item) return null;
  const Icon = item.icon;
  return (
    <div
      className={`pointer-events-none fixed z-[90] flex flex-col items-center justify-center gap-1 rounded-2xl text-base font-semibold shadow-2xl ring-4 ring-white/70 ${
        active ? "bg-sky-600 text-white" : "bg-amb-card text-amb-ink"
      }`}
      style={{
        left: drag.x - drag.offsetX,
        top: drag.y - drag.offsetY,
        width: drag.width,
        height: drag.height,
        transform: "scale(1.14)",
        transformOrigin: "center"
      }}
    >
      <Icon className="h-8 w-8" />
      <span>{item.label}</span>
    </div>
  );
}

function WeatherCard({ dashboard }: { dashboard: DashboardSummary }) {
  return (
    <>
      <SectionTitle icon={CloudSun} title="Weather" />
      <div className="mt-5 flex items-end justify-between">
        <div>
          <p className="text-8xl font-bold">{dashboard.weather.current.temperature} deg</p>
          <p className="text-2xl text-amb-muted">Feels like {dashboard.weather.current.apparentTemperature} deg</p>
        </div>
        <p className="mb-3 rounded-full bg-sky-100 px-5 py-3 text-lg font-semibold text-sky-800">{dashboard.weather.current.description}</p>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-3">
        {dashboard.weather.daily.slice(0, 4).map((day) => (
          <div key={day.date} className="rounded-2xl bg-amb-well p-4">
            <p className="font-bold">{formatShortDate(day.date)}</p>
            <p className="text-amb-muted">{day.high} deg / {day.low} deg</p>
          </div>
        ))}
      </div>
    </>
  );
}

function CalendarPanel({ events }: { events: CalendarEvent[] }) {
  const [weekEvents, setWeekEvents] = useState(events.map(normalizeEventEnd));
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("Week");
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventDate, setNewEventDate] = useState(today());
  const [newEventStart, setNewEventStart] = useState("09:00");
  const [newEventEnd, setNewEventEnd] = useState("10:00");
  // Which week is on screen. 0 is this week; drag the grid sideways to move.
  const [weekOffset, setWeekOffset] = useState(0);
  const [panDx, setPanDx] = useState(0);
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const panRef = useRef<{ startX: number; moved: boolean } | null>(null);
  const weekStart = addClientDays(startOfWeek(new Date()), weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, index) => addClientDays(weekStart, index));
  const startHour = 6;
  const endHour = 22;
  const hourHeight = 64;
  const dayWidthPercent = 100 / 7;

  useEffect(() => {
    setWeekEvents(events.map(normalizeEventEnd));
  }, [events]);

  // The dashboard payload caps the calendar at eight events for the Home
  // summary, which is not enough once you can page into other weeks.
  useEffect(() => {
    fetchCalendarEvents()
      .then((all) => setWeekEvents(all.map(normalizeEventEnd)))
      .catch(() => undefined);
  }, []);

  function panWeek(delta: number) {
    setWeekOffset((current) => current + delta);
  }

  function updateEventTime(id: string, patch: { start?: Date; end?: Date }) {
    setWeekEvents((current) =>
      current.map((event) => {
        if (event.id !== id) return event;
        const nextStart = patch.start ?? new Date(event.start);
        const nextEnd = patch.end ?? new Date(event.end || event.start);
        return { ...event, start: nextStart.toISOString(), end: nextEnd.toISOString() };
      })
    );
  }

  function addLocalEvent() {
    if (!newEventTitle.trim()) return;
    const start = new Date(`${newEventDate}T${newEventStart}:00`);
    const end = new Date(`${newEventDate}T${newEventEnd}:00`);
    if (end.getTime() <= start.getTime()) end.setTime(start.getTime() + 60 * 60 * 1000);

    const localEvent: CalendarEvent = {
      id: `local-${Date.now()}`,
      title: newEventTitle.trim(),
      start: start.toISOString(),
      end: end.toISOString(),
      source: "demo"
    };

    setWeekEvents((current) => [...current, localEvent].sort((a, b) => a.start.localeCompare(b.start)));
    setNewEventTitle("");
    setIsEventModalOpen(false);
  }

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>, calendarEvent: CalendarEvent) {
    event.preventDefault();
    const target = event.currentTarget;
    const grid = target.closest("[data-week-grid]") as HTMLElement | null;
    if (!grid) return;
    const weekGrid = grid;
    const start = new Date(calendarEvent.start);
    const end = new Date(calendarEvent.end || calendarEvent.start);
    const duration = end.getTime() - start.getTime();
    const offsetY = event.clientY - target.getBoundingClientRect().top;
    let frame = 0;
    let latestPointer: PointerEvent | null = null;

    function applyMove(pointerEvent: PointerEvent) {
      const rect = weekGrid.getBoundingClientRect();
      const dayIndex = clamp(Math.floor(((pointerEvent.clientX - rect.left) / rect.width) * 7), 0, 6);
      const minutesFromStart = clamp(Math.round(((pointerEvent.clientY - rect.top - offsetY) / hourHeight) * 60 / 15) * 15, 0, (endHour - startHour) * 60 - 15);
      const nextStart = new Date(days[dayIndex]);
      nextStart.setHours(startHour, minutesFromStart, 0, 0);
      const nextEnd = new Date(nextStart.getTime() + duration);
      updateEventTime(calendarEvent.id, { start: nextStart, end: nextEnd });
    }

    function move(pointerEvent: PointerEvent) {
      latestPointer = pointerEvent;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (latestPointer) applyMove(latestPointer);
      });
    }

    function up() {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
  }

  function beginResize(event: ReactPointerEvent<HTMLDivElement>, calendarEvent: CalendarEvent) {
    event.stopPropagation();
    event.preventDefault();
    const target = event.currentTarget;
    const grid = target.closest("[data-week-grid]") as HTMLElement | null;
    if (!grid) return;
    const weekGrid = grid;
    const start = new Date(calendarEvent.start);
    let frame = 0;
    let latestPointer: PointerEvent | null = null;

    function applyMove(pointerEvent: PointerEvent) {
      const rect = weekGrid.getBoundingClientRect();
      const minutesFromStart = clamp(Math.round(((pointerEvent.clientY - rect.top) / hourHeight) * 60 / 15) * 15, 15, (endHour - startHour) * 60);
      const nextEnd = new Date(start);
      nextEnd.setHours(startHour, minutesFromStart, 0, 0);
      if (nextEnd.getTime() <= start.getTime()) nextEnd.setTime(start.getTime() + 15 * 60 * 1000);
      updateEventTime(calendarEvent.id, { end: nextEnd });
    }

    function move(pointerEvent: PointerEvent) {
      latestPointer = pointerEvent;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (latestPointer) applyMove(latestPointer);
      });
    }

    function up() {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up);
  }

  return (
    <section className="relative flex flex-1 flex-col overflow-hidden rounded-[28px] border border-amb-border bg-amb-card p-5 shadow-sm">
      <div className="grid min-h-0 flex-1 grid-cols-[300px_1fr] gap-5">
        <aside className="flex min-h-0 flex-col gap-4 rounded-[24px] bg-amb-card p-5 shadow-sm">
          <div className="grid grid-cols-2 gap-2">
            {(["Day", "Week", "Month", "Schedule"] as CalendarMode[]).map((label) => (
              <button
                key={label}
                onClick={() => setCalendarMode(label)}
                className={`h-16 rounded-xl text-xl font-bold ${
                  label === calendarMode
                    ? "bg-amb-accent text-amb-accent-ink"
                    : "bg-amb-well text-amb-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setIsEventModalOpen(true)}
            className="flex min-h-16 items-center justify-center rounded-2xl bg-[#ffcf5a] text-xl font-black text-slate-900 active:scale-95"
          >
            <Plus className="mr-2 h-7 w-7" /> Event
          </button>
          {calendarMode === "Week" && (
            <div className="rounded-2xl bg-amb-well p-3">
              <div className="flex items-center justify-between gap-2">
                <button onClick={() => panWeek(-1)} className="flex h-14 w-14 items-center justify-center rounded-xl bg-amb-card text-amb-ink active:scale-95" aria-label="Previous week">
                  <ChevronLeft className="h-7 w-7" />
                </button>
                <div className="min-w-0 flex-1 text-center">
                  <p className="truncate text-base font-black text-amb-ink">
                    {weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - {addClientDays(weekStart, 6).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                  <p className="text-xs font-bold uppercase tracking-wider text-amb-muted">
                    {weekOffset === 0 ? "This week" : weekOffset > 0 ? `${weekOffset} week${weekOffset > 1 ? "s" : ""} ahead` : `${Math.abs(weekOffset)} week${weekOffset < -1 ? "s" : ""} back`}
                  </p>
                </div>
                <button onClick={() => panWeek(1)} className="flex h-14 w-14 items-center justify-center rounded-xl bg-amb-card text-amb-ink active:scale-95" aria-label="Next week">
                  <ChevronRight className="h-7 w-7" />
                </button>
              </div>
              {weekOffset !== 0 && (
                <button onClick={() => setWeekOffset(0)} className="mt-2 min-h-12 w-full rounded-xl bg-sky-600 text-lg font-black text-white active:scale-95">
                  Back to today
                </button>
              )}
            </div>
          )}
          <div className="rounded-3xl bg-[#eef5ff] p-5 dark:bg-slate-800">
            <p className="text-lg font-bold text-amb-muted">{new Date().toLocaleDateString([], { weekday: "long" })}</p>
            <p className="text-6xl font-bold text-amb-ink">{new Date().getDate()}</p>
            <p className="mt-2 text-xl font-semibold text-amb-muted">{new Date().toLocaleDateString([], { month: "long", year: "numeric" })}</p>
          </div>
          <div className="rounded-3xl bg-[#fff7df] p-5 dark:bg-slate-800">
            <p className="text-xl font-bold text-amb-ink">Calendars</p>
            <div className="mt-4 space-y-3">
              {profilePalette.map((profile) => (
                <div key={profile.name} className="flex items-center gap-3">
                  <span className="h-5 w-5 rounded-full" style={{ background: profile.color }} />
                  <span className="text-lg font-semibold text-amb-muted">{profile.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 rounded-3xl bg-amb-card p-4 shadow-inner">
            <p className="mb-3 text-xl font-bold text-amb-ink">Today</p>
            <div className="space-y-3 overflow-y-auto pr-1">
              {weekEvents.filter((item) => isSameClientDate(new Date(item.start), new Date())).slice(0, 5).map((item) => {
                const colors = eventColor(item);
                return (
                  <div key={item.id} className="rounded-2xl p-3" style={{ background: colors.soft }}>
                    <p className="text-sm font-bold" style={{ color: colors.text }}>{formatTimeOnly(item.start)}</p>
                    <p className="truncate text-lg font-bold text-amb-ink">{item.title}</p>
                  </div>
                );
              })}
              {!weekEvents.some((item) => isSameClientDate(new Date(item.start), new Date())) && (
                <p className="rounded-2xl bg-amb-well p-4 text-lg font-semibold text-amb-muted">No events today.</p>
              )}
            </div>
          </div>
        </aside>

        <div
          className="relative flex min-h-0 flex-col overflow-hidden rounded-[24px] bg-amb-card shadow-sm"
          onPointerDown={(pointerEvent) => {
            // Dragging an event moves the event; dragging the grid moves weeks.
            if (calendarMode !== "Week") return;
            const target = pointerEvent.target as HTMLElement | null;
            if (target?.closest?.("[data-event-chip]")) return;
            panRef.current = { startX: pointerEvent.clientX, moved: false };
          }}
          onPointerMove={(pointerEvent) => {
            const pan = panRef.current;
            if (!pan) return;
            const dx = pointerEvent.clientX - pan.startX;
            if (Math.abs(dx) > 8) pan.moved = true;
            setPanDx(dx);
          }}
          onPointerUp={(pointerEvent) => {
            const pan = panRef.current;
            panRef.current = null;
            setPanDx(0);
            if (!pan) return;
            const dx = pointerEvent.clientX - pan.startX;
            // A quarter of the pane is a deliberate swipe rather than a wobble.
            const threshold = pointerEvent.currentTarget.getBoundingClientRect().width / 4;
            if (Math.abs(dx) > threshold) panWeek(dx < 0 ? 1 : -1);
          }}
          onPointerCancel={() => { panRef.current = null; setPanDx(0); }}
        >
          {calendarMode !== "Week" && (
            <div className="absolute inset-0 z-20 bg-amb-sheet p-5">
              {calendarMode === "Day" && <CalendarDayView events={weekEvents} day={new Date()} />}
              {calendarMode === "Month" && (
                <CalendarMonthView
                  events={weekEvents}
                  monthDate={new Date()}
                  onOpenEvent={setDetailEvent}
                  onMoved={setWeekEvents}
                />
              )}
              {calendarMode === "Schedule" && <CalendarScheduleView events={weekEvents} />}
            </div>
          )}
          <div
            className="grid shrink-0 grid-cols-[86px_1fr] border-b border-mirror-line"
            style={{ transform: `translateX(${panDx * 0.25}px)`, transition: panRef.current ? "none" : "transform 200ms ease-out" }}
          >
            <div className="flex items-center justify-center text-sm font-bold text-amb-muted">Time</div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const active = isSameClientDate(day, new Date());
                return (
                  <div key={day.toISOString()} className={`border-r border-mirror-line px-3 py-4 last:border-r-0 ${active ? "bg-amb-accent [&_p]:text-amb-accent-ink" : ""}`}>
                    <p className="text-lg font-bold text-amb-muted">{day.toLocaleDateString([], { weekday: "short" })}</p>
                    <p className="text-4xl font-bold text-amb-ink">{day.getDate()}</p>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-[86px_1fr] overflow-y-auto">
            <div className="relative bg-amb-card" style={{ height: (endHour - startHour) * hourHeight }}>
              {Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index).map((hour) => (
                <div key={hour} className="absolute left-0 right-3 -translate-y-3 text-right text-base font-bold text-amb-muted" style={{ top: (hour - startHour) * hourHeight }}>
                  {formatHour(hour)}
                </div>
              ))}
            </div>
            <div data-week-grid className="relative touch-none bg-amb-card" style={{ height: (endHour - startHour) * hourHeight }}>
              <div className="absolute inset-0 grid grid-cols-7">
                {days.map((day) => (
                  <div key={day.toISOString()} className="border-r border-mirror-line last:border-r-0" />
                ))}
              </div>
              <div className="absolute inset-0">
                {Array.from({ length: endHour - startHour + 1 }, (_, index) => (
                  <div key={index} className="absolute left-0 right-0 border-t border-mirror-line" style={{ top: index * hourHeight }} />
                ))}
              </div>
              {weekEvents.map((calendarEvent) => {
                const start = new Date(calendarEvent.start);
                const end = new Date(calendarEvent.end || calendarEvent.start);
                const dayIndex = days.findIndex((day) => isSameClientDate(day, start));
                if (dayIndex < 0) return null;
                const top = ((start.getHours() - startHour) * 60 + start.getMinutes()) / 60 * hourHeight;
                const height = Math.max(58, (end.getTime() - start.getTime()) / (60 * 60 * 1000) * hourHeight);
                if (top < 0 || top > (endHour - startHour) * hourHeight) return null;
                const colors = eventColor(calendarEvent);

                return (
                  <div
                    key={calendarEvent.id}
                    onPointerDown={(pointerEvent) => beginDrag(pointerEvent, calendarEvent)}
                    data-event-chip
                    className="absolute overflow-hidden cursor-grab select-none rounded-xl border-l-[6px] px-2.5 py-1.5 shadow-sm active:cursor-grabbing"
                    style={{
                      left: `calc(${dayIndex * dayWidthPercent}% + 8px)`,
                      top,
                      width: `calc(${dayWidthPercent}% - 16px)`,
                      height,
                      background: colors.soft,
                      borderColor: colors.color
                    }}
                  >
                    <p className="text-xs font-bold leading-tight" style={{ color: colors.text }}>{formatTimeOnly(calendarEvent.start)} - {formatTimeOnly(calendarEvent.end || calendarEvent.start)}</p>
                    <p className="mt-0.5 line-clamp-2 text-base font-bold leading-tight text-amb-ink">{calendarEvent.title}</p>
                    <div
                      onPointerDown={(pointerEvent) => beginResize(pointerEvent, calendarEvent)}
                      className="absolute bottom-0.5 left-1/2 h-2 w-10 -translate-x-1/2 rounded-full opacity-60"
                      style={{ background: colors.color }}
                    />
                  </div>
                );
              })}
              {!weekEvents.length && (
                <div className="absolute inset-x-0 top-10 text-center text-2xl font-semibold text-amb-muted">No events this week.</div>
              )}
            </div>
          </div>
        </div>
      </div>
      {detailEvent && <EventDetailDialog calendarEvent={detailEvent} onClose={() => setDetailEvent(null)} />}
      {isEventModalOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/35 p-8">
          <div className="w-full max-w-3xl rounded-[28px] bg-amb-sheet p-7 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-4xl font-bold text-amb-ink">Add Event</h3>
              <button onClick={() => setIsEventModalOpen(false)} className="touch-button bg-amb-well px-6 text-amb-ink">Close</button>
            </div>
            <div className="mt-6 grid gap-4">
              <input value={newEventTitle} onChange={(event) => setNewEventTitle(event.target.value)} className="touch-input" placeholder="Event title" autoFocus />
              <div className="grid grid-cols-3 gap-4">
                <input value={newEventDate} onChange={(event) => setNewEventDate(event.target.value)} className="touch-input" type="date" />
                <input value={newEventStart} onChange={(event) => setNewEventStart(event.target.value)} className="touch-input" type="time" />
                <input value={newEventEnd} onChange={(event) => setNewEventEnd(event.target.value)} className="touch-input" type="time" />
              </div>
              <button onClick={addLocalEvent} className="touch-button bg-[#ffcf5a] text-slate-900"><Plus className="mr-2 h-7 w-7" /> Add to Calendar</button>
              <p className="text-lg font-semibold text-amb-muted">This adds a local display event for now. Google/iCloud write-back comes in the calendar persistence phase.</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function CalendarDayView({ events, day }: { events: CalendarEvent[]; day: Date }) {
  const dayEvents = events.filter((event) => isSameClientDate(new Date(event.start), day)).sort((a, b) => a.start.localeCompare(b.start));
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-end justify-between border-b border-mirror-line pb-4">
        <div>
          <p className="text-lg font-bold uppercase text-amb-muted">Day View</p>
          <h3 className="text-5xl font-bold text-amb-ink">{day.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</h3>
        </div>
        <p className="rounded-full bg-[#fff3c4] px-5 py-3 text-xl font-bold text-slate-700">{dayEvents.length} events</p>
      </div>
      <div className="mt-5 space-y-4 overflow-y-auto pr-2">
        {dayEvents.map((event) => {
          const colors = eventColor(event);
          return (
            <div key={event.id} className="rounded-3xl border-l-[12px] p-5" style={{ background: colors.soft, borderColor: colors.color }}>
              <p className="text-lg font-bold" style={{ color: colors.text }}>{formatTimeOnly(event.start)} - {formatTimeOnly(event.end || event.start)}</p>
              <p className="text-3xl font-bold text-amb-ink">{event.title}</p>
            </div>
          );
        })}
        {!dayEvents.length && <p className="rounded-3xl bg-amb-well p-8 text-2xl font-bold text-amb-muted">No events today.</p>}
      </div>
    </div>
  );
}

function EventDetailDialog({ calendarEvent, onClose }: { calendarEvent: CalendarEvent; onClose: () => void }) {
  const colors = eventColor(calendarEvent);
  const start = new Date(calendarEvent.start);
  const end = calendarEvent.end ? new Date(calendarEvent.end) : null;
  const sourceLabel: Record<string, string> = {
    ical: "Subscribed calendar",
    google: "Google Calendar",
    local: "Added here",
    voice: "Added by voice",
    demo: "Example"
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-10" onClick={onClose}>
      <div
        className="w-full max-w-2xl overflow-hidden rounded-[28px] bg-amb-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="p-8" style={{ borderTop: `10px solid ${colors.color}` }}>
          <p className="text-sm font-black uppercase tracking-widest" style={{ color: colors.text }}>
            {sourceLabel[calendarEvent.source] || calendarEvent.source}
          </p>
          <h2 className="mt-3 text-4xl font-black leading-tight text-amb-ink">{calendarEvent.title}</h2>

          <div className="mt-6 space-y-3 border-t border-mirror-line pt-5 text-2xl">
            <p className="font-bold text-amb-ink">
              {start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
            <p className="text-amb-muted">
              {formatTimeOnly(calendarEvent.start)}{end ? ` - ${formatTimeOnly(end.toISOString())}` : ""}
            </p>
            {calendarEvent.location && (
              <p className="text-amb-muted">{calendarEvent.location}</p>
            )}
            {calendarEvent.moved && (
              <p className="rounded-2xl bg-amber-100 p-4 text-lg font-semibold text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
                Moved on this dashboard. The original calendar still has it at its old time.
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            className="mt-7 min-h-16 w-full rounded-2xl bg-sky-600 text-2xl font-black text-white active:scale-95"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function CalendarMonthView({
  events,
  monthDate,
  onOpenEvent,
  onMoved
}: {
  events: CalendarEvent[];
  monthDate: Date;
  onOpenEvent: (event: CalendarEvent) => void;
  onMoved: (events: CalendarEvent[]) => void;
}) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const monthDays = Array.from({ length: 35 }, (_, index) => addClientDays(gridStart, index));

  // A press only becomes a drag after being held, so a tap still opens the
  // event and a scroll does not pick one up by accident.
  const HOLD_MS = 320;
  const [dragging, setDragging] = useState<{ event: CalendarEvent; x: number; y: number } | null>(null);
  const [hoverDay, setHoverDay] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const holdRef = useRef<{ timer: number; event: CalendarEvent; startX: number; startY: number; held: boolean } | null>(null);

  function clearHold() {
    if (holdRef.current) window.clearTimeout(holdRef.current.timer);
    holdRef.current = null;
  }

  function dayUnderPointer(x: number, y: number) {
    const element = document.elementFromPoint(x, y) as HTMLElement | null;
    return element?.closest?.("[data-month-day]")?.getAttribute("data-month-day") || null;
  }

  function beginPress(pointerEvent: ReactPointerEvent<HTMLButtonElement>, calendarEvent: CalendarEvent) {
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
    const startX = pointerEvent.clientX;
    const startY = pointerEvent.clientY;
    const timer = window.setTimeout(() => {
      if (!holdRef.current) return;
      holdRef.current.held = true;
      setDragging({ event: calendarEvent, x: startX, y: startY });
    }, HOLD_MS);
    holdRef.current = { timer, event: calendarEvent, startX, startY, held: false };
  }

  function movePress(pointerEvent: ReactPointerEvent<HTMLButtonElement>) {
    const hold = holdRef.current;
    if (!hold) return;
    const dx = Math.abs(pointerEvent.clientX - hold.startX);
    const dy = Math.abs(pointerEvent.clientY - hold.startY);
    // Moving before the hold completes means they are scrolling, not dragging.
    if (!hold.held && (dx > 12 || dy > 12)) {
      clearHold();
      return;
    }
    if (!hold.held) return;
    // The held event follows the finger now; tell the page not to scroll under it.
    pointerEvent.preventDefault();
    setDragging({ event: hold.event, x: pointerEvent.clientX, y: pointerEvent.clientY });
    setHoverDay(dayUnderPointer(pointerEvent.clientX, pointerEvent.clientY));
  }

  async function endPress(pointerEvent: ReactPointerEvent<HTMLButtonElement>, calendarEvent: CalendarEvent) {
    const hold = holdRef.current;
    clearHold();
    const wasDragging = Boolean(hold?.held);
    setDragging(null);
    setHoverDay(null);

    if (!wasDragging) {
      onOpenEvent(calendarEvent);
      return;
    }

    const targetDay = dayUnderPointer(pointerEvent.clientX, pointerEvent.clientY);
    if (!targetDay) return;

    const start = new Date(calendarEvent.start);
    const target = new Date(targetDay);
    if (isSameClientDate(start, target)) return;

    // Keep the time of day; only the date changes.
    const nextStart = new Date(target);
    nextStart.setHours(start.getHours(), start.getMinutes(), 0, 0);
    const duration = calendarEvent.end
      ? new Date(calendarEvent.end).getTime() - start.getTime()
      : 60 * 60 * 1000;

    setSaving(true);
    try {
      const updated = await moveCalendarEvent(
        calendarEvent.id,
        nextStart.toISOString(),
        new Date(nextStart.getTime() + duration).toISOString()
      );
      onMoved(updated.map(normalizeEventEnd));
    } catch {
      // Leave the event where it was; the list is refetched on the next load.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-end justify-between border-b border-mirror-line pb-4">
        <div>
          <p className="text-lg font-bold uppercase text-amb-muted">Month View</p>
          <h3 className="text-5xl font-bold text-amb-ink">
            {monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </h3>
        </div>
        <p className="text-base font-semibold text-amb-muted">
          {saving ? "Moving..." : "Tap an event for details, or hold to drag it to another day"}
        </p>
      </div>

      <div className="mt-4 grid min-h-0 flex-1 grid-cols-7 gap-2">
        {monthDays.map((day) => {
          const key = day.toISOString();
          const dayEvents = events.filter((event) => isSameClientDate(new Date(event.start), day));
          const muted = day.getMonth() !== monthDate.getMonth();
          const today = isSameClientDate(day, new Date());
          const isTarget = hoverDay === key && Boolean(dragging);
          return (
            <div
              key={key}
              data-month-day={key}
              className={`flex min-h-0 flex-col overflow-hidden rounded-2xl p-2 transition-colors ${
                isTarget ? "bg-sky-100 ring-4 ring-sky-400 dark:bg-sky-500/20" : "bg-amb-card"
              } ${muted ? "opacity-45" : ""}`}
            >
              <p className={`shrink-0 text-lg font-bold ${today ? "text-sky-600 dark:text-sky-400" : "text-amb-ink"}`}>
                {day.getDate()}
              </p>
              <div className="mt-1 min-h-0 flex-1 space-y-1 overflow-y-auto">
                {dayEvents.map((calendarEvent) => {
                  const colors = eventColor(calendarEvent);
                  const isHeld = dragging?.event.id === calendarEvent.id;
                  return (
                    <button
                      key={calendarEvent.id}
                      type="button"
                      onPointerDown={(pointerEvent) => beginPress(pointerEvent, calendarEvent)}
                      onPointerMove={movePress}
                      onPointerUp={(pointerEvent) => endPress(pointerEvent, calendarEvent)}
                      onPointerCancel={clearHold}
                      className={`w-full touch-none rounded-lg px-2 py-1 text-left transition ${isHeld ? "opacity-30" : "active:scale-95"}`}
                      style={{ background: colors.soft, borderLeft: `4px solid ${colors.color}` }}
                    >
                      <p className="truncate text-xs font-bold" style={{ color: colors.text }}>
                        {formatTimeOnly(calendarEvent.start)}
                      </p>
                      <p className="line-clamp-2 text-sm font-bold leading-tight text-amb-ink">
                        {calendarEvent.title}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Follows the finger so it is obvious what is being carried. */}
      {dragging && (
        <div
          className="pointer-events-none fixed z-50 w-44 rounded-xl bg-amb-sheet p-2 shadow-2xl ring-2 ring-sky-400"
          style={{ left: dragging.x - 88, top: dragging.y - 28 }}
        >
          <p className="truncate text-xs font-bold text-amb-muted">{formatTimeOnly(dragging.event.start)}</p>
          <p className="line-clamp-2 text-sm font-bold leading-tight text-amb-ink">{dragging.event.title}</p>
        </div>
      )}
    </div>
  );
}

function CalendarScheduleView({ events }: { events: CalendarEvent[] }) {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-mirror-line pb-4">
        <p className="text-lg font-bold uppercase text-amb-muted">Schedule View</p>
        <h3 className="text-5xl font-bold text-amb-ink">Upcoming Events</h3>
      </div>
      <div className="mt-5 space-y-3 overflow-y-auto pr-2">
        {sorted.map((event) => {
          const colors = eventColor(event);
          return (
            <div key={event.id} className="grid grid-cols-[180px_1fr] items-center gap-4 rounded-3xl bg-amb-card p-4">
              <div>
                <p className="text-lg font-bold text-amb-muted">{new Date(event.start).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</p>
                <p className="text-xl font-bold" style={{ color: colors.text }}>{formatTimeOnly(event.start)}</p>
              </div>
              <div className="rounded-2xl border-l-[10px] p-4" style={{ background: colors.soft, borderColor: colors.color }}>
                <p className="text-2xl font-bold text-amb-ink">{event.title}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GroceryPanel() {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");
  const [status, setStatus] = useState<GroceryStatus>("low");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const activeItems = items.filter((item) => !item.purchased);
  const purchasedItems = items.filter((item) => item.purchased);

  async function load() {
    setItems(await fetchGroceryItems());
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function addItem() {
    if (!name.trim()) return;
    await createGroceryItem({
      name: name.trim(),
      quantity: quantity || undefined,
      category: category || undefined,
      supplier: supplier || undefined,
      status
    });
    setName("");
    setQuantity("");
    await load();
  }

  async function quickAddItem(itemName: string, itemCategory: string) {
    const existing = items.find((item) => item.name.toLowerCase() === itemName.toLowerCase() && item.category === itemCategory && !item.purchased);
    if (existing) {
      await updateGroceryItem(existing.id, { status: "low" });
      await load();
      return;
    }
    await createGroceryItem({
      name: itemName,
      category: itemCategory,
      status: "low"
    });
    await load();
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between">
        <SectionTitle icon={ShoppingBasket} title="Grocery Tracker" />
        <div className="flex items-center gap-3">
          <button onClick={() => setShareOpen(true)} className="touch-button bg-sky-600 px-7 text-white">
            Package List
          </button>
          <button onClick={() => setQuickAddOpen(true)} className="touch-button bg-emerald-600 px-7 text-white">
            <Plus className="mr-2 h-7 w-7" /> Quick Add
          </button>
          <p className="rounded-full bg-amber-100 px-5 py-3 text-xl font-bold text-amber-800">{activeItems.length} to buy this week</p>
        </div>
      </div>
      <div className="mt-4 grid shrink-0 grid-cols-[1.2fr_0.7fr_0.8fr_0.8fr_150px_90px] gap-3">
        <input value={name} onChange={(event) => setName(event.target.value)} className="touch-input" placeholder="Food or supply" />
        <input value={quantity} onChange={(event) => setQuantity(event.target.value)} className="touch-input" placeholder="Qty" />
        <input value={category} onChange={(event) => setCategory(event.target.value)} className="touch-input" placeholder="Category" />
        <input value={supplier} onChange={(event) => setSupplier(event.target.value)} className="touch-input" placeholder="Store" />
        <select value={status} onChange={(event) => setStatus(event.target.value as GroceryStatus)} className="touch-input">
          <option value="low">Low</option>
          <option value="out">Out</option>
          <option value="ok">Stocked</option>
        </select>
        <button onClick={addItem} className="touch-button bg-emerald-600 text-white"><Plus className="h-7 w-7" /></button>
      </div>

      <div className="mt-4 grid min-h-0 flex-1 grid-cols-[1fr_320px] gap-4">
        <div className="min-h-0 overflow-y-auto rounded-3xl bg-amb-card p-4">
          <h3 className="mb-4 text-2xl font-bold">Low or Out</h3>
          <div className="space-y-3">
            {activeItems.map((item) => <GroceryItemRow key={item.id} item={item} onChanged={load} />)}
            {!activeItems.length && <p className="rounded-2xl bg-amb-well p-6 text-2xl font-bold text-amb-muted">Nothing on the grocery list yet.</p>}
          </div>
        </div>
        <div className="min-h-0 overflow-y-auto rounded-3xl bg-amb-card p-4">
          <h3 className="mb-4 text-2xl font-bold">Purchased</h3>
          <div className="space-y-3">
            {purchasedItems.slice(0, 12).map((item) => <GroceryItemRow key={item.id} item={item} onChanged={load} compact />)}
            {!purchasedItems.length && <p className="rounded-2xl bg-amb-well p-5 text-lg font-bold text-amb-muted">Purchased items appear here.</p>}
          </div>
        </div>
      </div>
      {quickAddOpen && <QuickGroceryModal onClose={() => setQuickAddOpen(false)} onAdd={quickAddItem} />}
      {shareOpen && <GroceryShareModal items={activeItems} onClose={() => setShareOpen(false)} />}
    </Card>
  );
}

function GroceryItemRow({ item, onChanged, compact = false }: { item: GroceryItem; onChanged: () => Promise<void>; compact?: boolean }) {
  const badge = groceryStatusStyle(item.status);
  return (
    <div className={`grid items-center gap-3 rounded-2xl bg-amb-card p-4 shadow-sm ${compact ? "grid-cols-[1fr_92px]" : "grid-cols-[1fr_150px_130px_90px_90px]"}`}>
      <div className={item.purchased ? "opacity-50" : ""}>
        <p className={`font-bold ${compact ? "text-xl" : "text-3xl"} ${item.purchased ? "line-through" : ""}`}>{item.name}</p>
        <p className="text-lg font-semibold text-amb-muted">
          {[item.quantity, item.category, item.supplier].filter(Boolean).join(" - ") || "No details"}
        </p>
      </div>
      {!compact && (
        <>
          <select value={item.status} onChange={(event) => updateGroceryItem(item.id, { status: event.target.value as GroceryStatus }).then(onChanged)} className={`h-16 rounded-2xl px-3 text-xl font-bold ${badge}`}>
            <option value="low">Low</option>
            <option value="out">Out</option>
            <option value="ok">Stocked</option>
          </select>
          <button onClick={() => updateGroceryItem(item.id, { purchased: !item.purchased }).then(onChanged)} className="touch-button bg-emerald-100 text-emerald-700">
            {item.purchased ? "Undo" : "Bought"}
          </button>
          <button onClick={() => updateGroceryItem(item.id, { status: "out" }).then(onChanged)} className="touch-button bg-rose-100 text-rose-700">Out</button>
        </>
      )}
      <button onClick={() => deleteGroceryItem(item.id).then(onChanged)} className="touch-button bg-amb-well text-amb-muted"><Trash2 className="h-6 w-6" /></button>
    </div>
  );
}

function QuickGroceryModal({ onClose, onAdd }: { onClose: () => void; onAdd: (name: string, category: string) => Promise<void> }) {
  const [selectedCategory, setSelectedCategory] = useState<(typeof groceryQuickCategories)[number] | null>(null);
  const [busyItem, setBusyItem] = useState("");

  async function addAndClose(name: string, category: string) {
    setBusyItem(name);
    await onAdd(name, category);
    setBusyItem("");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-8">
      <div className="flex max-h-[86vh] w-[980px] flex-col rounded-3xl bg-amb-sheet p-7 shadow-2xl">
        <div className="flex items-center justify-between border-b border-mirror-line pb-5">
          <div>
            <p className="text-lg font-bold uppercase text-amb-muted">Quick Add</p>
            <h3 className="text-4xl font-black">{selectedCategory ? selectedCategory.category : "Choose a category"}</h3>
          </div>
          <div className="flex gap-3">
            {selectedCategory && <button onClick={() => setSelectedCategory(null)} className="touch-button bg-amb-well px-6 text-amb-ink">Back</button>}
            <button onClick={onClose} className="touch-button bg-rose-100 px-6 text-rose-700">Close</button>
          </div>
        </div>

        {!selectedCategory ? (
          <div className="mt-6 grid grid-cols-4 gap-4 overflow-y-auto pr-1">
            {groceryQuickCategories.map((group) => (
              <button key={group.category} onClick={() => setSelectedCategory(group)} className="min-h-40 rounded-3xl bg-amb-card p-5 text-left shadow-sm transition active:scale-95">
                <span className="flex h-20 w-20 items-center justify-center rounded-3xl text-5xl shadow-sm" style={{ backgroundColor: `${group.color}24` }}>
                  <GroceryThumbnail name={group.category} alt={group.category} />
                </span>
                <span className="mt-5 block text-3xl font-black">{group.category}</span>
                <span className="mt-1 block text-lg font-bold text-amb-muted">{group.items.length} common items</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-3 gap-4 overflow-y-auto pr-1">
            {selectedCategory.items.map((item) => (
              <QuickGroceryButton
                key={`${selectedCategory.category}-${item.name}`}
                name={item.name}
                category={selectedCategory.category}
                color={selectedCategory.color}
                busy={busyItem === item.name}
                onAdd={() => addAndClose(item.name, selectedCategory.category)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function QuickGroceryButton({ name, category, color, busy, onAdd }: { name: string; category: string; color: string; busy: boolean; onAdd: () => void }) {
  return (
    <button onClick={onAdd} disabled={busy} className="grid min-h-32 grid-cols-[76px_1fr] items-center gap-4 rounded-3xl bg-amb-card p-5 text-left shadow-sm transition active:scale-95 disabled:opacity-60">
      <span className="flex h-20 w-20 items-center justify-center rounded-3xl text-5xl shadow-sm" style={{ backgroundColor: `${color}24` }}>
        <GroceryThumbnail name={name} alt={name} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-3xl font-black text-amb-ink">{name}</span>
        <span className="block truncate text-lg font-bold uppercase text-amb-muted">{busy ? "Adding..." : category}</span>
      </span>
    </button>
  );
}

function GroceryThumbnail({ name, alt }: { name: string; alt: string }) {
  const code = groceryIconCodes[name] || groceryIconCodes.Pantry;
  return <img className="h-12 w-12 object-contain" src={`https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${code}.svg`} alt={alt} />;
}

function GroceryShareModal({ items, onClose }: { items: GroceryItem[]; onClose: () => void }) {
  const [message, setMessage] = useState("");
  const [showQr, setShowQr] = useState(false);
  const listText = formatGroceryList(items);
  const encodedList = encodeURIComponent(listText);
  const groceryDocumentUrl = buildGroceryDocumentUrl(listText);
  const encodedDocumentUrl = encodeURIComponent(groceryDocumentUrl);

  async function copyList() {
    await navigator.clipboard?.writeText(listText);
    setMessage("Copied shopping list.");
  }

  async function shareList() {
    if (!navigator.share) {
      await copyList();
      setMessage("Share is not available here, so I copied the list.");
      return;
    }
    await navigator.share({ title: "Shopping List", text: listText });
    setMessage("Shopping list shared.");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-8">
      <div className="flex max-h-[86vh] w-[860px] flex-col rounded-3xl bg-amb-sheet p-7 shadow-2xl">
        <div className="flex items-center justify-between border-b border-mirror-line pb-5">
          <div>
            <p className="text-lg font-bold uppercase text-amb-muted">Shopping Package</p>
            <h3 className="text-4xl font-black">{items.length} item{items.length === 1 ? "" : "s"} ready</h3>
          </div>
          <button onClick={onClose} className="touch-button bg-rose-100 px-6 text-rose-700">Close</button>
        </div>

        <div className="mt-6 grid min-h-0 flex-1 grid-cols-[1fr_250px] gap-5">
          <textarea readOnly value={listText} className="min-h-[440px] resize-none rounded-3xl border border-mirror-line bg-amb-card p-5 text-2xl font-semibold leading-relaxed text-amb-ink outline-none dark:border-white/10" />
          <div className="space-y-3">
            <button onClick={shareList} className="touch-button w-full bg-emerald-600 px-5 text-white">Share</button>
            <button onClick={copyList} className="touch-button w-full bg-sky-600 px-5 text-white">Copy</button>
            <button onClick={() => setShowQr((value) => !value)} className="touch-button w-full bg-amb-accent px-5 text-amb-accent-ink">Document QR</button>
            <a className="touch-button w-full bg-green-100 px-5 text-green-800" href={`https://wa.me/${groceryWhatsappPhone}?text=${encodedList}`}>WhatsApp Phone</a>
            <a className="touch-button w-full bg-indigo-100 px-5 text-indigo-700" href={`sms:?&body=${encodedList}`}>Text</a>
            <a className="touch-button w-full bg-amber-100 px-5 text-amber-700" href={`mailto:?subject=Shopping%20List&body=${encodedList}`}>Email</a>
            <p className="rounded-2xl bg-amb-card p-4 text-lg font-bold text-amb-muted">
              Use Document QR to open an organized grocery-list page on your phone, then share it into Notes.
            </p>
            {message && <p className="rounded-2xl bg-emerald-100 p-4 text-lg font-bold text-emerald-800">{message}</p>}
          </div>
        </div>
        {showQr && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 p-8">
            <div className="rounded-[2rem] bg-white p-8 text-center shadow-2xl">
              <img className="mx-auto h-[52vh] max-h-[560px] min-h-80 w-[52vh] min-w-80 max-w-[560px]" src={`https://api.qrserver.com/v1/create-qr-code/?size=720x720&data=${encodedDocumentUrl}`} alt="Shopping list document QR code" />
              <p className="mt-5 text-3xl font-black text-amb-ink">Scan with your phone</p>
              <p className="mt-2 text-xl font-bold text-amb-muted">This opens a grocery document, not a phone search.</p>
              <button onClick={() => setShowQr(false)} className="touch-button mx-auto mt-5 bg-amb-accent px-8 text-amb-accent-ink">Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GroceryDocumentPage() {
  const [message, setMessage] = useState("");
  const listText = new URLSearchParams(window.location.search).get("list") || "Shopping List\n\nNo items were included.";
  const lines = listText.split("\n");
  const title = lines[0] || "Shopping List";
  const sections = parseGroceryDocumentSections(lines.slice(1));

  async function copyList() {
    await navigator.clipboard?.writeText(listText);
    setMessage("Copied. You can paste it into Notes.");
  }

  async function shareList() {
    if (!navigator.share) {
      await copyList();
      return;
    }
    await navigator.share({ title, text: listText });
    setMessage("Shared.");
  }

  return (
    <main className="min-h-screen bg-[#f8faf7] px-5 py-6 text-slate-900">
      <section className="mx-auto max-w-3xl rounded-[28px] bg-white p-6 shadow-xl">
        <p className="text-sm font-black uppercase tracking-normal text-teal-700">Home Scheduler</p>
        <h1 className="mt-1 text-4xl font-black">{title}</h1>
        <p className="mt-2 text-lg font-bold text-amb-muted">Organized for your next grocery trip.</p>

        <div className="mt-6 flex gap-3">
          <button onClick={shareList} className="min-h-14 flex-1 rounded-2xl bg-teal-700 px-5 text-xl font-black text-white">Share</button>
          <button onClick={copyList} className="min-h-14 flex-1 rounded-2xl bg-sky-100 px-5 text-xl font-black text-sky-800">Copy</button>
        </div>
        {message && <p className="mt-4 rounded-2xl bg-emerald-100 p-4 text-lg font-black text-emerald-800">{message}</p>}

        <div className="mt-6 grid gap-4">
          {sections.map((section) => (
            <div key={section.heading} className="rounded-3xl bg-amb-well p-5">
              <h2 className="text-2xl font-black text-amb-ink">{section.heading}</h2>
              <div className="mt-3 grid gap-2">
                {section.items.map((item) => (
                  <label key={item} className="flex min-h-12 items-center gap-3 rounded-2xl bg-white px-4 py-3 text-xl font-bold">
                    <input type="checkbox" className="h-6 w-6 accent-teal-700" />
                    <span>{item.replace(/^- /, "")}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function TaskPanel({ initialTasks, onChanged }: { initialTasks: Task[]; onChanged: () => void }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(today());
  const [priority, setPriority] = useState<Priority>("normal");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchTasks().then(setTasks).catch(() => setTasks(initialTasks));
  }, [initialTasks]);

  async function reload() {
    const next = await fetchTasks();
    setTasks(next);
    onChanged();
  }

  async function addTask() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await createTask({ title: title.trim(), dueDate, priority });
      setTitle("");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <SectionTitle icon={CheckCircle2} title="Tasks" />
      <div className="mt-4 grid shrink-0 grid-cols-[1fr_210px_170px_110px] gap-3">
        <input value={title} onChange={(event) => setTitle(event.target.value)} className="touch-input" placeholder="New task" />
        <input value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="touch-input" type="date" />
        <select value={priority} onChange={(event) => setPriority(event.target.value as Priority)} className="touch-input">
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </select>
        <button onClick={addTask} disabled={busy} className="touch-button bg-sky-600 text-white"><Plus className="h-6 w-6" /></button>
      </div>
      <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
        {tasks.map((task) => (
          <div key={task.id} className="grid grid-cols-[72px_1fr_170px_90px] items-center gap-3 rounded-2xl bg-amb-well p-4">
            <button onClick={() => updateTask(task.id, { completed: !task.completed }).then(reload)} className={`h-14 rounded-2xl ${task.completed ? "bg-emerald-500 text-white" : "bg-amb-well text-amb-muted"}`}>
              <CheckCircle2 className="mx-auto h-7 w-7" />
            </button>
            <div>
              <p className={`text-3xl font-semibold ${task.completed ? "line-through opacity-60" : ""}`}>{task.title}</p>
              <p className="text-amb-muted">{task.dueDate || "No due date"} - {task.priority} priority</p>
            </div>
            <select value={task.priority} onChange={(event) => updateTask(task.id, { priority: event.target.value as Priority }).then(reload)} className="touch-input text-xl">
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
            <button onClick={() => deleteTask(task.id).then(reload)} className="touch-button bg-rose-100 text-rose-700"><Trash2 className="h-6 w-6" /></button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function NotesPanel({ onChanged }: { onChanged: () => void }) {
  const [date, setDate] = useState(today());
  const [body, setBody] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);

  async function load(selectedDate = date) {
    const [note, allNotes] = await Promise.all([fetchNote(selectedDate), fetchNotes()]);
    setBody(note?.body || "");
    setNotes(allNotes);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function save() {
    await saveNote(date, body);
    await load(date);
    onChanged();
  }

  async function remove() {
    await deleteNote(date);
    setBody("");
    await load(date);
    onChanged();
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <SectionTitle icon={StickyNote} title="Notes" />
      <div className="mt-4 grid shrink-0 grid-cols-[260px_120px_120px] gap-3">
        <input value={date} onChange={(event) => { setDate(event.target.value); load(event.target.value).catch(() => undefined); }} className="touch-input" type="date" />
        <button onClick={save} className="touch-button bg-sky-600 text-white"><Save className="h-6 w-6" /></button>
        <button onClick={remove} className="touch-button bg-rose-100 text-rose-700"><Trash2 className="h-6 w-6" /></button>
      </div>
      <textarea className="mt-4 min-h-0 flex-1 w-full resize-none rounded-2xl border border-amb-border bg-amb-well p-5 text-3xl text-amb-ink leading-relaxed outline-none focus:ring-4 focus:ring-sky-200" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write today's note..." />
      <div className="mt-4 flex shrink-0 gap-3 overflow-x-auto pb-2">
        {notes.map((note) => (
          <button key={note.id} onClick={() => { setDate(note.date); setBody(note.body); }} className="min-w-48 rounded-2xl bg-amb-well p-4 text-left">
            <p className="font-bold">{note.date}</p>
            <p className="truncate text-amb-muted">{note.body || "Empty note"}</p>
          </button>
        ))}
      </div>
    </Card>
  );
}

const ASSISTANT_CONVERSATION_KEY = "mirror-dashboard-assistant-conversation";

type ChatBubble = { key: string; role: "user" | "assistant"; content: string; actions?: AssistantAction[] };

/** "claude-haiku-4-5" -> "Claude Haiku 4.5", for the badge above the thread. */
function modelLabel(model: string) {
  const match = model.match(/^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-|$)/i);
  if (!match) return model;
  const family = match[1][0].toUpperCase() + match[1].slice(1);
  return `Claude ${family} ${match[2]}${match[3] ? `.${match[3]}` : ""}`;
}

function conversationTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (now.getTime() - date.getTime() < 6 * 86400000) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function groupConversations(list: AssistantConversationSummary[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86400000;
  const groups: Array<[string, AssistantConversationSummary[]]> = [["Today", []], ["Yesterday", []], ["Previous 7 days", []], ["Older", []]];
  for (const conversation of list) {
    const time = Date.parse(conversation.updatedAt);
    const index = time >= today ? 0 : time >= today - day ? 1 : time >= today - 7 * day ? 2 : 3;
    groups[index][1].push(conversation);
  }
  return groups.filter(([, items]) => items.length);
}

/** Bold and inline code only; enough markdown for chat replies. */
function inlineMarkdown(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={index} className="rounded-md bg-amb-well px-1.5 py-0.5 text-[0.85em]">{part.slice(1, -1)}</code>;
    return part;
  });
}

/** Paragraphs, bullet and numbered lists, and headings, the way chat apps show replies. */
function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(<p key={blocks.length}>{inlineMarkdown(paragraph.join(" "))}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, index) => <li key={index}>{inlineMarkdown(item)}</li>);
    blocks.push(list.ordered
      ? <ol key={blocks.length} className="list-decimal space-y-1.5 pl-8">{items}</ol>
      : <ul key={blocks.length} className="list-disc space-y-1.5 pl-8">{items}</ul>);
    list = null;
  };

  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flushList();
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (heading) {
      flushParagraph();
      blocks.push(<p key={blocks.length} className="font-semibold">{inlineMarkdown(heading[1])}</p>);
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return <div className="space-y-4">{blocks}</div>;
}

function AssistantAvatar({ small = false }: { small?: boolean }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-amb-accent text-amb-accent-ink ${small ? "mt-1 h-11 w-11" : "h-16 w-16"}`}>
      <Sparkles className={small ? "h-5 w-5" : "h-8 w-8"} />
    </span>
  );
}

/**
 * The Assistant tab, laid out like the Claude app: Recents on the left, the
 * open chat on the right. Chats are saved on the server, so they are the same
 * on the wall panel and on a phone over Tailscale.
 */
function AssistantPanel({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [conversations, setConversations] = useState<AssistantConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<number | null>(() => {
    try {
      const stored = Number(localStorage.getItem(ASSISTANT_CONVERSATION_KEY));
      return stored > 0 ? stored : null;
    } catch {
      return null;
    }
  });
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // Set when a send creates a chat, so selecting it does not refetch the
  // thread that is already on screen.
  const skipLoadRef = useRef<number | null>(null);

  const enabled = Boolean(status?.enabled);
  const active = conversations.find((conversation) => conversation.id === activeId) ?? null;

  function loadConversations() {
    fetchAssistantConversations().then(setConversations).catch(() => undefined);
  }

  useEffect(() => {
    fetchAssistantStatus().then(setStatus).catch(() => setStatus({ enabled: false, model: "", reason: "Could not reach the assistant service." }));
    loadConversations();
  }, []);

  useEffect(() => {
    try {
      if (activeId) localStorage.setItem(ASSISTANT_CONVERSATION_KEY, String(activeId));
      else localStorage.removeItem(ASSISTANT_CONVERSATION_KEY);
    } catch {
      // Storage can be blocked; the open chat just won't be remembered.
    }
    setConfirmDelete(null);
    setError("");
    if (activeId === null) {
      setMessages([]);
      return;
    }
    if (skipLoadRef.current === activeId) {
      skipLoadRef.current = null;
      return;
    }
    let cancelled = false;
    setLoadingThread(true);
    setMessages([]);
    fetchAssistantConversation(activeId)
      .then((conversation) => {
        if (cancelled) return;
        setMessages(conversation.messages.map((message) => ({ key: `m-${message.id}`, role: message.role, content: message.content, actions: message.actions })));
      })
      .catch(() => {
        if (!cancelled) setActiveId(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingThread(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  // Grow the composer with its text, up to about five lines.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 220)}px`;
  }, [draft]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy || !enabled) return;
    const pendingKey = `pending-${Date.now()}`;
    setMessages((current) => [...current, { key: pendingKey, role: "user", content: trimmed }]);
    setDraft("");
    setBusy(true);
    setError("");
    try {
      const result = await sendAssistantMessage(trimmed, activeId);
      setMessages((current) => [...current, { key: `reply-${Date.now()}`, role: "assistant", content: result.reply, actions: result.actions }]);
      if (result.conversationId && result.conversationId !== activeId) {
        skipLoadRef.current = result.conversationId;
        setActiveId(result.conversationId);
      }
      loadConversations();
      if (result.refresh.length) onChanged();
    } catch (err) {
      // Put the words back so nothing typed is lost; the thread stays as it was.
      setMessages((current) => current.filter((message) => message.key !== pendingKey));
      setDraft(trimmed);
      setError(err instanceof Error ? err.message : "The assistant could not answer.");
    } finally {
      setBusy(false);
    }
  }

  function startNewChat() {
    if (busy) return;
    setActiveId(null);
    setDraft("");
    inputRef.current?.focus();
  }

  async function removeConversation(id: number) {
    try {
      await deleteAssistantConversation(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the chat.");
      return;
    }
    if (id === activeId) setActiveId(null);
    setConfirmDelete(null);
    loadConversations();
  }

  const suggestions = ["What's on today?", "Plan dinners for this week", "Add milk to the grocery list", "Remind me to take the trash out tomorrow"];
  const groups = groupConversations(conversations);
  const showWelcome = activeId === null && !messages.length;

  const composer = (
    <div className="flex items-end gap-3 rounded-[28px] border border-amb-border bg-amb-card p-3 pl-6 shadow-ambient">
      <textarea
        ref={inputRef}
        rows={1}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            send(draft);
          }
        }}
        disabled={!enabled || busy}
        placeholder={enabled ? (showWelcome ? "How can I help today?" : "Reply to Claude...") : "Assistant is not configured"}
        className="max-h-[220px] min-h-[56px] min-w-0 flex-1 resize-none bg-transparent py-3 text-2xl leading-snug text-amb-ink outline-none placeholder:text-amb-muted"
      />
      <button
        onClick={() => send(draft)}
        disabled={!enabled || busy || !draft.trim()}
        className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-amb-accent text-amb-accent-ink transition active:scale-95 disabled:opacity-35"
        aria-label="Send message"
      >
        <ArrowUp className="h-7 w-7" />
      </button>
    </div>
  );

  return (
    <Card className="flex min-h-0 flex-1 overflow-hidden">
      <div className="grid min-h-0 flex-1 grid-cols-[340px_minmax(0,1fr)] gap-5">
        <aside className="flex min-h-0 flex-col rounded-[24px] bg-amb-well p-3">
          <button
            onClick={startNewChat}
            disabled={busy}
            className="flex min-h-16 shrink-0 items-center gap-3 rounded-2xl bg-amb-accent px-5 text-xl font-semibold text-amb-accent-ink active:scale-[0.98] disabled:opacity-50"
          >
            <Plus className="h-6 w-6" /> New chat
          </button>
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
            {!conversations.length && <p className="px-3 py-4 text-lg text-amb-muted">Your chats will show up here.</p>}
            {groups.map(([label, items]) => (
              <div key={label} className="mb-4">
                <p className="px-3 pb-2 text-base font-semibold text-amb-muted">{label}</p>
                {items.map((conversation) => {
                  const selected = conversation.id === activeId;
                  return (
                    <div key={conversation.id} className={`flex items-center gap-1 rounded-2xl ${selected ? "bg-amb-card shadow-ambient" : ""}`}>
                      <button
                        onClick={() => { if (!busy) setActiveId(conversation.id); }}
                        className="flex min-h-16 min-w-0 flex-1 flex-col justify-center px-4 py-2 text-left"
                      >
                        <span className="flex items-baseline gap-3">
                          <span className="min-w-0 flex-1 truncate text-lg font-semibold text-amb-ink">{conversation.title}</span>
                          <span className="shrink-0 text-sm text-amb-muted">{conversationTime(conversation.updatedAt)}</span>
                        </span>
                        <span className="truncate text-sm text-amb-muted">{conversation.preview}</span>
                      </button>
                      {selected && (confirmDelete === conversation.id ? (
                        <button onClick={() => removeConversation(conversation.id)} className="mr-2 h-11 shrink-0 rounded-xl bg-rose-600 px-3 text-sm font-bold text-white active:scale-95">
                          Delete
                        </button>
                      ) : (
                        <button onClick={() => setConfirmDelete(conversation.id)} className="mr-1 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-amb-muted active:scale-95" aria-label="Delete chat">
                          <Trash2 className="h-5 w-5" />
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col">
          <header className="flex shrink-0 items-center justify-between gap-4 px-2 pb-3">
            <h2 className="min-w-0 truncate font-display text-4xl text-amb-ink">{active?.title ?? "New chat"}</h2>
            {status?.model && (
              <span className="shrink-0 rounded-full border border-amb-border px-4 py-1.5 text-base font-semibold text-amb-muted">{modelLabel(status.model)}</span>
            )}
          </header>

          {status && !status.enabled && (
            <div className="mb-4 rounded-2xl bg-amber-100 p-5 text-xl font-semibold text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
              {status.reason}
            </div>
          )}

          {showWelcome ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-6 pb-10">
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
                className="flex items-center gap-5"
              >
                <AssistantAvatar />
                <h3 className="font-display text-6xl text-amb-ink">{greetingFor(new Date())}. How can I help?</h3>
              </motion.div>
              <div className="w-full max-w-[980px]">{composer}</div>
              {error && <p className="text-xl font-semibold text-rose-600 dark:text-rose-300">{error}</p>}
              {enabled && (
                <div className="flex max-w-[980px] flex-wrap justify-center gap-3">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => send(suggestion)}
                      className="min-h-14 rounded-2xl border border-amb-border bg-amb-well px-5 text-xl font-semibold text-amb-ink active:scale-95"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2">
                <div className="mx-auto flex w-full max-w-[980px] flex-col gap-8 py-4">
                  {loadingThread && !messages.length && <p className="text-xl text-amb-muted">Opening chat...</p>}
                  {messages.map((message) =>
                    message.role === "user" ? (
                      <motion.div key={message.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex justify-end">
                        <p className="max-w-[78%] whitespace-pre-wrap rounded-[26px] bg-amb-card px-6 py-4 text-2xl leading-relaxed text-amb-ink shadow-ambient">{message.content}</p>
                      </motion.div>
                    ) : (
                      <motion.div key={message.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex gap-4">
                        <AssistantAvatar small />
                        <div className="min-w-0 flex-1 text-2xl leading-relaxed text-amb-ink">
                          <RichText text={message.content} />
                          {message.actions?.length ? (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {message.actions.map((action, index) => (
                                <span key={index} className="inline-flex items-center gap-2 rounded-full border border-amb-border bg-amb-well px-4 py-1.5 text-base font-semibold text-amb-ink">
                                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                                  {action.summary}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </motion.div>
                    )
                  )}
                  {busy && (
                    <div className="flex gap-4">
                      <AssistantAvatar small />
                      <div className="flex items-center gap-2 pt-3" aria-label="Claude is typing">
                        {[0, 1, 2].map((dot) => <span key={dot} className="typing-dot h-3 w-3 rounded-full bg-amb-muted" />)}
                      </div>
                    </div>
                  )}
                  {error && <p className="text-xl font-semibold text-rose-600 dark:text-rose-300">{error}</p>}
                </div>
              </div>
              <div className="mx-auto w-full max-w-[980px] shrink-0 pt-3">{composer}</div>
            </>
          )}
        </section>
      </div>
    </Card>
  );
}

function FinancePanel({ quotes, initialSummary }: { quotes: FinanceQuote[]; initialSummary: PersonalFinanceSummary }) {
  const [summary, setSummary] = useState(() => normalizeFinanceSummary(initialSummary));
  const [plaidStatus, setPlaidStatus] = useState<PlaidConnectionStatus | null>(null);
  const [plaidMessage, setPlaidMessage] = useState("");
  const [plaidBusy, setPlaidBusy] = useState(false);
  const [ruleTransaction, setRuleTransaction] = useState<FinanceTransaction | null>(null);
  const [ruleMatch, setRuleMatch] = useState("");
  const [ruleCategory, setRuleCategory] = useState("");

  useEffect(() => {
    setSummary(normalizeFinanceSummary(initialSummary));
  }, [initialSummary]);

  async function loadPersonalFinance() {
    const [nextSummary, nextStatus] = await Promise.all([fetchPersonalFinanceSummary(), fetchPlaidStatus()]);
    setSummary(normalizeFinanceSummary(nextSummary));
    setPlaidStatus(nextStatus);
  }

  useEffect(() => {
    loadPersonalFinance()
      .catch(() => undefined);
  }, []);

  async function connectPlaid() {
    try {
      setPlaidBusy(true);
      setPlaidMessage("Opening Plaid...");
      await loadPlaidScript();
      const { link_token: linkToken } = await createPlaidLinkToken();
      window.Plaid?.create({
        token: linkToken,
        onSuccess: async (publicToken, metadata) => {
          try {
            setPlaidMessage("Link connected. Importing accounts and transactions...");
            await exchangePlaidPublicToken({ publicToken, institutionName: metadata.institution?.name });
            await loadPersonalFinance();
            setPlaidMessage("Plaid sync complete.");
          } catch (error) {
            setPlaidMessage(error instanceof Error ? error.message : "Plaid token exchange failed.");
          } finally {
            setPlaidBusy(false);
          }
        },
        onExit: () => {
          setPlaidMessage("Plaid Link closed.");
          setPlaidBusy(false);
        }
      }).open();
    } catch (error) {
      setPlaidMessage(error instanceof Error ? error.message : "Plaid setup failed.");
      setPlaidBusy(false);
    }
  }

  async function syncPlaid(forceFull = false) {
    try {
      setPlaidBusy(true);
      setPlaidMessage(forceFull ? "Running full Plaid refresh..." : "Syncing bank data...");
      const result = await syncPlaidFinance({ forceFull });
      await loadPersonalFinance();
      const totals = result.results.reduce((sum, entry) => ({
        added: sum.added + entry.added,
        modified: sum.modified + entry.modified,
        removed: sum.removed + entry.removed
      }), { added: 0, modified: 0, removed: 0 });
      setPlaidMessage(`${forceFull ? "Full refresh" : "Sync"} checked ${result.syncedItems} connection${result.syncedItems === 1 ? "" : "s"}: ${totals.added} added, ${totals.modified} updated, ${totals.removed} removed.`);
    } catch (error) {
      setPlaidMessage(error instanceof Error ? error.message : "Plaid sync failed.");
    } finally {
      setPlaidBusy(false);
    }
  }

  async function changeTransactionCategory(transaction: FinanceTransaction, category: string) {
    await updateFinanceTransactionCategory(transaction.id, { category });
    await loadPersonalFinance();
  }

  function openRule(transaction: FinanceTransaction) {
    setRuleTransaction(transaction);
    setRuleMatch(transaction.merchant);
    setRuleCategory(transaction.category === "Uncategorized" ? summary.budgets[0]?.category || "Shopping" : transaction.category);
  }

  async function saveRule() {
    if (!ruleTransaction || !ruleMatch.trim() || !ruleCategory.trim()) return;
    await updateFinanceTransactionCategory(ruleTransaction.id, {
      category: ruleCategory.trim(),
      createRule: true,
      matchText: ruleMatch.trim()
    });
    setRuleTransaction(null);
    await loadPersonalFinance();
  }

  const budgetPercent = summary.budgetLimit ? Math.min(100, Math.round((summary.budgetSpent / summary.budgetLimit) * 100)) : 0;
  const maxTrend = Math.max(1, ...summary.trend.flatMap((point) => [point.income, point.spending]));
  const categoryOptions = Array.from(new Set([...summary.budgets.map((budget) => budget.category), "Groceries", "Dining", "Gas", "Bills", "Shopping", "Home", "Health", "Travel", "Entertainment", "Income", "Transfers", "Fees", "Uncategorized"]));
  const lastPlaidSync = plaidStatus?.items
    .map((item) => item.lastSyncedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-br from-white via-emerald-50 to-sky-50 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950">
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div>
          <SectionTitle icon={Landmark} title="Finance" />
          <p className="mt-2 text-xl font-semibold text-amb-muted">Family money dashboard - {summary.monthLabel}</p>
        </div>
        <div className="rounded-3xl bg-amb-card px-5 py-4 text-right shadow-sm">
          <p className="text-lg font-bold text-amb-muted">Data provider</p>
          <p className="text-2xl font-black">{summary.provider}</p>
        </div>
      </div>

      <div className="mt-3 grid shrink-0 grid-cols-[1fr_150px_150px_170px] items-center gap-3 rounded-3xl bg-amb-card p-3 shadow-sm">
        <div>
          <p className="text-xl font-black">Bank connections</p>
          <p className="text-lg font-semibold text-amb-muted">
            {plaidStatus?.configured ? `${plaidStatus.itemCount} Plaid connection${plaidStatus.itemCount === 1 ? "" : "s"} - ${plaidStatus.environment}` : "Set Plaid sandbox keys in .env to connect accounts."}
          </p>
          {lastPlaidSync && <p className="text-base font-bold text-amb-muted">Last Plaid sync {formatServerDateTime(lastPlaidSync)}</p>}
          {plaidMessage && <p className="mt-1 text-base font-bold text-sky-700">{plaidMessage}</p>}
        </div>
        <button onClick={connectPlaid} disabled={plaidBusy || plaidStatus?.configured === false} className="touch-button bg-emerald-600 px-5 text-white">Connect</button>
        <button onClick={() => syncPlaid(false)} disabled={plaidBusy || !plaidStatus?.itemCount} className="touch-button bg-sky-600 px-5 text-white">Sync</button>
        <button onClick={() => syncPlaid(true)} disabled={plaidBusy || !plaidStatus?.itemCount} className="touch-button bg-indigo-100 px-5 text-indigo-700">Full Refresh</button>
      </div>

      <div className="mt-3 grid shrink-0 grid-cols-4 gap-3">
        <FinanceMetric icon={Wallet} label="Cash" value={money(summary.totalCash)} tone="emerald" />
        <FinanceMetric icon={CreditCard} label="Debt" value={money(summary.totalDebt)} tone="rose" />
        <FinanceMetric icon={ArrowUpRight} label="Income" value={money(summary.monthlyIncome)} tone="sky" />
        <FinanceMetric icon={ArrowDownRight} label="Spending" value={money(summary.monthlySpending)} tone="amber" />
      </div>

      <div className="mt-3 grid min-h-0 flex-1 grid-cols-[300px_1fr_1.15fr] gap-4">
        <div className="rounded-3xl bg-amb-card p-4 text-center shadow-sm">
          <BudgetCircle percent={budgetPercent} spent={summary.budgetSpent} limit={summary.budgetLimit} />
          <p className="mt-4 text-xl font-bold text-amb-muted">Monthly Budget</p>
          <p className={`text-3xl font-black ${summary.cashFlow >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{money(summary.cashFlow)} cash flow</p>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl bg-amb-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black">Budget Checks</h3>
            <p className="rounded-full bg-amb-well px-4 py-2 text-lg font-bold text-amb-muted">{summary.budgets.length} groups</p>
          </div>
          <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
            {summary.budgets.map((budget) => {
              const percent = budget.limitAmount ? Math.min(100, Math.round((budget.spentAmount / budget.limitAmount) * 100)) : 0;
              return (
                <div key={budget.id} className="rounded-2xl bg-amb-well p-4">
                  <div className="mb-2 flex items-center justify-between text-xl font-bold">
                    <span>{budget.category}</span>
                    <span>{percent}%</span>
                  </div>
                  <div className="h-4 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: budget.color }} />
                  </div>
                  <p className="mt-2 text-lg font-semibold text-amb-muted">{money(budget.spentAmount)} of {money(budget.limitAmount)}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl bg-amb-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-black">Transactions</h3>
              <p className="text-lg font-semibold text-amb-muted">{summary.recentTransactions.length} recent - {summary.uncategorizedTransactions.length} need review</p>
            </div>
            <button onClick={() => syncPlaid(false)} disabled={plaidBusy || !plaidStatus?.itemCount} className="touch-button h-16 bg-sky-600 px-5 text-white">Sync</button>
          </div>
          <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
            {summary.recentTransactions.map((transaction) => (
              <FinanceTransactionRow
                key={transaction.id}
                transaction={transaction}
                categories={categoryOptions}
                onCategoryChange={(category) => changeTransactionCategory(transaction, category)}
                onRule={() => openRule(transaction)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 grid h-44 shrink-0 grid-cols-[1fr_1fr_1fr] gap-4">
        <div className="overflow-hidden rounded-3xl bg-amb-card p-4 shadow-sm">
          <h3 className="text-2xl font-black">Accounts</h3>
          <div className="mt-2 grid max-h-28 grid-cols-2 gap-2 overflow-y-auto pr-1">
            {summary.accounts.slice(0, 6).map((account) => (
              <div key={account.id} className="rounded-2xl bg-amb-well p-4">
                <p className="truncate text-lg font-bold text-amb-muted">{account.institution}</p>
                <p className="truncate text-xl font-black">{account.name}</p>
                <p className={`mt-2 text-2xl font-black ${account.balance < 0 ? "text-rose-600" : "text-emerald-600"}`}>{money(account.balance)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl bg-amb-card p-4 shadow-sm">
          <div className="h-full rounded-3xl bg-slate-950 p-4 text-white shadow-sm dark:bg-black/40">
            <div className="flex items-center gap-3">
              <Sparkles className="h-8 w-8 text-emerald-300" />
              <h3 className="text-2xl font-black">AI Money Review</h3>
            </div>
            <div className="mt-3 max-h-24 space-y-2 overflow-y-auto pr-1">
              {summary.insights.slice(0, 3).map((insight) => (
                <p key={insight} className="rounded-2xl bg-white/10 px-4 py-2 text-lg font-semibold">{insight}</p>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl bg-amb-card p-4 shadow-sm">
          <h3 className="text-2xl font-black">Rules & Markets</h3>
          <div className="mt-2 max-h-20 space-y-2 overflow-y-auto pr-1">
            {summary.categoryRules.slice(0, 4).map((rule) => (
              <p key={rule.id} className="rounded-2xl bg-amb-well px-4 py-3 text-lg font-bold">{rule.matchText} to {rule.category}</p>
            ))}
            {!summary.categoryRules.length && <p className="rounded-2xl bg-amb-well px-4 py-3 text-lg font-bold text-amb-muted">No custom rules yet.</p>}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {quotes.slice(0, 4).map((quote) => (
              <div key={quote.symbol} className="rounded-2xl bg-amb-well p-4">
                <p className="text-xl font-black">{quote.symbol}</p>
                <p className="truncate text-base font-semibold text-amb-muted">{quote.name}</p>
                <p className="mt-2 text-2xl font-black">{money(quote.price)}</p>
                <p className={quote.changePercent && quote.changePercent < 0 ? "font-bold text-rose-600" : "font-bold text-emerald-600"}>{signed(quote.changePercent)}%</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {ruleTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-8">
          <div className="w-[720px] rounded-3xl bg-amb-sheet p-7 shadow-2xl">
            <h3 className="text-3xl font-black">Create Category Rule</h3>
            <p className="mt-2 text-xl font-semibold text-amb-muted">Apply this category whenever a merchant contains this text.</p>
            <div className="mt-5 grid gap-4">
              <input value={ruleMatch} onChange={(event) => setRuleMatch(event.target.value)} className="touch-input" placeholder="Merchant text to match" />
              <select value={ruleCategory} onChange={(event) => setRuleCategory(event.target.value)} className="touch-input">
                {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setRuleTransaction(null)} className="touch-button bg-amb-well px-6 text-amb-ink">Cancel</button>
              <button onClick={saveRule} className="touch-button bg-emerald-600 px-6 text-white">Save Rule</button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function FinanceMetric({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: "emerald" | "rose" | "sky" | "amber" }) {
  const tones = {
    emerald: "bg-emerald-100 text-emerald-700",
    rose: "bg-rose-100 text-rose-700",
    sky: "bg-sky-100 text-sky-700",
    amber: "bg-amber-100 text-amber-700"
  };
  return (
    <div className="rounded-3xl bg-amb-card p-4 shadow-sm">
      <div className={`mb-2 flex h-11 w-11 items-center justify-center rounded-2xl ${tones[tone]}`}>
        <Icon className="h-6 w-6" />
      </div>
      <p className="text-base font-bold text-amb-muted">{label}</p>
      <p className="mt-1 text-3xl font-black">{value}</p>
    </div>
  );
}

function normalizeFinanceSummary(summary?: PersonalFinanceSummary): PersonalFinanceSummary {
  return {
    ...demoPersonalFinance,
    ...(summary || {}),
    accounts: summary?.accounts || [],
    budgets: summary?.budgets || [],
    recentTransactions: summary?.recentTransactions || [],
    uncategorizedTransactions: summary?.uncategorizedTransactions || [],
    categoryRules: summary?.categoryRules || [],
    trend: summary?.trend || [],
    insights: summary?.insights || []
  };
}

function BudgetCircle({ percent, spent, limit }: { percent: number; spent: number; limit: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  const color = clamped >= 90 ? "#e11d48" : clamped >= 75 ? "#f59e0b" : "#10b981";
  return (
    <div className="mx-auto flex h-48 w-48 items-center justify-center rounded-full p-3" style={{ background: `conic-gradient(${color} ${clamped * 3.6}deg, #e2e8f0 0deg)` }}>
      <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-amb-card shadow-inner">
        <p className="text-5xl font-black" style={{ color }}>{clamped}%</p>
        <p className="mt-1 text-lg font-bold text-amb-muted">used</p>
        <p className="mt-2 text-xl font-black">{money(spent)}</p>
        <p className="text-base font-bold text-amb-muted">of {money(limit)}</p>
      </div>
    </div>
  );
}

function FinanceTransactionRow({ transaction, categories, onCategoryChange, onRule }: { transaction: FinanceTransaction; categories: string[]; onCategoryChange: (category: string) => void; onRule: () => void }) {
  const needsReview = transaction.category === "Uncategorized";
  return (
    <div className={`grid grid-cols-[1fr_180px_96px] items-center gap-3 rounded-2xl p-4 ${needsReview ? "bg-amber-50 ring-2 ring-amber-200" : "bg-amb-card"}`}>
      <div>
        <p className="truncate text-xl font-black">{transaction.merchant}</p>
        <p className="flex flex-wrap items-center gap-2 text-base font-semibold text-amb-muted">
          <span>{transaction.transactionDate}</span>
          <span>- {transaction.categorizedBy || "provider"}</span>
          {transaction.pending && <span className="rounded-full bg-amber-100 px-2 py-1 text-sm font-black text-amber-800">Pending</span>}
        </p>
        <p className={`mt-1 text-2xl font-black ${transaction.amount < 0 ? "text-amb-ink" : "text-emerald-600"}`}>{money(transaction.amount)}</p>
      </div>
      <select value={transaction.category} onChange={(event) => onCategoryChange(event.target.value)} className="h-16 rounded-2xl border border-mirror-line bg-amb-card px-3 text-lg font-bold text-amb-ink outline-none focus:ring-4 focus:ring-sky-200 dark:border-white/10">
        {categories.map((category) => <option key={category} value={category}>{category}</option>)}
      </select>
      <button onClick={onRule} className="touch-button h-16 bg-emerald-100 text-emerald-700">Rule</button>
    </div>
  );
}

function loadPlaidScript() {
  if (window.Plaid) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-plaid-link]");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Plaid Link failed to load.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.async = true;
    script.dataset.plaidLink = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Plaid Link failed to load."));
    document.head.appendChild(script);
  });
}

const DEAL_ACCENTS: Record<string, { card: string; chip: string; ring: string }> = {
  sky: { card: "from-sky-500 to-sky-700", chip: "bg-sky-100 text-sky-800", ring: "ring-sky-300" },
  amber: { card: "from-amber-500 to-orange-600", chip: "bg-amber-100 text-amber-900", ring: "ring-amber-300" },
  emerald: { card: "from-emerald-500 to-teal-700", chip: "bg-emerald-100 text-emerald-900", ring: "ring-emerald-300" },
  rose: { card: "from-rose-500 to-pink-700", chip: "bg-rose-100 text-rose-900", ring: "ring-rose-300" },
  violet: { card: "from-violet-500 to-indigo-700", chip: "bg-violet-100 text-violet-900", ring: "ring-violet-300" },
  teal: { card: "from-teal-500 to-cyan-700", chip: "bg-teal-100 text-teal-900", ring: "ring-teal-300" }
};

function dealAccent(name: string) {
  return DEAL_ACCENTS[name] || DEAL_ACCENTS.sky;
}

function RecipesPanel({ onChanged, refreshKey = 0, focusRecipeId = null, onFocusHandled }: { onChanged: () => void; refreshKey?: number; focusRecipeId?: number | null; onFocusHandled?: () => void }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [plan, setPlan] = useState<MealPlanEntry[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Recipe | null>(null);
  // Which night we are choosing a meal for; null means the picker is closed.
  const [assigning, setAssigning] = useState<string | null>(null);

  async function load() {
    const [allRecipes, weekPlan] = await Promise.all([fetchRecipes(), fetchMealPlan()]);
    setRecipes(allRecipes);
    setPlan(weekPlan);
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, [refreshKey]);

  // The share banner asked for this recipe: open it once the list has it.
  useEffect(() => {
    if (!focusRecipeId) return;
    const wanted = recipes.find((recipe) => recipe.id === focusRecipeId);
    if (wanted) {
      setOpen(wanted);
      onFocusHandled?.();
    }
  }, [focusRecipeId, recipes]);

  async function run(label: string, work: () => Promise<void>) {
    setBusy(label);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work.");
    } finally {
      setBusy("");
    }
  }

  const generate = () =>
    run("generate", async () => {
      const recipe = await generateRecipe(prompt.trim() || "an easy family dinner for a weeknight");
      setPrompt("");
      await load();
      setMessage(`Saved ${recipe.title}`);
      setOpen(recipe);
    });

  const assign = (date: string, recipeId: number | null) =>
    run("assign", async () => {
      setPlan(await setMealPlan(date, recipeId));
      setAssigning(null);
      onChanged();
    });

  const toGrocery = () =>
    run("grocery", async () => {
      const result = await pushPlanToGrocery();
      setMessage(
        result.added
          ? `Added ${result.added} item${result.added === 1 ? "" : "s"}${result.skipped ? `, skipped ${result.skipped} already on the list` : ""}.`
          : "Everything for this week is already on the list."
      );
      onChanged();
    });

  const plannedCount = plan.filter((entry) => entry.recipe).length;

  return (
    <div className="flex h-full min-h-0 gap-4">
      {/* The week, which is the point of the tab */}
      <Card className="flex w-[420px] shrink-0 flex-col overflow-hidden">
        <SectionTitle icon={UtensilsCrossed} title="This week" />
        <p className="mt-2 shrink-0 text-lg text-amb-muted">
          {plannedCount} of 7 dinners planned
        </p>

        <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {plan.map((entry) => {
            const day = new Date(`${entry.date}T12:00:00`);
            const isToday = entry.date === new Date().toLocaleDateString("en-CA");
            return (
              <button
                key={entry.date}
                onClick={() => setAssigning(entry.date)}
                className={`flex w-full items-center gap-4 rounded-2xl p-4 text-left transition active:scale-[0.98] ${
                  isToday ? "bg-sky-100 dark:bg-sky-500/15" : "bg-amb-card"
                }`}
              >
                <div className="w-16 shrink-0">
                  <p className="text-sm font-black uppercase text-amb-muted">
                    {day.toLocaleDateString("en-US", { weekday: "short" })}
                  </p>
                  <p className="text-2xl font-black text-amb-ink">{day.getDate()}</p>
                </div>
                <div className="min-w-0 flex-1">
                  {entry.recipe ? (
                    <>
                      <p className="truncate text-xl font-bold text-amb-ink">{entry.recipe.title}</p>
                      <p className="text-base text-amb-muted">
                        {entry.recipe.totalMinutes ? `${entry.recipe.totalMinutes} min` : "Planned"}
                        {entry.recipe.servings ? `, serves ${entry.recipe.servings}` : ""}
                      </p>
                    </>
                  ) : (
                    <p className="text-xl font-semibold text-amb-muted">Tap to plan</p>
                  )}
                </div>
                {isToday && <span className="shrink-0 rounded-full bg-sky-600 px-3 py-1 text-xs font-black uppercase text-white">Tonight</span>}
              </button>
            );
          })}
        </div>

        <button
          onClick={toGrocery}
          disabled={Boolean(busy) || !plannedCount}
          className="mt-4 flex min-h-16 shrink-0 items-center justify-center rounded-2xl bg-[#ffcf5a] text-xl font-black text-slate-900 active:scale-95 disabled:opacity-40"
        >
          <ShoppingBasket className="mr-3 h-7 w-7" />
          {busy === "grocery" ? "Adding..." : "Send week to grocery list"}
        </button>
      </Card>

      {/* The library */}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-4">
          <SectionTitle icon={ChefHat} title="Recipes" />
          <p className="text-lg text-amb-muted">{recipes.length} saved</p>
        </div>

        <div className="mt-4 flex shrink-0 gap-3">
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") generate(); }}
            placeholder="Describe a meal, e.g. something with chicken in 30 minutes"
            className="touch-input min-w-0 flex-1"
          />
          <button
            onClick={generate}
            disabled={Boolean(busy)}
            className="touch-button w-40 bg-sky-600 text-white disabled:opacity-40"
          >
            {busy === "generate" ? "Writing..." : "Create"}
          </button>
        </div>

        {(message || error) && (
          <p className={`mt-3 shrink-0 text-lg font-semibold ${error ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
            {error || message}
          </p>
        )}

        <div className="mt-4 grid min-h-0 flex-1 grid-cols-3 gap-3 overflow-y-auto pr-1">
          {recipes.map((recipe) => (
            <button
              key={recipe.id}
              onClick={() => setOpen(recipe)}
              className="flex flex-col rounded-2xl bg-amb-card p-4 text-left transition active:scale-[0.98]"
            >
              {recipe.imageUrl ? <img src={recipe.imageUrl} alt="" loading="lazy" className="mb-3 aspect-[4/3] w-full rounded-xl object-cover" /> : null}
              <p className="line-clamp-2 text-xl font-black leading-tight text-amb-ink">{recipe.title}</p>
              <p className="mt-1 line-clamp-2 text-base text-amb-muted">{recipe.summary}</p>
              {recipe.sourceName ? <p className="mt-1 truncate text-sm font-semibold text-amb-muted">{recipe.sourceName}</p> : null}
              <div className="mt-auto flex flex-wrap gap-2 pt-3">
                {recipe.totalMinutes ? (
                  <span className="rounded-full bg-amb-well px-3 py-1 text-sm font-bold text-amb-muted">
                    {recipe.totalMinutes} min
                  </span>
                ) : null}
                {recipe.tags.slice(0, 2).map((tag) => (
                  <span key={tag} className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          ))}
          {!recipes.length && (
            <p className="col-span-3 rounded-2xl bg-amb-card p-6 text-xl text-amb-muted">
              No recipes yet. Describe a meal above and one will be written and saved.
            </p>
          )}
        </div>
      </Card>

      {assigning && (
        <MealPicker
          date={assigning}
          recipes={recipes}
          onPick={(recipeId) => assign(assigning, recipeId)}
          onClose={() => setAssigning(null)}
        />
      )}
      {open && <RecipeDialog recipe={open} onClose={() => setOpen(null)} onDeleted={() => { setOpen(null); load().catch(() => undefined); }} />}
    </div>
  );
}

function MealPicker({
  date,
  recipes,
  onPick,
  onClose
}: {
  date: string;
  recipes: Recipe[];
  onPick: (recipeId: number | null) => void;
  onClose: () => void;
}) {
  const day = new Date(`${date}T12:00:00`);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-10" onClick={onClose}>
      <div className="flex max-h-full w-full max-w-4xl flex-col rounded-[28px] bg-amb-sheet p-8" onClick={(event) => event.stopPropagation()}>
        <h2 className="shrink-0 text-4xl font-black text-amb-ink">
          Dinner for {day.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </h2>
        <div className="mt-6 grid min-h-0 flex-1 grid-cols-3 gap-3 overflow-y-auto pr-1">
          {recipes.map((recipe) => (
            <button
              key={recipe.id}
              onClick={() => onPick(recipe.id)}
              className="rounded-2xl bg-amb-well p-4 text-left active:scale-95"
            >
              <p className="line-clamp-2 text-xl font-black leading-tight text-amb-ink">{recipe.title}</p>
              <p className="mt-1 text-base text-amb-muted">{recipe.totalMinutes ? `${recipe.totalMinutes} min` : ""}</p>
            </button>
          ))}
          {!recipes.length && <p className="col-span-3 text-xl text-amb-muted">Create a recipe first.</p>}
        </div>
        <div className="mt-6 flex shrink-0 gap-3">
          <button onClick={() => onPick(null)} className="min-h-16 flex-1 rounded-2xl bg-rose-100 text-xl font-black text-rose-700 active:scale-95">
            Clear this night
          </button>
          <button onClick={onClose} className="min-h-16 flex-1 rounded-2xl bg-amb-accent text-xl font-black text-amb-accent-ink active:scale-95">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function RecipeDialog({ recipe, onClose, onDeleted }: { recipe: Recipe; onClose: () => void; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [moveMessage, setMoveMessage] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-10" onClick={onClose}>
      <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-[28px] bg-amb-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="shrink-0 border-b border-mirror-line p-8 pb-6">
          <div className="flex gap-6">
            {recipe.imageUrl ? <img src={recipe.imageUrl} alt="" className="h-36 w-48 shrink-0 rounded-2xl object-cover" /> : null}
            <div className="min-w-0">
              <h2 className="text-4xl font-black leading-tight text-amb-ink">{recipe.title}</h2>
              {recipe.sourceName ? <p className="mt-1 text-lg font-semibold text-amb-muted">From {recipe.sourceName}</p> : null}
              <p className="mt-2 text-xl text-amb-muted">{recipe.summary}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {recipe.totalMinutes ? <span className="rounded-full bg-amb-well px-4 py-2 text-base font-bold text-amb-ink">{recipe.totalMinutes} min</span> : null}
            {recipe.servings ? <span className="rounded-full bg-amb-well px-4 py-2 text-base font-bold text-amb-ink">Serves {recipe.servings}</span> : null}
            {recipe.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-emerald-100 px-4 py-2 text-base font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{tag}</span>
            ))}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[340px_1fr] gap-8 overflow-y-auto p-8">
          <div>
            <p className="text-sm font-black uppercase tracking-widest text-amb-muted">Ingredients</p>
            <ul className="mt-4 space-y-3">
              {recipe.ingredients.map((ingredient, index) => (
                <li key={index} className="text-xl leading-snug text-amb-ink">
                  <span className="font-bold">{ingredient.quantity}</span> {ingredient.name}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-black uppercase tracking-widest text-amb-muted">Method</p>
            {!recipe.steps.length ? <p className="mt-4 text-xl font-semibold text-amb-ink">Method: see the original post</p> : null}
            <ol className="mt-4 space-y-4">
              {recipe.steps.map((step, index) => (
                <li key={index} className="flex gap-4 text-xl leading-snug text-amb-ink">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-600 text-base font-black text-white">{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            {recipe.sourceUrl ? <div className="mt-6"><SlideQr url={recipe.sourceUrl} label="Open the original on your phone" /></div> : null}
          </div>
        </div>

        <div className="flex shrink-0 gap-3 border-t border-mirror-line p-6">
          {recipe.sourceUrl ? (
            <button
              onClick={() => moveSharedItem("recipe", recipe.id, "trip").then((result) => (result.status === "saved" ? onDeleted() : setMoveMessage(result.message))).catch((err: Error) => setMoveMessage(err.message))}
              className="min-h-16 w-64 rounded-2xl bg-amb-well text-xl font-bold text-amb-ink active:scale-95"
            >
              {moveMessage ?? "This is a trip idea"}
            </button>
          ) : null}
          <button
            onClick={() => (confirming ? deleteRecipe(recipe.id).then(onDeleted).catch(() => undefined) : setConfirming(true))}
            className="min-h-16 w-56 rounded-2xl bg-rose-100 text-xl font-black text-rose-700 active:scale-95"
          >
            {confirming ? "Tap again to delete" : "Delete"}
          </button>
          <button onClick={onClose} className="min-h-16 flex-1 rounded-2xl bg-sky-600 text-2xl font-black text-white active:scale-95">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function TravelPanel({ focusDealId, refreshKey = 0, showSaved = 0, onShowSavedHandled }: { focusDealId?: number | null; refreshKey?: number; showSaved?: number; onShowSavedHandled?: () => void }) {
  const [tab, setTab] = useState<"ideas" | "planner">("ideas");
  // Saved trip ideas live on the planner tab; the share banner opens it there.
  useEffect(() => {
    if (showSaved) {
      setTab("planner");
      onShowSavedHandled?.();
    }
  }, [showSaved]);
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 gap-3">
        {(["ideas", "planner"] as const).map((entry) => (
          <button
            key={entry}
            onClick={() => setTab(entry)}
            className={`min-h-14 rounded-2xl px-7 text-xl font-black capitalize active:scale-95 ${
              tab === entry
                ? "bg-sky-600 text-white"
                : "bg-amb-card text-amb-muted"
            }`}
          >
            {entry}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{tab === "ideas" ? <TravelDealsPanel focusDealId={focusDealId} /> : <TravelHubPanel refreshKey={refreshKey} />}</div>
    </div>
  );
}

function TravelDealsPanel({ focusDealId }: { focusDealId?: number | null }) {
  const [state, setState] = useState<TravelDealsResponse | null>(null);
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState<TravelDeal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragDx, setDragDx] = useState(0);
  const dragRef = useRef<{ startX: number; startIndex: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    fetchTravelDeals()
      .then((data) => {
        setState(data);
        // Arriving from a Home card: land on that trip and open it, rather
        // than dropping the person on the first card to hunt for it.
        const wanted = focusDealId ? data.deals.findIndex((deal) => deal.id === focusDealId) : -1;
        setIndex(wanted >= 0 ? wanted : 0);
        if (wanted >= 0) setExpanded(data.deals[wanted]);
      })
      .catch((err: Error) => setError(err.message));
  }, [focusDealId]);

  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const data = await refreshTravelDeals();
      setState(data);
      setIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh trip ideas.");
    } finally {
      setBusy(false);
    }
  }

  const deals = state?.deals ?? [];

  function step(direction: number) {
    if (!deals.length) return;
    setIndex((current) => Math.min(deals.length - 1, Math.max(0, current + direction)));
  }

  // Finger travel that equates to advancing one card.
  const CARD_STEP = 240;

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!deals.length) return;
    // Deliberately no pointer capture yet. Capturing here retargets the
    // pointerup to the rail, so the browser fires click on the rail rather than
    // the card and a plain tap never opens the trip. Capture is taken only once
    // the gesture has actually become a drag (see onPointerMove).
    dragRef.current = { startX: event.clientX, startIndex: index, moved: false };
    setDragDx(0);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    // Past this the gesture is a drag, not a tap - and now it is safe to
    // capture, so the drag survives the finger sliding off the rail.
    if (!drag.moved && Math.abs(dx) > 8) {
      drag.moved = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Capture is a nicety - if the pointer has already gone, the drag
        // still works while the finger stays on the rail.
      }
    }
    // Set straight from the event rather than deferring to rAF: the browser
    // already coalesces pointermove to one per frame, so a rAF hop only adds a
    // frame of lag between finger and card - and if rAF is throttled the rail
    // stops tracking entirely while still snapping on release, which reads as
    // a broken gesture.
    setDragDx(dx);
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    // Snap to whichever card the finger left nearest the middle.
    const landed = Math.round(drag.startIndex - dx / CARD_STEP);
    setIndex(Math.min(deals.length - 1, Math.max(0, landed)));
    setDragDx(0);
    // pointerup is followed by click; a drag must not also open the card.
    suppressClickRef.current = drag.moved;
  }

  function openOrCentre(deal: TravelDeal, position: number, centred: boolean) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (centred) setExpanded(deal);
    else setIndex(position);
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between">
        <SectionTitle icon={Luggage} title="Trip ideas today" />
        <div className="flex items-center gap-3">
          {state?.generatedFor && (
            <span className="text-lg font-semibold text-amb-muted">{state.generatedFor}</span>
          )}
          <button
            onClick={refresh}
            disabled={busy}
            className="touch-button w-20 bg-amb-card text-amb-muted disabled:opacity-40"
            aria-label="Refresh trip ideas"
          >
            <RefreshCw className={`h-7 w-7 ${busy ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && <p className="mt-3 shrink-0 text-xl font-semibold text-rose-600 dark:text-rose-400">{error}</p>}

      {state && state.status !== "ready" && (
        <div className="mt-4 rounded-2xl bg-amber-100 p-5 text-xl font-semibold text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
          {state.reason}
        </div>
      )}

      {busy && !deals.length && (
        <p className="mt-6 text-2xl text-amb-muted">Planning fresh trips...</p>
      )}

      {deals.length > 0 && (
        <>
          {/* Lazy-susan rail: only transform/opacity animate, so the Pi composites on the GPU. */}
          <div
            className="relative mt-4 min-h-[420px] flex-1 touch-none select-none overflow-hidden"
            style={{ perspective: "1400px" }}
            data-no-touch-scroll
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {deals.map((deal, position) => {
              // While dragging this is fractional, so the rail tracks the finger
              // instead of jumping a whole card at a time.
              const offset = position - (index - dragDx / CARD_STEP);
              const distance = Math.abs(offset);
              if (distance > 3) return null;
              const accent = dealAccent(deal.accent);
              const isCenter = distance < 0.5;
              return (
                <button
                  key={deal.id}
                  onClick={() => openOrCentre(deal, position, isCenter)}
                  aria-label={isCenter ? `Open ${deal.destination}` : `Show ${deal.destination}`}
                  className={`absolute left-1/2 top-1/2 flex h-[400px] w-[460px] flex-col justify-between overflow-hidden rounded-[28px] bg-gradient-to-br p-7 text-left text-white ${dragRef.current ? "" : "transition-transform duration-500 ease-out"} ${accent.card} ${
                    isCenter ? "shadow-xl" : ""
                  }`}
                  style={{
                    transform: `translate(-50%, -50%) translateX(${offset * 46}%) rotateY(${offset * -32}deg) scale(${1 - Math.min(distance, 1) * 0.18})`,
                    zIndex: 10 - Math.round(distance),
                    opacity: Math.max(0, Math.min(1, 2.6 - distance)),
                    pointerEvents: distance > 2 ? "none" : "auto"
                  }}
                >
                  {deal.imageUrl && (
                    <>
                      <img
                        src={deal.imageUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 h-full w-full object-cover"
                        // A dead image link should leave the gradient, not a broken icon.
                        onError={(event) => { event.currentTarget.style.display = "none"; }}
                      />
                      {/* Scrim: the photo is arbitrary, so text needs a guaranteed contrast floor. */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-black/25" />
                    </>
                  )}
                  <div className="relative">
                    <span className="text-6xl leading-none">{deal.emoji}</span>
                    <p className="mt-4 text-4xl font-black leading-tight">{deal.destination}</p>
                    <p className="text-xl font-semibold text-white/80">{deal.country}</p>
                    <p className="mt-3 text-2xl font-bold leading-snug">{deal.headline}</p>
                    {isCenter && <p className="mt-3 text-xl leading-relaxed text-white/90">{deal.hook}</p>}
                  </div>
                  <div className="relative flex flex-wrap gap-2 text-lg font-bold">
                    {deal.tripLength && <span className="rounded-full bg-white/25 px-4 py-2">{deal.tripLength}</span>}
                    {deal.estCost && <span className="rounded-full bg-white/25 px-4 py-2">{deal.estCost}</span>}
                    {deal.bestMonths && <span className="rounded-full bg-white/25 px-4 py-2">{deal.bestMonths}</span>}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex shrink-0 items-center justify-center gap-5">
            <button
              onClick={() => step(-1)}
              disabled={index === 0}
              className="touch-button w-20 bg-amb-card text-amb-muted disabled:opacity-30"
              aria-label="Previous trip"
            >
              <ChevronLeft className="h-8 w-8" />
            </button>
            <div className="flex items-center gap-2">
              {deals.map((deal, position) => (
                <button
                  key={deal.id}
                  onClick={() => setIndex(position)}
                  aria-label={`Go to ${deal.destination}`}
                  className={`h-4 rounded-full transition-all ${position === index ? "w-10 bg-sky-600" : "w-4 bg-slate-300 dark:bg-slate-600"}`}
                />
              ))}
            </div>
            <button
              onClick={() => step(1)}
              disabled={index >= deals.length - 1}
              className="touch-button w-20 bg-amb-card text-amb-muted disabled:opacity-30"
              aria-label="Next trip"
            >
              <ChevronRight className="h-8 w-8" />
            </button>
          </div>
          <p className="mt-2 shrink-0 text-center text-lg text-amb-muted">
            Tap the front card for the full breakdown
          </p>
        </>
      )}

      {expanded && <TravelDealDetailView deal={expanded} onClose={() => setExpanded(null)} />}
    </Card>
  );
}

function TravelDealDetailView({ deal, onClose }: { deal: TravelDeal; onClose: () => void }) {
  const accent = dealAccent(deal.accent);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-6">
      <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-[28px] bg-amb-sheet">
        <div className={`relative flex shrink-0 items-start justify-between overflow-hidden bg-gradient-to-br p-7 text-white ${accent.card}`}>
          {deal.imageUrl && (
            <>
              <img
                src={deal.imageUrl}
                alt=""
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
                onError={(event) => { event.currentTarget.style.display = "none"; }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/50 to-black/25" />
            </>
          )}
          <div className="relative">
            <span className="text-5xl leading-none">{deal.emoji}</span>
            <p className="mt-3 text-4xl font-black">{deal.destination}</p>
            <p className="text-xl font-semibold text-white/80">{deal.country}</p>
            <p className="mt-2 text-2xl font-bold">{deal.headline}</p>
          </div>
          <button onClick={onClose} className="relative touch-button w-20 bg-white/25 text-white" aria-label="Close trip details">
            <X className="h-8 w-8" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-7 text-amb-ink">
          <p className="text-2xl leading-relaxed">{deal.detail.overview || deal.hook}</p>

          <div className="flex flex-wrap gap-3 text-lg font-bold">
            {deal.tripLength && <span className={`rounded-full px-5 py-2 ${accent.chip}`}>{deal.tripLength}</span>}
            {deal.estCost && <span className={`rounded-full px-5 py-2 ${accent.chip}`}>{deal.estCost}</span>}
            {deal.bestMonths && <span className={`rounded-full px-5 py-2 ${accent.chip}`}>Best {deal.bestMonths}</span>}
          </div>

          {deal.detail.highlights.length > 0 && (
            <section>
              <h3 className="text-2xl font-bold">Worth doing</h3>
              <ul className="mt-3 space-y-2 text-xl leading-relaxed">
                {deal.detail.highlights.map((item, i) => (
                  <li key={i} className="flex gap-3"><span className="text-sky-600 dark:text-sky-400">•</span>{item}</li>
                ))}
              </ul>
            </section>
          )}

          {deal.detail.itinerary.length > 0 && (
            <section>
              <h3 className="text-2xl font-bold">Rough plan</h3>
              <div className="mt-3 space-y-3">
                {deal.detail.itinerary.map((entry, i) => (
                  <div key={i} className="rounded-2xl bg-amb-well p-5">
                    <p className="text-xl font-bold">{entry.day}</p>
                    <p className="mt-1 text-xl leading-relaxed">{entry.plan}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {deal.detail.stay && (
              <section className="rounded-2xl bg-amb-well p-5">
                <h3 className="text-xl font-bold">Where to stay</h3>
                <p className="mt-2 text-xl leading-relaxed">{deal.detail.stay}</p>
              </section>
            )}
            {deal.detail.gettingThere && (
              <section className="rounded-2xl bg-amb-well p-5">
                <h3 className="text-xl font-bold">Getting there</h3>
                <p className="mt-2 text-xl leading-relaxed">{deal.detail.gettingThere}</p>
              </section>
            )}
          </div>

          {deal.detail.familyTip && (
            <section className="rounded-2xl bg-amber-100 p-5 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
              <h3 className="text-xl font-bold">With the kids</h3>
              <p className="mt-2 text-xl leading-relaxed">{deal.detail.familyTip}</p>
            </section>
          )}

          {deal.detail.budgetBreakdown.length > 0 && (
            <section>
              <h3 className="text-2xl font-bold">Rough budget</h3>
              <div className="mt-3 space-y-2">
                {deal.detail.budgetBreakdown.map((row, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-mirror-line pb-2 text-xl">
                    <span>{row.label}</span>
                    <span className="font-bold">{row.amount}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function TravelHubPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [tripType, setTripType] = useState<TravelTripType>("low-effort");
  const [duration, setDuration] = useState(5);
  const [budget, setBudget] = useState(5000);
  const [selectedId, setSelectedId] = useState(travelCandidates[0]?.id ?? "");
  const [inspirations, setInspirations] = useState<TravelInspiration[]>([]);
  const [inspirationUrl, setInspirationUrl] = useState("");
  const [inspirationTitle, setInspirationTitle] = useState("");
  const [inspirationLocation, setInspirationLocation] = useState("");
  const [inspirationNotes, setInspirationNotes] = useState("");
  const [itinerary, setItinerary] = useState<TravelItineraryResult | null>(null);
  const [itineraryDetailsOpen, setItineraryDetailsOpen] = useState(false);
  const [travelBusy, setTravelBusy] = useState(false);
  const [travelMessage, setTravelMessage] = useState("");

  const rankedTrips = useMemo(() => {
    return travelCandidates
      .map((trip) => ({ trip, score: scoreTravelTrip(trip, tripType, duration, budget) }))
      .sort((a, b) => b.score - a.score);
  }, [budget, duration, tripType]);

  const selected = rankedTrips.find(({ trip }) => trip.id === selectedId)?.trip ?? rankedTrips[0]?.trip;

  useEffect(() => {
    fetchTravelInspirations()
      .then(setInspirations)
      .catch(() => setTravelMessage("Saved Instagram ideas could not load."));
  }, [refreshKey]);

  async function saveInspiration() {
    if (!inspirationUrl.trim() || !inspirationTitle.trim()) {
      setTravelMessage("Add a link and short title first.");
      return;
    }
    setTravelBusy(true);
    try {
      const item = await createTravelInspiration({
        url: inspirationUrl.trim(),
        title: inspirationTitle.trim(),
        location: inspirationLocation.trim() || undefined,
        notes: inspirationNotes.trim() || undefined,
        tags: inspirationLocation.trim() ? [inspirationLocation.trim()] : []
      });
      setInspirations((current) => [item, ...current.filter((entry) => entry.id !== item.id)]);
      setInspirationUrl("");
      setInspirationTitle("");
      setInspirationLocation("");
      setInspirationNotes("");
      setTravelMessage("Saved to travel ideas.");
    } catch {
      setTravelMessage("That travel idea could not be saved.");
    } finally {
      setTravelBusy(false);
    }
  }

  async function removeInspiration(id: number) {
    await deleteTravelInspiration(id);
    setInspirations((current) => current.filter((entry) => entry.id !== id));
  }

  async function moveInspiration(id: number) {
    const result = await moveSharedItem("trip", id, "recipe").catch((err: Error) => ({ status: "failed" as const, message: err.message }));
    setTravelMessage(result.message);
    if (result.status === "saved") setInspirations((current) => current.filter((entry) => entry.id !== id));
  }

  async function buildItinerary() {
    setTravelBusy(true);
    setTravelMessage("Building itinerary from saved ideas...");
    try {
      const nextItinerary = await generateTravelItinerary();
      setItinerary(nextItinerary);
      setItineraryDetailsOpen(true);
      setTravelMessage(nextItinerary.provider === "openai" ? "AI itinerary ready." : "Draft itinerary ready.");
    } catch {
      setTravelMessage("The itinerary could not be generated.");
    } finally {
      setTravelBusy(false);
    }
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[290px_minmax(0,1fr)] gap-4 overflow-hidden">
      <aside className="flex min-h-0 flex-col gap-4 rounded-[24px] border border-teal-100 bg-amb-card p-4 shadow-sm dark:border-teal-500/20">
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-teal-700 text-2xl font-black text-white">TH</span>
          <div>
            <p className="text-3xl font-black text-amb-ink">Travel Hub</p>
            <p className="text-lg font-semibold text-amb-muted">Family trip autopilot</p>
          </div>
        </div>
        <div className="grid gap-3 border-t border-amb-border pt-4">
          <label className="text-lg font-black text-amb-ink">
            Trip type
            <select value={tripType} onChange={(event) => setTripType(event.target.value as TravelTripType)} className="touch-input mt-2 text-xl">
              <option value="low-effort">Low-effort with baby</option>
              <option value="beach">Beach reset</option>
              <option value="new-england">Driveable New England</option>
              <option value="city">City change of scenery</option>
              <option value="nature">Nature and fresh air</option>
              <option value="splurge">Splurge week</option>
            </select>
          </label>
          <label className="text-lg font-black text-amb-ink">
            Duration
            <select value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="touch-input mt-2 text-xl">
              <option value={3}>Long weekend</option>
              <option value={5}>5 nights</option>
              <option value={7}>Full week</option>
              <option value={10}>Slow 10-day trip</option>
            </select>
          </label>
          <label className="text-lg font-black text-amb-ink">
            Weekly budget
            <input value={budget} onChange={(event) => setBudget(Number(event.target.value))} type="range" min={1500} max={12000} step={250} className="mt-4 w-full accent-teal-700" />
            <span className="mt-2 block text-3xl text-teal-700 dark:text-teal-300">{money(budget)}</span>
          </label>
        </div>
        <div className="mt-auto grid gap-3">
          <TravelStat label="days off" value="62" />
          <TravelStat label="primary airport" value="BOS" />
          <TravelStat label="saved ideas" value={inspirations.length.toString()} />
        </div>
      </aside>

      <section className="flex min-h-0 flex-col overflow-hidden rounded-[24px] border border-amb-border bg-[#f8faf7]/95 p-4 shadow-sm dark:bg-slate-950/90">
        <div className="flex items-end justify-between gap-5">
          <div>
            <p className="text-lg font-black uppercase tracking-normal text-teal-700 dark:text-teal-300">June 15 - August 15, 2026</p>
            <h2 className="mt-1 text-4xl font-black text-amb-ink">Planned Trip Builder</h2>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <TravelMetric label="best fit" value={`${rankedTrips[0]?.score ?? 0}%`} />
            <TravelMetric label="under budget" value={rankedTrips.filter(({ trip }) => trip.estimatedCost <= budget).length.toString()} />
            <TravelMetric label="short hops" value={travelCandidates.filter((trip) => trip.flightHours <= 2.5).length.toString()} />
          </div>
        </div>

        <div className="mt-3 shrink-0 rounded-[20px] border border-teal-100 bg-amb-card p-3 shadow-sm dark:border-teal-500/20">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-2xl font-black text-amb-ink">Build trip candidates</h3>
              <p className="mt-1 text-lg font-semibold text-amb-muted">Ranked by ease, family fit, timing, budget, and deal strength.</p>
            </div>
            <button type="button" onClick={buildItinerary} disabled={travelBusy} className="h-14 rounded-2xl bg-teal-700 px-6 text-lg font-black text-white disabled:opacity-60">
              <Sparkles className="mr-2 inline h-6 w-6" />
              {travelBusy ? "Working" : "Generate"}
            </button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {rankedTrips.slice(0, 3).map(({ trip, score }) => (
              <button
                key={trip.id}
                type="button"
                onClick={() => setSelectedId(trip.id)}
                className={`overflow-hidden rounded-[20px] border bg-amb-card text-left shadow-sm transition active:scale-[0.98] ${
                  selected?.id === trip.id ? "border-teal-500 ring-4 ring-teal-200 dark:ring-teal-500/30" : "border-amb-border"
                }`}
              >
                <div className="h-14 p-3 text-white" style={{ background: trip.visual }}>
                  <div className="flex items-start justify-between">
                    <MapPinned className="h-6 w-6" />
                    <span className="rounded-full bg-white/20 px-3 py-1 text-base font-black">{score}%</span>
                  </div>
                </div>
                <div className="p-3">
                  <p className="truncate text-lg font-black text-amb-ink">{trip.name}</p>
                  <p className="truncate text-base font-bold text-amb-muted">{trip.location}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid min-h-0 flex-1 grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] gap-4">
          <div className="flex min-h-0 flex-col rounded-[20px] border border-amb-border bg-amb-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-3xl font-black text-amb-ink">Instagram ideas</h3>
              {travelMessage && <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-black text-teal-800 dark:bg-teal-500/15 dark:text-teal-200">{travelMessage}</span>}
            </div>
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
              {inspirations.length ? (
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                  {inspirations.map((item) => (
                    <div key={item.id} className="group overflow-hidden rounded-2xl bg-amb-well shadow-sm ring-1 ring-slate-200 dark:ring-slate-700">
                      <button type="button" onClick={() => window.open(item.url, "_blank", "noopener,noreferrer")} className="block w-full text-left active:scale-[0.99]">
                        <div className="relative aspect-[4/3] overflow-hidden bg-teal-50 dark:bg-slate-700">
                          {item.thumbnailUrl ? (
                            <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="grid h-full place-items-center text-teal-700 dark:text-teal-200">
                              <MapPinned className="h-12 w-12" />
                            </div>
                          )}
                          <span className="absolute left-3 top-3 rounded-full bg-amb-card px-3 py-1 text-xs font-black uppercase tracking-wide text-amb-ink shadow-sm">
                            Instagram
                          </span>
                        </div>
                        <div className="p-3">
                          <p className="line-clamp-2 min-h-[3.5rem] text-lg font-black leading-tight text-amb-ink">{item.title}</p>
                        </div>
                      </button>
                      <div className="flex items-center justify-between gap-2 border-t border-amb-border px-3 py-2">
                        <span className="truncate text-sm font-bold text-amb-muted">{item.location || "Saved idea"}</span>
                        {item.source !== "manual" ? (
                          <button type="button" onClick={() => moveInspiration(item.id)} className="h-10 shrink-0 rounded-xl bg-amb-well px-3 text-sm font-bold text-amb-ink">
                            This is a recipe
                          </button>
                        ) : null}
                        <button type="button" onClick={() => removeInspiration(item.id)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-200" aria-label={`Delete ${item.title}`}>
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid h-full place-items-center rounded-2xl bg-amb-well p-4 text-center text-2xl font-black text-amb-muted">
                  Send Instagram links from your phone shortcut.
                </div>
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-col rounded-[20px] border border-amb-border bg-amb-card p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-2xl font-black text-amb-ink">AI itinerary</h3>
                <button type="button" onClick={buildItinerary} disabled={travelBusy} className="h-12 rounded-2xl bg-amb-accent px-4 text-base font-black text-amb-accent-ink active:scale-[0.98] disabled:opacity-60">
                  <Sparkles className="mr-2 inline h-5 w-5" />
                  Build
                </button>
              </div>
              <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
                {itinerary ? (
                  <div className="grid gap-3">
                    <button type="button" onClick={() => setItineraryDetailsOpen(true)} className="rounded-2xl bg-teal-50 p-4 text-left active:scale-[0.99] dark:bg-teal-500/15">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xl font-black text-amb-ink">{itinerary.title}</p>
                          {itinerary.destination && <p className="mt-1 text-sm font-black uppercase tracking-wide text-teal-700 dark:text-teal-300">{itinerary.destination}</p>}
                        </div>
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amb-card text-teal-800 shadow-sm dark:text-teal-200">
                          <ExternalLink className="h-5 w-5" />
                        </span>
                      </div>
                      <p className="mt-1 text-base font-bold text-amb-muted">{itinerary.summary}</p>
                      <p className="mt-3 text-sm font-black text-teal-800 dark:text-teal-200">Tap for map, lodging, travel links, and full day breakdown</p>
                    </button>
                    {itinerary.days.map((day) => (
                      <button key={day.day} type="button" onClick={() => setItineraryDetailsOpen(true)} className="rounded-2xl bg-amb-well p-4 text-left active:scale-[0.99]">
                        <p className="text-lg font-black text-amb-ink">Day {day.day}: {day.title}</p>
                        <p className="mt-1 text-base font-bold text-amb-muted">{day.notes}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {day.stops.map((stop) => (
                            <span key={stop} className="rounded-full bg-amb-card px-3 py-1 text-sm font-black text-amb-ink shadow-sm">{stop}</span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="grid h-full place-items-center rounded-2xl bg-amb-well p-4 text-center text-lg font-bold text-amb-muted">
                    Generate an itinerary after saving a few creator posts.
                  </div>
                )}
            </div>
          </div>
        </div>
      </section>
      {itineraryDetailsOpen && itinerary && <ItineraryDetailModal itinerary={itinerary} onClose={() => setItineraryDetailsOpen(false)} />}
    </div>
  );
}

function TripBadge({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-amb-well px-3 text-sm font-black text-amb-ink">
      <span className="text-teal-700 dark:text-teal-300">{icon}</span>
      {label}
    </span>
  );
}

function ItineraryDetailModal({ itinerary, onClose }: { itinerary: TravelItineraryResult; onClose: () => void }) {
  const priceSummary = itinerary.priceSummary;
  const addOns = itinerary.addOns || [];

  return (
    <div className="presentation-backdrop fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-5 backdrop-blur-sm">
      <div className="presentation-window flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] bg-amb-sheet shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700">
        <div className="presentation-header flex items-start justify-between gap-4 border-b border-amb-border p-4">
          <div className="min-w-0">
            <p className="text-sm font-black uppercase tracking-wide text-teal-700 dark:text-teal-300">{itinerary.destination || "Trip breakdown"}</p>
            <h3 className="mt-1 text-3xl font-black leading-tight text-amb-ink">{itinerary.title}</h3>
            <p className="mt-1 line-clamp-2 max-w-4xl text-base font-bold text-amb-muted">{itinerary.summary}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <TripBadge icon={<MapPinned className="h-5 w-5" />} label={itinerary.destination || "Destination"} />
              <TripBadge icon={<Sparkles className="h-5 w-5" />} label={itinerary.provider === "openai" ? "ChatGPT planned" : "Draft planned"} />
              {priceSummary && <TripBadge icon={<DollarSign className="h-5 w-5" />} label={formatTripPriceRange(priceSummary)} />}
            </div>
          </div>
          <button type="button" onClick={onClose} className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-amb-well text-amb-ink active:scale-95" aria-label="Close itinerary details">
            <X className="h-7 w-7" />
          </button>
        </div>

        <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-4">
          <TripAddOnsContent addOns={addOns} priceSummary={priceSummary} onSelect={() => undefined} />
        </div>
      </div>
    </div>
  );
}

function SelectedItineraryDetail({ detail }: { detail: ItinerarySelectedDetail }) {
  return (
    <div className="presentation-detail min-h-0 rounded-3xl border border-amb-border bg-amb-card p-4 shadow-sm">
      <p className="text-sm font-black uppercase tracking-wide text-teal-700 dark:text-teal-300">{detail.eyebrow}</p>
      <h4 className="mt-1 text-2xl font-black text-amb-ink">{detail.title}</h4>
      <p className="mt-2 line-clamp-4 text-base font-bold leading-relaxed text-amb-muted">{detail.body}</p>
      {detail.chips?.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {detail.chips.slice(0, 8).map((chip) => (
            <span key={`${detail.title}-${chip}`} className="rounded-full bg-amb-well px-3 py-2 text-sm font-black text-amb-ink">{chip}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ItineraryPlanningPanel({ planning, onSelect }: { planning: NonNullable<TravelItineraryResult["planning"]>; onSelect: (detail: ItinerarySelectedDetail) => void }) {
  return (
    <div className="min-h-0 overflow-y-auto rounded-3xl border border-teal-100 bg-teal-50 p-4 shadow-sm dark:border-teal-500/20 dark:bg-teal-500/10">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amb-card text-teal-800 shadow-sm dark:text-teal-200">
          <Sparkles className="h-6 w-6" />
        </span>
        <div>
          <p className="text-2xl font-black text-amb-ink">AI trip options</p>
          <p className="text-sm font-bold text-amb-muted">Organized before you click links</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        <ItineraryOptionGroup title="Getting there" icon={<Car className="h-5 w-5" />} tone="from-sky-500 to-teal-500" options={planning.travelOptions} onSelect={onSelect} />
        <ItineraryOptionGroup title="Where to stay" icon={<BedDouble className="h-5 w-5" />} tone="from-violet-500 to-sky-500" options={planning.lodgingOptions} onSelect={onSelect} />
        <ItineraryOptionGroup title="Food and stops" icon={<Utensils className="h-5 w-5" />} tone="from-amber-500 to-rose-500" options={planning.foodAndStops} onSelect={onSelect} />
        <ItineraryNoteGroup title="Family notes" icon={<CheckCircle2 className="h-5 w-5" />} notes={planning.familyNotes} onSelect={onSelect} />
        <ItineraryNoteGroup title="Packing notes" icon={<Luggage className="h-5 w-5" />} notes={planning.packingNotes} onSelect={onSelect} />
      </div>
    </div>
  );
}

function TripOptionsModal({ planning, onClose, onSelect }: { planning: NonNullable<TravelItineraryResult["planning"]>; onClose: () => void; onSelect: (detail: ItinerarySelectedDetail) => void }) {
  return (
    <div className="presentation-backdrop fixed inset-0 z-[60] grid place-items-center bg-slate-950/55 p-5 backdrop-blur-sm">
      <div className="presentation-window flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] bg-amb-sheet shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700">
        <div className="flex items-center justify-between gap-4 border-b border-amb-border p-4">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-teal-700 dark:text-teal-300">AI planning</p>
            <h3 className="text-3xl font-black text-amb-ink">Trip Options</h3>
          </div>
          <button type="button" onClick={onClose} className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-amb-well text-amb-ink active:scale-95" aria-label="Close trip options">
            <X className="h-7 w-7" />
          </button>
        </div>
        <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-4">
          <ItineraryPlanningPanel planning={planning} onSelect={onSelect} />
        </div>
      </div>
    </div>
  );
}

function TripAddOnsContent({ addOns, priceSummary, onSelect }: { addOns: NonNullable<TravelItineraryResult["addOns"]>; priceSummary?: TravelItineraryResult["priceSummary"]; onSelect: (detail: ItinerarySelectedDetail) => void }) {
  const groups = [
    { key: "stays", title: "Stays", icon: <BedDouble className="h-5 w-5" />, tone: "from-violet-500 to-sky-500" },
    { key: "food", title: "Food", icon: <Utensils className="h-5 w-5" />, tone: "from-amber-500 to-rose-500" },
    { key: "activities", title: "Activities", icon: <MapPinned className="h-5 w-5" />, tone: "from-teal-500 to-emerald-500" }
  ] as const;
  const [activeIndexByCategory, setActiveIndexByCategory] = useState<Record<string, number>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function setActive(category: string, index: number) {
    setActiveIndexByCategory((current) => ({ ...current, [category]: index }));
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div className="presentation-card rounded-3xl border border-amber-100 bg-amber-50 p-4 shadow-sm dark:border-amber-500/20 dark:bg-amber-500/10">
        <p className="text-sm font-black uppercase tracking-wide text-amber-700 dark:text-amber-300">Estimate</p>
        <p className="mt-2 text-4xl font-black text-amb-ink">{priceSummary ? formatTripPriceRange(priceSummary) : "Needs quote"}</p>
        <p className="mt-2 rounded-2xl bg-amb-card p-3 text-sm font-black text-amber-800 shadow-sm dark:text-amber-200">{selectedIds.size} selected add-on{selectedIds.size === 1 ? "" : "s"}</p>
        <div className="mt-4 grid gap-2">
          {(priceSummary?.pricingNotes || ["Estimates are planning numbers, not confirmed quotes."]).slice(0, 4).map((note, index) => (
            <p key={note} style={{ animationDelay: `${index * 50 + 120}ms` }} className="presentation-route rounded-2xl bg-amb-card p-3 text-sm font-bold text-amb-muted shadow-sm">{note}</p>
          ))}
        </div>
      </div>

      <div className="grid gap-4">
        {groups.map((group, groupIndex) => {
          const items = addOns.filter((item) => item.category === group.key);
          return <AddOnCarousel
            key={group.key}
            title={group.title}
            category={group.key}
            icon={group.icon}
            tone={group.tone}
            items={items}
            activeIndex={activeIndexByCategory[group.key] || 0}
            selectedIds={selectedIds}
            animationDelay={groupIndex * 80 + 120}
            onActiveChange={(index) => setActive(group.key, index)}
            onToggleSelected={toggleSelected}
            onSelect={onSelect}
          />;
        })}
      </div>
    </div>
  );
}

function TripAddOnsModal({ addOns, priceSummary, onClose, onSelect }: { addOns: NonNullable<TravelItineraryResult["addOns"]>; priceSummary?: TravelItineraryResult["priceSummary"]; onClose: () => void; onSelect: (detail: ItinerarySelectedDetail) => void }) {
  const groups = [
    { key: "stays", title: "Stays", icon: <BedDouble className="h-5 w-5" />, tone: "from-violet-500 to-sky-500" },
    { key: "food", title: "Food", icon: <Utensils className="h-5 w-5" />, tone: "from-amber-500 to-rose-500" },
    { key: "activities", title: "Activities", icon: <MapPinned className="h-5 w-5" />, tone: "from-teal-500 to-emerald-500" }
  ] as const;
  const [activeIndexByCategory, setActiveIndexByCategory] = useState<Record<string, number>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function setActive(category: string, index: number) {
    setActiveIndexByCategory((current) => ({ ...current, [category]: index }));
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="presentation-backdrop fixed inset-0 z-[60] grid place-items-center bg-slate-950/55 p-5 backdrop-blur-sm">
      <div className="presentation-window flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] bg-amb-sheet shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700">
        <div className="flex items-center justify-between gap-4 border-b border-amb-border p-4">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-amber-700 dark:text-amber-300">Trip package pricing</p>
            <h3 className="text-3xl font-black text-amb-ink">Add-ons</h3>
            <p className="mt-1 text-base font-bold text-amb-muted">{priceSummary ? formatTripPriceRange(priceSummary) : "Pricing estimates"} across selected trip options.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-amb-well text-amb-ink active:scale-95" aria-label="Close trip add-ons">
            <X className="h-7 w-7" />
          </button>
        </div>

        <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-4">
          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="presentation-card rounded-3xl border border-amber-100 bg-amber-50 p-4 shadow-sm dark:border-amber-500/20 dark:bg-amber-500/10">
              <p className="text-sm font-black uppercase tracking-wide text-amber-700 dark:text-amber-300">Estimate</p>
              <p className="mt-2 text-4xl font-black text-amb-ink">{priceSummary ? formatTripPriceRange(priceSummary) : "Needs quote"}</p>
              <p className="mt-2 rounded-2xl bg-amb-card p-3 text-sm font-black text-amber-800 shadow-sm dark:text-amber-200">{selectedIds.size} selected add-on{selectedIds.size === 1 ? "" : "s"}</p>
              <div className="mt-4 grid gap-2">
                {(priceSummary?.pricingNotes || ["Estimates are planning numbers, not confirmed quotes."]).slice(0, 4).map((note, index) => (
                  <p key={note} style={{ animationDelay: `${index * 50 + 120}ms` }} className="presentation-route rounded-2xl bg-amb-card p-3 text-sm font-bold text-amb-muted shadow-sm">{note}</p>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              {groups.map((group, groupIndex) => {
                const items = addOns.filter((item) => item.category === group.key);
                return <AddOnCarousel
                  key={group.key}
                  title={group.title}
                  category={group.key}
                  icon={group.icon}
                  tone={group.tone}
                  items={items}
                  activeIndex={activeIndexByCategory[group.key] || 0}
                  selectedIds={selectedIds}
                  animationDelay={groupIndex * 80 + 120}
                  onActiveChange={(index) => setActive(group.key, index)}
                  onToggleSelected={toggleSelected}
                  onSelect={onSelect}
                />;
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddOnCarousel({
  title,
  category,
  icon,
  tone,
  items,
  activeIndex,
  selectedIds,
  animationDelay,
  onActiveChange,
  onToggleSelected,
  onSelect
}: {
  title: string;
  category: NonNullable<TravelItineraryResult["addOns"]>[number]["category"];
  icon: ReactNode;
  tone: string;
  items: NonNullable<TravelItineraryResult["addOns"]>;
  activeIndex: number;
  selectedIds: Set<string>;
  animationDelay: number;
  onActiveChange: (index: number) => void;
  onToggleSelected: (id: string) => void;
  onSelect: (detail: ItinerarySelectedDetail) => void;
}) {
  const safeIndex = items.length ? Math.min(activeIndex, items.length - 1) : 0;
  const carouselRef = useRef<HTMLDivElement | null>(null);

  function shift(direction: -1 | 1) {
    if (!items.length) return;
    const nextIndex = (safeIndex + direction + items.length) % items.length;
    onActiveChange(nextIndex);
    const card = carouselRef.current?.querySelector<HTMLElement>(`[data-addon-index="${nextIndex}"]`);
    card?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }

  function handleScroll() {
    const carousel = carouselRef.current;
    if (!carousel || !items.length) return;
    const center = carousel.scrollLeft + carousel.clientWidth / 2;
    let closestIndex = safeIndex;
    let closestDistance = Number.POSITIVE_INFINITY;
    Array.from(carousel.querySelectorAll<HTMLElement>("[data-addon-index]")).forEach((card) => {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const distance = Math.abs(cardCenter - center);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = Number(card.dataset.addonIndex || 0);
      }
    });
    if (closestIndex !== safeIndex) onActiveChange(closestIndex);
  }

  return (
    <div style={{ animationDelay: `${animationDelay}ms` }} className="presentation-card rounded-3xl bg-amb-card p-3 shadow-sm ring-1 ring-slate-200 dark:ring-slate-800">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br ${tone} text-white shadow-sm`}>{icon}</span>
          <div>
            <p className="text-xl font-black text-amb-ink">{title}</p>
            <p className="text-xs font-black uppercase text-amb-muted">Swipe through {items.length} option{items.length === 1 ? "" : "s"}</p>
          </div>
        </div>
        {items.length > 1 && (
          <div className="flex gap-2">
            <button type="button" onClick={() => shift(-1)} className="grid h-11 w-11 place-items-center rounded-2xl bg-amb-well text-amb-muted active:scale-95" aria-label={`Previous ${title} option`}>
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button type="button" onClick={() => shift(1)} className="grid h-11 w-11 place-items-center rounded-2xl bg-amb-well text-amb-muted active:scale-95" aria-label={`Next ${title} option`}>
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>
        )}
      </div>

      {items.length ? (
        <div className="mt-3">
          <div
            ref={carouselRef}
            onScroll={handleScroll}
            className="airbnb-addon-carousel flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-2"
          >
            {items.map((item, index) => {
              const selected = selectedIds.has(item.id);
              const isActive = index === safeIndex;
              return (
                <article
                  key={item.id}
                  data-addon-index={index}
                  className={`min-w-[188px] max-w-[188px] snap-center overflow-hidden rounded-3xl bg-amb-well shadow-sm ring-2 transition ${isActive ? "scale-[1.015] ring-amber-400" : selected ? "ring-emerald-400" : "ring-transparent"}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onActiveChange(index);
                      onSelect({
                        title: item.title,
                        eyebrow: title,
                        body: item.description,
                        chips: [addOnProviderLabel(item), formatAddOnPrice(item), item.unit, addOnConfidenceLabel(item.confidence)]
                      });
                    }}
                    className="block w-full text-left active:scale-[0.99]"
                  >
                    <AddOnThumbnail category={category} index={index} tone={tone} icon={icon} />
                    <div className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-full bg-amb-card px-2 py-1 text-[11px] font-black text-amber-700 shadow-sm dark:text-amber-200">{formatAddOnPrice(item)}</span>
                        <span className="truncate text-[10px] font-black uppercase text-amb-muted">{addOnProviderLabel(item)}</span>
                      </div>
                      <p className="mt-2 line-clamp-2 min-h-[44px] text-base font-black leading-tight text-amb-ink">{item.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs font-bold leading-snug text-amb-muted">{item.description}</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleSelected(item.id)}
                    className={`mx-3 mb-3 h-10 w-[calc(100%-1.5rem)] rounded-2xl text-xs font-black active:scale-[0.98] ${selected ? "bg-emerald-600 text-white" : "bg-amb-card text-amb-ink shadow-sm"}`}
                  >
                    {selected ? "Selected" : "Add"}
                  </button>
                  {item.bookingUrl && (
                    <a
                      href={item.bookingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mx-3 mb-3 flex h-10 items-center justify-center gap-2 rounded-2xl bg-amb-accent text-xs font-black text-amb-accent-ink active:scale-[0.98]"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open
                    </a>
                  )}
                </article>
              );
            })}
          </div>
          <div className="mt-2 flex justify-center gap-1.5">
            {items.map((item, index) => (
              <button
                key={`${item.id}-dot`}
                type="button"
                onClick={() => {
                  onActiveChange(index);
                  const card = carouselRef.current?.querySelector<HTMLElement>(`[data-addon-index="${index}"]`);
                  card?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
                }}
                className={`h-2.5 rounded-full transition-all ${index === safeIndex ? "w-8 bg-slate-900 dark:bg-white" : selectedIds.has(item.id) ? "w-2.5 bg-emerald-500" : "w-2.5 bg-slate-300 dark:bg-slate-700"}`}
                aria-label={`Show ${item.title}`}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-2xl bg-amb-well p-3 text-sm font-bold text-amb-muted">No {title.toLowerCase()} add-ons yet.</p>
      )}
    </div>
  );
}

function AddOnThumbnail({ category, index, tone, icon, large = false }: { category: NonNullable<TravelItineraryResult["addOns"]>[number]["category"]; index: number; tone: string; icon: ReactNode; large?: boolean }) {
  const labels = {
    stays: ["Stay", "Inn", "Rent"],
    food: ["Meal", "Cafe", "Taste"],
    activities: ["Stop", "View", "Tour"]
  };
  return (
    <span className={`grid place-items-center bg-gradient-to-br ${tone} text-white ${large ? "h-full min-h-[184px]" : "h-16"}`}>
      <span className="grid place-items-center gap-1 text-center">
        <span className={`${large ? "grid h-16 w-16" : "grid h-9 w-9"} place-items-center rounded-2xl bg-white/20 shadow-sm`}>{icon}</span>
        <span className={`${large ? "text-base" : "text-[10px]"} font-black uppercase tracking-wide`}>{labels[category][index % labels[category].length]}</span>
      </span>
    </span>
  );
}

function TripMapModal({ title, activeMapQuery, activeMapEmbedUrl, onClose, onReset }: { title: string; activeMapQuery: string; activeMapEmbedUrl: string; onClose: () => void; onReset: () => void }) {
  return (
    <div className="presentation-backdrop fixed inset-0 z-[60] grid place-items-center bg-slate-950/55 p-5 backdrop-blur-sm">
      <div className="presentation-window flex h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] bg-amb-sheet shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700">
        <div className="flex items-center justify-between gap-4 border-b border-amb-border p-4">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-teal-700 dark:text-teal-300">Embedded Google Map</p>
            <h3 className="text-3xl font-black text-amb-ink">{title}</h3>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onReset} className="h-14 rounded-2xl bg-teal-700 px-5 text-base font-black text-white active:scale-[0.98]">
              Reset
            </button>
            <button type="button" onClick={onClose} className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-amb-well text-amb-ink active:scale-95" aria-label="Close map">
              <X className="h-7 w-7" />
            </button>
          </div>
        </div>
        <iframe title="Itinerary Google Map" src={activeMapEmbedUrl} className="min-h-0 flex-1 border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        <div className="truncate border-t border-amb-border p-3 text-sm font-bold text-amb-muted">
          Showing: {activeMapQuery}
        </div>
      </div>
    </div>
  );
}

function ItineraryOptionGroup({ title, icon, tone, options, onSelect }: { title: string; icon: ReactNode; tone: string; options: NonNullable<TravelItineraryResult["planning"]>["travelOptions"]; onSelect: (detail: ItinerarySelectedDetail) => void }) {
  return (
    <div className="rounded-3xl bg-amb-card p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br ${tone} text-white shadow-sm`}>{icon}</span>
        <p className="text-lg font-black text-amb-ink">{title}</p>
      </div>
      <div className="mt-3 grid gap-2">
        {options.map((option, index) => (
          <button
            key={`${title}-${option.title}`}
            type="button"
            style={{ animationDelay: `${index * 55 + 80}ms` }}
            onClick={() => onSelect({
              title: option.title,
              eyebrow: title,
              body: option.recommendation,
              chips: [option.timing, option.estimatedCost, option.bookingNotes].filter(Boolean) as string[]
            })}
            className="presentation-option presentation-route rounded-2xl border border-amb-border bg-amb-well p-3 text-left shadow-sm active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-base font-black text-amb-ink">{option.title}</p>
              {option.timing && <span className="shrink-0 rounded-full bg-amb-card px-2 py-1 text-[11px] font-black uppercase text-teal-700 shadow-sm dark:text-teal-200">{option.timing}</span>}
            </div>
            <p className="mt-2 line-clamp-3 text-sm font-bold leading-snug text-amb-muted">{option.recommendation}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {option.estimatedCost && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amb-card px-2 py-1 text-[11px] font-black text-amb-muted shadow-sm">
                  <DollarSign className="h-3 w-3" />
                  {option.estimatedCost}
                </span>
              )}
              {option.bookingNotes && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amb-card px-2 py-1 text-[11px] font-black text-amb-muted shadow-sm">
                  <Clock3 className="h-3 w-3" />
                  {option.bookingNotes}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ItineraryNoteGroup({ title, icon, notes, onSelect }: { title: string; icon: ReactNode; notes: string[]; onSelect: (detail: ItinerarySelectedDetail) => void }) {
  return (
    <div className="rounded-3xl bg-amb-card p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-amb-well text-teal-800 dark:text-teal-200">{icon}</span>
        <p className="text-lg font-black text-amb-ink">{title}</p>
      </div>
      <div className="mt-2 grid gap-2">
        {notes.map((note, index) => (
          <button
            key={`${title}-${note}`}
            type="button"
            style={{ animationDelay: `${index * 45 + 80}ms` }}
            onClick={() => onSelect({ title, eyebrow: "Note", body: note })}
            className="presentation-route rounded-2xl bg-amb-well p-3 text-left text-sm font-bold text-amb-muted active:scale-[0.99]"
          >
            {note}
          </button>
        ))}
      </div>
    </div>
  );
}

function CompactLinkPanel({ icon, title, links }: { icon: ReactNode; title: string; links: { label: string; url: string }[] }) {
  return (
    <div className="rounded-3xl border border-amb-border bg-amb-card p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-amb-well text-teal-800 dark:text-teal-200">{icon}</span>
        <p className="text-lg font-black text-amb-ink">{title}</p>
      </div>
      <div className="mt-3 grid gap-2">
        {links.slice(0, 2).map((link) => (
          <button key={`${title}-${link.label}`} type="button" onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")} className="flex min-h-11 items-center justify-between gap-2 rounded-2xl bg-amb-well px-3 py-2 text-left text-sm font-black text-amb-ink active:scale-[0.99]">
            <span className="truncate">{link.label}</span>
            <ExternalLink className="h-4 w-4 shrink-0 text-teal-700 dark:text-teal-300" />
          </button>
        ))}
      </div>
    </div>
  );
}

function ItineraryLinkPanel({ icon, title, links }: { icon: ReactNode; title: string; links: { label: string; url: string }[] }) {
  return (
    <div className="rounded-3xl border border-amb-border bg-amb-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amb-well text-teal-800 dark:text-teal-200">{icon}</span>
        <p className="text-2xl font-black text-amb-ink">{title}</p>
      </div>
      <div className="mt-4 grid gap-2">
        {links.length ? links.map((link) => (
          <button key={`${title}-${link.label}`} type="button" onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")} className="flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-amb-well px-4 py-3 text-left text-base font-black text-amb-ink active:scale-[0.99]">
            <span>{link.label}</span>
            <ExternalLink className="h-5 w-5 shrink-0 text-teal-700 dark:text-teal-300" />
          </button>
        )) : (
          <p className="rounded-2xl bg-amb-well p-4 text-base font-bold text-amb-muted">Build an itinerary to generate links.</p>
        )}
      </div>
    </div>
  );
}

function googleMapsClientUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function googleMapsClientEmbedUrl(query: string) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

function formatTripPriceRange(priceSummary: NonNullable<TravelItineraryResult["priceSummary"]>) {
  const low = priceSummary.estimatedLow;
  const high = priceSummary.estimatedHigh;
  if (low === null && high === null) return "Needs quote";
  if (low !== null && high !== null) return `${priceSummary.currency} ${money(low)}-${money(high).replace("$", "")}`;
  return `${priceSummary.currency} ${money(low ?? high)}`;
}

function formatAddOnPrice(addOn: NonNullable<TravelItineraryResult["addOns"]>[number]) {
  const low = addOn.estimatedLow;
  const high = addOn.estimatedHigh;
  if (low === null && high === null) return addOn.priceLabel || "Quote";
  if (low !== null && high !== null) return `${money(low)}-${money(high).replace("$", "")}`;
  return money(low ?? high);
}

function addOnProviderLabel(addOn: NonNullable<TravelItineraryResult["addOns"]>[number]) {
  const labels = {
    hotel: "Hotel",
    airbnb: "Airbnb",
    vacation_rental: "Rental",
    restaurant: "Food",
    activity: "Activity",
    local: "Idea"
  };
  return labels[addOn.provider || "local"];
}

function addOnConfidenceLabel(confidence: NonNullable<TravelItineraryResult["addOns"]>[number]["confidence"]) {
  if (confidence === "researched") return "researched estimate";
  if (confidence === "needs_quote") return "needs live quote";
  return "planning estimate";
}

function TravelStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-amb-border bg-amb-well p-4">
      <p className="text-3xl font-black text-amb-ink">{value}</p>
      <p className="text-lg font-bold text-amb-muted">{label}</p>
    </div>
  );
}

function TravelMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-amb-border bg-amb-card p-4 text-center">
      <p className="text-2xl font-black text-amb-ink">{value}</p>
      <p className="text-base font-black uppercase tracking-normal text-amb-muted">{label}</p>
    </div>
  );
}

/** The last 10 shares from the phone, so a failed one can be seen and retried instead of vanishing. */
function RecentShares() {
  const [shares, setShares] = useState<ShareImport[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => fetchRecentShares().then(setShares).catch(() => undefined);
  useEffect(() => {
    load();
  }, []);

  async function retry(id: number) {
    setBusy(id);
    setError(null);
    try {
      const result = await retryShare(id);
      if (result.status !== "saved") setError(result.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry didn't reach the Pi. Try again.");
    } finally {
      setBusy(null);
    }
  }

  if (!shares.length) return null;
  return (
    <div className="mt-4 rounded-3xl bg-amb-card p-4 shadow-sm">
      <p className="text-lg font-black text-amb-ink">Recent shares</p>
      {error ? <p className="mt-1 text-sm font-semibold text-rose-600 dark:text-rose-300">{error}</p> : null}
      <ul className="mt-2 divide-y divide-amb-border">
        {shares.map((share) => (
          <li key={share.id} className="flex items-center gap-3 py-2">
            <span className={`h-3 w-3 shrink-0 rounded-full ${share.status === "saved" ? "bg-emerald-500" : share.status === "failed" ? "bg-rose-500" : "bg-amb-muted"}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-amb-ink">{share.title || share.url || "Shared text"}</p>
              <p className="truncate text-sm text-amb-muted">{share.message}</p>
            </div>
            <span className="shrink-0 text-sm text-amb-muted">
              {new Date(share.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>
            {share.status === "failed" ? (
              <button type="button" onClick={() => retry(share.id)} disabled={busy === share.id} className="h-10 shrink-0 rounded-xl bg-amb-accent px-4 text-sm font-bold text-amb-accent-ink disabled:opacity-50">
                Retry
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SettingsPanel({ onChanged }: { onChanged: () => void }) {
  const [feeds, setFeeds] = useState<RssFeed[]>([]);
  const [watchlist, setWatchlist] = useState<FinanceWatchlistItem[]>([]);
  const [integrations, setIntegrations] = useState<ApiIntegrationStatus | null>(null);
  const [feedUrl, setFeedUrl] = useState("");
  const [feedTitle, setFeedTitle] = useState("");
  const [symbol, setSymbol] = useState("");

  async function load() {
    const [nextFeeds, nextWatchlist, nextIntegrations] = await Promise.all([fetchRssFeeds(), fetchWatchlist(), fetchIntegrationStatus()]);
    setFeeds(nextFeeds);
    setWatchlist(nextWatchlist);
    setIntegrations(nextIntegrations);
  }

  async function reloadAndRefresh() {
    await load();
    onChanged();
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  async function addFeed() {
    if (!feedUrl.trim()) return;
    await createRssFeed({ title: feedTitle || undefined, url: feedUrl.trim() });
    setFeedTitle("");
    setFeedUrl("");
    await load();
    onChanged();
  }

  async function addSymbol() {
    if (!symbol.trim()) return;
    await createWatchlistItem({ symbol: symbol.trim() });
    setSymbol("");
    await load();
    onChanged();
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <SectionTitle icon={Settings} title="Settings" />
      <RecentShares />
      <div className="mt-4 grid grid-cols-4 gap-3">
        {(integrations?.items || []).map((item) => (
          <div key={item.key} className="rounded-3xl bg-amb-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-black text-amb-ink">{item.label}</p>
                <p className="mt-1 line-clamp-2 text-sm font-bold text-amb-muted">{item.detail}</p>
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black uppercase ${integrationModeClass(item.mode)}`}>{integrationModeLabel(item.mode)}</span>
            </div>
            {item.nextStep && <p className="mt-3 line-clamp-2 text-sm font-bold text-sky-700 dark:text-sky-300">{item.nextStep}</p>}
          </div>
        ))}
      </div>
      <div className="mt-4 grid min-h-0 flex-1 grid-cols-2 gap-4">
        <div className="flex min-h-0 flex-col rounded-3xl bg-amb-well p-4">
          <h3 className="text-2xl font-bold">RSS Feeds</h3>
          <div className="mt-4 grid grid-cols-[1fr_1fr_90px] gap-3">
            <input value={feedTitle} onChange={(event) => setFeedTitle(event.target.value)} className="touch-input text-xl" placeholder="Title" />
            <input value={feedUrl} onChange={(event) => setFeedUrl(event.target.value)} className="touch-input text-xl" placeholder="Feed URL" />
            <button onClick={addFeed} className="touch-button bg-sky-600 text-white"><Plus className="h-6 w-6" /></button>
          </div>
          <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
            {feeds.map((feed) => (
              <div key={feed.id} className="grid grid-cols-[1fr_90px_90px] items-center gap-3 rounded-2xl bg-amb-well p-3">
                <div>
                  <p className="text-xl font-bold">{feed.title}</p>
                  <p className="truncate text-amb-muted">{feed.url}</p>
                </div>
                <button onClick={() => updateRssFeed(feed.id, { enabled: !feed.enabled }).then(reloadAndRefresh)} className={`touch-button ${feed.enabled ? "bg-emerald-100 text-emerald-700" : "bg-amb-well text-amb-muted"}`}>{feed.enabled ? "On" : "Off"}</button>
                <button onClick={() => deleteRssFeed(feed.id).then(reloadAndRefresh)} className="touch-button bg-rose-100 text-rose-700"><Trash2 className="h-6 w-6" /></button>
              </div>
            ))}
          </div>
        </div>
        <div className="flex min-h-0 flex-col rounded-3xl bg-amb-well p-4">
          <h3 className="text-2xl font-bold">Finance Watchlist</h3>
          <div className="mt-4 grid grid-cols-[1fr_90px] gap-3">
            <input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} className="touch-input text-xl" placeholder="Symbol" />
            <button onClick={addSymbol} className="touch-button bg-sky-600 text-white"><Plus className="h-6 w-6" /></button>
          </div>
          <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
            {watchlist.map((item) => (
              <div key={item.id} className="grid grid-cols-[1fr_90px_90px] items-center gap-3 rounded-2xl bg-amb-well p-3">
                <p className="text-3xl font-bold">{item.symbol}</p>
                <button onClick={() => updateWatchlistItem(item.id, { enabled: !item.enabled }).then(reloadAndRefresh)} className={`touch-button ${item.enabled ? "bg-emerald-100 text-emerald-700" : "bg-amb-well text-amb-muted"}`}>{item.enabled ? "On" : "Off"}</button>
                <button onClick={() => deleteWatchlistItem(item.id).then(reloadAndRefresh)} className="touch-button bg-rose-100 text-rose-700"><Trash2 className="h-6 w-6" /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function integrationModeLabel(mode: ApiIntegrationStatus["items"][number]["mode"]) {
  if (mode === "live") return "Live";
  if (mode === "partial") return "Ready";
  if (mode === "mock") return "Mock";
  return "Setup";
}

function integrationModeClass(mode: ApiIntegrationStatus["items"][number]["mode"]) {
  if (mode === "live") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200";
  if (mode === "partial") return "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200";
  if (mode === "mock") return "bg-amb-well text-amb-muted";
  return "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200";
}

function EventList({ events }: { events: CalendarEvent[] }) {
  if (!events.length) return <p className="text-xl text-amb-muted">No events scheduled.</p>;
  return (
    <div className="space-y-3">
      {events.map((event) => (
        <div key={event.id} className="rounded-2xl bg-sky-50 p-4">
          <p className="text-lg font-bold text-sky-900">{formatEventTime(event.start)}</p>
          <p className="text-2xl font-semibold text-amb-ink">{event.title}</p>
          {event.location && <p className="text-amb-muted">{event.location}</p>}
        </div>
      ))}
    </div>
  );
}

function TaskList({ tasks, large = false }: { tasks: Task[]; large?: boolean }) {
  if (!tasks.length) return <p className="text-xl text-amb-muted">Nothing due right now.</p>;
  return (
    <div className="mt-4 space-y-3">
      {tasks.map((task) => (
        <div key={task.id} className={`flex items-center gap-3 rounded-2xl bg-amb-well p-4 ${task.completed ? "opacity-60" : ""}`}>
          <CheckCircle2 className={`h-7 w-7 ${task.completed ? "text-emerald-500" : "text-amb-muted"}`} />
          <div>
            <p className={`${large ? "text-3xl" : "text-xl"} font-semibold ${task.completed ? "line-through" : ""}`}>{task.title}</p>
            <p className="text-amb-muted">{task.priority} priority</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function NewsList({ articles }: { articles: NewsArticle[] }) {
  return (
    <div className="mt-4 space-y-3">
      {articles.map((article) => (
        <a key={article.id} href={article.link} className="block rounded-2xl bg-amb-well p-4 text-lg font-semibold text-amb-ink">
          {article.title}
          <span className="block text-sm text-amb-muted">{article.source}</span>
        </a>
      ))}
    </div>
  );
}

function FinanceList({ quotes }: { quotes: FinanceQuote[] }) {
  return (
    <div className="mt-4 space-y-3">
      {quotes.map((quote) => (
        <div key={quote.symbol} className="flex items-center justify-between rounded-2xl bg-amb-well p-4">
          <div>
            <p className="text-xl font-bold">{quote.symbol}</p>
            <p className="text-amb-muted">{quote.name}</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold">{money(quote.price)}</p>
            <p className={quote.changePercent && quote.changePercent < 0 ? "text-rose-600" : "text-emerald-600"}>{signed(quote.changePercent)}%</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function OnScreenKeyboard({ visible, getTarget, onClose }: { visible: boolean; getTarget: () => HTMLInputElement | HTMLTextAreaElement | null; onClose: () => void }) {
  const rows = ["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm"];
  if (!visible) return null;

  function press(value: string) {
    const target = getTarget();
    if (!target) return;
    target.focus();
    insertIntoField(target, value);
  }

  function backspace() {
    const target = getTarget();
    if (!target) return;
    target.focus();
    deleteFromField(target);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] border-t border-amb-border bg-amb-sheet p-4 shadow-2xl">
      <div className="mx-auto max-w-6xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xl font-bold text-amb-muted">Touch Keyboard</p>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onClose} className="h-14 rounded-2xl bg-amb-well px-6 text-xl font-bold text-amb-ink">Done</button>
        </div>
        <div className="space-y-2">
          {rows.map((row, rowIndex) => (
            <div key={row} className="flex justify-center gap-2">
              {rowIndex === 3 && <KeyboardKey label="Shift" wide onPress={() => undefined} />}
              {row.split("").map((key) => (
                <KeyboardKey key={key} label={key.toUpperCase()} onPress={() => press(key)} />
              ))}
              {rowIndex === 3 && <KeyboardKey label="Del" wide onPress={backspace} />}
            </div>
          ))}
          <div className="flex justify-center gap-2">
            <KeyboardKey label="@" onPress={() => press("@")} />
            <KeyboardKey label="." onPress={() => press(".")} />
            <KeyboardKey label="/" onPress={() => press("/")} />
            <KeyboardKey label="Space" extraWide onPress={() => press(" ")} />
            <KeyboardKey label="-" onPress={() => press("-")} />
            <KeyboardKey label="_" onPress={() => press("_")} />
            <KeyboardKey label="Clear" wide onPress={() => clearField(getTarget())} />
          </div>
        </div>
      </div>
    </div>
  );
}

function KeyboardKey({ label, onPress, wide = false, extraWide = false }: { label: string; onPress: () => void; wide?: boolean; extraWide?: boolean }) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
      className={`h-16 rounded-2xl bg-amb-well text-xl font-bold text-amb-ink active:scale-95 ${extraWide ? "w-80" : wide ? "w-28" : "w-16"}`}
    >
      {label}
    </button>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amb-border text-amb-accent">
        <Icon className="h-7 w-7" />
      </span>
      <h2 className="font-display text-4xl">{title}</h2>
    </div>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`min-h-0 rounded-[30px] border border-amb-border bg-amb-card p-5 shadow-ambient ${className}`}>{children}</section>;
}

// Times are pinned to en-US rather than the system locale: the Pi's locale
// formats 24-hour, and the household wants AM/PM everywhere.
function formatEventTime(value: string) {
  return new Date(value).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
}

function formatTimeOnly(value: string) {
  return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatHour(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 || 12;
  return `${display} ${suffix}`;
}

function formatShortDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function formatServerDateTime(value: string) {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  return new Date(normalized).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function money(value: number | null) {
  return value === null ? "--" : value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function signed(value: number | null) {
  if (value === null) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function scoreTravelTrip(trip: TravelCandidate, tripType: TravelTripType, duration: number, budget: number) {
  const typeFit = trip.types.includes(tripType) ? 18 : 0;
  const durationFit = trip.durationFit.includes(duration) ? 14 : 0;
  const budgetFit = trip.estimatedCost <= budget ? 12 : Math.max(-10, Math.round((budget - trip.estimatedCost) / 500));
  const noFlightBonus = trip.flightHours === 0 ? 8 : Math.max(0, 8 - Math.round(trip.flightHours * 2));
  const weighted = Math.round((trip.ease * 0.26) + (trip.babyFit * 0.22) + (trip.deal * 0.18) + (trip.weather * 0.12) + typeFit + durationFit + budgetFit + noFlightBonus);
  return Math.min(99, Math.max(35, weighted));
}

function buildGroceryDocumentUrl(listText: string) {
  const origin = getShareOrigin();
  return `${origin}/share/grocery?list=${encodeURIComponent(listText)}`;
}

function getShareOrigin() {
  if (typeof window === "undefined") return "";
  const { protocol, hostname, port } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") return `${protocol}//192.168.1.174${port ? `:${port}` : ""}`;
  return window.location.origin;
}

function parseGroceryDocumentSections(lines: string[]) {
  const sections: Array<{ heading: string; items: string[] }> = [];
  let current: { heading: string; items: string[] } | null = null;

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    if (!line.startsWith("- ")) {
      current = { heading: line.replace(/:$/, ""), items: [] };
      sections.push(current);
      return;
    }
    if (!current) {
      current = { heading: "Items", items: [] };
      sections.push(current);
    }
    current.items.push(line);
  });

  return sections.length ? sections : [{ heading: "Items", items: ["No active grocery items yet."] }];
}

function readNavOrder(): View[] {
  const saved = safeStorageGet("mirror-dashboard-nav-order");
  if (!saved) return defaultNavOrder;
  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return defaultNavOrder;
    return normalizeNavOrder(parsed);
  } catch {
    return defaultNavOrder;
  }
}

function normalizeNavOrder(order: unknown[]): View[] {
  const knownViews = new Set(defaultNavOrder);
  const ordered = order.filter((view): view is View => typeof view === "string" && knownViews.has(view as View));
  const missing = defaultNavOrder.filter((view) => !ordered.includes(view));
  return [...ordered, ...missing];
}

function getNavViewAtPoint(clientX: number, clientY: number): View | null {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-nav-view]"));
  const target = buttons.find((button) => {
    const rect = button.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  });
  const view = target?.dataset.navView;
  return defaultNavOrder.includes(view as View) ? view as View : null;
}

function moveNavView(order: View[], draggedView: View, targetView: View) {
  const next = [...order];
  const fromIndex = next.indexOf(draggedView);
  const toIndex = next.indexOf(targetView);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return order;
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function shouldSkipTouchScroll(target: HTMLElement) {
  return Boolean(target.closest([
    "input",
    "select",
    "textarea",
    ".nav-app-button",
    ".cursor-grab",
    ".cursor-ns-resize",
    "[data-no-touch-scroll]"
  ].join(",")));
}

function findScrollableParent(target: HTMLElement) {
  let current: HTMLElement | null = target;
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    const canScrollY = /(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight + 2;
    if (canScrollY) return current;
    current = current.parentElement;
  }
  const documentElement = document.scrollingElement as HTMLElement | null;
  if (documentElement && documentElement.scrollHeight > documentElement.clientHeight + 2) return documentElement;
  return null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function tomorrowAt(hours: number, minutes: number) {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

function normalizeEventEnd(event: CalendarEvent): CalendarEvent {
  if (event.end) return event;
  const end = new Date(event.start);
  end.setMinutes(end.getMinutes() + 45);
  return { ...event, end: end.toISOString() };
}

function eventColor(event: CalendarEvent) {
  const source = `${event.title}-${event.id}`;
  const index = Array.from(source).reduce((total, char) => total + char.charCodeAt(0), 0) % profilePalette.length;
  return profilePalette[index];
}

function groceryStatusStyle(status: GroceryStatus) {
  if (status === "out") return "bg-rose-100 text-rose-800";
  if (status === "ok") return "bg-emerald-100 text-emerald-800";
  return "bg-amber-100 text-amber-800";
}

function formatGroceryList(items: GroceryItem[]) {
  if (!items.length) return "Shopping List\n\nNo active grocery items yet.";
  const grouped = items.reduce<Record<string, GroceryItem[]>>((next, item) => {
    const group = item.category || "Other";
    next[group] = next[group] || [];
    next[group].push(item);
    return next;
  }, {});

  const sections = Object.entries(grouped)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, groupItems]) => {
      const lines = groupItems
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((item) => {
          const details = [item.quantity, item.supplier, item.status === "out" ? "out" : ""].filter(Boolean).join(", ");
          return `- ${item.name}${details ? ` (${details})` : ""}`;
        });
      return `${category}\n${lines.join("\n")}`;
    });

  return `Shopping List\n${new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}\n\n${sections.join("\n\n")}`;
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  next.setDate(next.getDate() - day);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addClientDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isSameClientDate(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isKeyboardField(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return false;
  if (target.readOnly || target.disabled) return false;
  if (target instanceof HTMLTextAreaElement) return true;
  const type = target.type || "text";
  return ["text", "search", "url", "email", "tel", "password"].includes(type);
}

function insertIntoField(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  field.setRangeText(value, start, end, "end");
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function deleteFromField(field: HTMLInputElement | HTMLTextAreaElement) {
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  if (start !== end) {
    field.setRangeText("", start, end, "end");
  } else if (start > 0) {
    field.setRangeText("", start - 1, start, "end");
  }
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function clearField(field: HTMLInputElement | HTMLTextAreaElement | null) {
  if (!field) return;
  field.focus();
  field.setRangeText("", 0, field.value.length, "end");
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function safeStorageGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Local storage can be unavailable in some kiosk/privacy modes.
  }
}
