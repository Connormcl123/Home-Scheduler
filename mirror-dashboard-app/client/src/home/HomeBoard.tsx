import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { CalendarDays, Check, ListChecks, Newspaper, Plane, ShoppingBasket, StickyNote, UtensilsCrossed, Wallet, type LucideIcon } from "lucide-react";
import type { CalendarEvent, DashboardSummary, GroceryItem, MealPlanEntry, NewsArticle, Note, Task, TravelDeal } from "@mirror-dashboard/shared";
import { fetchGroceryItems, fetchMealPlan, fetchNotes, fetchTravelDeals, updateTask } from "../api";
import { dateKey } from "../packages/packageText";
import { allDay, coming, dueLabel, laneOf, moneyPace, railHours, timeOf, todays } from "./homeText";
import { CarouselControls, DealCarousel, useCarouselIndex } from "../travel/DealCarousel";
import { dealAccent } from "../travel/dealAccent";

export type HomeTarget = "calendar" | "tasks" | "grocery" | "recipes" | "notes" | "finance" | "travel";

const rise = (step: number) => ({ duration: 0.7, ease: [0.2, 0.7, 0.2, 1] as const, delay: 0.25 + step * 0.07 });

/**
 * Home below the clock: every tab drawn in its own form rather than a grid of
 * matching cards. The day rail is the one bold surface; everything else sits
 * straight on the sky.
 */
export function HomeBoard({
  dashboard,
  now,
  onNavigate,
  onOpenNews,
  onOpenDeal
}: {
  dashboard: DashboardSummary;
  now: Date;
  onNavigate: (target: HomeTarget, dealId?: number) => void;
  onOpenNews: (article: NewsArticle) => void;
  onOpenDeal: (deal: TravelDeal) => void;
}) {
  const [meals, setMeals] = useState<MealPlanEntry[]>([]);
  const [grocery, setGrocery] = useState<GroceryItem[]>([]);
  const [deals, setDeals] = useState<TravelDeal[]>([]);
  const [note, setNote] = useState<Note | null>(null);

  // The dashboard summary covers calendar, tasks, money and news; the rest refresh here.
  useEffect(() => {
    const load = () => {
      fetchMealPlan().then(setMeals).catch(() => undefined);
      fetchGroceryItems(true).then(setGrocery).catch(() => undefined);
      fetchTravelDeals().then((data) => setDeals(data.deals)).catch(() => undefined);
      fetchNotes().then((notes) => setNote(dashboard.todayNote ?? latest(notes))).catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 300_000);
    return () => window.clearInterval(timer);
  }, [dashboard.todayNote]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={rise(0)} className="shrink-0">
        <DayRail events={dashboard.calendar} now={now} onOpen={() => onNavigate("calendar")} />
      </motion.div>

      <div className="grid min-h-0 flex-1 grid-cols-3 gap-x-14">
        <motion.div className="flex min-h-0 flex-col gap-6" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={rise(1)}>
          <TaskList tasks={dashboard.tasks} now={now} onOpen={() => onNavigate("tasks")} />
          {note && <NoteQuote note={note} onOpen={() => onNavigate("notes")} />}
        </motion.div>
        <motion.div className="flex min-h-0 flex-col gap-6" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={rise(2)}>
          <Dinner meals={meals} now={now} onOpen={() => onNavigate("recipes")} />
          <Grocery items={grocery} onOpen={() => onNavigate("grocery")} />
        </motion.div>
        <motion.div className="flex min-h-0 flex-col gap-6" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={rise(3)}>
          <Money dashboard={dashboard} now={now} onOpen={() => onNavigate("finance")} />
          {dashboard.news.length > 0 && <Headlines articles={dashboard.news} onOpen={onOpenNews} />}
        </motion.div>
      </div>

      {deals.length > 0 && (
        <motion.div className="shrink-0" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={rise(4)}>
          <TripBand deals={deals} onOpen={onOpenDeal} onAll={() => onNavigate("travel")} />
        </motion.div>
      )}
    </div>
  );
}

