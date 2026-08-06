import { HomeTheme as T } from "./home-theme";

/** Services hub — Ocean Breeze aligned. */
export const PropertyHubTheme = {
  screenBg: T.canvas,
  surface: T.white,
  text: T.navy,
  textMuted: T.gray,
  caption: "#94A3B8",
  border: T.border,
  heroBg: T.white,
  heroText: T.navy,
  heroSubtext: T.gray,
  heroBorder: T.border,
  heroAccent: T.teal,
  iconColor: T.teal,
  iconWell: T.mint,
  iconBorder: "rgba(20, 184, 166, 0.32)",
  teal: T.teal,
  mint: T.mint,
  deepTeal: T.deepTeal,
  accentSoft: "#E6FFFA",
  accentBlue: "#E0F2FE",
  accentLilac: "#EEF2FF",
  successBg: "#ECFDF5",
  successBorder: "#A7F3D0",
  successText: T.deepTeal,
  successBadgeBg: T.mint,
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
  approvalBg: T.mint,
  approvalBorder: "rgba(20, 184, 166, 0.28)",
  approvalText: T.navy,
  approvalBadgeBg: "rgba(20, 184, 166, 0.15)",
  cardRadius: 16,
  cardPad: 16,
};

export const PROPERTY_SERVICE_META = {
  amenity: {
    lucide: "CalendarDays",
    icon: "calendar",
    color: T.teal,
    bg: T.mint,
    border: "rgba(20, 184, 166, 0.32)",
  },
  rules: {
    lucide: "ShieldCheck",
    icon: "shield",
    color: T.teal,
    bg: T.mint,
    border: "rgba(20, 184, 166, 0.32)",
  },
  documents: {
    lucide: "FileStack",
    icon: "file-text",
    color: T.teal,
    bg: T.mint,
    border: "rgba(20, 184, 166, 0.32)",
  },
  bookings: {
    lucide: "BookmarkCheck",
    icon: "bookmark",
    color: T.teal,
    bg: T.mint,
    border: "rgba(20, 184, 166, 0.32)",
  },
  community: {
    lucide: "Building2",
    icon: "home",
    color: T.teal,
    bg: T.mint,
    border: "rgba(20, 184, 166, 0.32)",
  },
  approvals: {
    lucide: "BookmarkCheck",
    icon: "check-circle",
    color: "#B45309",
    bg: "#FFFBEB",
    border: "rgba(245, 158, 11, 0.28)",
  },
  help: {
    lucide: "LifeBuoy",
    icon: "life-buoy",
    color: T.teal,
    bg: T.mint,
    border: "rgba(20, 184, 166, 0.32)",
  },
  notices: {
    lucide: "Bell",
    icon: "bell",
    color: T.teal,
    bg: T.mint,
    border: "rgba(20, 184, 166, 0.32)",
  },
  marketplace: {
    lucide: "Store",
    icon: "shopping-bag",
    color: T.teal,
    bg: T.mint,
    border: "rgba(20, 184, 166, 0.32)",
  },
  listings: {
    lucide: "Tag",
    icon: "tag",
    color: T.teal,
    bg: T.mint,
    border: "rgba(20, 184, 166, 0.32)",
  },
  addAmenity: {
    lucide: "CirclePlus",
    icon: "plus-circle",
    color: T.teal,
    bg: T.mint,
    border: "rgba(20, 184, 166, 0.32)",
  },
};

/** Themed icons for admin stats and approval queue cards. */
export const APPROVAL_QUEUE_ICON_META = {
  bookingRequest: {
    lucide: "CalendarClock",
    color: "#B45309",
    bg: "#FFFBEB",
    ring: "#FEF3C7",
    border: "rgba(245, 158, 11, 0.35)",
  },
  amenityReview: {
    lucide: "ClipboardCheck",
    color: T.deepTeal,
    bg: T.mint,
    ring: "#E6FFFA",
    border: "rgba(20, 184, 166, 0.38)",
  },
};

export function getApprovalQueueIconMeta(iconKey) {
  if (iconKey === "amenityReview") return APPROVAL_QUEUE_ICON_META.amenityReview;
  return APPROVAL_QUEUE_ICON_META.bookingRequest;
}

