import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { CalendarEvent, DashboardSummary, FinanceQuote, NewsArticle, Task } from "@mirror-dashboard/shared";
import { CalendarDays, CheckCircle2, CloudSun, Home, Landmark, type LucideIcon, Newspaper, Settings, StickyNote, SunMedium } from "lucide-react";
import { fetchDashboard } from "./api";

type View = "home" | "calendar" | "tasks" | "notes" | "finance" | "settings";

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
    ]
  }
};

const navItems: Array<{ view: View; label: string; icon: LucideIcon }> = [
  { view: "home", label: "Home", icon: Home },
  { view: "calendar", label: "Calendar", icon: CalendarDays },
  { view: "tasks", label: "Tasks", icon: CheckCircle2 },
  { view: "notes", label: "Notes", icon: StickyNote },
  { view: "finance", label: "Finance", icon: Landmark },
  { view: "settings", label: "Settings", icon: Settings }
];

export default function App() {
  const [dashboard, setDashboard] = useState<DashboardSummary>(demoDashboard);
  const [view, setView] = useState<View>("home");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchDashboard()
      .then((data) => {
        setDashboard(data);
        setError(null);
      })
      .catch((err: Error) => {
        setError(err.message);
      });
  }, []);

  const content = useMemo(() => {
    if (view === "calendar") return <CalendarPanel events={dashboard.calendar} />;
    if (view === "tasks") return <TaskPanel tasks={dashboard.tasks} />;
    if (view === "notes") return <NotesPanel note={dashboard.todayNote?.body || "No note for today yet."} />;
    if (view === "finance") return <FinancePanel quotes={dashboard.finance.quotes} />;
    if (view === "settings") return <SettingsPanel />;
    return <HomePanel dashboard={dashboard} now={now} />;
  }, [dashboard, now, view]);

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#e7f3ff_0,#f9fbfe_36%,#eef5ef_100%)] text-mirror-ink">
      <div className="mx-auto flex min-h-screen max-w-[1920px] gap-5 px-6 py-5">
        <aside className="flex w-28 flex-col items-center gap-3 rounded-[24px] border border-white/70 bg-white/65 p-3 shadow-panel backdrop-blur">
          <SunMedium className="mt-2 h-9 w-9 text-amber-500" />
          <div className="h-px w-14 bg-mirror-line" />
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = view === item.view;
            return (
              <button
                key={item.view}
                onClick={() => setView(item.view)}
                className={`flex h-20 w-full flex-col items-center justify-center gap-1 rounded-2xl text-sm font-semibold transition active:scale-95 ${
                  active ? "bg-sky-600 text-white shadow-lg shadow-sky-300/40" : "text-slate-600 hover:bg-white"
                }`}
                aria-label={item.label}
              >
                <Icon className="h-6 w-6" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </aside>
        <section className="flex min-w-0 flex-1 flex-col gap-5">
          <header className="flex items-center justify-between rounded-[24px] border border-white/70 bg-white/65 px-7 py-4 shadow-panel backdrop-blur">
            <div>
              <p className="text-lg font-semibold text-slate-500">{now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</p>
              <h1 className="text-5xl font-bold tracking-normal">{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</h1>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold uppercase text-slate-500">Family Command Center</p>
              <p className="text-lg text-slate-600">{dashboard.weather.locationName} · {dashboard.weather.current.description}</p>
              {error && <p className="text-sm text-amber-700">Using demo fallback: {error}</p>}
            </div>
          </header>
          {content}
        </section>
      </div>
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
          <p className="text-8xl font-bold">{dashboard.weather.current.temperature}°</p>
          <p className="text-2xl text-slate-600">Feels like {dashboard.weather.current.apparentTemperature}°</p>
        </div>
        <p className="mb-3 rounded-full bg-sky-100 px-5 py-3 text-lg font-semibold text-sky-800">{dashboard.weather.current.description}</p>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-3">
        {dashboard.weather.daily.slice(0, 4).map((day) => (
          <div key={day.date} className="rounded-2xl bg-white/70 p-4">
            <p className="font-bold">{formatShortDate(day.date)}</p>
            <p className="text-slate-600">{day.high}° / {day.low}°</p>
          </div>
        ))}
      </div>
    </>
  );
}

function CalendarPanel({ events }: { events: CalendarEvent[] }) {
  return (
    <Card className="flex-1">
      <SectionTitle icon={CalendarDays} title="Calendar Agenda" />
      <div className="mt-6 grid grid-cols-3 gap-4">
        {["Today", "Tomorrow", "Upcoming"].map((label, index) => (
          <div key={label} className="rounded-2xl bg-white/70 p-5">
            <h2 className="mb-4 text-2xl font-bold">{label}</h2>
            <EventList events={events.slice(index * 3, index * 3 + 3)} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function TaskPanel({ tasks }: { tasks: Task[] }) {
  return (
    <Card className="flex-1">
      <SectionTitle icon={CheckCircle2} title="Tasks" />
      <TaskList tasks={tasks} large />
    </Card>
  );
}

function NotesPanel({ note }: { note: string }) {
  return (
    <Card className="flex-1">
      <SectionTitle icon={StickyNote} title="Notes" />
      <textarea className="mt-6 h-[60vh] w-full resize-none rounded-2xl border border-mirror-line bg-white/70 p-6 text-3xl leading-relaxed outline-none focus:ring-4 focus:ring-sky-200" defaultValue={note} />
    </Card>
  );
}

function FinancePanel({ quotes }: { quotes: FinanceQuote[] }) {
  return (
    <Card className="flex-1">
      <SectionTitle icon={Landmark} title="Finance" />
      <div className="mt-6 grid grid-cols-3 gap-5">
        {quotes.map((quote) => (
          <div key={quote.symbol} className="rounded-3xl bg-white/75 p-6">
            <p className="text-xl font-bold text-slate-500">{quote.symbol}</p>
            <p className="mt-2 truncate text-2xl font-semibold">{quote.name}</p>
            <p className="mt-6 text-5xl font-bold">{money(quote.price)}</p>
            <p className={`mt-2 text-2xl font-bold ${quote.changePercent && quote.changePercent < 0 ? "text-rose-600" : "text-emerald-600"}`}>
              {signed(quote.change)} · {signed(quote.changePercent)}%
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SettingsPanel() {
  return (
    <Card className="flex-1">
      <SectionTitle icon={Settings} title="Settings" />
      <div className="mt-6 grid grid-cols-2 gap-5 text-2xl text-slate-700">
        <p className="rounded-2xl bg-white/70 p-5">Calendar feed, weather location, RSS feeds, and watchlist are editable through the API in v1.</p>
        <p className="rounded-2xl bg-white/70 p-5">Next pass can add touchscreen forms and an on-screen keyboard for kiosk edits.</p>
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
  return <section className={`rounded-[24px] border border-white/75 bg-mirror-card p-6 shadow-panel backdrop-blur ${className}`}>{children}</section>;
}

function formatEventTime(value: string) {
  return new Date(value).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
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
