import Anthropic from "@anthropic-ai/sdk";
import type { AssistantAction, AssistantChatResponse, AssistantMessage, AssistantStatus } from "@mirror-dashboard/shared";
import { config } from "../config.js";
import { getCalendarEvents } from "./calendar.js";
import { createGroceryItem, listGroceryItems, updateGroceryItem } from "./grocery.js";
import { createLocalCalendarEvent } from "./localCalendar.js";
import { getNoteByDate, upsertNote } from "./notes.js";
import { createTask, deleteTask, listTasks, updateTask } from "./tasks.js";
import { getWeather } from "./weather.js";
import { todayIso } from "../utils/dates.js";

export class AssistantError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type RefreshTarget = AssistantChatResponse["refresh"][number];

type ToolContext = {
  actions: AssistantAction[];
  refresh: Set<RefreshTarget>;
};

type ToolHandler = (input: any, ctx: ToolContext) => Promise<unknown>;

const tools: Anthropic.Tool[] = [
  {
    name: "list_tasks",
    description: "List the household tasks. Use this before completing or deleting a task so you have the right id.",
    input_schema: {
      type: "object",
      properties: {
        todayOnly: { type: "boolean", description: "Only tasks due today or with no due date." }
      }
    }
  },
  {
    name: "create_task",
    description: "Add a task to the household task list.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short description of the task." },
        notes: { type: "string" },
        dueDate: { type: "string", description: "Due date as YYYY-MM-DD." },
        priority: { type: "string", enum: ["low", "normal", "high"] }
      },
      required: ["title"]
    }
  },
  {
    name: "complete_task",
    description: "Mark an existing task complete or incomplete by its id.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "number" },
        completed: { type: "boolean", description: "True to complete, false to reopen. Defaults to true." }
      },
      required: ["id"]
    }
  },
  {
    name: "delete_task",
    description: "Permanently delete a task by id. Only use this when someone clearly asks to remove it.",
    input_schema: {
      type: "object",
      properties: { id: { type: "number" } },
      required: ["id"]
    }
  },
  {
    name: "list_grocery_items",
    description: "List grocery and household supply items being tracked.",
    input_schema: {
      type: "object",
      properties: {
        activeOnly: { type: "boolean", description: "Only items not yet purchased." }
      }
    }
  },
  {
    name: "add_grocery_item",
    description: "Add an item to the grocery and household supply list.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        quantity: { type: "string", description: "For example: 1 gallon, or 2 boxes." },
        category: { type: "string", description: "For example: Dairy, Produce, Household." },
        status: { type: "string", enum: ["low", "out", "ok"] }
      },
      required: ["name"]
    }
  },
  {
    name: "update_grocery_item",
    description: "Update a grocery item by id, most often to mark it purchased or change its status.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "number" },
        purchased: { type: "boolean" },
        status: { type: "string", enum: ["low", "out", "ok"] },
        quantity: { type: "string" }
      },
      required: ["id"]
    }
  },
  {
    name: "list_calendar_events",
    description: "List upcoming calendar events from every connected calendar.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "How many events to return. Defaults to 10." }
      }
    }
  },
  {
    name: "create_calendar_event",
    description: "Add an event to the local household calendar.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        start: { type: "string", description: "Start time as a full ISO 8601 timestamp." },
        end: { type: "string", description: "Optional end time as a full ISO 8601 timestamp." },
        location: { type: "string" }
      },
      required: ["title", "start"]
    }
  },
  {
    name: "get_note",
    description: "Read the daily note for a given date.",
    input_schema: {
      type: "object",
      properties: { date: { type: "string", description: "Date as YYYY-MM-DD. Defaults to today." } }
    }
  },
  {
    name: "save_note",
    description: "Write or replace the daily note for a date. Read the existing note first when adding to it.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date as YYYY-MM-DD. Defaults to today." },
        body: { type: "string" }
      },
      required: ["body"]
    }
  },
  {
    name: "get_weather",
    description: "Get current conditions and the multi-day forecast for home.",
    input_schema: { type: "object", properties: {} }
  }
];

