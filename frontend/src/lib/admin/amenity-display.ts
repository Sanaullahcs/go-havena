import type { LucideIcon } from "lucide-react";
import {
  Baby,
  Bike,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Car,
  Clapperboard,
  DoorOpen,
  Droplets,
  Dumbbell,
  Flower2,
  Package,
  Scissors,
  Shirt,
  Sparkles,
  Trees,
  Trophy,
  UtensilsCrossed,
} from "lucide-react";

import { formatCommunityMoney } from "@/lib/money";

const VISUALS = [
  { key: "gym", match: ["gym", "workout", "gymnasium"], tint: "#DB2777", soft: "#FCE7F3", label: "Gymnasium access" },
  { key: "yoga", match: ["yoga", "fitness", "pilates"], tint: "#BE185D", soft: "#FDF2F8", label: "Yoga / Fitness" },
  { key: "pool", match: ["pool", "swim"], tint: "#0284C7", soft: "#E0F2FE", label: "Pool access" },
  { key: "laundry", match: ["laundry"], tint: "#163A66", soft: "#F0FDFA", label: "Laundry service" },
  { key: "car_wash", match: ["car wash", "carwash"], tint: "#475569", soft: "#F1F5F9", label: "Car wash" },
  { key: "barber", match: ["barber", "salon", "hair"], tint: "#B45309", soft: "#FEF3C7", label: "Barber" },
  { key: "cleaning", match: ["personal clean", "maid", "housekeep"], tint: "#0F766E", soft: "#CCFBF1", label: "Personal cleaning request" },
  { key: "sports", match: ["sport", "tennis", "basketball", "court"], tint: "#059669", soft: "#ECFDF5", label: "Sports activity" },
  { key: "events", match: ["event", "activity", "participation"], tint: "#7C3AED", soft: "#F5F3FF", label: "Event / Activity participation" },
  { key: "package", match: ["package", "parcel", "courier"], tint: "#1D4ED8", soft: "#DBEAFE", label: "Package service" },
  { key: "lounge", match: ["lounge", "community", "clubhouse", "hall"], tint: "#1B4F8A", soft: "#E8F0F7", label: "Community / Lounge area" },
  { key: "other", match: ["other", "custom"], tint: "#64748B", soft: "#F1F5F9", label: "Other" },
] as const;

const LEGACY_VISUALS = [
  { key: "hall", match: ["hall", "party"], tint: "#1B4F8A", soft: "#E8F0F7", label: "Hall" },
  { key: "meeting", match: ["meeting", "conference"], tint: "#1B4F8A", soft: "#E8F0F7", label: "Meeting" },
  { key: "dining", match: ["bbq", "grill", "kitchen", "dining"], tint: "#EA580C", soft: "#E8F0F7", label: "Dining" },
  { key: "playground", match: ["kid", "playground", "child", "play"], tint: "#D97706", soft: "#FEF3C7", label: "Play" },
  { key: "terrace", match: ["garden", "park", "roof", "terrace", "outdoor"], tint: "#16A34A", soft: "#F0FDF4", label: "Outdoor" },
  { key: "spa", match: ["spa", "sauna", "wellness"], tint: "#BE185D", soft: "#FDF2F8", label: "Wellness" },
  { key: "library", match: ["library", "study", "reading"], tint: "#163A66", soft: "#E8F0F7", label: "Study" },
  { key: "parking", match: ["parking", "garage"], tint: "#475569", soft: "#F1F5F9", label: "Parking" },
  { key: "cinema", match: ["cinema", "theater", "theatre", "movie"], tint: "#7C3AED", soft: "#F5F3FF", label: "Cinema" },
  { key: "bike", match: ["bike", "cycle", "bicycle"], tint: "#1B4F8A", soft: "#E8F0F7", label: "Bike" },
] as const;

const DEFAULT_VISUAL = {
  key: "building",
  tint: "#1B4F8A",
  soft: "#E8F0F7",
  label: "Building",
} as const;

const ALL_VISUALS = [...VISUALS, ...LEGACY_VISUALS];

export const AMENITY_ICON_CATALOG = VISUALS.map(({ key, tint, soft, label }) => ({ key, tint, soft, label }));

export const AMENITY_ICON_KEYS = [...AMENITY_ICON_CATALOG.map((v) => v.key), ...LEGACY_VISUALS.map((v) => v.key), DEFAULT_VISUAL.key];

export const AMENITY_STATUS_OPTIONS = [
  { key: "bookable", label: "Timed slots", short: "Slots" },
  { key: "open", label: "Open availability", short: "Open" },
  { key: "closed", label: "Closed", short: "Closed" },
] as const;

export type AmenityStatus = (typeof AMENITY_STATUS_OPTIONS)[number]["key"];

const LUCIDE_BY_KEY: Record<string, LucideIcon> = {
  gym: Dumbbell,
  yoga: Flower2,
  pool: Droplets,
  laundry: Shirt,
  car_wash: Car,
  barber: Scissors,
  cleaning: Sparkles,
  sports: Trophy,
  events: CalendarDays,
  package: Package,
  lounge: DoorOpen,
  hall: DoorOpen,
  meeting: BriefcaseBusiness,
  dining: UtensilsCrossed,
  playground: Baby,
  terrace: Trees,
  spa: Flower2,
  library: BookOpen,
  parking: Car,
  cinema: Clapperboard,
  bike: Bike,
  building: Building2,
};

export function getAmenityVisual(name = "", iconKey?: string | null) {
  if (iconKey) {
    const byKey = ALL_VISUALS.find((v) => v.key === iconKey) ?? (iconKey === DEFAULT_VISUAL.key ? DEFAULT_VISUAL : null);
    if (byKey) return byKey;
  }
  const n = name.toLowerCase();
  return ALL_VISUALS.find((v) => v.match.some((m) => n.includes(m))) ?? DEFAULT_VISUAL;
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

export function formatAmenityFeeLabel(amenity: {
  shared_billing_enabled?: boolean;
  shared_billing_amount?: number | null;
  shared_billing_frequency?: string | null;
  booking_fee?: number | null;
  display_fee?: number | null;
  display_fee_kind?: string | null;
}): string {
  const shared = Boolean(amenity.shared_billing_enabled) || amenity.display_fee_kind === "monthly" || amenity.display_fee_kind === "yearly";
  const amount = Number(
    shared
      ? (amenity.display_fee ?? amenity.shared_billing_amount ?? 0)
      : (amenity.display_fee ?? amenity.booking_fee ?? 0),
  );
  if (!Number.isFinite(amount) || amount <= 0) return "Free";
  const formatted = formatCommunityMoney(amount);
  if (shared) {
    return `${formatted} / ${amenity.display_fee_kind === "yearly" || amenity.shared_billing_frequency === "yearly" ? "year" : "month"}`;
  }
  return formatted;
}

export function formatBookingDisplayFee(booking: {
  booking_fee?: number | null;
  display_fee?: number | null;
  display_fee_kind?: string | null;
}): string {
  const amount = Number(booking.display_fee ?? booking.booking_fee ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return "Free";
  const formatted = formatCommunityMoney(amount);
  if (booking.display_fee_kind === "yearly") return `${formatted} / year`;
  if (booking.display_fee_kind === "monthly") return `${formatted} / month`;
  return formatted;
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
