import type { FinanceAccount, FinanceBudget, FinanceCategoryRule, FinanceTransaction, FinanceTrendPoint, PersonalFinanceSummary } from "@mirror-dashboard/shared";
import { getDb } from "../db.js";

const demoAccounts = [
  ["Everyday Checking", "Local Bank", "checking", 4280.22],
  ["Family Savings", "Local Bank", "savings", 12840.7],
  ["Rewards Card", "Credit Card", "credit", -1430.18],
  ["Home Projects Card", "Credit Card", "credit", -520.4]
] as const;

const demoBudgets = [
  ["Groceries", 850, "#10b981"],
  ["Dining", 300, "#f97316"],
  ["Gas", 260, "#0ea5e9"],
  ["Home", 500, "#8b5cf6"],
  ["Shopping", 450, "#ec4899"]
] as const;

const demoTransactions = [
  ["Grocery Market", "Groceries", -126.4, 0],
  ["Gas Station", "Gas", -48.2, 1],
  ["Target", "Shopping", -74.15, 2],
  ["Paycheck", "Income", 2450, 3],
  ["Italian Kitchen", "Dining", -62.88, 4],
  ["Hardware Store", "Home", -91.33, 5],
  ["Grocery Market", "Groceries", -184.1, 7],
  ["Coffee Shop", "Dining", -12.75, 9],
  ["Paycheck", "Income", 2450, 17],
  ["Online Retail", "Shopping", -118.44, 18],
  ["Pharmacy", "Health", -36.2, 20]
] as const;

const categoryAliases: Record<string, string> = {
  FOOD_AND_DRINK: "Dining",
  GENERAL_MERCHANDISE: "Shopping",
  GENERAL_SERVICES: "Home",
  GOVERNMENT_AND_NON_PROFIT: "Bills",
  HOME_IMPROVEMENT: "Home",
  LOAN_PAYMENTS: "Debt",
  MEDICAL: "Health",
  PERSONAL_CARE: "Health",
  RENT_AND_UTILITIES: "Bills",
  TRANSPORTATION: "Gas",
  TRAVEL: "Travel",
  TRANSFER_IN: "Income",
  TRANSFER_OUT: "Transfers",
  INCOME: "Income",
  BANK_FEES: "Fees",
  ENTERTAINMENT: "Entertainment"
};

export async function getPersonalFinanceSummary(): Promise<PersonalFinanceSummary> {
  const db = await getDb();
  await seedPersonalFinanceDemoData();

  const plaidItemCount = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM plaid_items WHERE status = 'active'");
  const accounts = (await db.all("SELECT * FROM finance_accounts ORDER BY type ASC, id ASC")).map(rowToAccount);
  const budgets = await getBudgetsWithSpend();
  const recentTransactions = (await db.all("SELECT * FROM finance_transactions ORDER BY transaction_date DESC, id DESC LIMIT 12")).map(rowToTransaction);
  const uncategorizedTransactions = (await db.all("SELECT * FROM finance_transactions WHERE category = 'Uncategorized' ORDER BY transaction_date DESC, id DESC LIMIT 12")).map(rowToTransaction);
  const categoryRules = await listCategoryRules();
  const totals = await getMonthlyTotals();
  const trend = await getTrend();
  const budgetLimit = budgets.reduce((sum, budget) => sum + budget.limitAmount, 0);
  const budgetSpent = budgets.reduce((sum, budget) => sum + budget.spentAmount, 0);
  const totalCash = accounts.filter((account) => account.balance > 0).reduce((sum, account) => sum + account.balance, 0);
  const totalDebt = Math.abs(accounts.filter((account) => account.balance < 0).reduce((sum, account) => sum + account.balance, 0));

  return {
    provider: plaidItemCount?.count ? "plaid" : "local-demo",
    monthLabel: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date()),
    totalCash,
    totalDebt,
    monthlyIncome: totals.income,
    monthlySpending: totals.spending,
    cashFlow: totals.income - totals.spending,
    budgetLimit,
    budgetSpent,
    accounts,
    budgets,
    recentTransactions,
    uncategorizedTransactions,
    categoryRules,
    trend,
    insights: buildInsights({ budgets, monthlySpending: totals.spending, cashFlow: totals.income - totals.spending })
  };
}

