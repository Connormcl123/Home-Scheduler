import type { DashboardSummary, FinanceWatchlistItem, Note, Priority, RssFeed, Task } from "@mirror-dashboard/shared";

export async function fetchDashboard(): Promise<DashboardSummary> {
  const response = await fetch("/api/dashboard");
  if (!response.ok) throw new Error(`Dashboard request failed: ${response.status}`);
  return response.json();
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    ...options,
    headers
  });
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
  if (response.status === 204) return undefined as T;
  return response.json();
}

export function fetchTasks() {
  return request<Task[]>("/api/tasks");
}

export function createTask(input: { title: string; notes?: string; dueDate?: string; priority?: Priority }) {
  return request<Task>("/api/tasks", { method: "POST", body: JSON.stringify(input) });
}

export function updateTask(id: number, input: Partial<{ title: string; notes: string | null; dueDate: string | null; priority: Priority; completed: boolean }>) {
  return request<Task>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteTask(id: number) {
  return request<void>(`/api/tasks/${id}`, { method: "DELETE" });
}

export function fetchNotes() {
  return request<Note[]>("/api/notes");
}

export function fetchNote(date: string) {
  return request<Note | null>(`/api/notes/${date}`);
}

export function saveNote(date: string, body: string) {
  return request<Note>("/api/notes", { method: "POST", body: JSON.stringify({ date, body }) });
}

export function deleteNote(date: string) {
  return request<void>(`/api/notes/${date}`, { method: "DELETE" });
}

export function fetchRssFeeds() {
  return request<RssFeed[]>("/api/rss-feeds");
}

export function createRssFeed(input: { title?: string; url: string; enabled?: boolean }) {
  return request<RssFeed>("/api/rss-feeds", { method: "POST", body: JSON.stringify(input) });
}

export function updateRssFeed(id: number, input: Partial<{ title: string; url: string; enabled: boolean }>) {
  return request<RssFeed>(`/api/rss-feeds/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteRssFeed(id: number) {
  return request<void>(`/api/rss-feeds/${id}`, { method: "DELETE" });
}

export function fetchWatchlist() {
  return request<FinanceWatchlistItem[]>("/api/finance/watchlist");
}

export function createWatchlistItem(input: { symbol: string; enabled?: boolean }) {
  return request<FinanceWatchlistItem>("/api/finance/watchlist", { method: "POST", body: JSON.stringify(input) });
}

export function updateWatchlistItem(id: number, input: Partial<{ symbol: string; enabled: boolean }>) {
  return request<FinanceWatchlistItem>(`/api/finance/watchlist/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteWatchlistItem(id: number) {
  return request<void>(`/api/finance/watchlist/${id}`, { method: "DELETE" });
}
