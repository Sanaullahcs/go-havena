/** Canonical property management stack routes (expo-router). */

import { MarketplaceRoutes } from "./marketplace-routes";
import { normalizeCapacityBookingType } from "../utils/amenity-display";

export const PropertyManagementRoutes = {
  HOME: "/(tabs)/services",
  AMENITY: "/(tabs)/services/amenity",
  ALL_FACILITIES: "/(tabs)/services/amenity/all-facilities",
  RESERVATION_CALENDAR:
    "/(tabs)/services/amenity/all-facilities/reservation-calender",
  RESERVATION_RULE_DETAILS:
    "/(tabs)/services/amenity/all-facilities/reservation-calender/rule-details",
  COMMUNITY_RULES: "/(tabs)/services/community-rules",
  RULE_DETAIL: "/(tabs)/services/community-rules/rule-detail",
  RULE_FORM: "/(tabs)/services/community-rules/rule-form",
  DOCUMENTS: "/(tabs)/services/documents",
  DOCUMENT_DETAIL: "/(tabs)/services/documents/document-detail",
  DOCUMENT_FORM: "/(tabs)/services/documents/document-form",
  DOCUMENTS_SCREEN: "/screens/property-management/documents",
  DOCUMENT_DETAIL_SCREEN: "/screens/property-management/documents/document-detail",
  DOCUMENT_FORM_SCREEN: "/screens/property-management/documents/document-form",
  MY_BOOKING: "/(tabs)/services/my-booking",
  /** Root-stack copies so Home quick actions can push and Back returns to Home. */
  AMENITY_SCREEN: "/screens/property-management/amenity",
  MY_BOOKING_SCREEN: "/screens/property-management/my-booking",
  ALL_FACILITIES_SCREEN: "/screens/property-management/amenity/all-facilities",
  RESERVATION_CALENDAR_SCREEN:
    "/screens/property-management/amenity/all-facilities/reservation-calender",
  RESERVATION_RULE_DETAILS_SCREEN:
    "/screens/property-management/amenity/all-facilities/reservation-calender/rule-details",
  AMENITY_FORM: "/(tabs)/services/amenity-form",
  ADMIN_BOOKINGS: "/screens/admin-bookings",
  ADMIN_AMENITIES: "/screens/admin-amenities",
  UNIT_BILLS: "/screens/property-management/unit-bills",
  AMENITY_BILLS: "/screens/property-management/amenity-bills",
  AVAILABLE_SERVICES: "/screens/property-management/available-services",
  BILLING_CONTACT: "/screens/property-management/billing-contact",
  ADMIN_SERVICE_BILLS: "/screens/admin-service-bills",
  ADMIN_AMENITY_BILLS: "/screens/admin-amenity-bills",
  ADMIN_SERVICE_FORM: "/screens/admin-service-form",
  ADMIN_UNITS: "/screens/admin-units",
  NOTICES: "/(tabs)/notices",
  MARKETPLACE: MarketplaceRoutes.HOME,
  COMMUNITY_LISTINGS: MarketplaceRoutes.COMMUNITY_LISTINGS,
};

/** Tab hub roots — always land on the main screen, not a stale nested route. */
const HUB_TAB_ROUTE_KEYS = new Set(["MARKETPLACE", "NOTICES", "HOME"]);

export function isPropertyManagementRootPath(pathname) {
  return String(pathname ?? "").includes("/screens/property-management");
}

/** Keep amenity drill-in on the same stack that opened the list. */
export function amenityFlowRoutes(pathname) {
  if (isPropertyManagementRootPath(pathname)) {
    return {
      allFacilities: PropertyManagementRoutes.ALL_FACILITIES_SCREEN,
      reservationCalendar: PropertyManagementRoutes.RESERVATION_CALENDAR_SCREEN,
      ruleDetails: PropertyManagementRoutes.RESERVATION_RULE_DETAILS_SCREEN,
      myBooking: PropertyManagementRoutes.MY_BOOKING_SCREEN,
      documentDetail: PropertyManagementRoutes.DOCUMENT_DETAIL_SCREEN,
      documentForm: PropertyManagementRoutes.DOCUMENT_FORM_SCREEN,
    };
  }
  return {
    allFacilities: PropertyManagementRoutes.ALL_FACILITIES,
    reservationCalendar: PropertyManagementRoutes.RESERVATION_CALENDAR,
    ruleDetails: PropertyManagementRoutes.RESERVATION_RULE_DETAILS,
    myBooking: PropertyManagementRoutes.MY_BOOKING,
    documentDetail: PropertyManagementRoutes.DOCUMENT_DETAIL,
    documentForm: PropertyManagementRoutes.DOCUMENT_FORM,
  };
}

