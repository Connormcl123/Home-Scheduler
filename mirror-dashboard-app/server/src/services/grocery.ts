import type { GroceryItem, GroceryStatus } from "@mirror-dashboard/shared";
import { getDb } from "../db.js";

function rowToGroceryItem(row: any): GroceryItem {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    category: row.category,
    supplier: row.supplier,
    status: row.status,
    purchased: Boolean(row.purchased),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listGroceryItems(filter: { activeOnly?: boolean } = {}) {
  const db = await getDb();
  const rows = filter.activeOnly
    ? await db.all("SELECT * FROM grocery_items WHERE purchased = 0 ORDER BY status DESC, category ASC, id DESC")
    : await db.all("SELECT * FROM grocery_items ORDER BY purchased ASC, status DESC, category ASC, id DESC");
  return rows.map(rowToGroceryItem);
}

export async function createGroceryItem(input: { name: string; quantity?: string; category?: string; supplier?: string; status?: GroceryStatus }) {
  const db = await getDb();
  const result = await db.run(
    "INSERT INTO grocery_items (name, quantity, category, supplier, status) VALUES (?, ?, ?, ?, ?)",
    input.name.trim(),
    input.quantity || null,
    input.category || null,
    input.supplier || null,
    input.status || "low"
  );
  const row = await db.get("SELECT * FROM grocery_items WHERE id = ?", result.lastID);
  return rowToGroceryItem(row);
}

export async function updateGroceryItem(id: number, input: Partial<{ name: string; quantity: string | null; category: string | null; supplier: string | null; status: GroceryStatus; purchased: boolean }>) {
  const db = await getDb();
  const current = await db.get("SELECT * FROM grocery_items WHERE id = ?", id);
  if (!current) return null;

  await db.run(
    `UPDATE grocery_items
     SET name = ?, quantity = ?, category = ?, supplier = ?, status = ?, purchased = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    input.name === undefined ? current.name : input.name.trim(),
    input.quantity === undefined ? current.quantity : input.quantity,
    input.category === undefined ? current.category : input.category,
    input.supplier === undefined ? current.supplier : input.supplier,
    input.status ?? current.status,
    input.purchased === undefined ? current.purchased : Number(input.purchased),
    id
  );

  const row = await db.get("SELECT * FROM grocery_items WHERE id = ?", id);
  return rowToGroceryItem(row);
}

export async function deleteGroceryItem(id: number) {
  const db = await getDb();
  await db.run("DELETE FROM grocery_items WHERE id = ?", id);
}
