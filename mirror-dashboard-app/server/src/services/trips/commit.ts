import { randomBytes } from "node:crypto";
import type { TripArrangements, TripPlan, TripSelection, TripTotals } from "@mirror-dashboard/shared";
import { config } from "../../config.js";
import { getDb } from "../../db.js";
import { listBudgets, setBudget } from "../budgets.js";
import { createLocalCalendarEvent } from "../localCalendar.js";
import { addDays, tripTotals } from "./links.js";

/**
 * Moving on a trip, from the wall, in one tap: the dates go on the family
 * calendar, the cost goes against a Travel budget, and everything needed to
 * actually book lands on a phone through a QR code. Nothing is bought here -
 * the booking and the paying stay with the person holding the phone.
 */

export interface TripCommit {
  arrangements: TripArrangements;
  selection: TripSelection;
  holdInCalendar: boolean;
  addToBudget: boolean;
}

function rowToPlan(row: { id: number; deal_id: number; destination: string; start_date: string; end_date: string; token: string; payload: string; calendar_event_id: number | null; budget_category: string | null; created_at: string }): TripPlan {
  const payload = JSON.parse(row.payload) as { selection: TripSelection; totals: TripTotals; travelers: TripArrangements["travelers"] };
  return {
    id: row.id,
    dealId: row.deal_id,
    destination: row.destination,
    startDate: row.start_date,
    endDate: row.end_date,
    travelers: payload.travelers,
    selection: payload.selection,
    totals: payload.totals,
    phoneUrl: tripUrl(row.token),
    heldInCalendar: Boolean(row.calendar_event_id),
    budgetCategory: row.budget_category,
    createdAt: row.created_at
  };
}

export function tripUrl(token: string): string {
  return `${config.trips.publicBase.replace(/\/$/, "")}/trips/${token}`;
}

/** A long weekend shows on the calendar as one block, not a dozen entries. */
async function holdDates(arrangements: TripArrangements): Promise<number | null> {
  const event = await createLocalCalendarEvent({
    title: `Trip: ${arrangements.destination}`,
    start: new Date(`${arrangements.startDate}T00:00:00`).toISOString(),
    end: addDays(new Date(`${arrangements.endDate}T00:00:00`), 1).toISOString(),
    location: arrangements.destination,
    source: "local"
  });
  return event ? Number(event.id.replace(/\D/g, "")) || null : null;
}

/** The Travel budget has to cover the trip, so raise it rather than lower it. */
async function budgetFor(total: number): Promise<string | null> {
  const summary = await listBudgets();
  const existing = summary.budgets.find((budget) => budget.category === "Travel");
  const limit = Math.max(existing?.limitAmount ?? 0, total);
  await setBudget({ category: "Travel", limitAmount: limit });
  return "Travel";
}

export async function commitTrip(input: TripCommit): Promise<TripPlan> {
  const totals = tripTotals(input.arrangements, input.selection);
  const token = randomBytes(9).toString("hex");
  const db = await getDb();

  const calendarEventId = input.holdInCalendar ? await holdDates(input.arrangements) : null;
  const budgetCategory = input.addToBudget ? await budgetFor(totals.total) : null;

  const result = await db.run(
    `INSERT INTO trip_plans (deal_id, token, destination, start_date, end_date, payload, calendar_event_id, budget_category)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    input.arrangements.dealId,
    token,
    input.arrangements.destination,
    input.arrangements.startDate,
    input.arrangements.endDate,
    JSON.stringify({ arrangements: input.arrangements, selection: input.selection, totals, travelers: input.arrangements.travelers }),
    calendarEventId,
    budgetCategory
  );

  const row = await db.get("SELECT * FROM trip_plans WHERE id = ?", result.lastID);
  return rowToPlan(row);
}

export async function listTripPlans(limit = 10): Promise<TripPlan[]> {
  const db = await getDb();
  const rows = await db.all("SELECT * FROM trip_plans ORDER BY id DESC LIMIT ?", limit);
  return rows.map(rowToPlan);
}

export async function tripByToken(token: string): Promise<{ arrangements: TripArrangements; selection: TripSelection; totals: TripTotals; plan: TripPlan } | null> {
  const db = await getDb();
  const row = await db.get("SELECT * FROM trip_plans WHERE token = ?", token);
  if (!row) return null;
  const payload = JSON.parse(row.payload) as { arrangements: TripArrangements; selection: TripSelection; totals: TripTotals };
  return { ...payload, plan: rowToPlan(row) };
}

export async function deleteTripPlan(id: number): Promise<boolean> {
  const db = await getDb();
  const result = await db.run("DELETE FROM trip_plans WHERE id = ?", id);
  return Boolean(result.changes);
}
