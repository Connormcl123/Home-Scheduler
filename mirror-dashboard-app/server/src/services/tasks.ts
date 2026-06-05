import type { Priority, Task } from "@mirror-dashboard/shared";
import { getDb } from "../db.js";

function rowToTask(row: any): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    dueDate: row.due_date,
    priority: row.priority,
    completed: Boolean(row.completed),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listTasks(filter: { today?: string } = {}) {
  const db = await getDb();
  const rows = filter.today
    ? await db.all("SELECT * FROM tasks WHERE due_date IS NULL OR due_date <= ? ORDER BY completed ASC, due_date ASC, priority DESC, id DESC", filter.today)
    : await db.all("SELECT * FROM tasks ORDER BY completed ASC, due_date ASC, id DESC");
  return rows.map(rowToTask);
}

export async function createTask(input: { title: string; notes?: string; dueDate?: string; priority?: Priority }) {
  const db = await getDb();
  const result = await db.run(
    "INSERT INTO tasks (title, notes, due_date, priority) VALUES (?, ?, ?, ?)",
    input.title,
    input.notes || null,
    input.dueDate || null,
    input.priority || "normal"
  );
  const row = await db.get("SELECT * FROM tasks WHERE id = ?", result.lastID);
  return rowToTask(row);
}

export async function updateTask(id: number, input: Partial<{ title: string; notes: string | null; dueDate: string | null; priority: Priority; completed: boolean }>) {
  const db = await getDb();
  const current = await db.get("SELECT * FROM tasks WHERE id = ?", id);
  if (!current) return null;

  await db.run(
    `UPDATE tasks
     SET title = ?, notes = ?, due_date = ?, priority = ?, completed = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    input.title ?? current.title,
    input.notes === undefined ? current.notes : input.notes,
    input.dueDate === undefined ? current.due_date : input.dueDate,
    input.priority ?? current.priority,
    input.completed === undefined ? current.completed : Number(input.completed),
    id
  );

  const row = await db.get("SELECT * FROM tasks WHERE id = ?", id);
  return rowToTask(row);
}

export async function deleteTask(id: number) {
  const db = await getDb();
  await db.run("DELETE FROM tasks WHERE id = ?", id);
}
