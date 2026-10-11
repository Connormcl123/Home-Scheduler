import { createLocalCalendarEvent } from "./localCalendar.js";
import type { BudgetSummary, BudgetView, Task } from "@mirror-dashboard/shared";
import { createTask, listTasks } from "./tasks.js";
import { createGroceryItem, listGroceryItems, updateGroceryItem } from "./grocery.js";

type VoiceGroceryInput = {
  items?: string;
  item?: string;
  name?: string;
};

type VoiceTaskInput = {
  title?: string;
  task?: string;
  dueDate?: string;
  priority?: "low" | "normal" | "high";
  source?: string;
};

type VoiceEventInput = {
  title?: string;
  event?: string;
  date?: string;
  time?: string;
  start?: string;
  end?: string;
  durationMinutes?: number;
  location?: string;
};

export async function createTaskFromVoice(input: VoiceTaskInput) {
  const title = tidyDictation(input.title || input.task || "");
  if (!title) throw new VoiceCommandError("Task title is required.", 400);
  return createTask({
    title,
    dueDate: input.dueDate,
    priority: input.priority || "normal",
    notes: `Added with ${input.source === "siri" ? "Siri" : "Alexa"}`
  });
}

/** Dictation arrives as "buy milk." - drop the full stop Siri adds and capitalise the first letter. */
export function tidyDictation(text: string): string {
  const clean = text.trim().replace(/[.!\s]+$/, "");
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * "Milk, eggs and bread." becomes ["Milk", "Eggs", "Bread"]. Splits on commas,
 * new lines and "and", so say "mac n cheese" rather than "mac and cheese".
 */
export function splitGroceryDictation(text: string): string[] {
  const names = text.split(/,|\n|\band\b/i).map(tidyDictation).filter(Boolean);
  return names.filter((name, index) => names.findIndex((other) => other.toLowerCase() === name.toLowerCase()) === index);
}

/** What Siri says after adding: "Added Eggs to the grocery list. Milk was already on it." */
export function grocerySaidBack(added: string[], alreadyListed: string[]): string {
  const join = (names: string[]) => (names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);
  const already = (names: string[]) => `${join(names)} ${names.length === 1 ? "was" : "were"} already on`;
  if (!added.length) return `${already(alreadyListed)} the grocery list.`;
  const said = `Added ${join(added)} to the grocery list.`;
  return alreadyListed.length ? `${said} ${already(alreadyListed)} it.` : said;
}

/**
 * Something still on the list is left alone; something bought before goes back
 * on the list with its old aisle and store, so the text groups it properly.
 */
export async function addGroceriesFromVoice(input: VoiceGroceryInput) {
  const names = splitGroceryDictation(input.items || input.item || input.name || "");
  if (!names.length) throw new VoiceCommandError("Say at least one grocery item.", 400);
  const existing = await listGroceryItems();
  const added: string[] = [];
  const alreadyListed: string[] = [];
  for (const name of names) {
    const match = existing.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (match && !match.purchased) {
      alreadyListed.push(match.name);
    } else if (match) {
      await updateGroceryItem(match.id, { purchased: false, status: "low" });
      added.push(match.name);
    } else {
      await createGroceryItem({ name, status: "low" });
      added.push(name);
    }
  }
  return { added, alreadyListed, message: grocerySaidBack(added, alreadyListed) };
}

export async function openTasksForVoice(today: string) {
  const tasks = await listTasks({ today });
  return spokenTaskList(tasks.filter((task) => !task.completed));
}

/** What Siri reads back: "You have 3 tasks: Buy milk, Call the dentist and Return the library books." */
export function spokenTaskList(tasks: Pick<Task, "title">[], limit = 5): string {
  if (!tasks.length) return "Your task list is clear.";
  const titles = tasks.slice(0, limit).map((task) => task.title.replace(/[.\s]+$/, ""));
  const more = tasks.length - titles.length;
  if (more) titles.push(`${more} more`);
  const listed = titles.length === 1 ? titles[0] : `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
  return `You have ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}: ${listed}.`;
}

export async function createCalendarEventFromVoice(input: VoiceEventInput) {
  const title = (input.title || input.event || "").trim();
  if (!title) throw new VoiceCommandError("Calendar event title is required.", 400);

  const start = resolveStart(input);
  const end = input.end ? new Date(input.end) : new Date(start.getTime() + (input.durationMinutes || 60) * 60_000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new VoiceCommandError("Calendar event date or time could not be understood.", 400);

  const event = await createLocalCalendarEvent({
    title,
    start: start.toISOString(),
    end: end.toISOString(),
    location: input.location,
    source: "voice"
  });

  if (!event) throw new VoiceCommandError("Calendar event could not be created.", 500);
  return event;
}

export class VoiceCommandError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function resolveStart(input: VoiceEventInput) {
  if (input.start) return new Date(input.start);

  const date = input.date || new Date().toISOString().slice(0, 10);
  const time = normalizeTime(input.time || "09:00");
  return new Date(`${date}T${time}`);
}

function normalizeTime(time: string) {
  const clean = time.trim().toLowerCase();
  const match = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return clean;

  let hour = Number(match[1]);
  const minute = match[2] || "00";
  const meridiem = match[3];
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return `${hour.toString().padStart(2, "0")}:${minute}:00`;
}

const dollars = (value: number) => `$${Math.round(Math.abs(value)).toLocaleString("en-US")}`;

/** What Siri says after setting one: the budget, and where the month already stands. */
export function budgetSaidBack(budget: BudgetView): string {
  const spent = budget.spentAmount > 0 ? ` You have spent ${dollars(budget.spentAmount)} of it this month.` : "";
  return `${budget.category} budget set to ${dollars(budget.limitAmount)}.${spent}`;
}

/**
 * The spoken budget check. It leads with anything over or running hot, because
 * that is the reason to ask, and keeps the rest to a single sentence.
 */
export function budgetsSpoken(summary: BudgetSummary): string {
  if (!summary.budgets.length) return "No budgets are set yet. Say set a groceries budget to 600 to start one.";
  const over = summary.budgets.filter((budget) => budget.state === "over");
  const ahead = summary.budgets.filter((budget) => budget.state === "ahead");
  const lines = [`You have spent ${dollars(summary.totalSpent)} of ${dollars(summary.totalLimit)} with ${summary.daysInMonth - summary.dayOfMonth} days left in ${summary.monthLabel.split(" ")[0]}.`];
  for (const budget of over.slice(0, 3)) {
    lines.push(`${budget.category} is over by ${dollars(budget.remaining)}.`);
  }
  for (const budget of ahead.slice(0, 2)) {
    lines.push(`${budget.category} is running ahead, ${dollars(budget.spentAmount)} of ${dollars(budget.limitAmount)}.`);
  }
  if (!over.length && !ahead.length) lines.push("Every budget is on track.");
  if (summary.unbudgetedSpent > 0) lines.push(`Another ${dollars(summary.unbudgetedSpent)} went to things with no budget.`);
  return lines.join(" ");
}
