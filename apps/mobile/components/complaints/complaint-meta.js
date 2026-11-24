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
  ["plumbing", "Plumbing", "Water leakage, drainage, and pipe issues."],
  ["electrical", "Electrical", "Power failures, wiring, and lighting issues."],
  ["cleaning", "Cleaning & Sanitation", "Garbage, cleanliness, and hygiene issues."],
  ["lifts", "Elevators / Lifts", "Elevator breakdowns and maintenance."],
  ["parking", "Parking", "Parking violations and blocked spaces."],
  ["security_safety", "Security & Safety", "Security concerns and unauthorized access."],
  ["noise_disturbance", "Noise Disturbance", "Loud music and excessive noise."],
  ["common_areas", "Common Areas & Amenities", "Shared facility issues."],
  ["building_maintenance", "Building Maintenance", "Structural damage and general repairs."],
  ["landscaping", "Landscaping & Outdoor Areas", "Gardens and outdoor maintenance."],
  ["pest_control", "Pest Control", "Rodents, insects, and infestations."],
  ["billing_payments", "Billing & Payments", "Incorrect charges and payment issues."],
  ["resident_behavior", "Resident Behavior", "Neighbor disputes and rule violations."],
  ["other", "Other", "Complaints not covered by existing categories."],
];

export const TECHNICAL_CATEGORIES = [
  ["app_bug", "App Bug", "Something in the app is not working as expected."],
  ["login", "Login & Authentication", "Trouble signing in or verifying an account."],
  ["account", "Account & Access", "Account details, permissions, or access problems."],
  ["performance", "Performance Issues", "The app is slow, freezing, or unresponsive."],
  ["payment", "Payment Technical Issues", "A payment failed or did not show correctly in the app."],
  ["notifications", "Notification Issues", "Missing, delayed, or incorrect notifications."],
  ["data_display", "Data & Display Issues", "Information looks wrong or does not display correctly."],
  ["file_upload", "File & Upload Issues", "A file will not upload, open, or download."],
  ["other", "Other Technical Issues", "A technical problem that does not fit the other categories."],
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
  if (status === "requested") return "#6D28D9";
  if (status === "pending" || status === "in_review" || status === "waiting_on_resident" || status === "reopened" || status === "high") return "#D97706";
  if (status === "in_progress") return "#1B4F8A";
  return "#1B4F8A";
}

/** Staff complaint colors: requested purple, in progress blue, pending amber, not resolved red, resolved green. */
export function staffStatusTone(status, workflow) {
  const key = workflow || status;
  if (key === "resolved" || key === "closed") return { color: "#059669", bg: "#E7F8EF" };
  if (key === "in_progress") return { color: "#1B4F8A", bg: "#E8F1FA" };
  if (key === "not_resolved" || key === "cancelled") return { color: "#E11D48", bg: "#FDECEC" };
  if (key === "requested") return { color: "#6D28D9", bg: "#F5F3FF" };
  if (key === "open" || key === "submitted") return { color: "#1B4F8A", bg: "#E8F1FA" };
  return { color: "#D97706", bg: "#FEF6E7" };
}
