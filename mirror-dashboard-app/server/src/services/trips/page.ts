import type { TripArrangements, TripSelection, TripTotals } from "@mirror-dashboard/shared";
import { travelerCount } from "./links.js";

/**
 * What the phone shows after scanning the wall: the trip as chosen, and the
 * three or four taps that book it. Written as one self-contained page so it
 * opens instantly over Tailscale with nothing else to load.
 */

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] as string);

const money = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;

function dayRange(startDate: string, endDate: string): string {
  const from = new Date(`${startDate}T12:00:00`);
  const to = new Date(`${endDate}T12:00:00`);
  const shown = { weekday: "short", month: "short", day: "numeric" } as const;
  return `${from.toLocaleDateString("en-US", shown)} to ${to.toLocaleDateString("en-US", shown)}`;
}

export function tripPage(input: { arrangements: TripArrangements; selection: TripSelection; totals: TripTotals }): string {
  const { arrangements: trip, selection, totals } = input;
  const flight = trip.flights.find((option) => option.id === selection.flightId);
  const stay = trip.stays.find((option) => option.id === selection.stayId);
  const activities = trip.activities.filter((option) => selection.activityIds.includes(option.id));
  const people = travelerCount(trip.travelers);

  const step = (number: number, title: string, detail: string, price: string, link: string, action: string) => `
    <li class="step">
      <div class="head"><span class="num">${number}</span><h2>${escape(title)}</h2></div>
      <p class="detail">${escape(detail)}</p>
      <div class="row"><span class="price">${escape(price)}</span><a class="go" href="${escape(link)}" target="_blank" rel="noopener">${escape(action)}</a></div>
    </li>`;

  const steps = [
    flight && step(1, flight.airline, `${flight.route}. ${flight.stops}, out ${flight.departs}, back ${flight.returns}.`, `about ${money(flight.pricePerPerson)} each, ${money(totals.flights)} for ${people}`, flight.link, "Book flights"),
    stay && step(2, stay.name, `${stay.area}${stay.area && stay.note ? ". " : ""}${stay.note}`, `about ${money(stay.nightlyPrice)} a night, ${money(totals.stay)} for ${trip.nights} nights`, stay.link, "Book the stay"),
    ...activities.map((activity, index) =>
      step(3 + index, activity.name, `${activity.when}${activity.when && activity.note ? ". " : ""}${activity.note}`, activity.pricePerPerson ? `about ${money(activity.pricePerPerson)} each` : "free", activity.link, "Book it")
    )
  ].filter(Boolean).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(trip.destination)}</title>
<style>
  :root { color-scheme: light dark; --ink: #10233b; --muted: #5b6b80; --card: #ffffff; --bg: #eef3f8; --line: #dbe4ee; --accent: #1d4ed8; }
  @media (prefers-color-scheme: dark) {
    :root { --ink: #eaf0f8; --muted: #9fb0c4; --card: #16202e; --bg: #0c131c; --line: #24344a; --accent: #7aa2ff; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 20px 16px 48px; background: var(--bg); color: var(--ink); font: 17px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  header { margin-bottom: 18px; }
  h1 { margin: 0 0 4px; font-size: 30px; line-height: 1.1; }
  .when { color: var(--muted); font-weight: 600; }
  .total { margin: 16px 0 22px; padding: 16px; background: var(--card); border: 1px solid var(--line); border-radius: 18px; }
  .total .big { font-size: 34px; font-weight: 700; }
  .total .split { color: var(--muted); font-size: 15px; margin-top: 6px; }
  ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
  .step { padding: 16px; background: var(--card); border: 1px solid var(--line); border-radius: 18px; }
  .head { display: flex; align-items: center; gap: 10px; }
  .num { flex: none; width: 26px; height: 26px; border-radius: 50%; background: var(--accent); color: #fff; font-size: 14px; font-weight: 700; display: grid; place-items: center; }
  h2 { margin: 0; font-size: 19px; }
  .detail { margin: 8px 0 12px; color: var(--muted); }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .price { color: var(--muted); font-size: 15px; }
  .go { flex: none; background: var(--accent); color: #fff; text-decoration: none; font-weight: 700; padding: 12px 18px; border-radius: 12px; }
  footer { margin-top: 22px; color: var(--muted); font-size: 14px; }
</style>
</head>
<body>
  <header>
    <h1>${escape(trip.destination)}</h1>
    <p class="when">${escape(dayRange(trip.startDate, trip.endDate))}, ${trip.nights} nights, ${trip.travelers.adults} adults${trip.travelers.children ? ` and ${trip.travelers.children} kids` : ""}</p>
  </header>

  <section class="total">
    <div class="big">${money(totals.total)}</div>
    <div class="split">${money(totals.perPerson)} each. Flights ${money(totals.flights)}, stay ${money(totals.stay)}, activities ${money(totals.activities)}, food ${money(totals.food)}.</div>
  </section>

  <ol>${steps}</ol>

  <footer>Prices are estimates from the wall. Each button opens the live price, where you book and pay.</footer>
</body>
</html>`;
}