/** The trip ideas, on the same rail the Travel tab uses, so a tap opens the same trip. */
function TripBand({
  deals,
  onOpen,
  onAll
}: {
  deals: TravelDeal[];
  onOpen: (deal: TravelDeal) => void;
  onAll: () => void;
}) {
  // Kept here rather than on the board: moving the rail must not re-render the
  // clock, the day or the money beside it.
  const [index, onIndex] = useCarouselIndex();
  return (
    <div className="flex h-[140px] items-stretch gap-6">
      <div className="flex w-48 shrink-0 flex-col justify-center gap-3">
        <button type="button" onClick={onAll} className="self-start text-left active:opacity-60">
          <Heading icon={Plane}>Trip ideas</Heading>
          <p className="mt-1 font-display text-[26px] leading-tight text-amb-ink">{deals[index]?.tripLength ?? `${deals.length} today`}</p>
        </button>
        <CarouselControls deals={deals} index={index} onIndex={onIndex} size="home" />
      </div>
      <DealCarousel deals={deals} index={index} onIndex={onIndex} onOpen={onOpen} size="home" accentOf={dealAccent}>
        {(deal, centred) => (
          <div className="relative flex h-full flex-col justify-between p-5">
            <div>
              <p className="flex items-baseline gap-2.5">
                <span className="text-3xl leading-none">{deal.emoji}</span>
                <span className="truncate font-display text-[30px] leading-tight">{deal.destination}</span>
              </p>
              <p className="mt-1 line-clamp-2 text-lg font-semibold leading-snug text-white/90">{centred ? deal.headline : deal.country}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-base font-bold">
              {deal.estCost && <span className="rounded-full bg-white/25 px-3.5 py-1.5">{deal.estCost}</span>}
              {deal.bestMonths && <span className="rounded-full bg-white/25 px-3.5 py-1.5">{deal.bestMonths}</span>}
            </div>
          </div>
        )}
      </DealCarousel>
    </div>
  );
}

/** One headline under the money: the bottom strip now belongs to the trips. */
function Headlines({ articles, onOpen }: { articles: NewsArticle[]; onOpen: (article: NewsArticle) => void }) {
  return (
    <section className="flex min-h-0 flex-col gap-1.5">
      <Heading icon={Newspaper}>Headlines</Heading>
      {articles.slice(0, 1).map((article) => (
        <button key={article.id} type="button" onClick={() => onOpen(article)} className="flex min-w-0 items-center gap-3 text-left active:opacity-60">
          {article.imageUrl && <Thumb src={article.imageUrl} className="h-10 w-14 rounded-lg" />}
          <span className="min-w-0">
            <span className="line-clamp-2 text-[18px] font-semibold leading-tight text-amb-ink">{article.title}</span>
            <span className="block truncate text-base text-amb-muted">{article.source}</span>
          </span>
        </button>
      ))}
    </section>
  );
}

