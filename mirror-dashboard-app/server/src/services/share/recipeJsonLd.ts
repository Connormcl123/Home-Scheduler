import { decodeEntities } from "./html.js";

export type ParsedRecipe = {
  title: string;
  summary: string | null;
  servings: number | null;
  totalMinutes: number | null;
  ingredientLines: string[];
  steps: string[];
  imageUrl: string | null;
  author: string | null;
  tags: string[];
};

type Node = Record<string, unknown>;

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  return decodeEntities(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function isType(node: unknown, type: string): boolean {
  if (!node || typeof node !== "object") return false;
  return asArray((node as Node)["@type"]).some((entry) => typeof entry === "string" && entry.toLowerCase() === type.toLowerCase());
}

function findRecipeNode(data: unknown): Node | null {
  for (const node of asArray(data)) {
    if (!node || typeof node !== "object") continue;
    if (isType(node, "Recipe")) return node as Node;
    const found = findRecipeNode((node as Node)["@graph"]);
    if (found) return found;
  }
  return null;
}

export function parseIsoDuration(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  const match = trimmed.match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!match || trimmed === "P" || trimmed === "PT") return null;
  const minutes = Number(match[1] || 0) * 1440 + Number(match[2] || 0) * 60 + Number(match[3] || 0) + Number(match[4] || 0) / 60;
  return minutes > 0 ? Math.round(minutes) : null;
}

export function parseYield(value: unknown): number | null {
  const first = asArray(value)[0];
  if (typeof first === "number") return first > 0 ? Math.round(first) : null;
  if (typeof first !== "string") return null;
  const match = first.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function stepsFrom(value: unknown): string[] {
  const steps: string[] = [];
  for (const item of asArray(value)) {
    if (typeof item === "string") {
      steps.push(...item.split(/\n+/).map(clean).filter(Boolean));
    } else if (isType(item, "HowToSection")) {
      steps.push(...stepsFrom((item as Node).itemListElement));
    } else if (item && typeof item === "object") {
      const text = clean((item as Node).text ?? (item as Node).name);
      if (text) steps.push(text);
    }
  }
  return steps;
}

function imageFrom(value: unknown): string | null {
  const first = asArray(value)[0];
  if (typeof first === "string") return first;
  if (first && typeof first === "object" && typeof (first as Node).url === "string") return (first as Node).url as string;
  return null;
}

function authorFrom(value: unknown): string | null {
  const first = asArray(value)[0];
  if (typeof first === "string") return clean(first) || null;
  if (first && typeof first === "object") return clean((first as Node).name) || null;
  return null;
}

function addMinutes(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

/** The first schema.org Recipe on the page with a title and at least one ingredient, or null. */
export function findJsonLdRecipe(html: string): ParsedRecipe | null {
  const blocks = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(block[1].trim());
    } catch {
      continue;
    }
    const node = findRecipeNode(data);
    if (!node) continue;
    const title = clean(node.name);
    const ingredientLines = asArray(node.recipeIngredient).map(clean).filter(Boolean);
    if (!title || !ingredientLines.length) continue;
    return {
      title,
      summary: clean(node.description) || null,
      servings: parseYield(node.recipeYield),
      totalMinutes: parseIsoDuration(node.totalTime) ?? addMinutes(parseIsoDuration(node.prepTime), parseIsoDuration(node.cookTime)),
      ingredientLines,
      steps: stepsFrom(node.recipeInstructions),
      imageUrl: imageFrom(node.image),
      author: authorFrom(node.author),
      tags: [...asArray(node.recipeCategory), ...asArray(node.recipeCuisine)].map(clean).filter(Boolean).slice(0, 4)
    };
  }
  return null;
}
