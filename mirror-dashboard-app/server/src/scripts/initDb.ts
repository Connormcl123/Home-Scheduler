import { getDb } from "../db.js";

const db = await getDb();
const row = await db.get<{ ok: number }>("SELECT 1 as ok");
console.log(`SQLite initialized (${row?.ok === 1 ? "ok" : "unknown"})`);
