/** Property Management hub — soft tint pairs aligned with app tokens. */
export const PropertyHubTheme = {
  screenBg: "#F7F8FC",
  surface: "#FFFFFF",
  text: "#101828",
  textMuted: "#667085",
  caption: "#98A2B3",
  border: "#E8ECF2",
  heroBorder: "#E8ECF2",
  successBg: "#F0FDF4",
  successBorder: "#BBF7D0",
  successText: "#15803D",
  successBadgeBg: "#DCFCE7",
  pendingBg: "#FFFBEB",
  pendingBorder: "#FDE68A",
  pendingText: "#B45309",
  pendingBadgeBg: "#FEF3C7",
  dangerBg: "#FEF2F2",
  dangerBorder: "#FECACA",
  dangerText: "#B91C1C",
  dangerBadgeBg: "#FEE2E2",
  alertBg: "#FFFBEB",
  alertBorder: "#FDE68A",
  alertTitle: "#92400E",
  alertText: "#B45309",
  alertLink: "#D97706",
  approvalBg: "#EFF6FF",
  approvalBorder: "#BFDBFE",
  approvalText: "#1D4ED8",
  approvalBadgeBg: "#DBEAFE",
  cardRadius: 16,
  cardPad: 16,
};

export const PROPERTY_SERVICE_META = {
  amenity: {
    lucide: "CalendarDays",
    icon: "calendar",
    color: "#0052DF",
    bg: "#EFF6FF",
    border: "#BFDBFE",
  },
  rules: {
    lucide: "ShieldCheck",
    icon: "shield",
    color: "#7C3AED",
    bg: "#F5F3FF",
    border: "#DDD6FE",
  },
  documents: {
    lucide: "FileStack",
    icon: "file-text",
    color: "#D97706",
    bg: "#FFFBEB",
    border: "#FDE68A",
  },
  bookings: {
    lucide: "BookmarkCheck",
    icon: "bookmark",
    color: "#059669",
    bg: "#ECFDF5",
    border: "#A7F3D0",
  },
  community: {
    lucide: "Building2",
    icon: "home",
    color: "#0EA5E9",
    bg: "#F0F9FF",
    border: "#BAE6FD",
  },
  approvals: {
    lucide: "BookmarkCheck",
    icon: "check-circle",
    color: "#0052DF",
    bg: "#EFF6FF",
    border: "#BFDBFE",
  },
};

/** Shared “Add Amenity” shortcut for residents and admins. */
const ADD_AMENITY_ACTION = {
  id: "add-amenity",
  key: "amenity",
  title: "Add Amenity",
  subtitle: "Create a facility",
  routeKey: "AMENITY_FORM",
  primary: true,
};

/** Always-available community resources under the hub. */
export const PROPERTY_COMMUNITY_SERVICES = [
  {
    id: "rules",
    key: "rules",
    title: "Community Rules",
    subtitle: "Guidelines and acknowledgments",
    routeKey: "COMMUNITY_RULES",
  },
  {
    id: "documents",
    key: "documents",
    title: "Documents",
    subtitle: "HOA files and resources",
    routeKey: "DOCUMENTS",
  },
];

/** Resident shortcuts — browse & create amenities (bookings live in dedicated section). */
export const PROPERTY_RESIDENT_QUICK_ACTIONS = [
  ADD_AMENITY_ACTION,
  {
    id: "amenity",
    key: "bookings",
    title: "Browse Amenities",
    subtitle: "Find facilities to book",
    routeKey: "AMENITY",
  },
];

/** Admin shortcuts — amenity management (approvals live in dedicated section). */
export const PROPERTY_ADMIN_QUICK_ACTIONS = [
  ADD_AMENITY_ACTION,
  {
    id: "amenities",
    key: "amenity",
    title: "Manage Amenities",
    subtitle: "Hours & capacity",
    routeKey: "ADMIN_AMENITIES",
  },
  {
    id: "book",
    key: "bookings",
    title: "Browse Amenities",
    subtitle: "Book as a resident",
    routeKey: "AMENITY",
  },
];

/** @deprecated Use role helpers below */
export const PROPERTY_QUICK_ACTIONS = PROPERTY_RESIDENT_QUICK_ACTIONS;

export function getPropertyQuickActions(isAdmin) {
  return isAdmin ? PROPERTY_ADMIN_QUICK_ACTIONS : PROPERTY_RESIDENT_QUICK_ACTIONS;
}

export function getPropertyHubHeroCopy(isAdmin) {
  if (isAdmin) {
    return {
      title: "Manage your community",
      subtitle: "Review amenities, approve bookings, and keep community resources up to date.",
    };
  }
  return {
    title: "Everything in one place",
    subtitle:
      "Book amenities, track reservations, and approve requests for facilities you manage.",
  };
}

export function getPropertyServiceMeta(key) {
  return PROPERTY_SERVICE_META[key] ?? PROPERTY_SERVICE_META.amenity;
}