function navigatorWithRoute(navigation, routeName) {
  let current = navigation;
  const seen = new Set();
  while (current && !seen.has(current)) {
    seen.add(current);
    const names = current.getState?.()?.routeNames;
    if (Array.isArray(names) && names.includes(routeName)) {
      return current;
    }
    current = typeof current.getParent === "function" ? current.getParent() : null;
  }
  return null;
}

function navigateServicesTab(navigation, router) {
  // useNavigation() from the custom tab bar is the root stack, which has
  // "(tabs)" — not a sibling named "services". Nested navigate resets the hub.
  const rootNav = navigatorWithRoute(navigation, "(tabs)");
  if (rootNav) {
    rootNav.navigate("(tabs)", {
      screen: "services",
      params: { screen: "index" },
    });
    return;
  }

  router?.navigate?.(PropertyManagementRoutes.HOME);
}

/** Open the Services hub root, dropping leftover amenity/booking screens. */
export function openServicesHub(navigation, router, pathname) {
  const path = String(pathname ?? "");
  const hub = PropertyManagementRoutes.HOME;

  if (isPropertyManagementRootPath(path)) {
    try {
      if (router?.canDismiss?.()) router.dismissAll();
    } catch {
      // ignore
    }
    navigateServicesTab(navigation, router);
    return;
  }

  const nestedInServicesTab =
    path.includes("/services/") || /(^|\/)services$/.test(path);

  if (nestedInServicesTab) {
    try {
      router?.dismissTo?.(hub);
    } catch {
      router?.replace?.(hub);
    }
    return;
  }

  navigateServicesTab(navigation, router);
}

/**
 * Navigate from the Services hub (or similar) without broken cross-tab pushes.
 * Tab hubs use dismissTo/navigate; stack screens use push.
 */
export function navigatePropertyHubRoute(router, routeKey, routes = PropertyManagementRoutes) {
  const route = routes[routeKey];
  if (!route || !router) return;

  if (HUB_TAB_ROUTE_KEYS.has(routeKey)) {
    router.navigate(route);
    return;
  }

  if (route.startsWith("/screens/")) {
    router.push(route);
    return;
  }

  router.push(route);
}

export function amenityFacilityParams(amenity) {
  return {
    id: String(amenity.id ?? ""),
    name: amenity.name ?? "",
    nameEs: amenity.name_es ?? "",
    nameAr: amenity.name_ar ?? "",
    description: amenity.description ?? "",
    descriptionEs: amenity.description_es ?? "",
    descriptionAr: amenity.description_ar ?? "",
    capacity: amenity.capacity != null ? String(amenity.capacity) : "",
    capacityBookingType: normalizeCapacityBookingType(
      amenity.capacity_booking_type ?? amenity.capacityBookingType ?? "per_seat",
    ),
    floor: amenity.floor ?? "",
    hours: amenity.hours ?? "",
    status: amenity.status ?? "",
    iconKey: amenity.icon_key ?? amenity.iconKey ?? "",
    weekendsAvailable:
      amenity.weekends_available === false || amenity.weekendsAvailable === false
        ? "0"
        : "1",
    slotDuration:
      amenity.slot_duration_minutes != null
        ? String(amenity.slot_duration_minutes)
        : "",
    startTime: amenity.start_time ?? amenity.startTime ?? "",
    endTime: amenity.end_time ?? amenity.endTime ?? "",
    isMine: amenity.is_mine || amenity.isMine ? "1" : "0",
    userHasUpcomingBooking:
      amenity.user_has_upcoming_booking || amenity.userHasUpcomingBooking ? "1" : "0",
    userNextBookingDate:
      amenity.user_next_booking_date ?? amenity.userNextBookingDate ?? "",
    hasOverdueSharedAmenityBill:
      amenity.has_overdue_shared_amenity_bill || amenity.hasOverdueSharedAmenityBill ? "1" : "0",
    bookingFee: amenity.booking_fee != null ? String(amenity.booking_fee) : "0",
    displayFee:
      amenity.display_fee != null
        ? String(amenity.display_fee)
        : amenity.shared_billing_enabled
          ? String(amenity.shared_billing_amount ?? "0")
          : amenity.booking_fee != null
            ? String(amenity.booking_fee)
            : "0",
    sharedBillingEnabled: amenity.shared_billing_enabled ? "1" : "0",
    sharedBillingFrequency: amenity.shared_billing_frequency ?? "",
  };
}
