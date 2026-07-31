import type { LucideIcon } from "lucide-react";
import {
  Baby,
  Bike,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  Car,
  Clapperboard,
  DoorOpen,
  Droplets,
  Dumbbell,
  Shirt,
  Sparkles,
  Trees,
  Trophy,
  UtensilsCrossed,
} from "lucide-react";

const VISUALS = [
  { key: "pool", match: ["pool", "swim"], tint: "#0284C7", soft: "#E0F2FE", label: "Pool" },
  { key: "gym", match: ["gym", "fitness", "workout"], tint: "#DB2777", soft: "#FCE7F3", label: "Gym" },
  { key: "hall", match: ["hall", "party", "event", "lounge", "community", "clubhouse"], tint: "#6366F1", soft: "#EEF2FF", label: "Hall" },
  { key: "meeting", match: ["meeting", "conference", "business", "office", "co-work", "cowork"], tint: "#0052DF", soft: "#EFF6FF", label: "Meeting" },
  { key: "dining", match: ["bbq", "grill", "kitchen", "dining", "cafe", "restaurant"], tint: "#EA580C", soft: "#FFF7ED", label: "Dining" },
  { key: "sports", match: ["tennis", "court", "sport", "basketball"], tint: "#059669", soft: "#ECFDF5", label: "Sports" },
  { key: "playground", match: ["kid", "playground", "child", "play"], tint: "#D97706", soft: "#FEF3C7", label: "Play" },
  { key: "terrace", match: ["garden", "park", "green", "roof", "terrace", "outdoor"], tint: "#16A34A", soft: "#F0FDF4", label: "Outdoor" },
  { key: "spa", match: ["spa", "sauna", "wellness", "yoga"], tint: "#BE185D", soft: "#FDF2F8", label: "Wellness" },
  { key: "library", match: ["library", "study", "reading"], tint: "#4F46E5", soft: "#EEF2FF", label: "Study" },
  { key: "parking", match: ["parking", "garage", "car"], tint: "#475569", soft: "#F1F5F9", label: "Parking" },
  { key: "laundry", match: ["laundry", "wash"], tint: "#0D9488", soft: "#F0FDFA", label: "Laundry" },
  { key: "cinema", match: ["cinema", "theater", "theatre", "movie"], tint: "#7C3AED", soft: "#F5F3FF", label: "Cinema" },
  { key: "bike", match: ["bike", "cycle", "bicycle"], tint: "#2563EB", soft: "#EFF6FF", label: "Bike" },
] as const;

const DEFAULT_VISUAL = {
  key: "building",
  tint: "#0052DF",
  soft: "#EFF6FF",
  label: "Building",
} as const;

export const AMENITY_ICON_CATALOG = [...VISUALS.map(({ key, tint, soft, label }) => ({ key, tint, soft, label })), DEFAULT_VISUAL];

export const AMENITY_ICON_KEYS = AMENITY_ICON_CATALOG.map((v) => v.key);

export const AMENITY_STATUS_OPTIONS = [
  { key: "bookable", label: "Timed slots", short: "Slots" },
  { key: "open", label: "Open availability", short: "Open" },
  { key: "closed", label: "Closed", short: "Closed" },
] as const;

export type AmenityStatus = (typeof AMENITY_STATUS_OPTIONS)[number]["key"];

const LUCIDE_BY_KEY: Record<string, LucideIcon> = {
  pool: Droplets,
  gym: Dumbbell,
  hall: DoorOpen,
  meeting: BriefcaseBusiness,
  dining: UtensilsCrossed,
  sports: Trophy,
  playground: Baby,
  terrace: Trees,
  spa: Sparkles,
  library: BookOpen,
  parking: Car,
  laundry: Shirt,
  cinema: Clapperboard,
  bike: Bike,
  building: Building2,
};

export function getAmenityVisual(name = "", iconKey?: string | null) {
  if (iconKey) {
    const byKey = AMENITY_ICON_CATALOG.find((v) => v.key === iconKey);
    if (byKey) return byKey;
  }
  const n = name.toLowerCase();
  return VISUALS.find((v) => v.match.some((m) => n.includes(m))) ?? DEFAULT_VISUAL;
}

export function getAmenityIcon(iconKey?: string | null, name = "") {
  const visual = getAmenityVisual(name, iconKey);
  return LUCIDE_BY_KEY[visual.key] ?? Building2;
}

export function getAmenityStatusMeta(status?: string) {
  switch (status) {
    case "bookable":
      return { label: "Timed slots", tone: "amber" as const, dot: "#F59E0B" };
    case "closed":
      return { label: "Closed", tone: "red" as const, dot: "#EF4444" };
    case "open":
    default:
      return { label: "Open availability", tone: "green" as const, dot: "#10B981" };
  }
}

export function getAmenityReviewMeta(reviewStatus?: string | null) {
  switch (reviewStatus) {
    case "pending":
      return { label: "Pending review", tone: "amber" as const };
    case "rejected":
      return { label: "Rejected", tone: "red" as const };
    case "approved":
    default:
      return null;
  }
}