const handlers: Record<string, ToolHandler> = {
  async list_tasks(input) {
    return listTasks(input?.todayOnly ? { today: todayIso() } : {});
  },
  async create_task(input, ctx) {
    const task = await createTask({
      title: String(input.title).trim(),
      notes: input.notes,
      dueDate: input.dueDate,
      priority: input.priority
    });
    ctx.actions.push({ tool: "create_task", summary: `Added task: ${task.title}` });
    ctx.refresh.add("tasks");
    return task;
  },
  async complete_task(input, ctx) {
    const completed = input.completed === undefined ? true : Boolean(input.completed);
    const task = await updateTask(Number(input.id), { completed });
    if (!task) throw new Error(`No task with id ${input.id}.`);
    ctx.actions.push({ tool: "complete_task", summary: `${completed ? "Completed" : "Reopened"}: ${task.title}` });
    ctx.refresh.add("tasks");
    return task;
  },
  async delete_task(input, ctx) {
    await deleteTask(Number(input.id));
    ctx.actions.push({ tool: "delete_task", summary: `Deleted task ${input.id}` });
    ctx.refresh.add("tasks");
    return { deleted: true };
  },
  async list_grocery_items(input) {
    return listGroceryItems({ activeOnly: Boolean(input?.activeOnly) });
  },
  async add_grocery_item(input, ctx) {
    const item = await createGroceryItem({
      name: String(input.name).trim(),
      quantity: input.quantity,
      category: input.category,
      status: input.status
    });
    ctx.actions.push({ tool: "add_grocery_item", summary: `Added ${item.name} to the grocery list` });
    ctx.refresh.add("grocery");
    return item;
  },
  async update_grocery_item(input, ctx) {
    const item = await updateGroceryItem(Number(input.id), {
      purchased: input.purchased,
      status: input.status,
      quantity: input.quantity
    });
    if (!item) throw new Error(`No grocery item with id ${input.id}.`);
    ctx.actions.push({ tool: "update_grocery_item", summary: `Updated ${item.name}` });
    ctx.refresh.add("grocery");
    return item;
  },
  async list_calendar_events(input) {
    const events = await getCalendarEvents();
    return events.slice(0, Number(input?.limit) || 10);
  },
  async create_calendar_event(input, ctx) {
    const start = new Date(input.start);
    if (Number.isNaN(start.getTime())) throw new Error("start must be a valid ISO 8601 timestamp.");
    const event = await createLocalCalendarEvent({
      title: String(input.title).trim(),
      start: start.toISOString(),
      end: input.end ? new Date(input.end).toISOString() : undefined,
      location: input.location,
      source: "local"
    });
    ctx.actions.push({ tool: "create_calendar_event", summary: `Added ${input.title} to the calendar` });
    ctx.refresh.add("calendar");
    return event;
  },
  async get_note(input) {
    return getNoteByDate(input?.date || todayIso());
  },
  async save_note(input, ctx) {
    const date = input.date || todayIso();
    const note = await upsertNote(date, String(input.body));
    ctx.actions.push({ tool: "save_note", summary: `Saved the note for ${date}` });
    ctx.refresh.add("notes");
    return note;
  },
  async get_weather() {
    return getWeather();
  }
};

const SYSTEM_PROMPT = [
  "You are the household assistant built into a family command-center dashboard.",
  "It runs on a wall-mounted touchscreen in the home, so anyone in the household might be talking to you.",
  "",
  "Your tools read and write the same tasks, grocery list, calendar, and daily notes shown on screen.",
  "Use them instead of guessing. When someone asks you to change something, make the change and confirm it",
  "in one short sentence. When you need an id to complete or update something, list the items first and",
  "match on what the person described.",
  "",
  "Keep replies short and speakable, usually one or two sentences, because they are read at a glance from",
  "across the room. Skip preamble and do not restate the question. Use plain language and no markdown.",
  "If a request is ambiguous in a way that changes what you would do, ask one brief clarifying question.",
  "Otherwise make the sensible choice and say what you chose.",
  "",
  "Only delete something when the person clearly asked for it to be removed."
].join("\n");

export function getAssistantStatus(): AssistantStatus {
  if (!config.anthropic.apiKey) {
    return {
      enabled: false,
      model: config.anthropic.model,
      reason: "Set ANTHROPIC_API_KEY in .env to enable the assistant."
    };
  }
  return { enabled: true, model: config.anthropic.model };
}

let client: Anthropic | null = null;

function getClient() {
  if (!client) client = new Anthropic({ apiKey: config.anthropic.apiKey });
  return client;
}