export async function categorizeMerchant(merchant: string, providerCategory?: string | null) {
  const ruleCategory = await getRuleCategoryForMerchant(merchant);
  if (ruleCategory) return { category: ruleCategory, categorizedBy: "rule" as const };
  return { category: normalizeCategory(providerCategory), categorizedBy: "provider" as const };
}

export async function listCategoryRules(): Promise<FinanceCategoryRule[]> {
  const db = await getDb();
  const rows = await db.all("SELECT * FROM finance_category_rules ORDER BY match_text ASC");
  return rows.map(rowToCategoryRule);
}

export async function createCategoryRule(input: { matchText: string; category: string }) {
  const db = await getDb();
  const matchText = input.matchText.trim();
  const category = input.category.trim();
  if (!matchText || !category) throw new Error("Rule match text and category are required.");

  const result = await db.run(
    `INSERT INTO finance_category_rules (match_text, category)
     VALUES (?, ?)
     ON CONFLICT(match_text) DO UPDATE SET category = excluded.category, enabled = 1, updated_at = CURRENT_TIMESTAMP`,
    matchText,
    category
  );

  await applyCategoryRule({ matchText, category });
  const row = result.lastID
    ? await db.get("SELECT * FROM finance_category_rules WHERE id = ?", result.lastID)
    : await db.get("SELECT * FROM finance_category_rules WHERE match_text = ?", matchText);
  return rowToCategoryRule(row);
}

export async function updateTransactionCategory(id: number, input: { category: string; createRule?: boolean; matchText?: string }) {
  const db = await getDb();
  const current = await db.get("SELECT * FROM finance_transactions WHERE id = ?", id);
  if (!current) return null;

  const category = input.category.trim();
  await db.run(
    "UPDATE finance_transactions SET category = ?, categorized_by = 'manual', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    category,
    id
  );

  if (input.createRule) {
    await createCategoryRule({ matchText: input.matchText || current.merchant, category });
  }

  const row = await db.get("SELECT * FROM finance_transactions WHERE id = ?", id);
  return rowToTransaction(row);
}

async function getRuleCategoryForMerchant(merchant: string) {
  const db = await getDb();
  const rules = await db.all("SELECT match_text, category FROM finance_category_rules WHERE enabled = 1 ORDER BY LENGTH(match_text) DESC") as Array<{ match_text: string; category: string }>;
  const normalizedMerchant = merchant.toLowerCase();
  const rule = rules.find((entry) => normalizedMerchant.includes(entry.match_text.toLowerCase()));
  return rule?.category;
}

async function applyCategoryRule(input: { matchText: string; category: string }) {
  const db = await getDb();
  await db.run(
    `UPDATE finance_transactions
     SET category = ?, categorized_by = 'rule', updated_at = CURRENT_TIMESTAMP
     WHERE LOWER(merchant) LIKE ? AND categorized_by != 'manual'`,
    input.category,
    `%${input.matchText.toLowerCase()}%`
  );
}

async function seedPersonalFinanceDemoData() {
  const db = await getDb();
  const accountCount = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM finance_accounts");
  if (!accountCount?.count) {
    for (const [name, institution, type, balance] of demoAccounts) {
      await db.run(
        "INSERT INTO finance_accounts (name, institution, type, balance, last_synced_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
        name,
        institution,
        type,
        balance
      );
    }
  }

  const budgetCount = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM finance_budgets");
  if (!budgetCount?.count) {
    for (const [category, limit, color] of demoBudgets) {
      await db.run("INSERT INTO finance_budgets (category, limit_amount, color) VALUES (?, ?, ?)", category, limit, color);
    }
  }

  const transactionCount = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM finance_transactions");
  if (!transactionCount?.count) {
    const checking = await db.get<{ id: number }>("SELECT id FROM finance_accounts WHERE type = 'checking' ORDER BY id LIMIT 1");
    const credit = await db.get<{ id: number }>("SELECT id FROM finance_accounts WHERE type = 'credit' ORDER BY id LIMIT 1");
    const now = new Date();
    for (const [merchant, category, amount, daysAgo] of demoTransactions) {
      const date = new Date(now);
      date.setDate(now.getDate() - daysAgo);
      await db.run(
        "INSERT INTO finance_transactions (account_id, merchant, category, amount, transaction_date) VALUES (?, ?, ?, ?, ?)",
        amount > 0 ? checking?.id : credit?.id,
        merchant,
        category,
        amount,
        date.toISOString().slice(0, 10)
      );
    }
  }
}