/** Services hub — amenities and community resources (5-tile grid). */
export const PROPERTY_RESIDENT_SERVICES = [
  {
    id: "amenity",
    key: "amenity",
    title: "Amenities",
    subtitle: "Pool, gym, clubhouse",
    routeKey: "AMENITY",
    primary: true,
  },
  {
    id: "my-booking",
    key: "bookings",
    title: "My Bookings",
    subtitle: "Your reservations",
    routeKey: "MY_BOOKING",
    badgeKey: "myReservationCount",
  },
  {
    id: "add-amenity",
    key: "addAmenity",
    title: "Add Amenity",
    subtitle: "Suggest for community",
    routeKey: "AMENITY_FORM",
  },
  {
    id: "documents",
    key: "documents",
    title: "Documents",
    subtitle: "Bylaws & forms",
    routeKey: "DOCUMENTS",
  },
  {
    id: "rules",
    key: "rules",
    title: "Community Rules",
    subtitle: "Living guidelines",
    routeKey: "COMMUNITY_RULES",
  },
];

export const PROPERTY_ADMIN_SERVICES = [
  {
    id: "amenities",
    key: "amenity",
    title: "Manage Amenities",
    subtitle: "Hours & capacity",
    routeKey: "ADMIN_AMENITIES",
    primary: true,
  },
  {
    id: "approvals",
    key: "approvals",
    title: "Approvals",
    subtitle: "Booking requests",
    routeKey: "ADMIN_BOOKINGS",
    badgeKey: "approveRequestCount",
  },
  {
    id: "book",
    key: "bookings",
    title: "Browse Amenities",
    subtitle: "Book as a resident",
    routeKey: "AMENITY",
  },
  {
    id: "documents",
    key: "documents",
    title: "Documents",
    subtitle: "Bylaws & forms",
    routeKey: "DOCUMENTS",
  },
  {
    id: "rules",
    key: "rules",
    title: "Community Rules",
    subtitle: "Living guidelines",
    routeKey: "COMMUNITY_RULES",
  },
];

/** @deprecated Use PROPERTY_RESIDENT_SERVICES */
export const PROPERTY_RESIDENT_BOOK_ACTIONS = PROPERTY_RESIDENT_SERVICES.slice(0, 2);

/** @deprecated Use PROPERTY_ADMIN_SERVICES */
export const PROPERTY_ADMIN_BOOK_ACTIONS = PROPERTY_ADMIN_SERVICES.slice(0, 2);

export const PROPERTY_COMMUNITY_SERVICES = [
  {
    id: "documents",
    key: "documents",
    title: "Documents",
    subtitle: "Bylaws, forms, and guides",
    routeKey: "DOCUMENTS",
  },
  {
    id: "rules",
    key: "rules",
    title: "Community Rules",
    subtitle: "Guidelines for residents",
    routeKey: "COMMUNITY_RULES",
  },
];

export const PROPERTY_HELP_SERVICES = [
  {
    id: "help",
    key: "help",
    title: "Help & Support",
    subtitle: "Get assistance from your community",
    routeKey: "HELP",
  },
];

export const PROPERTY_RESIDENT_QUICK_ACTIONS = PROPERTY_RESIDENT_SERVICES;
export const PROPERTY_ADMIN_QUICK_ACTIONS = PROPERTY_ADMIN_SERVICES;
export const PROPERTY_QUICK_ACTIONS = PROPERTY_RESIDENT_SERVICES;

export function getPropertyHubServices(isAdmin) {
  return isAdmin ? PROPERTY_ADMIN_SERVICES : PROPERTY_RESIDENT_SERVICES;
}

export function getPropertyQuickActions(isAdmin) {
  return getPropertyHubServices(isAdmin);
}

export function getPropertyBookActions(isAdmin) {
  return getPropertyHubServices(isAdmin);
}

export function getPropertyHubHeroCopy(isAdmin) {
  if (isAdmin) {
    return {
      title: "Services dashboard",
      subtitle: "Manage amenities, bookings, and community resources in one place.",
    };
  }
  return {
    title: "Your services hub",
    subtitle: "Book amenities, add new spaces, and access community resources.",
  };
}

export function getPropertyServiceMeta(key) {
  return PROPERTY_SERVICE_META[key] ?? PROPERTY_SERVICE_META.amenity;
}
