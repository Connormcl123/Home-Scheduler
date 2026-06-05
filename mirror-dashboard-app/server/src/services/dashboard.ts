import type { DashboardSummary } from "@mirror-dashboard/shared";
import { getCalendarEvents } from "./calendar.js";
import { getFinanceSummary } from "./finance/index.js";
import { getNews } from "./news.js";
import { getTodayNote } from "./notes.js";
import { listTasks } from "./tasks.js";
import { getWeather } from "./weather.js";
import { todayIso } from "../utils/dates.js";

export async function getDashboard(): Promise<DashboardSummary> {
  const [calendar, tasks, todayNote, weather, news, finance] = await Promise.all([
    getCalendarEvents(),
    listTasks({ today: todayIso() }),
    getTodayNote(),
    getWeather(),
    getNews(),
    getFinanceSummary()
  ]);

  return {
    generatedAt: new Date().toISOString(),
    calendar: calendar.slice(0, 8),
    tasks: tasks.slice(0, 8),
    todayNote,
    weather,
    news,
    finance
  };
}