/** A photo that removes itself if it fails to load, so a dead link never leaves a broken box. */
function Thumb({ src, className }: { src: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img src={src} alt="" loading="lazy" className={`shrink-0 bg-amb-well object-cover ${className}`} onError={() => setFailed(true)} />;
}

function latest(notes: Note[]): Note | null {
  return notes.reduce<Note | null>((best, note) => (!best || note.updatedAt > best.updatedAt ? note : best), null);
}

/** Small tab name above each section: it says where a tap goes. */
function Heading({ icon: Icon, children }: { icon: LucideIcon; children: string }) {
  return (
    <span className="flex items-center gap-2.5 text-lg font-semibold text-amb-muted">
      <Icon className="h-5 w-5" />
      {children}
    </span>
  );
}

const tint = (percent: number, color = "var(--amb-accent)") => `color-mix(in oklch, ${color} ${percent}%, transparent)`;

/** Today on an hour scale, with the sun (or moon) riding the now line, and what comes next beside it. */
function DayRail({ events, now, onOpen }: { events: CalendarEvent[]; now: Date; onOpen: () => void }) {
  const today = todays(events, now);
  const timed = today.filter((event) => !allDay(event));
  const whole = today.filter(allDay);
  const { start, end } = railHours(timed);
  const span = (end - start) * 60;
  const at = (date: Date) => Math.min(100, Math.max(0, (((date.getHours() - start) * 60 + date.getMinutes()) / span) * 100));
  const nowAt = at(now);
  const lanes = laneOf(timed);
  // With nothing overlapping, one lane takes the full height and titles can wrap.
  const single = !lanes.some((lane) => lane > 0);
  const next = coming(events, now, 3);
  const hours = Array.from({ length: end - start + 1 }, (_, index) => start + index);
  const night = now.getHours() >= 19 || now.getHours() < 6;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-[170px] w-full gap-8 rounded-[30px] border border-amb-border bg-amb-card py-5 pl-8 pr-7 text-left shadow-ambient active:scale-[0.995]"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-baseline justify-between gap-4">
          <Heading icon={CalendarDays}>Today</Heading>
          {whole.length > 0 && <span className="truncate text-lg font-semibold text-amb-ink">All day: {whole.map((event) => event.title.trim()).join(", ")}</span>}
        </div>
        <div className="relative min-h-0 flex-1">
          {/* The part of the day already gone is washed out. */}
          <div className="absolute inset-y-0 left-0 rounded-l-2xl" style={{ width: `${nowAt}%`, background: "color-mix(in oklch, var(--amb-ink) 6%, transparent)" }} />
          {hours.map((hour) => (
            <div key={hour} className="absolute inset-y-0 w-px bg-amb-border" style={{ left: `${((hour - start) / (end - start)) * 100}%` }} />
          ))}
          <div className="absolute inset-x-0 top-1 bottom-9">
            {timed.map((event, index) => {
              const from = new Date(event.start);
              const to = event.end ? new Date(event.end) : new Date(from.getTime() + 3_600_000);
              // Short events get a readable minimum width; late ones are pulled back inside the rail.
              const width = Math.max(at(to) - at(from), 13);
              const left = Math.min(at(from), 100 - width);
              const past = to < now;
              return (
                <div
                  key={event.id}
                  className={`absolute flex min-w-0 flex-col justify-center overflow-hidden rounded-xl border-l-4 border-amb-accent px-3 ${past ? "opacity-50" : ""}`}
                  style={{ left: `${left}%`, width: `${width}%`, top: `${lanes[index] * 50}%`, height: single ? "100%" : "48%", background: tint(20) }}
                >
                  <span className={`font-display text-[25px] leading-[1.05] text-amb-ink ${single ? "line-clamp-2" : "truncate"}`}>{event.title.trim()}</span>
                  <span className="truncate text-base font-medium text-amb-muted">{timeOf(from)}</span>
                </div>
              );
            })}
            {!timed.length && (
              <p className="absolute inset-0 flex items-center justify-center font-display text-[30px] italic text-amb-muted">Nothing on the calendar today</p>
            )}
          </div>
          {hours.filter((hour) => hour % 3 === 0 && hour < end).map((hour) => (
            <span key={hour} className="absolute bottom-0 -translate-x-1/2 text-base font-medium text-amb-muted" style={{ left: `${((hour - start) / (end - start)) * 100}%` }}>
              {hour % 12 || 12} {hour < 12 || hour === 24 ? "am" : "pm"}
            </span>
          ))}
          <div className="absolute top-0 bottom-7 w-0.5 -translate-x-1/2 bg-amb-accent" style={{ left: `${nowAt}%` }}>
            <span
              className="absolute -top-2 left-1/2 h-6 w-6 -translate-x-1/2 rounded-full"
              style={{ background: night ? "oklch(0.93 0.02 250)" : "oklch(0.93 0.13 85)", boxShadow: `0 0 18px ${night ? "oklch(0.93 0.02 250 / 0.8)" : "oklch(0.9 0.15 80 / 0.9)"}` }}
            />
          </div>
        </div>
      </div>

      <div className="flex w-[430px] shrink-0 flex-col gap-2 border-l border-amb-border pl-7">
        <Heading icon={CalendarDays}>Coming up</Heading>
        {!next.length && <p className="text-xl text-amb-muted">Nothing in the next two weeks.</p>}
        <div className="flex flex-col gap-2">
          {next.map((event) => {
            const from = new Date(event.start);
            return (
              <div key={event.id} className="flex min-w-0 items-center gap-4">
                <span className="flex w-14 shrink-0 flex-col items-center leading-none">
                  <span className="text-sm font-semibold text-amb-muted">{from.toLocaleDateString("en-US", { weekday: "short" })}</span>
                  <span className="font-display text-[30px] leading-none text-amb-ink">{from.getDate()}</span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[19px] font-semibold leading-snug text-amb-ink">{event.title.trim()}</span>
                  <span className="block truncate text-base text-amb-muted">{allDay(event) ? "All day" : timeOf(from)}{event.location ? `, ${event.location.split("\n")[0]}` : ""}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </button>
  );
}

/** A real checklist: ticking here finishes the task. */
function TaskList({ tasks, now, onOpen }: { tasks: Task[]; now: Date; onOpen: () => void }) {
  const [done, setDone] = useState<Set<number>>(() => new Set());
  const open = tasks.filter((task) => !task.completed && !done.has(task.id));
  // Four fit above the trip band; the rest are a tap away on the Tasks tab.
  const shown = open.slice(0, 4);

  async function finish(task: Task) {
    setDone((current) => new Set(current).add(task.id));
    try {
      await updateTask(task.id, { completed: true });
    } catch {
      setDone((current) => {
        const next = new Set(current);
        next.delete(task.id);
        return next;
      });
    }
  }

  return (
    <section className="flex min-h-0 flex-col gap-3">
      <button type="button" onClick={onOpen} className="self-start active:opacity-60"><Heading icon={ListChecks}>Tasks</Heading></button>
      {!open.length && <p className="text-xl leading-snug text-amb-muted">Nothing to do. Say &ldquo;Hey Siri, add a task&rdquo; to add one.</p>}
      <ul className="flex flex-col gap-1">
        {shown.map((task) => {
          const due = dueLabel(task.dueDate, now);
          return (
            <li key={task.id} className="flex min-w-0 items-center gap-4">
              <button
                type="button"
                onClick={() => finish(task)}
                aria-label={`Finish ${task.title}`}
                className="flex h-12 w-14 shrink-0 items-center justify-center active:scale-90"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-amb-muted">
                  <Check className="h-5 w-5 text-amb-muted opacity-0" strokeWidth={3} />
                </span>
              </button>
              <button type="button" onClick={onOpen} className="min-w-0 text-left">
                <span className="block truncate text-[24px] font-semibold leading-tight text-amb-ink">{task.title}</span>
                {due && <span className={`block text-base font-medium ${due.late ? "text-amber-700 dark:text-amber-300" : "text-amb-muted"}`}>{due.text}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {open.length > shown.length && <p className="pl-[72px] text-lg font-semibold text-amb-muted">{open.length - shown.length} more</p>}
    </section>
  );
}

/** The latest note, set like something left on the counter. */
function NoteQuote({ note, onOpen }: { note: Note; onOpen: () => void }) {
  const left = new Date(`${note.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  return (
    <button type="button" onClick={onOpen} className="flex min-h-0 flex-col gap-2 text-left active:opacity-60">
      <Heading icon={StickyNote}>Note</Heading>
      <p className="line-clamp-4 border-l-[3px] border-amb-accent pl-5 font-display text-[29px] italic leading-[1.22] text-amb-ink">{note.body}</p>
      <p className="pl-6 text-base text-amb-muted">Left {left}</p>
    </button>
  );
}

/** Tonight's dinner, then the week's dinners as seven nights that fill in when planned. */
function Dinner({ meals, now, onOpen }: { meals: MealPlanEntry[]; now: Date; onOpen: () => void }) {
  const todayKey = dateKey(now);
  const dinners = meals.filter((meal) => meal.slot === "dinner" && meal.date >= todayKey).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7);
  const tonight = dinners.find((meal) => meal.date === todayKey);
  const recipe = tonight?.recipe;
  const openNights = dinners.filter((meal) => !meal.recipe && !meal.note).length;
  const facts = [recipe?.totalMinutes ? `${recipe.totalMinutes} min` : null, recipe?.servings ? `serves ${recipe.servings}` : null].filter(Boolean).join(", ");

  return (
    <button type="button" onClick={onOpen} className="flex flex-col gap-3 text-left active:opacity-60">
      <Heading icon={UtensilsCrossed}>Dinner tonight</Heading>
      <div className="flex min-w-0 items-center gap-5">
        {recipe?.imageUrl && <Thumb src={recipe.imageUrl} className="h-24 w-24 rounded-2xl" />}
        <div className="min-w-0">
          <p className="line-clamp-2 font-display text-[38px] leading-[1.02] text-amb-ink">{recipe?.title ?? tonight?.note ?? "Not planned yet"}</p>
          {facts && <p className="mt-1 text-lg text-amb-muted">{facts}</p>}
        </div>
      </div>
      {dinners.length > 0 && (
        <div className="mt-1 flex gap-2">
          {dinners.map((meal) => {
            const planned = Boolean(meal.recipe || meal.note);
            const isToday = meal.date === todayKey;
            return (
              <span key={meal.date} className="flex flex-1 flex-col items-center gap-1.5">
                <span className={`text-base ${isToday ? "font-bold text-amb-ink" : "font-medium text-amb-muted"}`}>
                  {new Date(`${meal.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" })}
                </span>
                <span className={`h-2.5 w-full rounded-full ${planned ? "bg-amb-accent" : "border-2 border-amb-border"}`} />
              </span>
            );
          })}
        </div>
      )}
      {openNights > 0 && <p className="text-base text-amb-muted">{openNights === 1 ? "1 night" : `${openNights} nights`} still to plan</p>}
    </button>
  );
}

/** How much is needed, then the list itself run together like a note on the fridge. */
function Grocery({ items, onOpen }: { items: GroceryItem[]; onOpen: () => void }) {
  const needed = items.filter((item) => !item.purchased);
  const out = needed.filter((item) => item.status === "out");
  const ordered = [...out, ...needed.filter((item) => item.status !== "out")];
  return (
    <button type="button" onClick={onOpen} className="flex min-h-0 flex-col gap-2 text-left active:opacity-60">
      <Heading icon={ShoppingBasket}>Grocery</Heading>
      {!needed.length ? (
        <p className="text-xl text-amb-muted">The list is empty.</p>
      ) : (
        <>
          <p className="flex items-baseline gap-3">
            <span className="font-display text-[52px] leading-none text-amb-ink">{needed.length}</span>
            <span className="text-xl font-semibold text-amb-ink">to buy</span>
            {out.length > 0 && <span className="text-lg text-amb-muted">{out.length} out, {needed.length - out.length} running low</span>}
          </p>
          <p className="line-clamp-3 text-xl leading-snug">
            {ordered.map((item, index) => (
              <span key={item.id} className={item.status === "out" ? "font-semibold text-amb-ink" : "text-amb-muted"}>
                {item.name.charAt(0).toUpperCase() + item.name.slice(1)}{index < ordered.length - 1 ? ", " : ""}
              </span>
            ))}
          </p>
        </>
      )}
    </button>
  );
}

/** The month's spending against its budget, with a tick where spending should be by today, then where the money stands. */
function Money({ dashboard, now, onOpen }: { dashboard: DashboardSummary; now: Date; onOpen: () => void }) {
  const personal = dashboard.finance.personal;
  const pace = moneyPace(personal.budgetSpent, personal.budgetLimit, now);
  // The categories furthest through their budget.
  const budgets = [...personal.budgets].filter((budget) => budget.limitAmount > 0).sort((a, b) => b.spentAmount / b.limitAmount - a.spentAmount / a.limitAmount).slice(0, 3);
  const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const month = now.toLocaleDateString("en-US", { month: "long" });

  return (
    <button type="button" onClick={onOpen} className="flex flex-col gap-2 text-left active:opacity-60">
      <Heading icon={Wallet}>Money</Heading>
      {personal.budgetLimit > 0 && (
        <>
          <p className="flex items-baseline gap-3">
            <span className="font-display text-[46px] leading-none text-amb-ink">{money(personal.budgetSpent)}</span>
            <span className="text-xl text-amb-muted">spent in {month}</span>
          </p>
          <div className="relative mt-1 h-3 rounded-full bg-amb-well">
            <div className={`absolute inset-y-0 left-0 rounded-full ${pace.over ? "bg-amber-500" : "bg-amb-accent"}`} style={{ width: `${pace.spentPercent}%` }} />
            <div className="absolute -top-1.5 -bottom-1.5 w-0.5 bg-amb-ink" style={{ left: `${pace.expectedPercent}%` }} />
          </div>
          <p className="text-lg text-amb-muted">
            {money(Math.max(0, personal.budgetLimit - personal.budgetSpent))} left of {money(personal.budgetLimit)}, {pace.over ? "spending faster than the month allows" : "on track for the month"}
          </p>
        </>
      )}
      <div className="mt-0.5 grid grid-cols-3 gap-4">
        <Figure label="Cash" value={money(personal.totalCash)} />
        <Figure label="Owed on cards" value={money(personal.totalDebt)} />
        <Figure label={`Left over in ${month}`} value={`${personal.cashFlow >= 0 ? "+" : "-"}${money(Math.abs(personal.cashFlow))}`} tone={personal.cashFlow >= 0 ? "up" : "down"} />
      </div>
      {budgets.length > 0 && (
        <div className="flex flex-col gap-1">
          {budgets.map((budget) => (
            <span key={budget.id} className="grid grid-cols-[112px_1fr_132px] items-center gap-3">
              <span className="truncate text-lg font-semibold text-amb-ink">{budget.category}</span>
              <span className="relative h-2 rounded-full bg-amb-well">
                <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (budget.spentAmount / budget.limitAmount) * 100)}%`, background: budget.color }} />
              </span>
              <span className="text-right text-base text-amb-muted">{money(budget.spentAmount)} of {money(budget.limitAmount)}</span>
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  const color = tone === "up" ? "text-emerald-700 dark:text-emerald-300" : tone === "down" ? "text-rose-700 dark:text-rose-300" : "text-amb-ink";
  return (
    <span className="flex min-w-0 flex-col">
      <span className={`truncate text-[25px] font-semibold leading-tight ${color}`}>{value}</span>
      <span className="truncate text-base text-amb-muted">{label}</span>
    </span>
  );
}

