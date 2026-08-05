import { HomeTheme as T } from "./home-theme";

/** Services hub — Ocean Breeze aligned. */
export const PropertyHubTheme = {
  screenBg: T.canvas,
  surface: T.white,
  text: T.navy,
  textMuted: T.gray,
  caption: "#94A3B8",
  border: T.border,
  heroBorder: T.border,
  teal: T.teal,
  mint: T.mint,
  deepTeal: T.deepTeal,
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
    color: T.navy,
    bg: T.mint,
    border: "rgba(20, 184, 166, 0.28)",
  },
  rules: {
    lucide: "ShieldCheck",
    icon: "shield",
    color: T.navy,
    bg: T.mint,
    border: "rgba(20, 184, 166, 0.28)",
  },
  documents: {
    lucide: "FileStack",
    icon: "file-text",
    color: T.navy,
    bg: T.mint,
    border: "rgba(20, 184, 166, 0.28)",
  },
  bookings: {
    lucide: "BookmarkCheck",
    icon: "bookmark",
    color: T.navy,
    bg: T.mint,
    border: "rgba(20, 184, 166, 0.28)",
  },
  community: {
    lucide: "Building2",
    icon: "home",
    color: T.navy,
    bg: T.mint,
    border: "rgba(20, 184, 166, 0.28)",
  },
  approvals: {
    lucide: "BookmarkCheck",
    icon: "check-circle",
    color: T.navy,
    bg: T.mint,
    border: "rgba(20, 184, 166, 0.28)",
  },
  help: {
    lucide: "LifeBuoy",
    icon: "life-buoy",
    color: T.navy,
    bg: T.mint,
    border: "rgba(20, 184, 166, 0.28)",
  },
  notices: {
    lucide: "Bell",
    icon: "bell",
    color: T.navy,
    bg: T.mint,
    border: "rgba(20, 184, 166, 0.28)",
  },
  marketplace: {
    lucide: "Store",
    icon: "shopping-bag",
    color: T.navy,
    bg: T.mint,
    border: "rgba(20, 184, 166, 0.28)",
  },
  listings: {
    lucide: "Tag",
    icon: "tag",
    color: T.navy,
    bg: T.mint,
    border: "rgba(20, 184, 166, 0.28)",
  },
};

/** Services hub — book, shop, and community resources (6-tile grid). */
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
    id: "marketplace",
    key: "marketplace",
    title: "Marketplace",
    subtitle: "Deals & local shops",
    routeKey: "MARKETPLACE",
  },
  {
    id: "listings",
    key: "listings",
    title: "Listings",
    subtitle: "Buy & sell nearby",
    routeKey: "COMMUNITY_LISTINGS",
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
    id: "marketplace",
    key: "marketplace",
    title: "Marketplace",
    subtitle: "Deals & businesses",
    routeKey: "MARKETPLACE",
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
      title: "Manage your community",
      subtitle: "Reviews, bookings, and resources at a glance.",
    };
  }
  return {
    title: "Your community hub",
    subtitle: "Book amenities, find documents, and get help.",
  };
}

export function getPropertyServiceMeta(key) {
  return PROPERTY_SERVICE_META[key] ?? PROPERTY_SERVICE_META.amenity;
}
