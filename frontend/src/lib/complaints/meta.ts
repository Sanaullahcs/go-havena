export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 5000;

export const MAINTENANCE_CATEGORIES = [
  ["plumbing", "Plumbing"],
  ["electrical", "Electrical"],
  ["cleaning", "Cleaning & Sanitation"],
  ["lifts", "Elevators / Lifts"],
  ["parking", "Parking"],
  ["security_safety", "Security & Safety"],
  ["noise_disturbance", "Noise Disturbance"],
  ["common_areas", "Common Areas & Amenities"],
  ["building_maintenance", "Building Maintenance"],
  ["landscaping", "Landscaping & Outdoor Areas"],
  ["pest_control", "Pest Control"],
  ["billing_payments", "Billing & Payments"],
  ["resident_behavior", "Resident Behavior"],
  ["other", "Other"],
] as const;

export const TECHNICAL_CATEGORIES = [
  ["app_bug", "App Bug"],
  ["login", "Login & Authentication"],
  ["account", "Account & Access"],
  ["performance", "Performance Issues"],
  ["payment", "Payment Technical Issues"],
  ["notifications", "Notification Issues"],
  ["data_display", "Data & Display Issues"],
  ["file_upload", "File & Upload Issues"],
  ["other", "Other Technical Issues"],
] as const;

export const TECHNICAL_CATEGORY_HINTS: Record<string, string> = {
  app_bug: "Something in the app is not working as expected.",
  login: "Trouble signing in or verifying an account.",
  account: "Account details, permissions, or access problems.",
  performance: "The app is slow, freezing, or unresponsive.",
  payment: "A payment failed or did not show correctly in the app.",
  notifications: "Missing, delayed, or incorrect notifications.",
  data_display: "Information looks wrong or does not display correctly.",
  file_upload: "A file will not upload, open, or download.",
  other: "A technical problem that does not fit the other categories.",
};

export const CATEGORY_HINTS: Record<string, string> = {
  plumbing: "Water leakage, drainage, and pipe issues.",
  electrical: "Power failures, wiring, and lighting issues.",
  cleaning: "Garbage, cleanliness, and hygiene issues.",
  lifts: "Elevator breakdowns and maintenance.",
  parking: "Parking violations and blocked spaces.",
  security_safety: "Security concerns and unauthorized access.",
  noise_disturbance: "Loud music and excessive noise.",
  common_areas: "Shared facility issues.",
  building_maintenance: "Structural damage and general repairs.",
  landscaping: "Gardens and outdoor maintenance.",
  pest_control: "Rodents, insects, and infestations.",
  billing_payments: "Incorrect charges and payment issues.",
  resident_behavior: "Neighbor disputes and rule violations.",
  other: "Complaints not covered by existing categories.",
};

export const COMPLAINT_PRIORITIES = [
  ["low", "Low"],
  ["normal", "Normal"],
  ["high", "High"],
  ["urgent", "Urgent"],
] as const;

export function complaintTitleError(value: string): string {
  const text = value.trim();
  if (text.length < 3) return "Title must be at least 3 characters.";
  if (!/\p{L}/u.test(text)) return "Title must include at least one letter.";
  return "";
}

export function complaintDescriptionError(value: string): string {
  if (value.trim().length < 10) return "Description must be at least 10 characters.";
  return "";
}