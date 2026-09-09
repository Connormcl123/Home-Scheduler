import Anthropic from "@anthropic-ai/sdk";
import type { GroceryPushResult, MealPlanEntry, Recipe, RecipeIngredient } from "@mirror-dashboard/shared";
import { config } from "../config.js";
import { getDb } from "../db.js";
import { createGroceryItem, listGroceryItems } from "./grocery.js";
import { todayIso } from "../utils/dates.js";

type RecipeRow = {
  id: number;
  title: string;
  summary: string | null;
  servings: number | null;
  total_minutes: number | null;
  tags: string;
  ingredients: string;
  steps: string;
  image_url: string | null;
  source: string;
  created_at: string;
};

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function rowToRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    servings: row.servings,
    totalMinutes: row.total_minutes,
    tags: parseJson<string[]>(row.tags, []),
    ingredients: parseJson<RecipeIngredient[]>(row.ingredients, []),
    steps: parseJson<string[]>(row.steps, []),
    imageUrl: row.image_url,
    source: row.source,
    createdAt: row.created_at
  };
}

export async function listRecipes(): Promise<Recipe[]> {
  const db = await getDb();
  const rows = await db.all<RecipeRow[]>("SELECT * FROM recipes ORDER BY title COLLATE NOCASE ASC");
  return rows.map(rowToRecipe);
}

export async function getRecipe(id: number): Promise<Recipe | null> {
  const db = await getDb();
  const row = await db.get<RecipeRow>("SELECT * FROM recipes WHERE id = ?", id);
  return row ? rowToRecipe(row) : null;
}

