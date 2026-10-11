import { useCallback, useEffect, useState } from "react";
import { BedDouble, CalendarCheck, ChevronLeft, ChevronRight, Minus, Plane, Plus, Ticket, Wallet } from "lucide-react";
import type { TravelDeal, TripArrangements, TripPlan, TripSelection, TripTotals } from "@mirror-dashboard/shared";
import { commitTrip, fetchTripArrangements } from "../api";
import { SlideQr } from "../SlideQr";
import { safeStorageGet, safeStorageSet } from "../storage";

const money = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;

function dayRange(startDate: string, endDate: string) {
  const from = new Date(`${startDate}T12:00:00`);
  const to = new Date(`${endDate}T12:00:00`);
  const shown = { weekday: "short", month: "short", day: "numeric" } as const;
  return `${from.toLocaleDateString("en-US", shown)} to ${to.toLocaleDateString("en-US", shown)}`;
}

/** Adds up as the family picks, so the number moves while they decide. */
function totalsOf(trip: TripArrangements, selection: TripSelection): TripTotals {
  const people = Math.max(1, trip.travelers.adults + trip.travelers.children);
  const flight = trip.flights.find((option) => option.id === selection.flightId);
  const stay = trip.stays.find((option) => option.id === selection.stayId);
  const activities = trip.activities.filter((option) => selection.activityIds.includes(option.id));
  const flights = Math.round((flight?.pricePerPerson ?? 0) * people);
  const stayCost = Math.round((stay?.nightlyPrice ?? 0) * trip.nights);
  const activityCost = Math.round(activities.reduce((sum, option) => sum + option.pricePerPerson * people, 0));
  const food = Math.round(trip.dailyFoodPerPerson * people * (trip.nights + 1));
  const total = flights + stayCost + activityCost + food;
  return { flights, stay: stayCost, activities: activityCost, food, total, perPerson: Math.round(total / people) };
}

/**
 * The deep dive behind a trip idea: the dates, a few ways to fly, places to
 * stay and things to do, each priced. One tap holds the dates, budgets the
 * cost and sends every booking link to a phone - the booking and paying happen
 * there, never on the wall.
 */
