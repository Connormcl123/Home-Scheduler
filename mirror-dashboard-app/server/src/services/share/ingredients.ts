import type { RecipeIngredient } from "@mirror-dashboard/shared";

const NUMBER = "(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?|[¼½¾⅓⅔⅛])";
const QUANTITY = `${NUMBER}(?:\\s*(?:-|–|to)\\s*${NUMBER})?`;
const UNIT = [
  "cups?", "tablespoons?", "tbsps?", "tbsp", "teaspoons?", "tsps?", "tsp", "pounds?", "lbs?", "lb", "ounces?", "oz",
  "grams?", "g", "kilograms?", "kg", "ml", "milliliters?", "liters?", "l", "cloves?", "cans?", "packages?", "pkgs?",
  "sticks?", "bunch(?:es)?", "slices?", "pinch(?:es)?", "dash(?:es)?", "stalks?", "heads?", "quarts?", "pints?",
  "large", "medium", "small"
].join("|");
const LINE = new RegExp(`^\\s*(${QUANTITY})\\s*(?:(${UNIT})\\.?(?=\\s|$))?\\s*(?:of\\s+)?(.+)$`, "i");

// Order matters: "chicken broth" is Pantry, not Meat; "frozen peas" is Frozen, not Produce.
const AISLES: Array<[string, RegExp]> = [
  ["Frozen", /\bfrozen\b/i],
  ["Pantry", /\b(salt|broth|stock|bouillon|peanut butter|pepper flakes|black pepper|chili powder|garlic powder|onion powder|seasoning|spice)\b/i],
  ["Meat", /\b(chicken|beef|pork|turkey|sausage|bacon|ham|lamb|steak|shrimp|salmon|fish|tuna|cod|tilapia|prosciutto|chorizo)\b/i],
  ["Dairy", /\b(milk|cream|butter|cheese|cheddar|parmesan|mozzarella|yogurt|eggs?|half-and-half|ricotta|feta)\b/i],
  ["Bakery", /\b(bread|buns?|rolls?|tortillas?|baguette|pita|naan|bagels?)\b/i],
  ["Produce", /\b(onions?|garlic|carrots?|celery|potato(?:es)?|tomato(?:es)?|peppers?|lettuce|spinach|kale|lemons?|limes?|apples?|bananas?|avocados?|cilantro|parsley|basil|mushrooms?|zucchini|broccoli|cucumbers?|ginger|scallions?|green onions?|jalape[nñ]os?|thyme|rosemary|berries|corn)\b/i],
  ["Pantry", /\b(flour|sugar|salt|oil|vinegar|rice|pasta|noodles?|beans?|lentils?|paprika|cumin|oregano|chili|sauce|honey|syrup|yeast|baking|cornstarch|wine|canned|oats)\b/i]
];

export function aisleFor(name: string): string | null {
  for (const [aisle, pattern] of AISLES) if (pattern.test(name)) return aisle;
  return null;
}

/** "2 tbsp butter" becomes { quantity: "2 tbsp", name: "butter" }. The name is cut at the first comma or bracket so it reads like a shopping-list entry. */
export function splitIngredient(line: string): RecipeIngredient {
  const text = line.replace(/\s+/g, " ").trim();
  const match = text.match(LINE);
  const quantity = match ? [match[1], match[2]].filter(Boolean).join(" ").trim() : null;
  const rest = match ? match[3] : text;
  const name = rest.split(/[,(]/)[0].trim() || rest.trim();
  return { name, quantity, category: aisleFor(name) };
}
