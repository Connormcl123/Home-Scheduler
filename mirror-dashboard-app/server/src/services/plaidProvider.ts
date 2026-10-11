import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { config } from "../config.js";
import { getDb } from "../db.js";
import { categorizeMerchant } from "./personalFinance.js";

type PlaidItemRow = {
  id: number;
  item_id: string;
  access_token: string;
  institution_name?: string | null;
  cursor?: string | null;
};

/**
 * Plaid answers with its own reason (bad keys, a bank that needs a fresh
 * sign-in); show that instead of a blank 500, since it says what to fix.
 */
export function plaidErrorMessage(error: unknown): string | null {
  const data = (error as { response?: { data?: { error_message?: string; error_code?: string } } })?.response?.data;
  if (!data?.error_message) return null;
  const invalidKeys = data.error_code === "INVALID_API_KEYS";
  return invalidKeys
    ? "Plaid rejected the keys on the Pi. Check PLAID_CLIENT_ID and PLAID_SECRET in .env, and that the secret matches PLAID_ENV."
    : `Plaid: ${data.error_message}`;
}

export function isPlaidConfigured() {
  return Boolean(config.plaid.clientId && config.plaid.secret);
}

export async function getPlaidStatus() {
  const db = await getDb();
  const items = await db.all("SELECT item_id, institution_name, status, last_synced_at FROM plaid_items ORDER BY id ASC") as Array<{
    item_id: string;
    institution_name?: string | null;
    status: string;
    last_synced_at?: string | null;
  }>;

  return {
    configured: isPlaidConfigured(),
    environment: config.plaid.env,
    itemCount: items.length,
    items: items.map((item) => ({
      itemId: item.item_id,
      institutionName: item.institution_name,
      status: item.status,
      lastSyncedAt: item.last_synced_at
    }))
  };
}

export async function createPlaidLinkToken() {
  assertPlaidConfigured();
  const response = await getPlaidClient().linkTokenCreate({
    user: { client_user_id: config.plaid.userId },
    client_name: config.plaid.clientName,
    products: config.plaid.products as any,
    country_codes: config.plaid.countryCodes as any,
    language: "en"
  });
  return response.data;
}

export async function exchangePlaidPublicToken(publicToken: string, institutionName?: string) {
  assertPlaidConfigured();
  const response = await getPlaidClient().itemPublicTokenExchange({ public_token: publicToken });
  const { access_token: accessToken, item_id: itemId } = response.data;
  const db = await getDb();
  const existingItems = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM plaid_items");
  if (!existingItems?.count) {
    await clearPlaceholderFinanceData();
  }
  await db.run(
    `INSERT INTO plaid_items (item_id, access_token, institution_name, status)
     VALUES (?, ?, ?, 'active')
     ON CONFLICT(item_id) DO UPDATE SET
       access_token = excluded.access_token,
       institution_name = COALESCE(excluded.institution_name, plaid_items.institution_name),
       status = 'active',
       updated_at = CURRENT_TIMESTAMP`,
    itemId,
    accessToken,
    institutionName || null
  );
  await syncPlaidItem(accessToken, itemId);
  return { itemId, institutionName: institutionName || null };
}

async function clearPlaceholderFinanceData() {
  const db = await getDb();
  await db.run("DELETE FROM finance_transactions WHERE provider_transaction_id IS NULL");
  await db.run("DELETE FROM finance_accounts WHERE provider_account_id IS NULL");
}

/**
 * Keeps the wall's money figures current without anyone pressing Sync. Plaid
 * itself refreshes a few times a day, so checking every few hours is plenty; a
 * failure (an expired login, the Pi offline) is logged and retried next tick.
 */
export function startPlaidSyncScheduler(minutes: number): void {
  const tick = () => {
    if (!isPlaidConfigured()) return;
    syncAllPlaidItems().catch((error) => console.error("Plaid sync failed:", error instanceof Error ? error.message : error));
  };
  setTimeout(tick, 60_000).unref?.();
  setInterval(tick, minutes * 60_000).unref?.();
}

export async function syncAllPlaidItems(options: { forceFull?: boolean } = {}) {
  assertPlaidConfigured();
  const db = await getDb();
  const items = await db.all("SELECT * FROM plaid_items WHERE status = 'active' ORDER BY id ASC") as PlaidItemRow[];
  const results = [];
  for (const item of items) {
    results.push(await syncPlaidItem(item.access_token, item.item_id, options.forceFull ? undefined : item.cursor || undefined));
  }
  return { syncedItems: results.length, forceFull: Boolean(options.forceFull), results };
}

