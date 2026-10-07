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
    color: T.deepTeal,
    bg: T.mint,
    border: "rgba(20, 184, 166, 0.32)",
  },
  rules: {
    lucide: "ShieldCheck",
    icon: "shield",
    color: "#0369A1",
    bg: "#E0F2FE",
    border: "rgba(3, 105, 161, 0.22)",
  },
  documents: {
    lucide: "FileStack",
    icon: "file-text",
    color: "#0F766E",
    bg: "#CCFBF1",
    border: "rgba(15, 118, 110, 0.22)",
  },
  bookings: {
    lucide: "BookmarkCheck",
    icon: "bookmark",
    color: "#B45309",
    bg: "#FFFBEB",
    border: "rgba(180, 83, 9, 0.22)",
  },
  community: {
    lucide: "Building2",
    icon: "home",
    color: T.navy,
    bg: "#E8F0F6",
    border: "rgba(15, 61, 95, 0.18)",
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
    color: "#7C3AED",
    bg: "#EDE9FE",
    border: "rgba(124, 58, 237, 0.2)",
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
    color: T.navy,
    bg: "#E8F0F6",
    border: "rgba(15, 61, 95, 0.18)",
  },
  listings: {
    lucide: "Tag",
    icon: "tag",
    color: T.deepTeal,
    bg: T.mint,
    border: "rgba(20, 184, 166, 0.32)",
  },
  addAmenity: {
    lucide: "CirclePlus",
    icon: "plus-circle",
    color: "#0E7490",
    bg: "#CFFAFE",
    border: "rgba(14, 116, 144, 0.22)",
  },
  unitBills: {
    lucide: "Receipt",
    icon: "file-text",
    color: "#B45309",
    bg: "#FFFBEB",
    border: "rgba(180, 83, 9, 0.22)",
  },
  amenityBills: {
    lucide: "Wallet",
    icon: "credit-card",
    color: "#1B4F8A",
    bg: "#E8F0F7",
    border: "rgba(27, 79, 138, 0.22)",
  },
  availableServices: {
    lucide: "Droplets",
    icon: "droplet",
    color: "#0369A1",
    bg: "#E0F2FE",
    border: "rgba(3, 105, 161, 0.22)",
  },
  billingContact: {
    lucide: "UserRound",
    icon: "user",
    color: "#0F766E",
    bg: "#CCFBF1",
    border: "rgba(15, 118, 110, 0.22)",
  },
  createService: {
    lucide: "CirclePlus",
    icon: "plus-circle",
    color: "#0E7490",
    bg: "#CFFAFE",
    border: "rgba(14, 116, 144, 0.22)",
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
export function getPropertyResidentServices(t) {
  return [
    {
      id: "book",
      key: "amenity",
      title: t("services.browseAmenitiesTitle"),
      subtitle: t("services.browseAmenitiesSub"),
      routeKey: "AMENITY",
      primary: true,
    },
    {
      id: "add-amenity",
      key: "addAmenity",
      title: t("services.addAmenity"),
      subtitle: t("services.addAmenitySub"),
      routeKey: "AMENITY_FORM",
    },
    {
      id: "booking-requests",
      key: "approvals",
      title: t("services.bookingRequests"),
      subtitle: t("services.bookingRequestsSub"),
      routeKey: "ADMIN_BOOKINGS",
      badgeKey: "approveRequestCount",
    },
    {
      id: "unit-bills",
      key: "unitBills",
      title: t("services.unitBillsTitle"),
      subtitle: t("services.unitBillsSub"),
      routeKey: "UNIT_BILLS",
      requiresBillingContact: true,
    },
    {
      id: "amenity-bills",
      key: "amenityBills",
      title: t("services.myAmenityBillsTitle"),
      subtitle: t("services.myAmenityBillsSub"),
      routeKey: "AMENITY_BILLS",
    },
    {
      id: "available-services",
      key: "availableServices",
      title: t("services.availableServicesTitle"),
      subtitle: t("services.availableServicesSub"),
      routeKey: "AVAILABLE_SERVICES",
    },
    {
      id: "billing-contact",
      key: "billingContact",
      title: t("services.billingContactTitle"),
      subtitle: t("services.billingContactSub"),
      routeKey: "BILLING_CONTACT",
    },
    ...getPropertyCommunityServices(t),
  ];
}

export function getPropertyAdminServices(t) {
  return [
    {
      id: "add-amenity",
      key: "addAmenity",
      title: t("services.addAmenity"),
      subtitle: t("services.addAmenitySub"),
      routeKey: "AMENITY_FORM",
    },
    {
      id: "approvals",
      key: "approvals",
      title: t("services.bookingRequests"),
      subtitle: t("services.bookingRequestsSub"),
      routeKey: "ADMIN_BOOKINGS",
      badgeKey: "approveRequestCount",
    },
    {
      id: "amenities",
      key: "amenity",
      title: t("services.manageAmenities"),
      subtitle: t("services.manageAmenitiesSub"),
      routeKey: "ADMIN_AMENITIES",
      primary: true,
    },
    {
      id: "book",
      key: "bookings",
      title: t("services.browseAmenitiesTitle"),
      subtitle: t("services.browseAmenitiesSub"),
      routeKey: "AMENITY",
    },
    {
      id: "create-service",
      key: "createService",
      title: t("services.createServiceTitle"),
      subtitle: t("services.createServiceSub"),
      routeKey: "ADMIN_SERVICE_FORM",
    },
    {
      id: "service-bills",
      key: "unitBills",
      title: t("services.serviceBillsTitle"),
      subtitle: t("services.serviceBillsSub"),
      routeKey: "ADMIN_SERVICE_BILLS",
    },
    {
      id: "amenity-bills",
      key: "amenityBills",
      title: t("services.amenityBillsTitle"),
      subtitle: t("services.amenityBillsSub"),
      routeKey: "ADMIN_AMENITY_BILLS",
    },
    ...getPropertyCommunityServices(t),
  ];
}

/** @deprecated Use getPropertyResidentServices(t) */
export function getPropertyResidentBookActions(t) {
  return getPropertyResidentServices(t).slice(0, 2);
}

/** @deprecated Use getPropertyAdminServices(t) */
export function getPropertyAdminBookActions(t) {
  return getPropertyAdminServices(t).slice(0, 2);
}

export function getPropertyCommunityServices(t) {
  return [
    {
      id: "rules",
      key: "rules",
      title: t("services.communityRules"),
      subtitle: t("services.communityRulesSub"),
      routeKey: "COMMUNITY_RULES",
    },
    {
      id: "documents",
      key: "documents",
      title: t("services.documents"),
      subtitle: t("services.documentsSub"),
      routeKey: "DOCUMENTS",
    },
  ];
}

export function getPropertyHelpServices(t) {
  return [
    {
      id: "help",
      key: "help",
      title: t("services.helpSupport"),
      subtitle: t("services.helpSupportSub"),
      routeKey: "HELP",
    },
  ];
}

export function getPropertyResidentQuickActions(t) {
  return getPropertyResidentServices(t);
}
export function getPropertyAdminQuickActions(t) {
  return getPropertyAdminServices(t);
}
export function getPropertyQuickActions(isAdmin, t) {
  return getPropertyHubServices(isAdmin, t);
}

export function getPropertyHubServices(isAdmin, t) {
  return isAdmin ? getPropertyAdminServices(t) : getPropertyResidentServices(t);
}

/** Hide billing-contact-only tiles (e.g. unit bills) for other unit residents. */
export function filterPropertyServicesForViewer(services, { isBillingContact = false } = {}) {
  return services.filter((item) => !item.requiresBillingContact || isBillingContact);
}

export function getPropertyBookActions(isAdmin, t) {
  return getPropertyHubServices(isAdmin, t);
}

export function getPropertyHubHeroCopy(isAdmin, t, { reservationCount = 0 } = {}) {
  const count = Number(reservationCount) || 0;
  const subtitle =
    count > 0
      ? t("services.upcomingBookingCount", { count })
      : t("services.browseAndReserve");

  return {
    eyebrow: t("services.heroAdminReservationEyebrow"),
    title: t("services.myReservations"),
    subtitle,
    cta: t("services.heroAdminReservationCta"),
    ctaRoute: "MY_BOOKING",
    icon: "calendar",
  };
}

export function getPropertyServiceMeta(key) {
  return PROPERTY_SERVICE_META[key] ?? PROPERTY_SERVICE_META.amenity;
}