export async function createRecipe(input: {
  title: string;
  summary?: string | null;
  servings?: number | null;
  totalMinutes?: number | null;
  tags?: string[];
  ingredients?: RecipeIngredient[];
  steps?: string[];
  imageUrl?: string | null;
  source?: string;
}): Promise<Recipe> {
  const db = await getDb();
  const result = await db.run(
    `INSERT INTO recipes (title, summary, servings, total_minutes, tags, ingredients, steps, image_url, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.title.trim(),
    input.summary || null,
    input.servings ?? null,
    input.totalMinutes ?? null,
    JSON.stringify(input.tags || []),
    JSON.stringify(input.ingredients || []),
    JSON.stringify(input.steps || []),
    input.imageUrl || null,
    input.source || "manual"
  );
  const recipe = await getRecipe(Number(result.lastID));
  if (!recipe) throw new Error("Recipe could not be created.");
  return recipe;
}

export async function deleteRecipe(id: number) {
  const db = await getDb();
  // Clear it out of the plan too, rather than leaving empty slots pointing nowhere.
  await db.run("DELETE FROM meal_plan WHERE recipe_id = ?", id);
  await db.run("DELETE FROM recipes WHERE id = ?", id);
}

/** Seven days starting today, so the planner always opens on the week ahead. */
export function planWindow(from = todayIso()): string[] {
  const start = new Date(`${from}T00:00:00`);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day.toLocaleDateString("en-CA");
  });
}

export async function getMealPlan(from = todayIso()): Promise<MealPlanEntry[]> {
  const db = await getDb();
  const days = planWindow(from);
  const rows = await db.all<Array<{ id: number; date: string; slot: string; note: string | null; recipe_id: number | null }>>(
    `SELECT id, date, slot, note, recipe_id FROM meal_plan WHERE date >= ? AND date <= ? ORDER BY date ASC`,
    days[0],
    days[days.length - 1]
  );

  const recipes = await listRecipes();
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));

  return days.map((date) => {
    const row = rows.find((entry) => entry.date === date && entry.slot === "dinner");
    return {
      id: row?.id ?? 0,
      date,
      slot: "dinner",
      note: row?.note ?? null,
      recipe: row?.recipe_id ? byId.get(row.recipe_id) || null : null
    };
  });
}

export async function setMeal(date: string, recipeId: number | null, slot = "dinner") {
  const db = await getDb();
  if (recipeId === null) {
    await db.run("DELETE FROM meal_plan WHERE date = ? AND slot = ?", date, slot);
    return;
  }
  await db.run(
    `INSERT INTO meal_plan (date, slot, recipe_id) VALUES (?, ?, ?)
     ON CONFLICT(date, slot) DO UPDATE SET recipe_id = excluded.recipe_id`,
    date,
    slot,
    recipeId
  );
}

export async function getTonightsMeal(): Promise<MealPlanEntry | null> {
  const plan = await getMealPlan();
  const tonight = plan.find((entry) => entry.date === todayIso());
  return tonight?.recipe ? tonight : null;
}

/**
 * Pushes the planned week's ingredients onto the grocery list. Matching is on
 * name alone, deliberately: the point is to avoid a second "Milk" appearing
 * when one is already on the list, not to reconcile quantities.
 */
export async function pushPlanToGrocery(from = todayIso()): Promise<GroceryPushResult> {
  const [plan, existing] = await Promise.all([getMealPlan(from), listGroceryItems()]);
  const have = new Set(existing.filter((item) => !item.purchased).map((item) => item.name.trim().toLowerCase()));

  // Collapse repeats across the week so three chicken dinners ask for chicken once.
  const wanted = new Map<string, RecipeIngredient>();
  for (const entry of plan) {
    for (const ingredient of entry.recipe?.ingredients || []) {
      const key = ingredient.name.trim().toLowerCase();
      if (!key || wanted.has(key)) continue;
      wanted.set(key, ingredient);
    }
  }

  const added: string[] = [];
  let skipped = 0;
  for (const [key, ingredient] of wanted) {
    if (have.has(key)) {
      skipped += 1;
      continue;
    }
    await createGroceryItem({
      name: ingredient.name.trim(),
      quantity: ingredient.quantity || undefined,
      category: ingredient.category || "Meal plan",
      status: "low"
    });
    added.push(ingredient.name.trim());
  }

  return { added: added.length, skipped, items: added };
}

const RECIPE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "The dish name, four words or fewer." },
    summary: { type: "string", description: "One sentence on what it is and why it works on a weeknight." },
    servings: { type: "number" },
    totalMinutes: { type: "number", description: "Total time from starting to serving." },
    tags: { type: "array", items: { type: "string" }, description: "Two to four short tags, e.g. quick, vegetarian, one pan." },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Just the item, as it would appear on a shopping list. No quantity here." },
          quantity: { type: "string", description: "e.g. 2 lb, 1 bunch, 3 cloves." },
          category: { type: "string", description: "Aisle: Produce, Meat, Dairy, Pantry, Frozen, Bakery." }
        },
        required: ["name", "quantity", "category"],
        additionalProperties: false
      }
    },
    steps: { type: "array", items: { type: "string" }, description: "Five to nine steps, one sentence each." }
  },
  required: ["title", "summary", "servings", "totalMinutes", "tags", "ingredients", "steps"],
  additionalProperties: false
} as const;

let client: Anthropic | null = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: config.anthropic.apiKey });
  return client;
}

export async function generateRecipe(prompt: string): Promise<Recipe> {
  if (!config.anthropic.apiKey) throw new Error("Set ANTHROPIC_API_KEY in .env to generate recipes.");

  const response = await getClient().messages.create({
    model: config.anthropic.model,
    max_tokens: 2000,
    output_config: { format: { type: "json_schema", schema: RECIPE_SCHEMA } },
    system:
      "You write practical family dinner recipes for a household cooking on a weeknight. Real ingredients from an ordinary " +
      "supermarket, no restaurant technique, no unusual equipment. Ingredient names must read like a shopping list entry - " +
      "'chicken thighs', not 'boneless skinless chicken thighs, trimmed' - because they get added to one.",
    messages: [{ role: "user", content: prompt }]
  });

  const text = response.content.find((block): block is Anthropic.TextBlock => block.type === "text")?.text;
  if (!text) throw new Error("The model returned no recipe.");
  const parsed = JSON.parse(text) as Omit<Recipe, "id" | "createdAt" | "source" | "imageUrl">;

  return createRecipe({ ...parsed, source: "ai" });
}

/** Fills empty dinner slots in the week, leaving anything already planned alone. */
export async function suggestWeek(from = todayIso()): Promise<MealPlanEntry[]> {
  const plan = await getMealPlan(from);
  const empty = plan.filter((entry) => !entry.recipe);
  if (!empty.length) return plan;

  const recipes = await listRecipes();
  if (recipes.length) {
    // Prefer what the household already has, and avoid repeating within the week.
    const used = new Set(plan.filter((entry) => entry.recipe).map((entry) => entry.recipe!.id));
    const pool = recipes.filter((recipe) => !used.has(recipe.id));
    for (const entry of empty) {
      const pick = pool.shift();
      if (!pick) break;
      await setMeal(entry.date, pick.id);
    }
  }

  return getMealPlan(from);
}
