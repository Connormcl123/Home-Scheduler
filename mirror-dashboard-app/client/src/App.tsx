import { type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { CalendarEvent, DashboardSummary, FinanceQuote, FinanceTransaction, FinanceWatchlistItem, GroceryItem, GroceryStatus, NewsArticle, Note, PersonalFinanceSummary, PlaidConnectionStatus, Priority, RssFeed, Task, TravelInspiration, TravelItineraryResult } from "@mirror-dashboard/shared";
import { ArrowDownRight, ArrowUpRight, CalendarDays, CheckCircle2, CloudSun, CreditCard, Home, Landmark, MapPinned, Moon, PieChart, Plane, type LucideIcon, Newspaper, Plus, RefreshCw, Save, Settings, ShoppingBasket, Sparkles, StickyNote, SunMedium, Trash2, Wallet, WifiOff } from "lucide-react";
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
  fetchNote,
  fetchNotes,
  fetchPersonalFinanceSummary,
  fetchPlaidStatus,
  fetchRssFeeds,
  fetchTasks,
  fetchTravelInspirations,
  fetchWatchlist,
  generateTravelItinerary,
  saveNote,
  exchangePlaidPublicToken,
  syncPlaidFinance,
  updateFinanceTransactionCategory,
  updateGroceryItem,
  updateRssFeed,
  updateTask,
  updateWatchlistItem
} from "./api";

