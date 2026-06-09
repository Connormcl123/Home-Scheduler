import { createLocalCalendarEvent } from "./localCalendar.js";
import { createTask } from "./tasks.js";

type VoiceTaskInput = {
  title?: string;
  task?: string;
  dueDate?: string;
  priority?: "low" | "normal" | "high";
};

type VoiceEventInput = {
  title?: string;
  event?: string;
  date?: string;
  time?: string;
  start?: string;
  end?: string;
  durationMinutes?: number;
  location?: string;
};

export async function createTaskFromVoice(input: VoiceTaskInput) {
  const title = (input.title || input.task || "").trim();
  if (!title) throw new VoiceCommandError("Task title is required.", 400);
  return createTask({
    title,
    dueDate: input.dueDate,
    priority: input.priority || "normal",
    notes: "Created by Alexa voice command"
  });
}

export async function createCalendarEventFromVoice(input: VoiceEventInput) {
  const title = (input.title || input.event || "").trim();
  if (!title) throw new VoiceCommandError("Calendar event title is required.", 400);

  const start = resolveStart(input);
  const end = input.end ? new Date(input.end) : new Date(start.getTime() + (input.durationMinutes || 60) * 60_000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new VoiceCommandError("Calendar event date or time could not be understood.", 400);

  const event = await createLocalCalendarEvent({
    title,
    start: start.toISOString(),
    end: end.toISOString(),
    location: input.location,
    source: "voice"
  });

  if (!event) throw new VoiceCommandError("Calendar event could not be created.", 500);
  return event;
}

export class VoiceCommandError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function resolveStart(input: VoiceEventInput) {
  if (input.start) return new Date(input.start);

  const date = input.date || new Date().toISOString().slice(0, 10);
  const time = normalizeTime(input.time || "09:00");
  return new Date(`${date}T${time}`);
}

function normalizeTime(time: string) {
  const clean = time.trim().toLowerCase();
  const match = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return clean;

  let hour = Number(match[1]);
  const minute = match[2] || "00";
  const meridiem = match[3];
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return `${hour.toString().padStart(2, "0")}:${minute}:00`;
}
