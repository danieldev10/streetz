import type { SupportPriority, SupportRequestCategory, SupportRequestStatus } from "@/lib/types";
import { supportCategories, supportStatusLabels } from "@/features/support/support-content";

export const supportStatuses: SupportRequestStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_ON_USER", "RESOLVED", "CLOSED"];
export const supportPriorities: SupportPriority[] = ["URGENT", "HIGH", "NORMAL"];
export const adminSupportStatusLabels = { ...supportStatusLabels, WAITING_ON_USER: "Waiting on user" };

type AdminSupportFilters = {
  status: SupportRequestStatus | "";
  category: SupportRequestCategory | "";
  priority: SupportPriority | "";
};

export function getAdminSupportFilters(params: Pick<URLSearchParams, "get">): AdminSupportFilters {
  const status = params.get("status");
  const category = params.get("category");
  const priority = params.get("priority");
  return {
    status: supportStatuses.find((value) => value === status) ?? "",
    category: supportCategories.find((value) => value.id === category)?.id ?? "",
    priority: supportPriorities.find((value) => value === priority) ?? "",
  };
}

export function adminSupportQuery(filters: AdminSupportFilters) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.category) params.set("category", filters.category);
  if (filters.priority) params.set("priority", filters.priority);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function formatSupportDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(new Date(value));
}

export function supportPriorityClass(priority: SupportPriority) {
  if (priority === "URGENT") return "bg-danger-tint text-danger";
  if (priority === "HIGH") return "bg-warning-tint text-warning";
  return "bg-black/5 text-ink-600";
}