type View = "home" | "calendar" | "grocery" | "tasks" | "notes" | "finance" | "travel" | "settings";
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
  { view: "tasks", label: "Tasks", icon: CheckCircle2 },
  { view: "notes", label: "Notes", icon: StickyNote },
  { view: "finance", label: "Finance", icon: Landmark },
  { view: "travel", label: "Travel", icon: Plane },
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
  const [darkMode, setDarkMode] = useState(() => safeStorageGet("mirror-dashboard-theme") === "dark");
  const [burnInStep, setBurnInStep] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
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
    safeStorageSet("mirror-dashboard-theme", darkMode ? "dark" : "light");
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

  useEffect(() => {
    let activeScroll: { pointerId: number; lastY: number; startY: number; element: HTMLElement; moved: boolean } | null = null;
    let suppressNextClick = false;

    function onPointerDown(event: PointerEvent) {
      if (!event.isPrimary || event.pointerType === "mouse") return;
      const target = event.target;
      if (!(target instanceof HTMLElement) || shouldSkipTouchScroll(target)) return;
      const element = findScrollableParent(target);
      if (!element) return;
      activeScroll = { pointerId: event.pointerId, lastY: event.clientY, startY: event.clientY, element, moved: false };
    }

    function onPointerMove(event: PointerEvent) {
      if (!activeScroll || event.pointerId !== activeScroll.pointerId) return;
      const deltaY = event.clientY - activeScroll.lastY;
      if (Math.abs(deltaY) < 1) return;
      activeScroll.element.scrollTop -= deltaY;
      activeScroll.lastY = event.clientY;
      if (Math.abs(event.clientY - activeScroll.startY) > 6) {
        activeScroll.moved = true;
        event.preventDefault();
      }
    }

    function endScroll(event: PointerEvent) {
      if (activeScroll?.pointerId !== event.pointerId) return;
      if (activeScroll.moved) {
        suppressNextClick = true;
        window.setTimeout(() => {
          suppressNextClick = false;
        }, 120);
      }
      activeScroll = null;
    }

    function onClick(event: MouseEvent) {
      if (!suppressNextClick) return;
      event.preventDefault();
      event.stopPropagation();
      suppressNextClick = false;
    }

    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("pointermove", onPointerMove, { passive: false });
    document.addEventListener("pointerup", endScroll, { passive: true });
    document.addEventListener("pointercancel", endScroll, { passive: true });
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", endScroll);
      document.removeEventListener("pointercancel", endScroll);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  const content = useMemo(() => {
    if (view === "calendar") return <CalendarPanel events={dashboard.calendar} />;
    if (view === "grocery") return <GroceryPanel />;
    if (view === "tasks") return <TaskPanel initialTasks={dashboard.tasks} onChanged={refreshDashboard} />;
    if (view === "notes") return <NotesPanel onChanged={refreshDashboard} />;
    if (view === "finance") return <FinancePanel quotes={dashboard.finance.quotes} initialSummary={dashboard.finance.personal} />;
    if (view === "travel") return <TravelHubPanel />;
    if (view === "settings") return <SettingsPanel onChanged={refreshDashboard} />;
    return <HomePanel dashboard={dashboard} now={now} />;
  }, [dashboard, now, view]);

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
    <main className={`min-h-screen overflow-hidden transition-colors duration-700 ${darkMode ? "dark bg-slate-950 text-slate-100" : "bg-[radial-gradient(circle_at_top_left,#e7f3ff_0,#f9fbfe_36%,#eef5ef_100%)] text-mirror-ink"}`}>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center">
        {(!isOnline || error) && (
          <div className="mt-3 flex items-center gap-3 rounded-full bg-amber-100 px-5 py-3 text-lg font-bold text-amber-900 shadow-lg">
            <WifiOff className="h-5 w-5" />
            {!isOnline ? "Offline - showing last saved dashboard" : "Provider issue - fallback data is active"}
          </div>
        )}
      </div>
      <div className={`mx-auto flex h-screen max-h-screen max-w-[1920px] gap-4 overflow-hidden px-5 py-4 transition-transform duration-700 ${keyboardVisible ? "pb-80" : ""}`} style={{ transform: `translate(${shift.x}px, ${shift.y}px)` }}>
        <aside className="flex w-32 shrink-0 flex-col items-center gap-2 rounded-[24px] border border-white/70 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-slate-900/90">
          <button onClick={() => setDarkMode((value) => !value)} className="touch-button w-full bg-amber-100 text-amber-700 dark:bg-slate-800 dark:text-sky-200" aria-label="Toggle dark mode">
            {darkMode ? <SunMedium className="h-8 w-8" /> : <Moon className="h-8 w-8" />}
          </button>
          <div className="h-px w-14 bg-mirror-line" />
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
                  active ? "bg-sky-600 text-white shadow-lg shadow-sky-300/40" : "text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
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
              className="mt-auto min-h-14 rounded-2xl bg-slate-900 px-3 text-base font-black text-white active:scale-95 dark:bg-slate-100 dark:text-slate-900"
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
          <header className="flex shrink-0 items-center justify-between rounded-[24px] border border-white/70 bg-white/80 px-6 py-3 shadow-sm dark:border-white/10 dark:bg-slate-900/90">
            <div>
              <p className="text-lg font-semibold text-slate-500 dark:text-slate-400">{now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</p>
              <h1 className="text-4xl font-bold tracking-normal">{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</h1>
            </div>
            <div className="flex items-center gap-4 text-right">
              <button onClick={refreshDashboard} className="touch-button w-20 bg-white/80 text-slate-600 dark:bg-slate-800 dark:text-slate-200" aria-label="Refresh dashboard"><RefreshCw className="h-7 w-7" /></button>
              <div>
                <p className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">Family Command Center</p>
                <p className="text-lg text-slate-600 dark:text-slate-300">{dashboard.weather.locationName} - {dashboard.weather.current.description}</p>
                <p className="text-sm text-slate-500 dark:text-slate-500">Refresh {lastRefresh ? lastRefresh.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "pending"}</p>
              </div>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-hidden">
            {content}
          </div>
        </section>
      </div>
      <OnScreenKeyboard
        visible={keyboardVisible}
        getTarget={() => keyboardTargetRef.current}
        onClose={() => setKeyboardVisible(false)}
      />
    </main>
  );
}

function HomePanel({ dashboard, now }: { dashboard: DashboardSummary; now: Date }) {
  return (
    <div className="grid flex-1 grid-cols-12 gap-5">
      <Card className="col-span-4 row-span-2">
        <WeatherCard dashboard={dashboard} />
      </Card>
      <Card className="col-span-5 row-span-2">
        <SectionTitle icon={CalendarDays} title="Agenda" />
        <EventList events={dashboard.calendar.slice(0, 5)} />
      </Card>
      <Card className="col-span-3 row-span-2">
        <SectionTitle icon={CheckCircle2} title="Today" />
        <TaskList tasks={dashboard.tasks.slice(0, 5)} />
      </Card>
      <Card className="col-span-4">
        <SectionTitle icon={StickyNote} title="Daily Note" />
        <p className="mt-4 text-2xl leading-snug text-slate-700">{dashboard.todayNote?.body || "No notes yet."}</p>
      </Card>
      <Card className="col-span-4">
        <SectionTitle icon={Newspaper} title="News" />
        <NewsList articles={dashboard.news.slice(0, 3)} />
      </Card>
      <Card className="col-span-4">
        <SectionTitle icon={Landmark} title="Finance" />
        <FinanceList quotes={dashboard.finance.quotes.slice(0, 3)} />
      </Card>
      <Card className="col-span-12">
        <p className="text-xl font-semibold text-slate-600">
          Updated {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Designed for kiosk touch, with manual page buttons and local-first data.
        </p>
      </Card>
    </div>
  );
}

function NavDragPreview({ item, drag, active }: { item?: { view: View; label: string; icon: LucideIcon }; drag: { x: number; y: number; offsetX: number; offsetY: number; width: number; height: number }; active: boolean }) {
  if (!item) return null;
  const Icon = item.icon;
  return (
    <div
      className={`pointer-events-none fixed z-[90] flex flex-col items-center justify-center gap-1 rounded-2xl text-base font-semibold shadow-2xl ring-4 ring-white/70 ${
        active ? "bg-sky-600 text-white" : "bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-100"
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
          <p className="text-2xl text-slate-600">Feels like {dashboard.weather.current.apparentTemperature} deg</p>
        </div>
        <p className="mb-3 rounded-full bg-sky-100 px-5 py-3 text-lg font-semibold text-sky-800">{dashboard.weather.current.description}</p>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-3">
        {dashboard.weather.daily.slice(0, 4).map((day) => (
          <div key={day.date} className="rounded-2xl bg-white/70 p-4">
            <p className="font-bold">{formatShortDate(day.date)}</p>
            <p className="text-slate-600">{day.high} deg / {day.low} deg</p>
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
  const weekStart = startOfWeek(new Date());
  const days = Array.from({ length: 7 }, (_, index) => addClientDays(weekStart, index));
  const startHour = 6;
  const endHour = 22;
  const hourHeight = 72;
  const dayWidthPercent = 100 / 7;

  useEffect(() => {
    setWeekEvents(events.map(normalizeEventEnd));
  }, [events]);

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
    <section className="relative flex flex-1 flex-col overflow-hidden rounded-[28px] border border-white/75 bg-[#f7f8f4] p-5 shadow-sm dark:border-white/10 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-5">
        <div>
          <p className="text-lg font-bold uppercase tracking-normal text-slate-500 dark:text-slate-400">Family Calendar</p>
          <h2 className="text-5xl font-bold text-slate-900 dark:text-white">This Week</h2>
        </div>
        <div className="flex rounded-2xl bg-white p-2 shadow-sm dark:bg-slate-900">
          {(["Day", "Week", "Month", "Schedule"] as CalendarMode[]).map((label) => (
            <button
              key={label}
              onClick={() => setCalendarMode(label)}
              className={`h-16 rounded-xl px-6 text-xl font-bold ${label === calendarMode ? "bg-slate-900 text-white dark:bg-sky-500" : "text-slate-500 dark:text-slate-300"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button onClick={() => setIsEventModalOpen(true)} className="touch-button bg-[#ffcf5a] px-7 text-slate-900"><Plus className="mr-2 h-7 w-7" /> Event</button>
      </div>

      <div className="mt-5 grid min-h-0 flex-1 grid-cols-[300px_1fr] gap-5">
        <aside className="flex min-h-0 flex-col gap-4 rounded-[24px] bg-white p-5 shadow-sm dark:bg-slate-900">
          <div className="rounded-3xl bg-[#eef5ff] p-5 dark:bg-slate-800">
            <p className="text-lg font-bold text-slate-500 dark:text-slate-400">{new Date().toLocaleDateString([], { weekday: "long" })}</p>
            <p className="text-6xl font-bold text-slate-900 dark:text-white">{new Date().getDate()}</p>
            <p className="mt-2 text-xl font-semibold text-slate-600 dark:text-slate-300">{new Date().toLocaleDateString([], { month: "long", year: "numeric" })}</p>
          </div>
          <div className="rounded-3xl bg-[#fff7df] p-5 dark:bg-slate-800">
            <p className="text-xl font-bold text-slate-900 dark:text-white">Calendars</p>
            <div className="mt-4 space-y-3">
              {profilePalette.map((profile) => (
                <div key={profile.name} className="flex items-center gap-3">
                  <span className="h-5 w-5 rounded-full" style={{ background: profile.color }} />
                  <span className="text-lg font-semibold text-slate-600 dark:text-slate-300">{profile.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 rounded-3xl bg-white p-4 shadow-inner dark:bg-slate-800">
            <p className="mb-3 text-xl font-bold text-slate-900 dark:text-white">Today</p>
            <div className="space-y-3 overflow-y-auto pr-1">
              {weekEvents.filter((item) => isSameClientDate(new Date(item.start), new Date())).slice(0, 5).map((item) => {
                const colors = eventColor(item);
                return (
                  <div key={item.id} className="rounded-2xl p-3" style={{ background: colors.soft }}>
                    <p className="text-sm font-bold" style={{ color: colors.text }}>{formatTimeOnly(item.start)}</p>
                    <p className="truncate text-lg font-bold text-slate-800">{item.title}</p>
                  </div>
                );
              })}
              {!weekEvents.some((item) => isSameClientDate(new Date(item.start), new Date())) && (
                <p className="rounded-2xl bg-slate-50 p-4 text-lg font-semibold text-slate-500">No events today.</p>
              )}
            </div>
          </div>
        </aside>

        <div className="relative min-h-0 overflow-hidden rounded-[24px] bg-white shadow-sm dark:bg-slate-900">
          {calendarMode !== "Week" && (
            <div className="absolute inset-0 z-20 bg-white p-5 dark:bg-slate-900">
              {calendarMode === "Day" && <CalendarDayView events={weekEvents} day={new Date()} />}
              {calendarMode === "Month" && <CalendarMonthView events={weekEvents} monthDate={new Date()} />}
              {calendarMode === "Schedule" && <CalendarScheduleView events={weekEvents} />}
            </div>
          )}
          <div className="grid grid-cols-[86px_1fr] border-b border-mirror-line">
            <div className="flex items-center justify-center text-sm font-bold text-slate-400">Time</div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const active = isSameClientDate(day, new Date());
                return (
                  <div key={day.toISOString()} className={`border-r border-mirror-line px-3 py-4 last:border-r-0 ${active ? "bg-[#fff3c4]" : ""}`}>
                    <p className="text-lg font-bold text-slate-500 dark:text-slate-400">{day.toLocaleDateString([], { weekday: "short" })}</p>
                    <p className="text-4xl font-bold text-slate-900 dark:text-white">{day.getDate()}</p>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="grid h-[64vh] grid-cols-[86px_1fr] overflow-y-auto">
            <div className="relative bg-[#fbfbf7] dark:bg-slate-950" style={{ height: (endHour - startHour) * hourHeight }}>
              {Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index).map((hour) => (
                <div key={hour} className="absolute left-0 right-3 -translate-y-3 text-right text-base font-bold text-slate-400" style={{ top: (hour - startHour) * hourHeight }}>
                  {formatHour(hour)}
                </div>
              ))}
            </div>
            <div data-week-grid className="relative touch-none bg-[#fbfbf7] dark:bg-slate-950" style={{ height: (endHour - startHour) * hourHeight }}>
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
                const height = Math.max(50, (end.getTime() - start.getTime()) / (60 * 60 * 1000) * hourHeight);
                if (top < 0 || top > (endHour - startHour) * hourHeight) return null;
                const colors = eventColor(calendarEvent);

                return (
                  <div
                    key={calendarEvent.id}
                    onPointerDown={(pointerEvent) => beginDrag(pointerEvent, calendarEvent)}
                    className="absolute cursor-grab select-none rounded-2xl border-l-[10px] px-4 py-3 shadow-sm active:cursor-grabbing"
                    style={{
                      left: `calc(${dayIndex * dayWidthPercent}% + 8px)`,
                      top,
                      width: `calc(${dayWidthPercent}% - 16px)`,
                      height,
                      background: colors.soft,
                      borderColor: colors.color
                    }}
                  >
                    <p className="text-sm font-bold" style={{ color: colors.text }}>{formatTimeOnly(calendarEvent.start)} - {formatTimeOnly(calendarEvent.end || calendarEvent.start)}</p>
                    <p className="mt-1 truncate text-xl font-bold text-slate-900">{calendarEvent.title}</p>
                    <div
                      onPointerDown={(pointerEvent) => beginResize(pointerEvent, calendarEvent)}
                      className="absolute bottom-1 left-1/2 h-4 w-16 -translate-x-1/2 rounded-full opacity-70"
                      style={{ background: colors.color }}
                    />
                  </div>
                );
              })}
              {!weekEvents.length && (
                <div className="absolute inset-x-0 top-10 text-center text-2xl font-semibold text-slate-500">No events this week.</div>
              )}
            </div>
          </div>
        </div>
      </div>
      {isEventModalOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/35 p-8">
          <div className="w-full max-w-3xl rounded-[28px] bg-white p-7 shadow-xl dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-4xl font-bold text-slate-900 dark:text-white">Add Event</h3>
              <button onClick={() => setIsEventModalOpen(false)} className="touch-button bg-slate-100 px-6 text-slate-700 dark:bg-slate-800 dark:text-slate-100">Close</button>
            </div>
            <div className="mt-6 grid gap-4">
              <input value={newEventTitle} onChange={(event) => setNewEventTitle(event.target.value)} className="touch-input" placeholder="Event title" autoFocus />
              <div className="grid grid-cols-3 gap-4">
                <input value={newEventDate} onChange={(event) => setNewEventDate(event.target.value)} className="touch-input" type="date" />
                <input value={newEventStart} onChange={(event) => setNewEventStart(event.target.value)} className="touch-input" type="time" />
                <input value={newEventEnd} onChange={(event) => setNewEventEnd(event.target.value)} className="touch-input" type="time" />
              </div>
              <button onClick={addLocalEvent} className="touch-button bg-[#ffcf5a] text-slate-900"><Plus className="mr-2 h-7 w-7" /> Add to Calendar</button>
              <p className="text-lg font-semibold text-slate-500 dark:text-slate-400">This adds a local display event for now. Google/iCloud write-back comes in the calendar persistence phase.</p>
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
          <p className="text-lg font-bold uppercase text-slate-500">Day View</p>
          <h3 className="text-5xl font-bold text-slate-900 dark:text-white">{day.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</h3>
        </div>
        <p className="rounded-full bg-[#fff3c4] px-5 py-3 text-xl font-bold text-slate-700">{dayEvents.length} events</p>
      </div>
      <div className="mt-5 space-y-4 overflow-y-auto pr-2">
        {dayEvents.map((event) => {
          const colors = eventColor(event);
          return (
            <div key={event.id} className="rounded-3xl border-l-[12px] p-5" style={{ background: colors.soft, borderColor: colors.color }}>
              <p className="text-lg font-bold" style={{ color: colors.text }}>{formatTimeOnly(event.start)} - {formatTimeOnly(event.end || event.start)}</p>
              <p className="text-3xl font-bold text-slate-900">{event.title}</p>
            </div>
          );
        })}
        {!dayEvents.length && <p className="rounded-3xl bg-slate-50 p-8 text-2xl font-bold text-slate-500">No events today.</p>}
      </div>
    </div>
  );
}

function CalendarMonthView({ events, monthDate }: { events: CalendarEvent[]; monthDate: Date }) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const monthDays = Array.from({ length: 35 }, (_, index) => addClientDays(gridStart, index));
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-mirror-line pb-4">
        <p className="text-lg font-bold uppercase text-slate-500">Month View</p>
        <h3 className="text-5xl font-bold text-slate-900 dark:text-white">{monthDate.toLocaleDateString([], { month: "long", year: "numeric" })}</h3>
      </div>
      <div className="mt-5 grid flex-1 grid-cols-7 gap-3">
        {monthDays.map((day) => {
          const dayEvents = events.filter((event) => isSameClientDate(new Date(event.start), day));
          const muted = day.getMonth() !== monthDate.getMonth();
          return (
            <div key={day.toISOString()} className={`min-h-28 rounded-2xl bg-[#fbfbf7] p-3 dark:bg-slate-800 ${muted ? "opacity-45" : ""}`}>
              <p className="text-xl font-bold text-slate-700 dark:text-slate-200">{day.getDate()}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {dayEvents.slice(0, 4).map((event) => <span key={event.id} className="h-3 w-3 rounded-full" style={{ background: eventColor(event).color }} />)}
              </div>
              {dayEvents[0] && <p className="mt-2 truncate text-sm font-bold text-slate-500">{dayEvents[0].title}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarScheduleView({ events }: { events: CalendarEvent[] }) {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-mirror-line pb-4">
        <p className="text-lg font-bold uppercase text-slate-500">Schedule View</p>
        <h3 className="text-5xl font-bold text-slate-900 dark:text-white">Upcoming Events</h3>
      </div>
      <div className="mt-5 space-y-3 overflow-y-auto pr-2">
        {sorted.map((event) => {
          const colors = eventColor(event);
          return (
            <div key={event.id} className="grid grid-cols-[180px_1fr] items-center gap-4 rounded-3xl bg-[#fbfbf7] p-4 dark:bg-slate-800">
              <div>
                <p className="text-lg font-bold text-slate-500">{new Date(event.start).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</p>
                <p className="text-xl font-bold" style={{ color: colors.text }}>{formatTimeOnly(event.start)}</p>
              </div>
              <div className="rounded-2xl border-l-[10px] p-4" style={{ background: colors.soft, borderColor: colors.color }}>
                <p className="text-2xl font-bold text-slate-900">{event.title}</p>
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
        <div className="overflow-y-auto rounded-3xl bg-white/70 p-4 dark:bg-slate-800">
          <h3 className="mb-4 text-2xl font-bold">Low or Out</h3>
          <div className="space-y-3">
            {activeItems.map((item) => <GroceryItemRow key={item.id} item={item} onChanged={load} />)}
            {!activeItems.length && <p className="rounded-2xl bg-slate-50 p-6 text-2xl font-bold text-slate-500">Nothing on the grocery list yet.</p>}
          </div>
        </div>
        <div className="overflow-y-auto rounded-3xl bg-white/70 p-4 dark:bg-slate-800">
          <h3 className="mb-4 text-2xl font-bold">Purchased</h3>
          <div className="space-y-3">
            {purchasedItems.slice(0, 12).map((item) => <GroceryItemRow key={item.id} item={item} onChanged={load} compact />)}
            {!purchasedItems.length && <p className="rounded-2xl bg-slate-50 p-5 text-lg font-bold text-slate-500">Purchased items appear here.</p>}
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
    <div className={`grid items-center gap-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900 ${compact ? "grid-cols-[1fr_92px]" : "grid-cols-[1fr_150px_130px_90px_90px]"}`}>
      <div className={item.purchased ? "opacity-50" : ""}>
        <p className={`font-bold ${compact ? "text-xl" : "text-3xl"} ${item.purchased ? "line-through" : ""}`}>{item.name}</p>
        <p className="text-lg font-semibold text-slate-500">
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
      <button onClick={() => deleteGroceryItem(item.id).then(onChanged)} className="touch-button bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200"><Trash2 className="h-6 w-6" /></button>
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
      <div className="flex max-h-[86vh] w-[980px] flex-col rounded-3xl bg-[#fbfbf7] p-7 shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-mirror-line pb-5">
          <div>
            <p className="text-lg font-bold uppercase text-slate-500">Quick Add</p>
            <h3 className="text-4xl font-black">{selectedCategory ? selectedCategory.category : "Choose a category"}</h3>
          </div>
          <div className="flex gap-3">
            {selectedCategory && <button onClick={() => setSelectedCategory(null)} className="touch-button bg-slate-100 px-6 text-slate-700">Back</button>}
            <button onClick={onClose} className="touch-button bg-rose-100 px-6 text-rose-700">Close</button>
          </div>
        </div>

        {!selectedCategory ? (
          <div className="mt-6 grid grid-cols-4 gap-4 overflow-y-auto pr-1">
            {groceryQuickCategories.map((group) => (
              <button key={group.category} onClick={() => setSelectedCategory(group)} className="min-h-40 rounded-3xl bg-white p-5 text-left shadow-sm transition active:scale-95 dark:bg-slate-800">
                <span className="flex h-20 w-20 items-center justify-center rounded-3xl text-5xl shadow-sm" style={{ backgroundColor: `${group.color}24` }}>
                  <GroceryThumbnail name={group.category} alt={group.category} />
                </span>
                <span className="mt-5 block text-3xl font-black">{group.category}</span>
                <span className="mt-1 block text-lg font-bold text-slate-500">{group.items.length} common items</span>
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
    <button onClick={onAdd} disabled={busy} className="grid min-h-32 grid-cols-[76px_1fr] items-center gap-4 rounded-3xl bg-white p-5 text-left shadow-sm transition active:scale-95 disabled:opacity-60 dark:bg-slate-800">
      <span className="flex h-20 w-20 items-center justify-center rounded-3xl text-5xl shadow-sm" style={{ backgroundColor: `${color}24` }}>
        <GroceryThumbnail name={name} alt={name} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-3xl font-black text-slate-900 dark:text-slate-100">{name}</span>
        <span className="block truncate text-lg font-bold uppercase text-slate-500">{busy ? "Adding..." : category}</span>
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
      <div className="flex max-h-[86vh] w-[860px] flex-col rounded-3xl bg-[#fbfbf7] p-7 shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-mirror-line pb-5">
          <div>
            <p className="text-lg font-bold uppercase text-slate-500">Shopping Package</p>
            <h3 className="text-4xl font-black">{items.length} item{items.length === 1 ? "" : "s"} ready</h3>
          </div>
          <button onClick={onClose} className="touch-button bg-rose-100 px-6 text-rose-700">Close</button>
        </div>

        <div className="mt-6 grid min-h-0 flex-1 grid-cols-[1fr_250px] gap-5">
          <textarea readOnly value={listText} className="min-h-[440px] resize-none rounded-3xl border border-mirror-line bg-white/90 p-5 text-2xl font-semibold leading-relaxed text-slate-800 outline-none dark:border-white/10 dark:bg-slate-800 dark:text-slate-100" />
          <div className="space-y-3">
            <button onClick={shareList} className="touch-button w-full bg-emerald-600 px-5 text-white">Share</button>
            <button onClick={copyList} className="touch-button w-full bg-sky-600 px-5 text-white">Copy</button>
            <button onClick={() => setShowQr((value) => !value)} className="touch-button w-full bg-slate-900 px-5 text-white dark:bg-slate-100 dark:text-slate-900">Document QR</button>
            <a className="touch-button w-full bg-green-100 px-5 text-green-800" href={`https://wa.me/${groceryWhatsappPhone}?text=${encodedList}`}>WhatsApp Phone</a>
            <a className="touch-button w-full bg-indigo-100 px-5 text-indigo-700" href={`sms:?&body=${encodedList}`}>Text</a>
            <a className="touch-button w-full bg-amber-100 px-5 text-amber-700" href={`mailto:?subject=Shopping%20List&body=${encodedList}`}>Email</a>
            <p className="rounded-2xl bg-white/80 p-4 text-lg font-bold text-slate-500 dark:bg-slate-800">
              Use Document QR to open an organized grocery-list page on your phone, then share it into Notes.
            </p>
            {message && <p className="rounded-2xl bg-emerald-100 p-4 text-lg font-bold text-emerald-800">{message}</p>}
          </div>
        </div>
        {showQr && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 p-8">
            <div className="rounded-[2rem] bg-white p-8 text-center shadow-2xl">
              <img className="mx-auto h-[52vh] max-h-[560px] min-h-80 w-[52vh] min-w-80 max-w-[560px]" src={`https://api.qrserver.com/v1/create-qr-code/?size=720x720&data=${encodedDocumentUrl}`} alt="Shopping list document QR code" />
              <p className="mt-5 text-3xl font-black text-slate-800">Scan with your phone</p>
              <p className="mt-2 text-xl font-bold text-slate-500">This opens a grocery document, not a phone search.</p>
              <button onClick={() => setShowQr(false)} className="touch-button mx-auto mt-5 bg-slate-900 px-8 text-white">Done</button>
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
        <p className="mt-2 text-lg font-bold text-slate-500">Organized for your next grocery trip.</p>

        <div className="mt-6 flex gap-3">
          <button onClick={shareList} className="min-h-14 flex-1 rounded-2xl bg-teal-700 px-5 text-xl font-black text-white">Share</button>
          <button onClick={copyList} className="min-h-14 flex-1 rounded-2xl bg-sky-100 px-5 text-xl font-black text-sky-800">Copy</button>
        </div>
        {message && <p className="mt-4 rounded-2xl bg-emerald-100 p-4 text-lg font-black text-emerald-800">{message}</p>}

        <div className="mt-6 grid gap-4">
          {sections.map((section) => (
            <div key={section.heading} className="rounded-3xl bg-slate-50 p-5">
              <h2 className="text-2xl font-black text-slate-800">{section.heading}</h2>
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
          <div key={task.id} className="grid grid-cols-[72px_1fr_170px_90px] items-center gap-3 rounded-2xl bg-white/75 p-4">
            <button onClick={() => updateTask(task.id, { completed: !task.completed }).then(reload)} className={`h-14 rounded-2xl ${task.completed ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"}`}>
              <CheckCircle2 className="mx-auto h-7 w-7" />
            </button>
            <div>
              <p className={`text-3xl font-semibold ${task.completed ? "line-through opacity-60" : ""}`}>{task.title}</p>
              <p className="text-slate-500">{task.dueDate || "No due date"} - {task.priority} priority</p>
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
      <textarea className="mt-4 min-h-0 flex-1 w-full resize-none rounded-2xl border border-mirror-line bg-white/70 p-5 text-3xl leading-relaxed outline-none focus:ring-4 focus:ring-sky-200" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write today's note..." />
      <div className="mt-4 flex shrink-0 gap-3 overflow-x-auto pb-2">
        {notes.map((note) => (
          <button key={note.id} onClick={() => { setDate(note.date); setBody(note.body); }} className="min-w-48 rounded-2xl bg-white/75 p-4 text-left">
            <p className="font-bold">{note.date}</p>
            <p className="truncate text-slate-500">{note.body || "Empty note"}</p>
          </button>
        ))}
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
          <p className="mt-2 text-xl font-semibold text-slate-500">Family money dashboard - {summary.monthLabel}</p>
        </div>
        <div className="rounded-3xl bg-white/80 px-5 py-4 text-right shadow-sm dark:bg-slate-900">
          <p className="text-lg font-bold text-slate-500">Data provider</p>
          <p className="text-2xl font-black">{summary.provider}</p>
        </div>
      </div>

      <div className="mt-3 grid shrink-0 grid-cols-[1fr_150px_150px_170px] items-center gap-3 rounded-3xl bg-white/70 p-3 shadow-sm dark:bg-slate-900">
        <div>
          <p className="text-xl font-black">Bank connections</p>
          <p className="text-lg font-semibold text-slate-500">
            {plaidStatus?.configured ? `${plaidStatus.itemCount} Plaid connection${plaidStatus.itemCount === 1 ? "" : "s"} - ${plaidStatus.environment}` : "Set Plaid sandbox keys in .env to connect accounts."}
          </p>
          {lastPlaidSync && <p className="text-base font-bold text-slate-500">Last Plaid sync {formatServerDateTime(lastPlaidSync)}</p>}
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
        <div className="rounded-3xl bg-white/80 p-4 text-center shadow-sm dark:bg-slate-900">
          <BudgetCircle percent={budgetPercent} spent={summary.budgetSpent} limit={summary.budgetLimit} />
          <p className="mt-4 text-xl font-bold text-slate-500">Monthly Budget</p>
          <p className={`text-3xl font-black ${summary.cashFlow >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{money(summary.cashFlow)} cash flow</p>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl bg-white/80 p-4 shadow-sm dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black">Budget Checks</h3>
            <p className="rounded-full bg-slate-100 px-4 py-2 text-lg font-bold text-slate-600">{summary.budgets.length} groups</p>
          </div>
          <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
            {summary.budgets.map((budget) => {
              const percent = budget.limitAmount ? Math.min(100, Math.round((budget.spentAmount / budget.limitAmount) * 100)) : 0;
              return (
                <div key={budget.id} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
                  <div className="mb-2 flex items-center justify-between text-xl font-bold">
                    <span>{budget.category}</span>
                    <span>{percent}%</span>
                  </div>
                  <div className="h-4 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: budget.color }} />
                  </div>
                  <p className="mt-2 text-lg font-semibold text-slate-500">{money(budget.spentAmount)} of {money(budget.limitAmount)}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl bg-white/80 p-4 shadow-sm dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-black">Transactions</h3>
              <p className="text-lg font-semibold text-slate-500">{summary.recentTransactions.length} recent - {summary.uncategorizedTransactions.length} need review</p>
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
        <div className="overflow-hidden rounded-3xl bg-white/75 p-4 shadow-sm dark:bg-slate-900">
          <h3 className="text-2xl font-black">Accounts</h3>
          <div className="mt-2 grid max-h-28 grid-cols-2 gap-2 overflow-y-auto pr-1">
            {summary.accounts.slice(0, 6).map((account) => (
              <div key={account.id} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
                <p className="truncate text-lg font-bold text-slate-500">{account.institution}</p>
                <p className="truncate text-xl font-black">{account.name}</p>
                <p className={`mt-2 text-2xl font-black ${account.balance < 0 ? "text-rose-600" : "text-emerald-600"}`}>{money(account.balance)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl bg-white/75 p-4 shadow-sm dark:bg-slate-900">
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

        <div className="overflow-hidden rounded-3xl bg-white/75 p-4 shadow-sm dark:bg-slate-900">
          <h3 className="text-2xl font-black">Rules & Markets</h3>
          <div className="mt-2 max-h-20 space-y-2 overflow-y-auto pr-1">
            {summary.categoryRules.slice(0, 4).map((rule) => (
              <p key={rule.id} className="rounded-2xl bg-slate-50 px-4 py-3 text-lg font-bold dark:bg-slate-800">{rule.matchText} to {rule.category}</p>
            ))}
            {!summary.categoryRules.length && <p className="rounded-2xl bg-slate-50 px-4 py-3 text-lg font-bold text-slate-500 dark:bg-slate-800">No custom rules yet.</p>}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {quotes.slice(0, 4).map((quote) => (
              <div key={quote.symbol} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
                <p className="text-xl font-black">{quote.symbol}</p>
                <p className="truncate text-base font-semibold text-slate-500">{quote.name}</p>
                <p className="mt-2 text-2xl font-black">{money(quote.price)}</p>
                <p className={quote.changePercent && quote.changePercent < 0 ? "font-bold text-rose-600" : "font-bold text-emerald-600"}>{signed(quote.changePercent)}%</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {ruleTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-8">
          <div className="w-[720px] rounded-3xl bg-white p-7 shadow-2xl dark:bg-slate-900">
            <h3 className="text-3xl font-black">Create Category Rule</h3>
            <p className="mt-2 text-xl font-semibold text-slate-500">Apply this category whenever a merchant contains this text.</p>
            <div className="mt-5 grid gap-4">
              <input value={ruleMatch} onChange={(event) => setRuleMatch(event.target.value)} className="touch-input" placeholder="Merchant text to match" />
              <select value={ruleCategory} onChange={(event) => setRuleCategory(event.target.value)} className="touch-input">
                {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setRuleTransaction(null)} className="touch-button bg-slate-100 px-6 text-slate-700">Cancel</button>
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
    <div className="rounded-3xl bg-white/75 p-4 shadow-sm dark:bg-slate-900">
      <div className={`mb-2 flex h-11 w-11 items-center justify-center rounded-2xl ${tones[tone]}`}>
        <Icon className="h-6 w-6" />
      </div>
      <p className="text-base font-bold text-slate-500">{label}</p>
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
      <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white shadow-inner dark:bg-slate-900">
        <p className="text-5xl font-black" style={{ color }}>{clamped}%</p>
        <p className="mt-1 text-lg font-bold text-slate-500">used</p>
        <p className="mt-2 text-xl font-black">{money(spent)}</p>
        <p className="text-base font-bold text-slate-500">of {money(limit)}</p>
      </div>
    </div>
  );
}

function FinanceTransactionRow({ transaction, categories, onCategoryChange, onRule }: { transaction: FinanceTransaction; categories: string[]; onCategoryChange: (category: string) => void; onRule: () => void }) {
  const needsReview = transaction.category === "Uncategorized";
  return (
    <div className={`grid grid-cols-[1fr_180px_96px] items-center gap-3 rounded-2xl p-4 ${needsReview ? "bg-amber-50 ring-2 ring-amber-200" : "bg-white/80 dark:bg-slate-800"}`}>
      <div>
        <p className="truncate text-xl font-black">{transaction.merchant}</p>
        <p className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-500">
          <span>{transaction.transactionDate}</span>
          <span>- {transaction.categorizedBy || "provider"}</span>
          {transaction.pending && <span className="rounded-full bg-amber-100 px-2 py-1 text-sm font-black text-amber-800">Pending</span>}
        </p>
        <p className={`mt-1 text-2xl font-black ${transaction.amount < 0 ? "text-slate-800 dark:text-slate-100" : "text-emerald-600"}`}>{money(transaction.amount)}</p>
      </div>
      <select value={transaction.category} onChange={(event) => onCategoryChange(event.target.value)} className="h-16 rounded-2xl border border-mirror-line bg-white px-3 text-lg font-bold text-slate-800 outline-none focus:ring-4 focus:ring-sky-200 dark:border-white/10 dark:bg-slate-900 dark:text-slate-100">
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

function TravelHubPanel() {
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
  }, []);

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

  async function buildItinerary() {
    setTravelBusy(true);
    setTravelMessage("Building itinerary from saved ideas...");
    try {
      const nextItinerary = await generateTravelItinerary();
      setItinerary(nextItinerary);
      setTravelMessage(nextItinerary.provider === "openai" ? "AI itinerary ready." : "Draft itinerary ready.");
    } catch {
      setTravelMessage("The itinerary could not be generated.");
    } finally {
      setTravelBusy(false);
    }
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[290px_minmax(0,1fr)] gap-4 overflow-hidden">
      <aside className="flex min-h-0 flex-col gap-4 rounded-[24px] border border-teal-100 bg-white/90 p-4 shadow-sm dark:border-teal-500/20 dark:bg-slate-900/90">
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-teal-700 text-2xl font-black text-white">TH</span>
          <div>
            <p className="text-3xl font-black text-slate-900 dark:text-white">Travel Hub</p>
            <p className="text-lg font-semibold text-slate-500 dark:text-slate-400">Family trip autopilot</p>
          </div>
        </div>
        <div className="grid gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
          <label className="text-lg font-black text-slate-700 dark:text-slate-200">
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
          <label className="text-lg font-black text-slate-700 dark:text-slate-200">
            Duration
            <select value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="touch-input mt-2 text-xl">
              <option value={3}>Long weekend</option>
              <option value={5}>5 nights</option>
              <option value={7}>Full week</option>
              <option value={10}>Slow 10-day trip</option>
            </select>
          </label>
          <label className="text-lg font-black text-slate-700 dark:text-slate-200">
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

      <section className="flex min-h-0 flex-col overflow-hidden rounded-[24px] border border-white/75 bg-[#f8faf7]/95 p-4 shadow-sm dark:border-white/10 dark:bg-slate-950/90">
        <div className="flex items-end justify-between gap-5">
          <div>
            <p className="text-lg font-black uppercase tracking-normal text-teal-700 dark:text-teal-300">June 15 - August 15, 2026</p>
            <h2 className="mt-1 text-4xl font-black text-slate-950 dark:text-white">Planned Trip Builder</h2>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <TravelMetric label="best fit" value={`${rankedTrips[0]?.score ?? 0}%`} />
            <TravelMetric label="under budget" value={rankedTrips.filter(({ trip }) => trip.estimatedCost <= budget).length.toString()} />
            <TravelMetric label="short hops" value={travelCandidates.filter((trip) => trip.flightHours <= 2.5).length.toString()} />
          </div>
        </div>

        <div className="mt-3 shrink-0 rounded-[20px] border border-teal-100 bg-white p-3 shadow-sm dark:border-teal-500/20 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white">Build trip candidates</h3>
              <p className="mt-1 text-lg font-semibold text-slate-500 dark:text-slate-400">Ranked by ease, family fit, timing, budget, and deal strength.</p>
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
                className={`overflow-hidden rounded-[20px] border bg-white text-left shadow-sm transition active:scale-[0.98] dark:bg-slate-800 ${
                  selected?.id === trip.id ? "border-teal-500 ring-4 ring-teal-200 dark:ring-teal-500/30" : "border-slate-200 dark:border-slate-700"
                }`}
              >
                <div className="h-14 p-3 text-white" style={{ background: trip.visual }}>
                  <div className="flex items-start justify-between">
                    <MapPinned className="h-6 w-6" />
                    <span className="rounded-full bg-white/20 px-3 py-1 text-base font-black">{score}%</span>
                  </div>
                </div>
                <div className="p-3">
                  <p className="truncate text-lg font-black text-slate-900 dark:text-white">{trip.name}</p>
                  <p className="truncate text-base font-bold text-slate-500 dark:text-slate-400">{trip.location}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid min-h-0 flex-1 grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] gap-4">
          <div className="flex min-h-0 flex-col rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-3xl font-black text-slate-900 dark:text-white">Instagram ideas</h3>
              {travelMessage && <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-black text-teal-800 dark:bg-teal-500/15 dark:text-teal-200">{travelMessage}</span>}
            </div>
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
              {inspirations.length ? (
                <div className="grid gap-3">
                  {inspirations.map((item) => (
                    <div key={item.id} className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
                      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-100">
                        <MapPinned className="h-7 w-7" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-2xl font-black text-slate-900 dark:text-white">{item.title}</p>
                        <p className="truncate text-lg font-bold text-slate-500 dark:text-slate-400">{item.location || "Location pending"}</p>
                        {item.notes && <p className="mt-1 line-clamp-2 text-base font-semibold text-slate-500 dark:text-slate-400">{item.notes}</p>}
                      </div>
                      <button type="button" onClick={() => window.open(item.url, "_blank", "noopener,noreferrer")} className="h-12 rounded-xl bg-white px-4 text-base font-black text-teal-800 shadow-sm dark:bg-slate-700 dark:text-teal-200">
                        Open
                      </button>
                      <button type="button" onClick={() => removeInspiration(item.id)} className="grid h-12 w-12 place-items-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-200" aria-label={`Delete ${item.title}`}>
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid h-full place-items-center rounded-2xl bg-slate-50 p-4 text-center text-2xl font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  Send Instagram links from your phone shortcut.
                </div>
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-col rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-2xl font-black text-slate-900 dark:text-white">AI itinerary</h3>
                <button type="button" onClick={buildItinerary} disabled={travelBusy} className="h-12 rounded-2xl bg-slate-900 px-4 text-base font-black text-white active:scale-[0.98] disabled:opacity-60 dark:bg-white dark:text-slate-900">
                  <Sparkles className="mr-2 inline h-5 w-5" />
                  Build
                </button>
              </div>
              <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
                {itinerary ? (
                  <div className="grid gap-3">
                    <div className="rounded-2xl bg-teal-50 p-4 dark:bg-teal-500/15">
                      <p className="text-xl font-black text-slate-900 dark:text-white">{itinerary.title}</p>
                      <p className="mt-1 text-base font-bold text-slate-600 dark:text-slate-300">{itinerary.summary}</p>
                    </div>
                    {itinerary.days.map((day) => (
                      <div key={day.day} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
                        <p className="text-lg font-black text-slate-900 dark:text-white">Day {day.day}: {day.title}</p>
                        <p className="mt-1 text-base font-bold text-slate-500 dark:text-slate-400">{day.notes}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {day.stops.map((stop) => (
                            <span key={stop} className="rounded-full bg-white px-3 py-1 text-sm font-black text-slate-700 shadow-sm dark:bg-slate-700 dark:text-slate-200">{stop}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid h-full place-items-center rounded-2xl bg-slate-50 p-4 text-center text-lg font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    Generate an itinerary after saving a few creator posts.
                  </div>
                )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function TravelStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
      <p className="text-3xl font-black text-slate-900 dark:text-white">{value}</p>
      <p className="text-lg font-bold text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

function TravelMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-center dark:border-slate-700 dark:bg-slate-800">
      <p className="text-2xl font-black text-slate-900 dark:text-white">{value}</p>
      <p className="text-base font-black uppercase tracking-normal text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

function SettingsPanel({ onChanged }: { onChanged: () => void }) {
  const [feeds, setFeeds] = useState<RssFeed[]>([]);
  const [watchlist, setWatchlist] = useState<FinanceWatchlistItem[]>([]);
  const [feedUrl, setFeedUrl] = useState("");
  const [feedTitle, setFeedTitle] = useState("");
  const [symbol, setSymbol] = useState("");

  async function load() {
    const [nextFeeds, nextWatchlist] = await Promise.all([fetchRssFeeds(), fetchWatchlist()]);
    setFeeds(nextFeeds);
    setWatchlist(nextWatchlist);
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
      <div className="mt-4 grid min-h-0 flex-1 grid-cols-2 gap-4">
        <div className="flex min-h-0 flex-col rounded-3xl bg-white/70 p-4">
          <h3 className="text-2xl font-bold">RSS Feeds</h3>
          <div className="mt-4 grid grid-cols-[1fr_1fr_90px] gap-3">
            <input value={feedTitle} onChange={(event) => setFeedTitle(event.target.value)} className="touch-input text-xl" placeholder="Title" />
            <input value={feedUrl} onChange={(event) => setFeedUrl(event.target.value)} className="touch-input text-xl" placeholder="Feed URL" />
            <button onClick={addFeed} className="touch-button bg-sky-600 text-white"><Plus className="h-6 w-6" /></button>
          </div>
          <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
            {feeds.map((feed) => (
              <div key={feed.id} className="grid grid-cols-[1fr_90px_90px] items-center gap-3 rounded-2xl bg-white/75 p-3">
                <div>
                  <p className="text-xl font-bold">{feed.title}</p>
                  <p className="truncate text-slate-500">{feed.url}</p>
                </div>
                <button onClick={() => updateRssFeed(feed.id, { enabled: !feed.enabled }).then(reloadAndRefresh)} className={`touch-button ${feed.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{feed.enabled ? "On" : "Off"}</button>
                <button onClick={() => deleteRssFeed(feed.id).then(reloadAndRefresh)} className="touch-button bg-rose-100 text-rose-700"><Trash2 className="h-6 w-6" /></button>
              </div>
            ))}
          </div>
        </div>
        <div className="flex min-h-0 flex-col rounded-3xl bg-white/70 p-4">
          <h3 className="text-2xl font-bold">Finance Watchlist</h3>
          <div className="mt-4 grid grid-cols-[1fr_90px] gap-3">
            <input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} className="touch-input text-xl" placeholder="Symbol" />
            <button onClick={addSymbol} className="touch-button bg-sky-600 text-white"><Plus className="h-6 w-6" /></button>
          </div>
          <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
            {watchlist.map((item) => (
              <div key={item.id} className="grid grid-cols-[1fr_90px_90px] items-center gap-3 rounded-2xl bg-white/75 p-3">
                <p className="text-3xl font-bold">{item.symbol}</p>
                <button onClick={() => updateWatchlistItem(item.id, { enabled: !item.enabled }).then(reloadAndRefresh)} className={`touch-button ${item.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{item.enabled ? "On" : "Off"}</button>
                <button onClick={() => deleteWatchlistItem(item.id).then(reloadAndRefresh)} className="touch-button bg-rose-100 text-rose-700"><Trash2 className="h-6 w-6" /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function EventList({ events }: { events: CalendarEvent[] }) {
  if (!events.length) return <p className="text-xl text-slate-500">No events scheduled.</p>;
  return (
    <div className="space-y-3">
      {events.map((event) => (
        <div key={event.id} className="rounded-2xl bg-sky-50 p-4">
          <p className="text-lg font-bold text-sky-900">{formatEventTime(event.start)}</p>
          <p className="text-2xl font-semibold text-slate-800">{event.title}</p>
          {event.location && <p className="text-slate-500">{event.location}</p>}
        </div>
      ))}
    </div>
  );
}

function TaskList({ tasks, large = false }: { tasks: Task[]; large?: boolean }) {
  if (!tasks.length) return <p className="text-xl text-slate-500">Nothing due right now.</p>;
  return (
    <div className="mt-4 space-y-3">
      {tasks.map((task) => (
        <div key={task.id} className={`flex items-center gap-3 rounded-2xl bg-white/70 p-4 ${task.completed ? "opacity-60" : ""}`}>
          <CheckCircle2 className={`h-7 w-7 ${task.completed ? "text-emerald-500" : "text-slate-300"}`} />
          <div>
            <p className={`${large ? "text-3xl" : "text-xl"} font-semibold ${task.completed ? "line-through" : ""}`}>{task.title}</p>
            <p className="text-slate-500">{task.priority} priority</p>
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
        <a key={article.id} href={article.link} className="block rounded-2xl bg-white/70 p-4 text-lg font-semibold text-slate-700">
          {article.title}
          <span className="block text-sm text-slate-500">{article.source}</span>
        </a>
      ))}
    </div>
  );
}

function FinanceList({ quotes }: { quotes: FinanceQuote[] }) {
  return (
    <div className="mt-4 space-y-3">
      {quotes.map((quote) => (
        <div key={quote.symbol} className="flex items-center justify-between rounded-2xl bg-white/70 p-4">
          <div>
            <p className="text-xl font-bold">{quote.symbol}</p>
            <p className="text-slate-500">{quote.name}</p>
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
    <div className="fixed inset-x-0 bottom-0 z-[80] border-t border-slate-200 bg-white/95 p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-950/96">
      <div className="mx-auto max-w-6xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xl font-bold text-slate-600 dark:text-slate-300">Touch Keyboard</p>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onClose} className="h-14 rounded-2xl bg-slate-100 px-6 text-xl font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-100">Done</button>
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
      className={`h-16 rounded-2xl bg-slate-100 text-xl font-bold text-slate-800 active:scale-95 dark:bg-slate-800 dark:text-slate-100 ${extraWide ? "w-80" : wide ? "w-28" : "w-16"}`}
    >
      {label}
    </button>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
        <Icon className="h-7 w-7" />
      </span>
      <h2 className="text-3xl font-bold">{title}</h2>
    </div>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`min-h-0 rounded-[24px] border border-white/75 bg-mirror-card p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/90 ${className}`}>{children}</section>;
}

function formatEventTime(value: string) {
  return new Date(value).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
}

function formatTimeOnly(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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
  return new Date(normalized).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function money(value: number | null) {
  return value === null ? "--" : value.toLocaleString([], { style: "currency", currency: "USD" });
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
