import type { GroceryItem } from "@mirror-dashboard/shared";

export interface RecipeGroup {
  recipe: string;
  items: GroceryItem[];
}

/**
 * Folds the list by the meal-plan recipe each item was sent from. An item two
 * recipes share sits in both folders (it is still one row on the list); items
 * added by hand stay in `other`. Folders are in name order so they hold still.
 */
export function groupByRecipe(items: GroceryItem[]): { groups: RecipeGroup[]; other: GroceryItem[] } {
  const byRecipe = new Map<string, GroceryItem[]>();
  const other: GroceryItem[] = [];
  for (const item of items) {
    if (!item.recipes?.length) {
      other.push(item);
      continue;
    }
    for (const recipe of item.recipes) byRecipe.set(recipe, [...(byRecipe.get(recipe) ?? []), item]);
  }
  const groups = [...byRecipe.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([recipe, grouped]) => ({ recipe, items: grouped }));
  return { groups, other };
}
