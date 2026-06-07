import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { CalendarEvent, DashboardSummary, FinanceQuote, FinanceTransaction, FinanceWatchlistItem, GroceryItem, GroceryStatus, NewsArticle, Note, PersonalFinanceSummary, PlaidConnectionStatus, Priority, RssFeed, Task } from "@mirror-dashboard/shared";
import { ArrowDownRight, ArrowUpRight, CalendarDays, CheckCircle2, CloudSun, CreditCard, Home, Landmark, Moon, PieChart, type LucideIcon, Newspaper, Plus, RefreshCw, Save, Settings, ShoppingBasket, Sparkles, StickyNote, SunMedium, Trash2, Wallet, WifiOff } from "lucide-react";
import {
  createGroceryItem,
  createPlaidLinkToken,
  createRssFeed,
  createTask,
  createWatchlistItem,
  deleteGroceryItem,
  deleteNote,
  deleteRssFeed,
  deleteTask,
  deleteWatchlistItem,
  fetchDashboard,
  fetchGroceryItems,
  fetchNote,
  fetchNotes,
  fetchPersonalFinanceSummary,
  fetchPlaidStatus,
  fetchRssFeeds,
  fetchTasks,
  fetchWatchlist,
  saveNote,
  exchangePlaidPublicToken,
  syncPlaidFinance,
  updateFinanceTransactionCategory,
  updateGroceryItem,
  updateRssFeed,
  updateTask,
  updateWatchlistItem
} from "./api";

type View = "home" | "calendar" | "grocery" | "tasks" | "notes" | "finance" | "settings";
type CalendarMode = "Day" | "Week" | "Month" | "Schedule";

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
  { view: "settings", label: "Settings", icon: Settings }
];

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