async function getBudgetsWithSpend(): Promise<FinanceBudget[]> {
  const db = await getDb();
  const rows = await db.all(`
    SELECT b.id, b.category, b.limit_amount, b.color, COALESCE(SUM(ABS(t.amount)), 0) as spent_amount
    FROM finance_budgets b
    LEFT JOIN finance_transactions t
      ON t.category = b.category
      AND t.amount < 0
      AND strftime('%Y-%m', t.transaction_date) = strftime('%Y-%m', 'now')
    GROUP BY b.id
    ORDER BY b.id ASC
  `);
  return rows.map(rowToBudget);
}

async function getMonthlyTotals() {
  const db = await getDb();
  const row = await db.get<{ income: number; spending: number }>(`
    SELECT
      COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as spending
    FROM finance_transactions
    WHERE strftime('%Y-%m', transaction_date) = strftime('%Y-%m', 'now')
  `);
  return { income: row?.income ?? 0, spending: row?.spending ?? 0 };
}

async function getTrend(): Promise<FinanceTrendPoint[]> {
  const db = await getDb();
  const rows = await db.all(`
    SELECT
      strftime('%m/%d', transaction_date) as label,
      COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as spending
    FROM finance_transactions
    WHERE date(transaction_date) >= date('now', '-28 days')
    GROUP BY transaction_date
    ORDER BY transaction_date ASC
  `);
  return rows.map((row) => ({ label: row.label, income: row.income, spending: row.spending }));
}

function buildInsights(input: { budgets: FinanceBudget[]; monthlySpending: number; cashFlow: number }) {
  const insights = [];
  const tightBudget = input.budgets.find((budget) => budget.spentAmount / budget.limitAmount >= 0.8);
  if (tightBudget) insights.push(`${tightBudget.category} is at ${Math.round((tightBudget.spentAmount / tightBudget.limitAmount) * 100)}% of this month's budget.`);
  if (input.cashFlow >= 0) insights.push(`Cash flow is positive by ${formatCurrency(input.cashFlow)} this month.`);
  if (input.monthlySpending > 0) insights.push(`Daily spending pace is about ${formatCurrency(input.monthlySpending / new Date().getDate())}.`);
  return insights;
}

function rowToAccount(row: any): FinanceAccount {
  return {
    id: row.id,
    providerAccountId: row.provider_account_id,
    name: row.name,
    institution: row.institution,
    type: row.type,
    balance: row.balance,
    currency: row.currency,
    lastSyncedAt: row.last_synced_at
  };
}

function rowToBudget(row: any): FinanceBudget {
  return {
    id: row.id,
    category: row.category,
    limitAmount: row.limit_amount,
    spentAmount: row.spent_amount,
    color: row.color
  };
}

function rowToTransaction(row: any): FinanceTransaction {
  return {
    id: row.id,
    accountId: row.account_id,
    merchant: row.merchant,
    category: row.category,
    amount: row.amount,
    transactionDate: row.transaction_date,
    notes: row.notes,
    categorizedBy: row.categorized_by || "provider"
  };
}

function rowToCategoryRule(row: any): FinanceCategoryRule {
  return {
    id: row.id,
    matchText: row.match_text,
    category: row.category,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at
  };
}

function normalizeCategory(category?: string | null) {
  if (!category) return "Uncategorized";
  return categoryAliases[category] || toTitleCase(category.replaceAll("_", " "));
}

function toTitleCase(value: string) {
  return value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}
