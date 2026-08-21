import type { ApiIntegrationStatus, AssistantChatResponse, AssistantMessage, AssistantStatus, DashboardSummary, FinanceCategoryRule, FinanceTransaction, FinanceWatchlistItem, GroceryItem, GroceryStatus, Note, PersonalFinanceSummary, PlaidConnectionStatus, Priority, RssFeed, Task, TravelInspiration, TravelItineraryResult } from "@mirror-dashboard/shared";

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
  if (!response.ok) {
    // Surface the server's message when it sends one - the kiosk shows this text.
    const detail = await response.json().catch(() => null);
    const message = detail && typeof detail.error === "string" ? detail.error : null;
    throw new Error(message || `${path} failed: ${response.status}`);
  }
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

export function fetchPersonalFinanceSummary() {
  return request<PersonalFinanceSummary>("/api/finance/personal");
}

export function fetchPlaidStatus() {
  return request<PlaidConnectionStatus>("/api/finance/plaid/status");
}

export function createPlaidLinkToken() {
  return request<{ link_token: string }>("/api/finance/plaid/link-token", { method: "POST" });
}

export function exchangePlaidPublicToken(input: { publicToken: string; institutionName?: string }) {
  return request<{ itemId: string; institutionName?: string | null }>("/api/finance/plaid/exchange-public-token", { method: "POST", body: JSON.stringify(input) });
}

export function syncPlaidFinance(input: { forceFull?: boolean } = {}) {
  return request<{ syncedItems: number; forceFull?: boolean; results: Array<{ itemId: string; added: number; modified: number; removed: number }> }>("/api/finance/plaid/sync", { method: "POST", body: JSON.stringify(input) });
}

export function createFinanceCategoryRule(input: { matchText: string; category: string }) {
  return request<FinanceCategoryRule>("/api/finance/category-rules", { method: "POST", body: JSON.stringify(input) });
}

export function updateFinanceTransactionCategory(id: number, input: { category: string; createRule?: boolean; matchText?: string }) {
  return request<FinanceTransaction>(`/api/finance/transactions/${id}/category`, { method: "PATCH", body: JSON.stringify(input) });
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

export function fetchIntegrationStatus() {
  return request<ApiIntegrationStatus>("/api/integrations/status");
}

export function fetchGroceryItems(activeOnly = false) {
  return request<GroceryItem[]>(`/api/grocery${activeOnly ? "?activeOnly=true" : ""}`);
}

export function createGroceryItem(input: { name: string; quantity?: string; category?: string; supplier?: string; status?: GroceryStatus }) {
  return request<GroceryItem>("/api/grocery", { method: "POST", body: JSON.stringify(input) });
}

export function updateGroceryItem(id: number, input: Partial<{ name: string; quantity: string | null; category: string | null; supplier: string | null; status: GroceryStatus; purchased: boolean }>) {
  return request<GroceryItem>(`/api/grocery/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteGroceryItem(id: number) {
  return request<void>(`/api/grocery/${id}`, { method: "DELETE" });
}

export function fetchTravelInspirations() {
  return request<TravelInspiration[]>("/api/travel/inspirations");
}

export function createTravelInspiration(input: { url: string; title: string; location?: string; notes?: string; tags?: string[] }) {
  return request<TravelInspiration>("/api/travel/inspirations", { method: "POST", body: JSON.stringify(input) });
}

export function updateTravelInspiration(id: number, input: Partial<{ url: string; title: string; location: string | null; notes: string | null; tags: string[] }>) {
  return request<TravelInspiration>(`/api/travel/inspirations/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteTravelInspiration(id: number) {
  return request<void>(`/api/travel/inspirations/${id}`, { method: "DELETE" });
}

export function generateTravelItinerary() {
  return request<TravelItineraryResult>("/api/travel/itinerary", { method: "POST" });
}

export function fetchAssistantStatus() {
  return request<AssistantStatus>("/api/assistant/status");
}

export function sendAssistantMessage(message: string, history: AssistantMessage[]) {
  return request<AssistantChatResponse>("/api/assistant/chat", {
    method: "POST",
    body: JSON.stringify({ message, history })
  });
}
