import apiClient from "./apiClient";
import { isAdminRole, normalizeBranchId } from "./branch-utils";

export const DASHBOARD_STATS_REFRESH_EVENT = "dashboard-stats-refresh";

/** Admin users have no branch — always fetch org-wide totals. */
export function getDashboardStatsParams(): Record<string, string> | undefined {
  if (typeof window === "undefined") return undefined;

  const role = localStorage.getItem("role");
  if (isAdminRole(role)) return undefined;

  const branchId = normalizeBranchId(localStorage.getItem("branch"));
  return branchId ? { branchId } : undefined;
}

export async function fetchDashboardStatsFresh() {
  const params = getDashboardStatsParams();
  const response = await apiClient.get("/dashboard/stats", { params });
  return response?.data?.data ?? null;
}

export function notifyDashboardStatsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DASHBOARD_STATS_REFRESH_EVENT));
}
