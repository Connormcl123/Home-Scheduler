import type { GroceryItem, GroceryStatus } from "@mirror-dashboard/shared";
import { getDb } from "../db.js";

function rowToGroceryItem(row: any): GroceryItem {
  return {
    id: row.id,
    name: row.name,
    recipes: parseRecipes(row.recipes),
    quantity: row.quantity,
    category: row.category,
    supplier: row.supplier,
    status: row.status,
    purchased: Boolean(row.purchased),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseRecipes(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((title): title is string => typeof title === "string") : [];
  } catch {
    return [];
  }
}

function storeRecipes(recipes: string[] | undefined): string | null {
  return recipes?.length ? JSON.stringify(recipes) : null;
}

export async function listGroceryItems(filter: { activeOnly?: boolean } = {}) {
  const db = await getDb();
  const rows = filter.activeOnly
    ? await db.all("SELECT * FROM grocery_items WHERE purchased = 0 ORDER BY status DESC, category ASC, id DESC")
    : await db.all("SELECT * FROM grocery_items ORDER BY purchased ASC, status DESC, category ASC, id DESC");
  return rows.map(rowToGroceryItem);
}

export async function createGroceryItem(input: { name: string; quantity?: string; category?: string; supplier?: string; status?: GroceryStatus; recipes?: string[] }) {
  const db = await getDb();
  const result = await db.run(
    "INSERT INTO grocery_items (name, quantity, category, supplier, status, recipes) VALUES (?, ?, ?, ?, ?, ?)",
    input.name.trim(),
    input.quantity || null,
    input.category || null,
    input.supplier || null,
    input.status || "low",
    storeRecipes(input.recipes)
  );
  const row = await db.get("SELECT * FROM grocery_items WHERE id = ?", result.lastID);
  return rowToGroceryItem(row);
}

export async function updateGroceryItem(id: number, input: Partial<{ name: string; quantity: string | null; category: string | null; supplier: string | null; status: GroceryStatus; purchased: boolean; recipes: string[] }>) {
  const db = await getDb();
  const current = await db.get("SELECT * FROM grocery_items WHERE id = ?", id);
  if (!current) return null;

  await db.run(
    `UPDATE grocery_items
     SET name = ?, quantity = ?, category = ?, supplier = ?, status = ?, purchased = ?, recipes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    input.name === undefined ? current.name : input.name.trim(),
    input.quantity === undefined ? current.quantity : input.quantity,
    input.category === undefined ? current.category : input.category,
    input.supplier === undefined ? current.supplier : input.supplier,
    input.status ?? current.status,
    input.purchased === undefined ? current.purchased : Number(input.purchased),
    input.recipes === undefined ? current.recipes : storeRecipes(input.recipes),
    id
  );

  const row = await db.get("SELECT * FROM grocery_items WHERE id = ?", id);
  return rowToGroceryItem(row);
}

export async function deleteGroceryItem(id: number) {
  const db = await getDb();
  await db.run("DELETE FROM grocery_items WHERE id = ?", id);
}

/**
 * The list as a text message: grouped by aisle, what has run out marked, one
 * item per line so it reads on a phone. `now` names the day at the top.
 */
export function groceryText(items: GroceryItem[], now: Date): string {
  const needed = items.filter((item) => !item.purchased);
  if (!needed.length) return "The grocery list is empty.";
  const day = now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const groups = new Map<string, GroceryItem[]>();
  for (const item of needed) {
    const aisle = item.category?.trim() || "Other";
    groups.set(aisle, [...(groups.get(aisle) ?? []), item]);
  }
  const sections = [...groups.entries()]
    .sort(([a], [b]) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)))
    .map(([aisle, list]) => {
      const lines = list
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
        .map((item) => {
          const name = item.name.trim().charAt(0).toUpperCase() + item.name.trim().slice(1);
          const quantity = item.quantity?.trim() ? `, ${item.quantity.trim()}` : "";
          return `- ${name}${quantity}${item.status === "out" ? " (out)" : ""}`;
        });
      return `${aisle}\n${lines.join("\n")}`;
    });
  return `Groceries for ${day} (${needed.length})\n\n${sections.join("\n\n")}`;
}
