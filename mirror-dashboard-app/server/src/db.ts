import fs from "node:fs/promises";
import path from "node:path";
import sqlite3 from "sqlite3";
import { open, type Database } from "sqlite";
import { config } from "./config.js";

let db: Database | null = null;

export async function getDb() {
  if (db) return db;

  await fs.mkdir(path.dirname(config.databasePath), { recursive: true });
  db = await open({
    filename: config.databasePath,
    driver: sqlite3.Database
  });

  await db.exec("PRAGMA foreign_keys = ON;");
  await initializeSchema(db);
  return db;
}

export async function initializeSchema(database: Database) {
  await database.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      notes TEXT,
      due_date TEXT,
      priority TEXT NOT NULL DEFAULT 'normal',
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      body TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rss_feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS finance_watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL UNIQUE,
      enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS finance_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_account_id TEXT,
      name TEXT NOT NULL,
      institution TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'checking',
      balance REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      last_synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS finance_budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL UNIQUE,
      limit_amount REAL NOT NULL,
      color TEXT NOT NULL DEFAULT '#3b82f6',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS finance_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_transaction_id TEXT,
      account_id INTEGER,
      merchant TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      transaction_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES finance_accounts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS plaid_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT NOT NULL UNIQUE,
      access_token TEXT NOT NULL,
      institution_name TEXT,
      cursor TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS grocery_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      quantity TEXT,
      category TEXT,
      supplier TEXT,
      status TEXT NOT NULL DEFAULT 'low',
      purchased INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await ensureColumn(database, "finance_accounts", "provider_item_id", "TEXT");
  await ensureColumn(database, "finance_accounts", "provider_account_id", "TEXT");
  await ensureColumn(database, "finance_transactions", "provider_item_id", "TEXT");
  await ensureColumn(database, "finance_transactions", "pending", "INTEGER NOT NULL DEFAULT 0");
}

async function ensureColumn(database: Database, table: string, column: string, definition: string) {
  const columns = await database.all(`PRAGMA table_info(${table})`) as Array<{ name: string }>;
  if (!columns.some((entry) => entry.name === column)) {
    await database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
