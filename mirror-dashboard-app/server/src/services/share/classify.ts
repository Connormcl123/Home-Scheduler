import Anthropic from "@anthropic-ai/sdk";
import type { RecipeIngredient } from "@mirror-dashboard/shared";
import { config } from "../../config.js";

export type ShareExtraction =
  | { kind: "recipe"; title: string; summary: string | null; sourceName: string | null; servings: number | null; totalMinutes: number | null; tags: string[]; ingredients: RecipeIngredient[]; steps: string[] }
  | { kind: "trip"; title: string; summary: string | null; sourceName: string | null; location: string | null; notes: string | null; tags: string[] }
  | { kind: "neither"; title: string | null };

export class ClassifyUnavailableError extends Error {}

export type CreateMessage = (
  body: Anthropic.MessageCreateParamsNonStreaming,
  options?: { timeout?: number; maxRetries?: number }
) => Promise<Pick<Anthropic.Message, "content">>;

// Structured outputs have no nulls here: 0 and "" mean unknown, and toExtraction turns them into null.
const SHARE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ["recipe", "trip", "neither"] },
    title: { type: "string" },
    summary: { type: "string", description: "One sentence, or empty." },
    sourceName: { type: "string", description: "Who made it, e.g. 'heresyourbite on Instagram' or 'Budget Bytes'. Empty if unknown." },
    servings: { type: "integer", description: "0 if unknown." },
    totalMinutes: { type: "integer", description: "0 if unknown." },
    tags: { type: "array", items: { type: "string" } },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", description: "Just the item, as on a shopping list. No quantity." },
          quantity: { type: "string", description: "e.g. 2 tbsp, 1 bunch. Empty if none." },
          category: { type: "string", enum: ["Produce", "Meat", "Dairy", "Pantry", "Frozen", "Bakery"] }
        },
        required: ["name", "quantity", "category"]
      }
    },
    steps: { type: "array", items: { type: "string" } },
    location: { type: "string", description: "Trips only: the place. Empty otherwise." },
    notes: { type: "string", description: "Trips only: what makes it worth going. Empty otherwise." }
  },
  required: ["kind", "title", "summary", "sourceName", "servings", "totalMinutes", "tags", "ingredients", "steps", "location", "notes"]
};

const SYSTEM =
  "Someone shared this page or social media caption to their family kitchen display. Decide what it is. " +
  "kind=recipe when it describes a dish to cook and lists ingredients. kind=trip when it is about a place to visit: " +
  "a destination, a town, a hotel, a park, an attraction. Otherwise kind=neither. " +
  "For recipes, ingredient names read like a shopping-list entry ('chicken breasts', not 'boneless skinless chicken breasts, trimmed'), " +
  "quantity holds the amount and unit, and category is the supermarket aisle. " +
  "Copy the method only from the source. If the source has no method (for example 'full recipe in my bio'), return an empty steps array. " +
  "Never write steps yourself. Use 0 for unknown numbers and an empty string for unknown text.";

let client: Anthropic | null = null;
const defaultCreate: CreateMessage = (body, options) => {
  if (!client) client = new Anthropic({ apiKey: config.anthropic.apiKey });
  return client.messages.create(body, options);
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(str).filter((entry): entry is string => entry !== null) : [];
}

export function toExtraction(raw: unknown): ShareExtraction {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const title = str(record.title);
  if (record.kind === "recipe" && title) {
    const ingredients: RecipeIngredient[] = Array.isArray(record.ingredients)
      ? record.ingredients.flatMap((item) => {
          const entry = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
          const name = str(entry.name);
          return name ? [{ name, quantity: str(entry.quantity), category: str(entry.category) }] : [];
        })
      : [];
    if (ingredients.length) {
      return {
        kind: "recipe", title, summary: str(record.summary), sourceName: str(record.sourceName),
        servings: positive(record.servings), totalMinutes: positive(record.totalMinutes),
        tags: strings(record.tags).slice(0, 4), ingredients, steps: strings(record.steps)
      };
    }
  }
  if (record.kind === "trip" && title) {
    return {
      kind: "trip", title, summary: str(record.summary), sourceName: str(record.sourceName),
      location: str(record.location), notes: str(record.notes), tags: strings(record.tags).slice(0, 6)
    };
  }
  return { kind: "neither", title };
}

export async function classifyShare(
  input: { url: string | null; text: string; forceKind?: "recipe" | "trip" },
  create?: CreateMessage
): Promise<ShareExtraction> {
  if (!create && !config.anthropic.apiKey) throw new ClassifyUnavailableError("ANTHROPIC_API_KEY is not set.");
  const system = input.forceKind
    ? `${SYSTEM} The person says this is a ${input.forceKind}; extract it as kind=${input.forceKind}.`
    : SYSTEM;
  let response: Pick<Anthropic.Message, "content">;
  try {
    response = await (create ?? defaultCreate)(
      {
        model: config.anthropic.model,
        max_tokens: 3000,
        output_config: { format: { type: "json_schema", schema: SHARE_SCHEMA } },
        system,
        messages: [{ role: "user", content: `${input.url ? `Link: ${input.url}\n\n` : ""}${input.text.slice(0, 20000)}` }]
      },
      { timeout: 12_000, maxRetries: 0 }
    );
  } catch (error) {
    throw new ClassifyUnavailableError(error instanceof Error ? error.message : "Claude could not be reached.");
  }
  const text = response.content.find((block): block is Anthropic.TextBlock => block.type === "text")?.text;
  if (!text) throw new ClassifyUnavailableError("Claude returned no answer.");
  try {
    return toExtraction(JSON.parse(text));
  } catch {
    throw new ClassifyUnavailableError("Claude's answer was not valid JSON.");
  }
}
