import api from "./client";

export interface Amenity {
  id: number;
  community_id?: number;
  created_by?: number | null;
  creator_name?: string | null;
  name: string;
  description: string | null;
  status: "open" | "bookable" | "closed" | string;
  review_status?: "pending" | "approved" | "rejected" | string;
  capacity: number;
  floor: string | null;
  image_url: string | null;
  icon_key?: string | null;
  hours: string | null;
  start_time?: string | null;
  end_time?: string | null;
  weekends_available?: boolean;
  slot_duration_minutes?: number | null;
  slots?: Array<{ label: string; value: string; start: string; end: string }>;
  is_mine?: boolean;
  user_has_upcoming_booking?: boolean;
  user_next_booking_id?: number | null;
  user_next_booking_date?: string | null;
  user_next_booking_time_slot?: string | null;
  user_next_booking_status?: string | null;
  user_next_booking_guests?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface Booking {
  id: number;
  amenity_id: number;
  amenity_name: string;
  amenity_image: string | null;
  amenity_icon_key?: string | null;
  amenity_description?: string | null;
  amenity_capacity?: number | null;
  amenity_floor?: string | null;
  amenity_hours?: string | null;
  date: string;
  time_slot: string | null;
  guests: number;
  status: string;
  notes?: string | null;
  user_name?: string;
  user_unit?: string | null;
}

export type AmenityFormPayload = {
  name: string;
  description?: string | null;
  status: "open" | "bookable" | "closed";
  capacity: number;
  floor?: string | null;
  hours?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  weekends_available?: boolean;
  slot_duration_minutes?: number | null;
  icon_key: string;
};

export async function fetchAmenities() {
  const res = await api.get("/v1/amenities");
  return res.data.data as Amenity[];
}

export async function createResidentAmenity(data: AmenityFormPayload) {
  const res = await api.post("/v1/amenities", data);
  return res.data;
}

export type AmenitySlot = {
  label: string;
  value: string;
  start: string;
  end: string;
};

export type AmenitySlotResult = {
  slots: Array<AmenitySlot & { available?: boolean }>;
  closed: boolean;
  message?: string;
  weekendsAvailable: boolean;
  userAlreadyBooked: boolean;
};

export async function fetchAmenitySlots(amenityId: number, date: string): Promise<AmenitySlotResult> {
  const res = await api.get(`/v1/amenities/${amenityId}/slots`, {
    params: { date },
  });
  return {
    slots: (res.data.data ?? []) as Array<AmenitySlot & { available?: boolean }>,
    closed: Boolean(res.data.closed),
    message: res.data.message as string | undefined,
    weekendsAvailable: res.data.weekends_available !== false,
    userAlreadyBooked: Boolean(res.data.user_already_booked),
  };
}

export async function fetchMyBookings() {
  const res = await api.get("/v1/bookings");
  return res.data.data as Booking[];
}

export async function fetchBookingInbox(params?: { status?: string }) {
  const res = await api.get("/v1/bookings/inbox", { params });
  return res.data.data as Booking[];
}

export async function createBooking(data: {
  amenity_id: number;
  date: string;
  time_slot?: string;
  guests?: number;
  notes?: string;
}) {
  const res = await api.post("/v1/bookings", data);
  return res.data;
}

export async function cancelBooking(id: number) {
  try {
    return await api.delete(`/v1/bookings/${id}`);
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 403 || status === 405) {
      return api.post(`/v1/bookings/${id}/cancel`);
    }
    throw err;
  }
}

export async function approveBooking(id: number) {
  return api.patch(`/v1/bookings/${id}/approve`);
}

export async function rejectBooking(id: number, reason?: string) {
  return api.patch(`/v1/bookings/${id}/reject`, reason ? { reason } : {});
}

export async function fetchAdminAmenities(params?: {
  status?: string;
  review_status?: string;
  search?: string;
}) {
  const res = await api.get("/v1/admin/amenities", { params });
  return {
    data: res.data.data as Amenity[],
    total: res.data.total as number,
    pendingReview: (res.data.pending_review as number) ?? 0,
  };
}

export async function createAmenity(data: AmenityFormPayload) {
  const res = await api.post("/v1/admin/amenities", data);
  return res.data.data as Amenity;
}

export async function updateAmenity(id: number, data: Partial<AmenityFormPayload>) {
  const res = await api.patch(`/v1/admin/amenities/${id}`, data);
  return res.data.data as Amenity;
}

export async function deleteAmenity(id: number) {
  return api.delete(`/v1/admin/amenities/${id}`);
}

export async function approveAmenity(id: number) {
  return api.patch(`/v1/admin/amenities/${id}/approve`);
}

export async function rejectAmenity(id: number, reason?: string) {
  return api.patch(`/v1/admin/amenities/${id}/reject`, reason ? { reason } : {});
}
