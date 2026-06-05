import type { DashboardSummary } from "@mirror-dashboard/shared";

export async function fetchDashboard(): Promise<DashboardSummary> {
  const response = await fetch("/api/dashboard");
  if (!response.ok) throw new Error(`Dashboard request failed: ${response.status}`);
  return response.json();
}
