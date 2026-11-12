export const COMPLAINT_STATUSES = [
  { id: "all", label: "All" },
  { id: "submitted", label: "Submitted" },
  { id: "in_review", label: "In Review" },
  { id: "in_progress", label: "In Progress" },
  { id: "waiting_on_resident", label: "Waiting" },
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
  resolved: "Mark resolved",
  closed: "Confirm resolution",
  cancelled: "Cancel complaint",
  reopened: "Reopen",
};

export function statusColor(status) {
  if (status === "resolved") return "#059669";
  if (status === "cancelled") return "#E11D48";
  if (status === "waiting_on_resident" || status === "high") return "#D97706";
  if (status === "urgent") return "#E11D48";
  if (status === "reopened" || status === "in_progress") return "#0891B2";
  return "#1B4F8A";
}
