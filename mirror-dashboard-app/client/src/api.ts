import type { BudgetSummary, BudgetView, TripArrangements, TripPlan, TripSelection, ShareImport, ShareKind, ShareResult, ApiIntegrationStatus, CalendarEvent, GroceryPushResult, MealPlanEntry, Recipe, HomePulse, MorningStory, TravelDealsResponse, AssistantChatResponse, AssistantConversation, AssistantConversationSummary, AssistantStatus, DashboardSummary, FinanceCategoryRule, FinanceTransaction, FinanceWatchlistItem, GroceryItem, GroceryStatus, Note, PersonalFinanceSummary, PlaidConnectionStatus, Priority, RssFeed, Task, TravelInspiration, TravelItineraryResult, PackageEventsResponse, PackagesResponse, ScreensaverSettings } from "@mirror-dashboard/shared";

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
    const message = detail && typeof detail.error === "string" ? detail.error : detail && typeof detail.message === "string" ? detail.message : null;
    throw new Error(message || `${path} failed: ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export function fetchTasks() {
  return request<Task[]>("/api/tasks");
}

/** The same list the dashboard summary carries: due today or earlier, or undated. */
export function fetchTodayTasks() {
  return request<Task[]>("/api/tasks?today=true");
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

export function fetchBudgets() {
  return request<BudgetSummary>("/api/finance/budgets");
}

export function saveBudget(input: { category: string; limitAmount: number }) {
  return request<BudgetView>("/api/finance/budgets", { method: "POST", body: JSON.stringify(input) });
}

export function updateBudget(id: number, input: { limitAmount?: number; category?: string }) {
  return request<BudgetView>(`/api/finance/budgets/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteBudget(id: number) {
  return request<void>(`/api/finance/budgets/${id}`, { method: "DELETE" });
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

export function fetchScreensaver() {
  return request<ScreensaverSettings>("/api/screensaver");
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

export function clearGroceryList() {
  return request<{ ok: true; deleted: number }>("/api/grocery", { method: "DELETE" });
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

export function sendAssistantMessage(message: string, conversationId: number | null) {
  return request<AssistantChatResponse>("/api/assistant/chat", {
    method: "POST",
    body: JSON.stringify({ message, conversationId })
  });
}

export function fetchAssistantConversations() {
  return request<AssistantConversationSummary[]>("/api/assistant/conversations");
}

export function fetchAssistantConversation(id: number) {
  return request<AssistantConversation>(`/api/assistant/conversations/${id}`);
}

export async function deleteAssistantConversation(id: number) {
  const response = await fetch(`/api/assistant/conversations/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Could not delete the chat (${response.status}).`);
}

export function fetchTripArrangements(dealId: number, input: { adults: number; children: number; weekShift: number }) {
  const query = new URLSearchParams({ adults: String(input.adults), children: String(input.children), weekShift: String(input.weekShift) });
  return request<TripArrangements>(`/api/travel/deals/${dealId}/arrangements?${query.toString()}`);
}

export function commitTrip(input: { dealId: number; selection: TripSelection; weekShift: number; travelers: { adults: number; children: number } }) {
  return request<TripPlan>("/api/travel/trips", { method: "POST", body: JSON.stringify(input) });
}

export function fetchTripPlans() {
  return request<TripPlan[]>("/api/travel/trips");
}

export function fetchTravelDeals() {
  return request<TravelDealsResponse>("/api/travel/deals");
}

export function refreshTravelDeals() {
  return request<TravelDealsResponse>("/api/travel/deals/refresh", { method: "POST" });
}

export function moveCalendarEvent(id: string, start: string, end?: string | null) {
  return request<CalendarEvent[]>(`/api/calendar/events/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ start, end })
  });
}

export function fetchCalendarEvents() {
  return request<CalendarEvent[]>("/api/calendar/events");
}

export function fetchRecipes() {
  return request<Recipe[]>("/api/recipes");
}

export function generateRecipe(prompt: string) {
  return request<Recipe>("/api/recipes/generate", { method: "POST", body: JSON.stringify({ prompt }) });
}

export function deleteRecipe(id: number) {
  return request<void>(`/api/recipes/${id}`, { method: "DELETE" });
}

export function fetchMealPlan() {
  return request<MealPlanEntry[]>("/api/meal-plan");
}

export function setMealPlan(date: string, recipeId: number | null) {
  return request<MealPlanEntry[]>(`/api/meal-plan/${date}`, { method: "PUT", body: JSON.stringify({ recipeId }) });
}

export function pushPlanToGrocery() {
  return request<GroceryPushResult>("/api/meal-plan/grocery", { method: "POST" });
}

export function fetchHomePulse() {
  return request<HomePulse>("/api/home/pulse");
}

export function fetchMorningStory() {
  return request<MorningStory | null>("/api/home/story");
}

export function fetchRecentShares(after?: number) {
  return request<ShareImport[]>(`/api/share/recent${after ? `?after=${after}` : ""}`);
}

export function retryShare(id: number) {
  return request<ShareResult>(`/api/share/${id}/retry`, { method: "POST" });
}

export function moveSharedItem(from: ShareKind, id: number, to: ShareKind) {
  return request<ShareResult>("/api/share/move", { method: "POST", body: JSON.stringify({ from, id, to }) });
}

export function fetchPackages() {
  return request<PackagesResponse>("/api/packages");
}

export function checkPackagesNow() {
  return request<PackagesResponse>("/api/packages/check", { method: "POST" });
}

export function hidePackage(id: number) {
  return request<PackagesResponse>(`/api/packages/${id}/hide`, { method: "POST" });
}

/** Without `after`, only where the event list ends (the banner starts there). */
export function fetchPackageEvents(after?: number) {
  return request<PackageEventsResponse>(`/api/packages/events${after !== undefined ? `?after=${after}` : ""}`);
}
