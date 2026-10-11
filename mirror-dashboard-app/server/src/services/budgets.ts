import type { BudgetSummary, BudgetView } from "@mirror-dashboard/shared";
import { getDb } from "../db.js";
import { FINANCE_CATEGORIES, matchCategory, NON_SPENDING, RENAMED } from "./finance/categories.js";

/** A colour per category, so a budget looks the same on the wall every month. */
const COLORS: Record<string, string> = {
  Groceries: "#10b981",
  "Dining & Drinks": "#f97316",
  Shopping: "#ec4899",
  "Gas & Auto": "#0ea5e9",
  Home: "#8b5cf6",
  Utilities: "#64748b",
  Health: "#ef4444",
  Entertainment: "#a855f7",
  Subscriptions: "#14b8a6",
  Travel: "#f59e0b",
  Kids: "#22c55e",
  Pets: "#84cc16",
  Personal: "#d946ef",
  Fees: "#78716c",
  Debt: "#dc2626",
  Other: "#94a3b8"
};

export function budgetColor(category: string): string {
  return COLORS[category] || "#3b82f6";
}

/** The categories a budget can be set on: spending only, and never twice. */
export async function availableCategories(): Promise<string[]> {
  const db = await getDb();
  const taken = new Set((await db.all("SELECT category FROM finance_budgets")).map((row: { category: string }) => row.category));
  return FINANCE_CATEGORIES.filter((category) => !NON_SPENDING.has(category) && !taken.has(category));
}

/** Budgets with this month's spending, what is left, and whether spending is ahead of the month. */
export async function listBudgets(now = new Date()): Promise<BudgetSummary> {
  const db = await getDb();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const rows = await db.all(
    `SELECT b.id, b.category, b.limit_amount, b.color, COALESCE(SUM(ABS(t.amount)), 0) as spent_amount
     FROM finance_budgets b
     LEFT JOIN finance_transactions t
       ON t.category = b.category AND t.amount < 0 AND strftime('%Y-%m', t.transaction_date) = ?
     GROUP BY b.id
     ORDER BY b.category ASC`,
    month
  );

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const throughMonth = now.getDate() / daysInMonth;
  const budgets: BudgetView[] = rows.map((row: { id: number; category: string; limit_amount: number; color: string; spent_amount: number }) => {
    const limitAmount = Number(row.limit_amount);
    const spentAmount = Number(row.spent_amount.toFixed(2));
    const expected = limitAmount * throughMonth;
    return {
      id: row.id,
      category: row.category,
      limitAmount,
      spentAmount,
      color: row.color || budgetColor(row.category),
      remaining: Number((limitAmount - spentAmount).toFixed(2)),
      percent: limitAmount > 0 ? Math.round((spentAmount / limitAmount) * 100) : 0,
      // Projected from the pace so far, which is what says "you will run out".
      projected: Number((throughMonth > 0 ? spentAmount / throughMonth : 0).toFixed(2)),
      state: spentAmount > limitAmount ? "over" : spentAmount > expected ? "ahead" : "under"
    };
  });

  const monthSpending = await db.get<{ total: number }>(
    `SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM finance_transactions
     WHERE amount < 0 AND strftime('%Y-%m', transaction_date) = ?
       AND category NOT IN (${[...NON_SPENDING].map(() => "?").join(",")})`,
    month,
    ...NON_SPENDING
  );
  const budgeted = budgets.reduce((sum, budget) => sum + budget.spentAmount, 0);

  return {
    monthLabel: now.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    dayOfMonth: now.getDate(),
    daysInMonth,
    budgets,
    totalLimit: Number(budgets.reduce((sum, budget) => sum + budget.limitAmount, 0).toFixed(2)),
    totalSpent: Number(budgeted.toFixed(2)),
    // What the month cost outside any budget, so the totals are honest.
    unbudgetedSpent: Number(Math.max(0, (monthSpending?.total ?? 0) - budgeted).toFixed(2)),
    available: await availableCategories()
  };
}

export class BudgetError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** A misheard word must not quietly become a budget on the wrong category. */
function requireCategory(value: string): string {
  const category = matchCategory(value);
  if (!category) throw new BudgetError(`There is no category called "${String(value).trim()}". Try one of: ${FINANCE_CATEGORIES.filter((name) => !NON_SPENDING.has(name)).join(", ")}.`);
  return category;
}

function checkAmount(amount: unknown): number {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new BudgetError("A budget needs an amount above zero.");
  if (value > 1_000_000) throw new BudgetError("That budget amount looks too large.");
  return Math.round(value * 100) / 100;
}

/** Creates a budget, or raises the one already on that category. */
export async function setBudget(input: { category: string; limitAmount: unknown; color?: string }): Promise<BudgetView> {
  const category = requireCategory(input.category);
  if (NON_SPENDING.has(category)) throw new BudgetError(`${category} is not spending, so it cannot have a budget.`);
  const limitAmount = checkAmount(input.limitAmount);
  const db = await getDb();
  await db.run(
    `INSERT INTO finance_budgets (category, limit_amount, color) VALUES (?, ?, ?)
     ON CONFLICT(category) DO UPDATE SET limit_amount = excluded.limit_amount, updated_at = CURRENT_TIMESTAMP`,
    category,
    limitAmount,
    input.color || budgetColor(category)
  );
  const summary = await listBudgets();
  const saved = summary.budgets.find((budget) => budget.category === category);
  if (!saved) throw new BudgetError("The budget could not be saved.", 500);
  return saved;
}

export async function updateBudget(id: number, input: { limitAmount?: unknown; category?: string; color?: string }): Promise<BudgetView | null> {
  const db = await getDb();
  const current = await db.get<{ id: number; category: string }>("SELECT id, category FROM finance_budgets WHERE id = ?", id);
  if (!current) return null;
  const category = input.category ? requireCategory(input.category) : current.category;
  if (NON_SPENDING.has(category)) throw new BudgetError(`${category} is not spending, so it cannot have a budget.`);
  if (category !== current.category) {
    const clash = await db.get("SELECT id FROM finance_budgets WHERE category = ? AND id != ?", category, id);
    if (clash) throw new BudgetError(`There is already a budget for ${category}.`);
  }
  await db.run(
    "UPDATE finance_budgets SET category = ?, limit_amount = COALESCE(?, limit_amount), color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    category,
    input.limitAmount === undefined ? null : checkAmount(input.limitAmount),
    input.color || budgetColor(category),
    id
  );
  const summary = await listBudgets();
  return summary.budgets.find((budget) => budget.id === id) ?? null;
}

export async function deleteBudget(id: number): Promise<boolean> {
  const db = await getDb();
  const result = await db.run("DELETE FROM finance_budgets WHERE id = ?", id);
  return Boolean(result.changes);
}

/**
 * Brings stored names onto the current category list, once, at startup: the
 * budgets, the rules that feed them and the transactions already imported.
 */
export async function renameOldCategories(): Promise<number> {
  const db = await getDb();
  let changed = 0;
  for (const [from, to] of Object.entries(RENAMED)) {
    const clash = await db.get("SELECT id FROM finance_budgets WHERE category = ?", to);
    if (clash) await db.run("DELETE FROM finance_budgets WHERE category = ?", from);
    else changed += (await db.run("UPDATE finance_budgets SET category = ?, color = ? WHERE category = ?", to, budgetColor(to), from)).changes ?? 0;
    await db.run("UPDATE finance_category_rules SET category = ? WHERE category = ?", to, from);
    changed += (await db.run("UPDATE finance_transactions SET category = ? WHERE category = ?", to, from)).changes ?? 0;
  }
  return changed;
}
