/** Canonical property management stack routes (expo-router). */

export const PropertyManagementRoutes = {
  HOME: "/screens/property-management",
  AMENITY: "/screens/property-management/amenity",
  ALL_FACILITIES: "/screens/property-management/amenity/all-facilities",
  RESERVATION_CALENDAR:
    "/screens/property-management/amenity/all-facilities/reservation-calender",
  RESERVATION_RULE_DETAILS:
    "/screens/property-management/amenity/all-facilities/reservation-calender/rule-details",
  COMMUNITY_RULES: "/screens/property-management/community-rules",
  RULE_DETAIL: "/screens/property-management/community-rules/rule-detail",
  RULE_FORM: "/screens/property-management/community-rules/rule-form",
  DOCUMENTS: "/screens/property-management/documents",
  DOCUMENT_DETAIL: "/screens/property-management/documents/document-detail",
  DOCUMENT_FORM: "/screens/property-management/documents/document-form",
  MY_BOOKING: "/screens/property-management/my-booking",
  AMENITY_FORM: "/screens/property-management/amenity-form",
  ADMIN_BOOKINGS: "/screens/admin-bookings",
  ADMIN_AMENITIES: "/screens/admin-amenities",
};

export function amenityFacilityParams(amenity) {
  return {
    id: String(amenity.id ?? ""),
    name: amenity.name ?? "",
    description: amenity.description ?? "",
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