export function TripPlanner({ deal, onClose }: { deal: TravelDeal; onClose: () => void }) {
  const [adults, setAdults] = useState(() => Number(safeStorageGet("mirror-dashboard-trip-adults")) || 2);
  const [children, setChildren] = useState(() => {
    const stored = safeStorageGet("mirror-dashboard-trip-children");
    return stored === null ? 2 : Number(stored) || 0;
  });
  const [weekShift, setWeekShift] = useState(0);
  const [trip, setTrip] = useState<TripArrangements | null>(null);
  const [selection, setSelection] = useState<TripSelection>({ flightId: "", stayId: "", activityIds: [] });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<TripPlan | null>(null);

  const load = useCallback(() => {
    setTrip(null);
    setError(null);
    fetchTripArrangements(deal.id, { adults, children, weekShift })
      .then((next) => {
        setTrip(next);
        // The first of each is picked, so a total shows the moment it opens.
        setSelection({
          flightId: next.flights[0]?.id ?? "",
          stayId: next.stays[0]?.id ?? "",
          activityIds: next.activities.slice(0, 2).map((activity) => activity.id)
        });
      })
      .catch((err: Error) => setError(err.message));
  }, [deal.id, adults, children, weekShift]);

  useEffect(load, [load]);

  useEffect(() => {
    safeStorageSet("mirror-dashboard-trip-adults", String(adults));
    safeStorageSet("mirror-dashboard-trip-children", String(children));
  }, [adults, children]);

  const totals = trip ? totalsOf(trip, selection) : null;

  async function decide() {
    if (!trip) return;
    setBusy(true);
    try {
      setPlan(await commitTrip({ dealId: deal.id, selection, weekShift, travelers: { adults, children } }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That trip could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (plan && trip && totals) return <TripReady deal={deal} plan={plan} trip={trip} totals={totals} onClose={onClose} />;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-6" onClick={onClose}>
      <div className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-[28px] bg-amb-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-amb-border px-7 py-5">
          <div className="min-w-0">
            <h2 className="font-display text-[38px] leading-none text-amb-ink">{deal.destination}</h2>
            <p className="mt-1 text-xl text-amb-muted">
              {trip ? `${dayRange(trip.startDate, trip.endDate)}, ${trip.nights} nights from ${trip.origin}` : "Working out the arrangements..."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setWeekShift((week) => week - 1)} disabled={!trip || weekShift <= -3} className="touch-button w-16 bg-amb-well disabled:opacity-30" aria-label="A week earlier">
              <ChevronLeft className="h-7 w-7" />
            </button>
            <button onClick={() => setWeekShift((week) => week + 1)} disabled={!trip || weekShift >= 12} className="touch-button w-16 bg-amb-well" aria-label="A week later">
              <ChevronRight className="h-7 w-7" />
            </button>
            <Counter label="Adults" value={adults} onChange={setAdults} min={1} />
            <Counter label="Kids" value={children} onChange={setChildren} min={0} />
          </div>
        </div>

        {error && <p className="px-7 pt-4 text-xl font-bold text-rose-600 dark:text-rose-400">{error}</p>}
        {!trip && !error && <p className="p-7 text-2xl text-amb-muted">Pricing flights, stays and things to do...</p>}

        {trip && (
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px] gap-6 overflow-hidden p-7">
            <div className="min-h-0 space-y-6 overflow-y-auto pr-2">
              <Section icon={Plane} title="Getting there">
                {trip.flights.map((option) => (
                  <Option
                    key={option.id}
                    chosen={selection.flightId === option.id}
                    onChoose={() => setSelection((current) => ({ ...current, flightId: option.id }))}
                    title={option.airline}
                    detail={`${option.route}. ${option.stops}, out ${option.departs}, back ${option.returns}.${option.note ? ` ${option.note}` : ""}`}
                    price={`${money(option.pricePerPerson)} each`}
                    link={option.link}
                  />
                ))}
              </Section>

              <Section icon={BedDouble} title="Where to stay">
                {trip.stays.map((option) => (
                  <Option
                    key={option.id}
                    chosen={selection.stayId === option.id}
                    onChoose={() => setSelection((current) => ({ ...current, stayId: option.id }))}
                    title={option.name}
                    detail={`${option.area}${option.area && option.note ? ". " : ""}${option.note}`}
                    price={`${money(option.nightlyPrice)} a night`}
                    link={option.link}
                  />
                ))}
              </Section>

              <Section icon={Ticket} title="While you're there">
                {trip.activities.map((option) => (
                  <Option
                    key={option.id}
                    chosen={selection.activityIds.includes(option.id)}
                    onChoose={() => setSelection((current) => ({
                      ...current,
                      activityIds: current.activityIds.includes(option.id)
                        ? current.activityIds.filter((id) => id !== option.id)
                        : [...current.activityIds, option.id]
                    }))}
                    title={option.name}
                    detail={`${option.when}${option.when && option.note ? ". " : ""}${option.note}`}
                    price={option.pricePerPerson ? `${money(option.pricePerPerson)} each` : "free"}
                    link={option.link}
                  />
                ))}
              </Section>
            </div>

            {totals && (
              <aside className="flex min-h-0 flex-col justify-between gap-5 overflow-y-auto rounded-3xl bg-amb-well p-6">
                <div>
                  <p className="font-display text-[54px] leading-none text-amb-ink">{money(totals.total)}</p>
                  <p className="mt-1 text-xl text-amb-muted">{money(totals.perPerson)} each, all in</p>
                  <dl className="mt-5 space-y-2 text-lg">
                    <Line label={`Flights for ${adults + children}`} value={money(totals.flights)} />
                    <Line label={`Stay, ${trip.nights} nights`} value={money(totals.stay)} />
                    <Line label="Things to do" value={money(totals.activities)} />
                    <Line label="Food, roughly" value={money(totals.food)} />
                  </dl>
                  <p className="mt-5 text-base leading-snug text-amb-muted">
                    Estimates for these dates. The real price is on the booking page, which opens on your phone.
                  </p>
                </div>
                <button
                  onClick={decide}
                  disabled={busy || !selection.flightId || !selection.stayId}
                  className="touch-button w-full bg-amb-accent px-6 text-amb-accent-ink disabled:opacity-40"
                >
                  {busy ? "Getting it ready..." : "Let's do this"}
                </button>
              </aside>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-amb-muted">{label}</dt>
      <dd className="font-semibold text-amb-ink">{value}</dd>
    </div>
  );
}

function Counter({ label, value, onChange, min }: { label: string; value: number; onChange: (value: number) => void; min: number }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-amb-well px-3 py-2">
      <button onClick={() => onChange(Math.max(min, value - 1))} aria-label={`One fewer ${label}`} className="flex h-10 w-10 items-center justify-center rounded-xl bg-amb-card active:scale-90">
        <Minus className="h-5 w-5" />
      </button>
      <span className="min-w-[4.5rem] text-center text-lg font-bold text-amb-ink">{value} {label}</span>
      <button onClick={() => onChange(Math.min(9, value + 1))} aria-label={`One more ${label}`} className="flex h-10 w-10 items-center justify-center rounded-xl bg-amb-card active:scale-90">
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Plane; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="flex items-center gap-3 text-2xl font-bold text-amb-ink"><Icon className="h-6 w-6 text-amb-muted" />{title}</h3>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Option({ chosen, onChoose, title, detail, price, link }: { chosen: boolean; onChoose: () => void; title: string; detail: string; price: string; link: string }) {
  return (
    <button
      onClick={onChoose}
      className={`w-full rounded-2xl border-2 p-5 text-left active:scale-[0.99] ${chosen ? "border-amb-accent bg-amb-card" : "border-transparent bg-amb-card/60"}`}
    >
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-2xl font-bold text-amb-ink">{title}</span>
        <span className="shrink-0 text-xl font-semibold text-amb-muted">{price}</span>
      </div>
      <p className="mt-1 text-lg leading-snug text-amb-muted">{detail}</p>
      <p className="mt-2 truncate text-base text-amb-muted">{new URL(link).hostname.replace(/^www\./, "")}</p>
    </button>
  );
}

/** After the tap: what was held, and the code that carries the booking to a phone. */
function TripReady({ deal, plan, trip, totals, onClose }: { deal: TravelDeal; plan: TripPlan; trip: TripArrangements; totals: TripTotals; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-6" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-[28px] bg-amb-sheet p-8" onClick={(event) => event.stopPropagation()}>
        <h2 className="font-display text-[40px] leading-tight text-amb-ink">{deal.destination} is ready to book</h2>
        <p className="mt-2 text-xl text-amb-muted">{dayRange(plan.startDate, plan.endDate)}, {money(totals.total)} for {trip.travelers.adults + trip.travelers.children}</p>

        <div className="mt-6 space-y-3 text-xl">
          {plan.heldInCalendar && (
            <p className="flex items-center gap-3 text-amb-ink"><CalendarCheck className="h-6 w-6 text-amb-muted" />The dates are held on the family calendar</p>
          )}
          {plan.budgetCategory && (
            <p className="flex items-center gap-3 text-amb-ink"><Wallet className="h-6 w-6 text-amb-muted" />The Travel budget covers {money(totals.total)}</p>
          )}
        </div>

        <div className="mt-7 flex items-center gap-6">
          <SlideQr url={plan.phoneUrl} label="Scan to book on your phone" />
          <p className="text-lg leading-snug text-amb-muted">
            Your phone gets the flight, the stay and each activity as its own booking link, in order. Paying happens there.
          </p>
        </div>

        <button onClick={onClose} className="touch-button mt-7 w-full bg-amb-accent px-6 text-amb-accent-ink">Done</button>
      </div>
    </div>
  );
}
