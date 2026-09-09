/**
 * Development seed. Fills the panels with plausible household data so the UI
 * can be judged against something realistic instead of empty lists.
 *
 * Every table is skipped if it already holds rows, so running this against a
 * database restored from the Pi will not overwrite anything real.
 */
import { getDb } from "../db.js";
import { todayIso } from "../utils/dates.js";

const db = await getDb();

function atHour(dayOffset: number, hour: number, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

async function isEmpty(table: string) {
  const row = await db.get<{ count: number }>(`SELECT COUNT(*) as count FROM ${table}`);
  return (row?.count ?? 0) === 0;
}

if (await isEmpty("tasks")) {
  const tasks: Array<[string, string | null, string | null, string]> = [
    ["Sign the school permission slip", "Due back Friday", todayIso(), "high"],
    ["Water the plants", null, todayIso(), "normal"],
    ["Book the dentist for Ella", "Six month check up", null, "normal"],
    ["Change the furnace filter", "Size 16x25x1", null, "low"],
    ["Return the library books", "Two overdue", todayIso(), "high"]
  ];
  for (const [title, notes, dueDate, priority] of tasks) {
    await db.run("INSERT INTO tasks (title, notes, due_date, priority) VALUES (?, ?, ?, ?)", title, notes, dueDate, priority);
  }
  console.log(`Seeded ${tasks.length} tasks`);
}

if (await isEmpty("grocery_items")) {
  const items: Array<[string, string | null, string, string]> = [
    ["Milk", "1 gallon", "Dairy", "out"],
    ["Eggs", "2 dozen", "Dairy", "low"],
    ["Coffee beans", "1 bag", "Pantry", "low"],
    ["Bananas", null, "Produce", "low"],
    ["Dish soap", null, "Household", "out"],
    ["Chicken thighs", "3 lb", "Meat", "ok"],
    ["Paper towels", "6 pack", "Household", "low"]
  ];
  for (const [name, quantity, category, status] of items) {
    await db.run("INSERT INTO grocery_items (name, quantity, category, status) VALUES (?, ?, ?, ?)", name, quantity, category, status);
  }
  console.log(`Seeded ${items.length} grocery items`);
}

if (await isEmpty("local_calendar_events")) {
  const events: Array<[string, string, string, string | null]> = [
    ["Breakfast reset", atHour(0, 8, 30), atHour(0, 9, 0), null],
    ["School pickup", atHour(0, 15, 10), atHour(0, 15, 40), "Oakridge Elementary"],
    ["Soccer practice", atHour(1, 17, 0), atHour(1, 18, 30), "Field 3"],
    ["Family dinner", atHour(1, 18, 30), atHour(1, 20, 0), null],
    ["Grocery pickup", atHour(2, 17, 0), atHour(2, 17, 30), "Kroger on Main"],
    ["Weekend planning", atHour(3, 10, 0), atHour(3, 11, 0), null]
  ];
  for (const [title, start, end, location] of events) {
    await db.run(
      "INSERT INTO local_calendar_events (title, start, end, location, source) VALUES (?, ?, ?, ?, 'local')",
      title, start, end, location
    );
  }
  console.log(`Seeded ${events.length} calendar events`);
}

if (await isEmpty("notes")) {
  await db.run(
    "INSERT INTO notes (date, body) VALUES (?, ?)",
    todayIso(),
    "Plumber coming Thursday between 9 and 11. Ella needs her cleats washed before practice."
  );
  console.log("Seeded today's note");
}

console.log("Dev seed complete.");