async function syncPlaidItem(accessToken: string, itemId: string, cursor?: string) {
  const db = await getDb();
  const client = getPlaidClient();
  const itemRow = await db.get<{ institution_name?: string | null }>("SELECT institution_name FROM plaid_items WHERE item_id = ?", itemId);
  const institution = itemRow?.institution_name || "Plaid";
  const accountsResponse = await client.accountsGet({ access_token: accessToken });
  const accountIdMap = new Map<string, number>();

  for (const account of accountsResponse.data.accounts) {
    const row = await upsertFinanceAccount({
      providerItemId: itemId,
      providerAccountId: account.account_id,
      name: account.name,
      institution,
      type: account.type || "other",
      balance: normalizeBalance(account.type, account.balances.current ?? account.balances.available ?? 0),
      currency: account.balances.iso_currency_code || "USD"
    });
    accountIdMap.set(account.account_id, row.id);
  }

  let nextCursor = cursor;
  let hasMore = true;
  let added = 0;
  let modified = 0;
  let removed = 0;

  while (hasMore) {
    const response = await client.transactionsSync({
      access_token: accessToken,
      cursor: nextCursor
    });

    for (const transaction of response.data.added) {
      await upsertFinanceTransaction(itemId, accountIdMap.get(transaction.account_id) ?? null, transaction);
      added += 1;
    }

    for (const transaction of response.data.modified) {
      await upsertFinanceTransaction(itemId, accountIdMap.get(transaction.account_id) ?? null, transaction);
      modified += 1;
    }

    for (const transaction of response.data.removed) {
      await db.run("DELETE FROM finance_transactions WHERE provider_transaction_id = ?", transaction.transaction_id);
      removed += 1;
    }

    nextCursor = response.data.next_cursor;
    hasMore = response.data.has_more;
  }

  await db.run(
    "UPDATE plaid_items SET cursor = ?, last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE item_id = ?",
    nextCursor,
    itemId
  );

  return { itemId, added, modified, removed };
}

async function upsertFinanceAccount(input: {
  providerItemId: string;
  providerAccountId: string;
  name: string;
  institution: string;
  type: string;
  balance: number;
  currency: string;
}) {
  const db = await getDb();
  const existing = await db.get<{ id: number }>("SELECT id FROM finance_accounts WHERE provider_account_id = ?", input.providerAccountId);
  if (existing) {
    await db.run(
      `UPDATE finance_accounts
       SET provider_item_id = ?, name = ?, institution = ?, type = ?, balance = ?, currency = ?, last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      input.providerItemId,
      input.name,
      input.institution,
      mapAccountType(input.type),
      input.balance,
      input.currency,
      existing.id
    );
    return existing;
  }

  const result = await db.run(
    `INSERT INTO finance_accounts (provider_item_id, provider_account_id, name, institution, type, balance, currency, last_synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    input.providerItemId,
    input.providerAccountId,
    input.name,
    input.institution,
    mapAccountType(input.type),
    input.balance,
    input.currency
  );
  return { id: Number(result.lastID) };
}

async function upsertFinanceTransaction(providerItemId: string, accountId: number | null, transaction: any) {
  const db = await getDb();
  const merchant = transaction.merchant_name || transaction.name || "Transaction";
  const providerCategory = transaction.personal_finance_category?.primary || transaction.category?.[0] || null;
  const normalizedAmount = -Number(transaction.amount || 0);
  const categorization = await categorizeMerchant(merchant, providerCategory, {
    detailed: transaction.personal_finance_category?.detailed || null,
    amount: normalizedAmount
  });
  const existing = await db.get<{ id: number }>("SELECT id FROM finance_transactions WHERE provider_transaction_id = ?", transaction.transaction_id);

  if (existing) {
    await db.run(
      `UPDATE finance_transactions
       SET provider_item_id = ?, account_id = ?, merchant = ?, category = CASE WHEN categorized_by = 'manual' THEN category ELSE ? END, amount = ?, transaction_date = ?, pending = ?, categorized_by = CASE WHEN categorized_by = 'manual' THEN categorized_by ELSE ? END, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      providerItemId,
      accountId,
      merchant,
      categorization.category,
      normalizedAmount,
      transaction.date,
      transaction.pending ? 1 : 0,
      categorization.categorizedBy,
      existing.id
    );
    return;
  }

  await db.run(
    `INSERT INTO finance_transactions (provider_item_id, provider_transaction_id, account_id, merchant, category, amount, transaction_date, pending, categorized_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    providerItemId,
    transaction.transaction_id,
    accountId,
    merchant,
    categorization.category,
    normalizedAmount,
    transaction.date,
    transaction.pending ? 1 : 0,
    categorization.categorizedBy
  );
}

function getPlaidClient() {
  const environment = PlaidEnvironments[config.plaid.env as keyof typeof PlaidEnvironments] || PlaidEnvironments.sandbox;
  const plaidConfig = new Configuration({
    basePath: environment,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": config.plaid.clientId,
        "PLAID-SECRET": config.plaid.secret
      }
    }
  });
  return new PlaidApi(plaidConfig);
}

function assertPlaidConfigured() {
  if (!isPlaidConfigured()) {
    throw new Error("Plaid is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET in mirror-dashboard-app/.env.");
  }
}

function normalizeBalance(type: string | undefined, balance: number) {
  if (type === "credit") return -Math.abs(balance);
  return balance;
}

function mapAccountType(type: string) {
  if (["checking", "savings", "credit", "investment"].includes(type)) return type;
  if (type === "depository") return "checking";
  if (type === "brokerage") return "investment";
  return "other";
}
