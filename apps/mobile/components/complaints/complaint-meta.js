export const COMPLAINT_STATUSES = [
  { id: "all", label: "All" },
  { id: "submitted", label: "Open" },
  { id: "in_review", label: "Pending" },
  { id: "in_progress", label: "In Progress" },
  { id: "waiting_on_resident", label: "Waiting" },
  { id: "not_resolved", label: "Not Resolved" },
  { id: "resolved", label: "Resolved" },
  { id: "reopened", label: "Reopened" },
  { id: "closed", label: "Closed" },
  { id: "cancelled", label: "Cancelled" },
];

export const MAINTENANCE_CATEGORIES = [
  ["plumbing", "Plumbing"],
  ["electrical", "Electrical"],
  ["cleaning", "Cleaning"],
  ["lifts", "Lifts"],
  ["parking", "Parking"],
  ["other", "Other"],
];

export const TECHNICAL_CATEGORIES = [
  ["app_bug", "App Bug"],
  ["account", "Account"],
  ["login", "Login"],
  ["payment", "Payment"],
  ["other", "Other"],
];

export const PRIORITIES = [
  ["low", "Low"],
  ["normal", "Normal"],
  ["high", "High"],
  ["urgent", "Urgent"],
];

export const STATUS_ACTION = {
  in_review: "Mark in review",
  in_progress: "Mark in progress",
  waiting_on_resident: "Waiting on resident",
  not_resolved: "Not resolved",
  resolved: "Mark resolved",
  closed: "Confirm resolution",
  cancelled: "Cancel complaint",
  reopened: "Reopen",
};

export function statusColor(status) {
  if (status === "resolved" || status === "closed") return "#059669";
  if (status === "cancelled" || status === "not_resolved" || status === "urgent") return "#E11D48";
  if (status === "requested" || status === "pending" || status === "in_review" || status === "waiting_on_resident" || status === "reopened" || status === "high") return "#D97706";
  if (status === "in_progress") return "#1B4F8A";
  return "#1B4F8A";
}

/** Staff complaint colors: open/requested navy, pending amber, in progress blue, not resolved red, resolved green. */
export function staffStatusTone(status, workflow) {
  const key = workflow || status;
  if (key === "resolved" || key === "closed") return { color: "#059669", bg: "#E7F8EF" };
  if (key === "in_progress") return { color: "#1B4F8A", bg: "#E8F1FA" };
  if (key === "not_resolved" || key === "cancelled") return { color: "#E11D48", bg: "#FDECEC" };
  if (key === "requested" || key === "open" || key === "submitted") return { color: "#1B4F8A", bg: "#E8F1FA" };
  return { color: "#D97706", bg: "#FEF6E7" };
}