export default function App() {
  const [dashboard, setDashboard] = useState<DashboardSummary>(demoDashboard);
  const [view, setView] = useState<View>("home");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [darkMode, setDarkMode] = useState(() => safeStorageGet("mirror-dashboard-theme") === "dark");
  const [burnInStep, setBurnInStep] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const keyboardTargetRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

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

  const content = useMemo(() => {
    if (view === "calendar") return <CalendarPanel events={dashboard.calendar} />;
    if (view === "grocery") return <GroceryPanel />;
    if (view === "tasks") return <TaskPanel initialTasks={dashboard.tasks} onChanged={refreshDashboard} />;
    if (view === "notes") return <NotesPanel onChanged={refreshDashboard} />;
    if (view === "finance") return <FinancePanel quotes={dashboard.finance.quotes} initialSummary={dashboard.finance.personal} />;
    if (view === "settings") return <SettingsPanel onChanged={refreshDashboard} />;
    return <HomePanel dashboard={dashboard} now={now} />;
  }, [dashboard, now, view]);

  const shift = burnInOffsets[burnInStep];

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
      <div className={`mx-auto flex min-h-screen max-w-[1920px] gap-5 px-6 py-5 transition-transform duration-700 ${keyboardVisible ? "pb-80" : ""}`} style={{ transform: `translate(${shift.x}px, ${shift.y}px)` }}>
        <aside className="flex w-32 flex-col items-center gap-3 rounded-[24px] border border-white/70 bg-white/80 p-3 shadow-sm dark:border-white/10 dark:bg-slate-900/90">
          <button onClick={() => setDarkMode((value) => !value)} className="touch-button w-full bg-amber-100 text-amber-700 dark:bg-slate-800 dark:text-sky-200" aria-label="Toggle dark mode">
            {darkMode ? <SunMedium className="h-8 w-8" /> : <Moon className="h-8 w-8" />}
          </button>
          <div className="h-px w-14 bg-mirror-line" />
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = view === item.view;
            return (
              <button
                key={item.view}
                onClick={() => setView(item.view)}
                className={`flex h-24 w-full flex-col items-center justify-center gap-1 rounded-2xl text-base font-semibold transition active:scale-95 ${
                  active ? "bg-sky-600 text-white shadow-lg shadow-sky-300/40" : "text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
                aria-label={item.label}
              >
                <Icon className="h-8 w-8" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </aside>
        <section className="flex min-w-0 flex-1 flex-col gap-5">
          <header className="flex items-center justify-between rounded-[24px] border border-white/70 bg-white/80 px-7 py-4 shadow-sm dark:border-white/10 dark:bg-slate-900/90">
            <div>
              <p className="text-lg font-semibold text-slate-500 dark:text-slate-400">{now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</p>
              <h1 className="text-5xl font-bold tracking-normal">{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</h1>
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
          {content}
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

  return (
    <Card className="flex-1 overflow-hidden">
      <div className="flex items-center justify-between">
        <SectionTitle icon={ShoppingBasket} title="Grocery Tracker" />
        <p className="rounded-full bg-amber-100 px-5 py-3 text-xl font-bold text-amber-800">{activeItems.length} to buy this week</p>
      </div>
      <div className="mt-6 grid grid-cols-[1.2fr_0.7fr_0.8fr_0.8fr_180px_100px] gap-3">
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

      <div className="mt-6 grid h-[58vh] grid-cols-[1fr_340px] gap-5">
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
    <Card className="flex-1">
      <SectionTitle icon={CheckCircle2} title="Tasks" />
      <div className="mt-6 grid grid-cols-[1fr_220px_180px_120px] gap-3">
        <input value={title} onChange={(event) => setTitle(event.target.value)} className="touch-input" placeholder="New task" />
        <input value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="touch-input" type="date" />
        <select value={priority} onChange={(event) => setPriority(event.target.value as Priority)} className="touch-input">
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </select>
        <button onClick={addTask} disabled={busy} className="touch-button bg-sky-600 text-white"><Plus className="h-6 w-6" /></button>
      </div>
      <div className="mt-6 space-y-3">
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
    <Card className="flex-1">
      <SectionTitle icon={StickyNote} title="Notes" />
      <div className="mt-6 grid grid-cols-[260px_120px_120px] gap-3">
        <input value={date} onChange={(event) => { setDate(event.target.value); load(event.target.value).catch(() => undefined); }} className="touch-input" type="date" />
        <button onClick={save} className="touch-button bg-sky-600 text-white"><Save className="h-6 w-6" /></button>
        <button onClick={remove} className="touch-button bg-rose-100 text-rose-700"><Trash2 className="h-6 w-6" /></button>
      </div>
      <textarea className="mt-6 h-[44vh] w-full resize-none rounded-2xl border border-mirror-line bg-white/70 p-6 text-3xl leading-relaxed outline-none focus:ring-4 focus:ring-sky-200" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write today's note..." />
      <div className="mt-5 flex gap-3 overflow-x-auto pb-2">
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

  async function syncPlaid() {
    try {
      setPlaidBusy(true);
      setPlaidMessage("Syncing bank data...");
      const result = await syncPlaidFinance();
      await loadPersonalFinance();
      setPlaidMessage(`Synced ${result.syncedItems} Plaid connection${result.syncedItems === 1 ? "" : "s"}.`);
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
  const transactionsToReview = summary.uncategorizedTransactions.length ? summary.uncategorizedTransactions : summary.recentTransactions;

  return (
    <Card className="flex-1 overflow-y-auto bg-gradient-to-br from-white via-emerald-50 to-sky-50 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950">
      <div className="flex items-start justify-between gap-4">
        <div>
          <SectionTitle icon={Landmark} title="Finance" />
          <p className="mt-2 text-xl font-semibold text-slate-500">Family money dashboard - {summary.monthLabel}</p>
        </div>
        <div className="rounded-3xl bg-white/80 px-5 py-4 text-right shadow-sm dark:bg-slate-900">
          <p className="text-lg font-bold text-slate-500">Data provider</p>
          <p className="text-2xl font-black">{summary.provider}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-[1fr_190px_190px] items-center gap-3 rounded-3xl bg-white/70 p-4 shadow-sm dark:bg-slate-900">
        <div>
          <p className="text-xl font-black">Bank connections</p>
          <p className="text-lg font-semibold text-slate-500">
            {plaidStatus?.configured ? `${plaidStatus.itemCount} Plaid connection${plaidStatus.itemCount === 1 ? "" : "s"} - ${plaidStatus.environment}` : "Set Plaid sandbox keys in .env to connect accounts."}
          </p>
          {plaidMessage && <p className="mt-1 text-base font-bold text-sky-700">{plaidMessage}</p>}
        </div>
        <button onClick={connectPlaid} disabled={plaidBusy || plaidStatus?.configured === false} className="touch-button bg-emerald-600 px-5 text-white">Connect</button>
        <button onClick={syncPlaid} disabled={plaidBusy || !plaidStatus?.itemCount} className="touch-button bg-sky-600 px-5 text-white">Sync</button>
      </div>

      <div className="mt-6 grid grid-cols-4 gap-4">
        <FinanceMetric icon={Wallet} label="Cash" value={money(summary.totalCash)} tone="emerald" />
        <FinanceMetric icon={CreditCard} label="Debt" value={money(summary.totalDebt)} tone="rose" />
        <FinanceMetric icon={ArrowUpRight} label="Income" value={money(summary.monthlyIncome)} tone="sky" />
        <FinanceMetric icon={ArrowDownRight} label="Spending" value={money(summary.monthlySpending)} tone="amber" />
      </div>

      <div className="mt-5 grid grid-cols-[360px_1fr_1.15fr] gap-5">
        <div className="rounded-3xl bg-white/80 p-6 text-center shadow-sm dark:bg-slate-900">
          <BudgetCircle percent={budgetPercent} spent={summary.budgetSpent} limit={summary.budgetLimit} />
          <p className="mt-4 text-xl font-bold text-slate-500">Monthly Budget</p>
          <p className={`text-3xl font-black ${summary.cashFlow >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{money(summary.cashFlow)} cash flow</p>
        </div>

        <div className="overflow-hidden rounded-3xl bg-white/80 p-5 shadow-sm dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black">Budget Checks</h3>
            <p className="rounded-full bg-slate-100 px-4 py-2 text-lg font-bold text-slate-600">{summary.budgets.length} groups</p>
          </div>
          <div className="mt-4 max-h-[360px] space-y-4 overflow-y-auto pr-2">
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

        <div className="overflow-hidden rounded-3xl bg-white/80 p-5 shadow-sm dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-black">Transactions</h3>
              <p className="text-lg font-semibold text-slate-500">{summary.uncategorizedTransactions.length} need review</p>
            </div>
            <button onClick={syncPlaid} disabled={plaidBusy || !plaidStatus?.itemCount} className="touch-button h-16 bg-sky-600 px-5 text-white">Sync</button>
          </div>
          <div className="mt-4 max-h-[360px] space-y-3 overflow-y-auto pr-2">
            {transactionsToReview.map((transaction) => (
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

      <div className="mt-5 grid grid-cols-[1fr_1fr_1fr] gap-5">
        <div className="rounded-3xl bg-white/75 p-5 shadow-sm dark:bg-slate-900">
          <h3 className="text-2xl font-black">Accounts</h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {summary.accounts.slice(0, 6).map((account) => (
              <div key={account.id} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
                <p className="truncate text-lg font-bold text-slate-500">{account.institution}</p>
                <p className="truncate text-xl font-black">{account.name}</p>
                <p className={`mt-2 text-2xl font-black ${account.balance < 0 ? "text-rose-600" : "text-emerald-600"}`}>{money(account.balance)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl bg-white/75 p-5 shadow-sm dark:bg-slate-900">
          <div className="rounded-3xl bg-slate-950 p-5 text-white shadow-sm dark:bg-black/40">
            <div className="flex items-center gap-3">
              <Sparkles className="h-8 w-8 text-emerald-300" />
              <h3 className="text-2xl font-black">AI Money Review</h3>
            </div>
            <div className="mt-4 space-y-2">
              {summary.insights.slice(0, 3).map((insight) => (
                <p key={insight} className="rounded-2xl bg-white/10 px-4 py-2 text-lg font-semibold">{insight}</p>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white/75 p-5 shadow-sm dark:bg-slate-900">
          <h3 className="text-2xl font-black">Rules & Markets</h3>
          <div className="mt-3 space-y-2">
            {summary.categoryRules.slice(0, 4).map((rule) => (
              <p key={rule.id} className="rounded-2xl bg-slate-50 px-4 py-3 text-lg font-bold dark:bg-slate-800">{rule.matchText} to {rule.category}</p>
            ))}
            {!summary.categoryRules.length && <p className="rounded-2xl bg-slate-50 px-4 py-3 text-lg font-bold text-slate-500 dark:bg-slate-800">No custom rules yet.</p>}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
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
    <div className="rounded-3xl bg-white/75 p-5 shadow-sm dark:bg-slate-900">
      <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${tones[tone]}`}>
        <Icon className="h-8 w-8" />
      </div>
      <p className="text-lg font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-4xl font-black">{value}</p>
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
    <div className="mx-auto flex h-64 w-64 items-center justify-center rounded-full p-4" style={{ background: `conic-gradient(${color} ${clamped * 3.6}deg, #e2e8f0 0deg)` }}>
      <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white shadow-inner dark:bg-slate-900">
        <p className="text-6xl font-black" style={{ color }}>{clamped}%</p>
        <p className="mt-1 text-lg font-bold text-slate-500">used</p>
        <p className="mt-3 text-2xl font-black">{money(spent)}</p>
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
        <p className="text-base font-semibold text-slate-500">{transaction.transactionDate} - {transaction.categorizedBy || "provider"}</p>
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
    <Card className="flex-1">
      <SectionTitle icon={Settings} title="Settings" />
      <div className="mt-6 grid grid-cols-2 gap-5">
        <div className="rounded-3xl bg-white/70 p-5">
          <h3 className="text-2xl font-bold">RSS Feeds</h3>
          <div className="mt-4 grid grid-cols-[1fr_1fr_90px] gap-3">
            <input value={feedTitle} onChange={(event) => setFeedTitle(event.target.value)} className="touch-input text-xl" placeholder="Title" />
            <input value={feedUrl} onChange={(event) => setFeedUrl(event.target.value)} className="touch-input text-xl" placeholder="Feed URL" />
            <button onClick={addFeed} className="touch-button bg-sky-600 text-white"><Plus className="h-6 w-6" /></button>
          </div>
          <div className="mt-4 space-y-3">
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
        <div className="rounded-3xl bg-white/70 p-5">
          <h3 className="text-2xl font-bold">Finance Watchlist</h3>
          <div className="mt-4 grid grid-cols-[1fr_90px] gap-3">
            <input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} className="touch-input text-xl" placeholder="Symbol" />
            <button onClick={addSymbol} className="touch-button bg-sky-600 text-white"><Plus className="h-6 w-6" /></button>
          </div>
          <div className="mt-4 space-y-3">
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
  return <section className={`rounded-[24px] border border-white/75 bg-mirror-card p-6 shadow-sm dark:border-white/10 dark:bg-slate-900/90 ${className}`}>{children}</section>;
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

function money(value: number | null) {
  return value === null ? "--" : value.toLocaleString([], { style: "currency", currency: "USD" });
}

function signed(value: number | null) {
  if (value === null) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
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
