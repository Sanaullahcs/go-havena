/** Canonical property management stack routes (expo-router). */

import { MarketplaceRoutes } from "./marketplace-routes";

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

/** Open the Services hub root, dropping leftover amenity/booking screens. */
export function openServicesHub(navigation, router, pathname) {
  const path = String(pathname ?? "");

  if (isPropertyManagementRootPath(path)) {
    try {
      if (router?.canDismiss?.()) router.dismissAll();
    } catch {
      // ignore
    }
    navigation?.navigate?.("services", { screen: "index" });
    return;
  }

  if (navigation?.navigate) {
    navigation.navigate("services", { screen: "index" });
  }

  const nestedInServicesTab =
    path.includes("/services/") || /(^|\/)services$/.test(path);

  if (nestedInServicesTab) {
    try {
      router?.dismissTo?.("/(tabs)/services");
    } catch {
      router?.replace?.("/(tabs)/services");
    }
    return;
  }

  if (!navigation?.navigate) {
    router?.navigate?.("/(tabs)/services");
  }
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
  };
}