async function buildLiveContext() {
  const now = new Date();
  const [tasks, grocery, events, note] = await Promise.all([
    listTasks({ today: todayIso() }),
    listGroceryItems({ activeOnly: true }),
    getCalendarEvents(),
    getNoteByDate(todayIso())
  ]);

  const openTasks = tasks
    .filter((task) => !task.completed)
    .slice(0, 10)
    .map((task) => `- [${task.id}] ${task.title}${task.dueDate ? ` (due ${task.dueDate})` : ""}`)
    .join("\n");

  const groceryLines = grocery
    .slice(0, 15)
    .map((item) => `- [${item.id}] ${item.name}${item.quantity ? ` (${item.quantity})` : ""} - ${item.status}`)
    .join("\n");

  const eventLines = events
    .slice(0, 6)
    .map((event) => `- ${new Date(event.start).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })} ${event.title}`)
    .join("\n");

  return [
    `Right now it is ${now.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}.`,
    `Today's date is ${todayIso()}.`,
    "",
    "Open tasks:",
    openTasks || "- none",
    "",
    "Grocery list:",
    groceryLines || "- none",
    "",
    "Next calendar events:",
    eventLines || "- none",
    "",
    note ? `Today's note: ${note.body}` : "No note saved for today."
  ].join("\n");
}

/** Turns SDK/network failures into something readable on a wall display. */
function toAssistantError(error: unknown): AssistantError {
  if (error instanceof AssistantError) return error;

  if (error instanceof Anthropic.APIError) {
    const detail = `${error.message ?? ""} ${JSON.stringify((error as { error?: unknown }).error ?? "")}`;
    if (/credit balance/i.test(detail)) {
      return new AssistantError("The assistant is out of Anthropic API credits. Add credits in the Anthropic Console to turn it back on.", 402);
    }
    if (error.status === 401 || error.status === 403) {
      return new AssistantError("Anthropic rejected the API key. Check ANTHROPIC_API_KEY in .env.", 401);
    }
    if (error.status === 429) {
      return new AssistantError("The assistant is being rate limited. Try again in a moment.", 429);
    }
    if (typeof error.status === "number" && error.status >= 500) {
      return new AssistantError("Anthropic is having trouble right now. Try again shortly.", 503);
    }
    return new AssistantError("The assistant could not complete that request.", 502);
  }

  return new AssistantError("The assistant is unreachable. Check the Pi's network connection.", 503);
}

/**
 * The agent loop is written out here rather than using the SDK's beta tool
 * runner: this dashboard is a long-lived appliance, so it stays on the stable
 * Messages API, and the loop records every mutation for the UI to refresh.
 */
export async function runAssistantTurn(history: AssistantMessage[], userMessage: string): Promise<AssistantChatResponse> {
  const status = getAssistantStatus();
  if (!status.enabled) throw new AssistantError(status.reason || "Assistant is not configured.", 503);

  const ctx: ToolContext = { actions: [], refresh: new Set() };
  const liveContext = await buildLiveContext();

  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-12).map((message) => ({ role: message.role, content: message.content })),
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text: `Current dashboard state:\n${liveContext}` },
        { type: "text" as const, text: userMessage }
      ]
    }
  ];

  let reply = "";

  for (let turn = 0; turn < 6; turn += 1) {
    let response: Anthropic.Message;
    try {
      response = await getClient().messages.create({
        model: config.anthropic.model,
        max_tokens: 8192,
        output_config: { effort: config.anthropic.effort as "low" | "medium" | "high" },
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools,
        messages
      });
    } catch (error) {
      throw toAssistantError(error);
    }

    if (response.stop_reason === "refusal") {
      reply = "Sorry, I can't help with that one.";
      break;
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    if (text) reply = text;

    const toolUses = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
    if (!toolUses.length) break;

    messages.push({ role: "assistant", content: response.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      const handler = handlers[toolUse.name];
      try {
        if (!handler) throw new Error(`Unknown tool ${toolUse.name}.`);
        const result = await handler(toolUse.input ?? {}, ctx);
        results.push({ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(result ?? null) });
      } catch (error) {
        results.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: error instanceof Error ? error.message : "Tool failed.",
          is_error: true
        });
      }
    }

    messages.push({ role: "user", content: results });
  }

  if (ctx.refresh.size) ctx.refresh.add("dashboard");

  return {
    reply: reply || "Done.",
    actions: ctx.actions,
    refresh: Array.from(ctx.refresh)
  };
}
