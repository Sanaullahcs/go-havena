import api from "./client";
import { getAdminCommunityId } from "./members";

export interface Amenity {
  id: number;
  community_id?: number;
  created_by?: number | null;
  creator_name?: string | null;
  name: string;
  description: string | null;
  status: "open" | "bookable" | "closed" | string;
  review_status?: "pending" | "approved" | "rejected" | string;
  rejection_reason?: string | null;
  capacity: number;
  floor: string | null;
  image_url: string | null;
  icon_key?: string | null;
  community_name?: string | null;
  shared_billing_enabled?: boolean;
  shared_billing_type?: "all_residents" | string | null;
  shared_billing_frequency?: "monthly" | string | null;
  shared_billing_amount?: number | null;
  shared_billing_due_day?: number | null;
  booking_fee?: number | null;
  has_overdue_shared_amenity_bill?: boolean;
  hours: string | null;
  start_time?: string | null;
  end_time?: string | null;
  hours_overnight?: boolean;
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
  booking_fee?: number;
  status: string;
  payment_verification_status?: string | null;
  payment_method?: string | null;
  ach_status?: string | null;
  bank_payment?: {
    id?: string;
    status?: string;
    status_label?: string;
    amount?: number;
  } | null;
  notes?: string | null;
  rejection_reason?: string | null;
  payment_proof?: AmenityPaymentProof | null;
  user_name?: string;
  user_unit?: string | null;
  created_at?: string | null;
  requested_at?: string | null;
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
  shared_billing_enabled?: boolean;
  shared_billing_type?: string | null;
  shared_billing_frequency?: string | null;
  shared_billing_amount?: number | null;
  shared_billing_due_day?: number | null;
  booking_fee?: number | null;
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
  start_day_offset?: number;
  end_day_offset?: number;
  starts_at?: string | null;
  ends_at?: string | null;
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
  const communityId = getAdminCommunityId();
  const res = await api.get("/v1/bookings/inbox", {
    params: {
      ...params,
      ...(communityId ? { community_id: communityId } : {}),
    },
    headers: communityId ? { "X-Community-Id": String(communityId) } : undefined,
  });
  return res.data.data as Booking[];
}

export async function createBooking(data: {
  amenity_id: number;
  date: string;
  time_slot?: string;
  guests?: number;
  notes?: string;
  payment_proof?: File | null;
  payment_date?: string;
  payment_reference?: string;
  payment_note?: string;
  payment_method?: "bank_ach" | "proof";
}) {
  if (data.payment_method === "bank_ach") {
    const res = await api.post("/v1/bookings", {
      amenity_id: data.amenity_id,
      date: data.date,
      time_slot: data.time_slot,
      guests: data.guests,
      notes: data.notes,
      payment_method: "bank_ach",
    });
    return res.data;
  }

  if (data.payment_proof) {
    const form = new FormData();
    form.append("amenity_id", String(data.amenity_id));
    form.append("date", data.date);
    if (data.time_slot) form.append("time_slot", data.time_slot);
    if (data.guests != null) form.append("guests", String(data.guests));
    if (data.notes) form.append("notes", data.notes);
    if (data.payment_date) form.append("payment_date", data.payment_date);
    if (data.payment_reference) form.append("payment_reference", data.payment_reference);
    if (data.payment_note) form.append("payment_note", data.payment_note);
    form.append("payment_proof", data.payment_proof);
    const res = await api.post("/v1/bookings", form);
    return res.data;
  }

  const res = await api.post("/v1/bookings", {
    amenity_id: data.amenity_id,
    date: data.date,
    time_slot: data.time_slot,
    guests: data.guests,
    notes: data.notes,
  });
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

export type AmenityMonthlyBill = {
  id: number;
  amenity_id: number;
  amenity_name?: string | null;
  community_id: number;
  billing_month: string;
  billing_month_label: string;
  title: string;
  description: string | null;
  amount_per_resident: number;
  amount?: number;
  due_date: string;
  status?: string;
  status_label?: string;
  file_url: string | null;
  file_name: string | null;
  file_size?: number | null;
  file_size_label?: string | null;
  mime_type?: string | null;
  resident_count?: number;
  unpaid_count?: number;
  pending_count?: number;
  paid_count?: number;
  rejected_count?: number;
  overdue_count?: number;
  total_residents_billed?: number;
  total_amount_expected?: number;
  total_amount_paid?: number;
  outstanding_amount?: number;
  resident_bill_id?: number;
  can_submit_proof?: boolean;
  payment_method?: string | null;
  ach_status?: string | null;
  payment_proof?: AmenityPaymentProof | null;
  payment_acknowledgement?: AmenityPaymentAcknowledgement | null;
  rejection_reason?: string | null;
  has_overdue_shared_amenity_bill?: boolean;
  has_outstanding_previous_bill?: boolean;
  outstanding_previous_bill?: AmenityOutstandingPreviousBill | null;
  paid_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  published_at?: string | null;
  created_at?: string | null;
};

export type AmenityOutstandingPreviousBill = {
  resident_bill_id: number;
  billing_month: string;
  billing_month_label: string;
  amount: number;
  due_date: string;
  status: string;
  status_label: string;
};

export type AmenityResidentPayment = {
  id: number;
  resident_bill_id: number;
  monthly_bill_id: number;
  amenity_id: number;
  community_id: number;
  user_id: number;
  resident_name: string | null;
  unit_number: string | null;
  amenity_name: string | null;
  billing_month: string;
  billing_month_label: string;
  amount: number;
  due_date?: string | null;
  status: string;
  status_label: string;
  can_review: boolean;
  payment_proof?: AmenityPaymentProof | null;
  payment_acknowledgement?: AmenityPaymentAcknowledgement | null;
  rejection_reason?: string | null;
  proof_submitted_by?: number | null;
  proof_submitted_at?: string | null;
  paid_at?: string | null;
  approved_by?: number | null;
  approved_at?: string | null;
  rejected_by?: number | null;
  rejected_at?: string | null;
};

export type AmenityPaymentAcknowledgement = {
  amenity_name: string;
  billing_month: string;
  billing_month_label: string;
  amount: number;
  payment_date: string | null;
  approved_at: string | null;
  payment_reference: string | null;
  status: string;
  status_label: string;
  acknowledged_by_label: string;
  message: string;
};

export type AmenityPaymentReview = {
  id: number;
  action: string;
  action_label: string;
  actor_id: number | null;
  actor_name: string | null;
  status_from: string | null;
  status_from_label: string | null;
  status_to: string | null;
  status_to_label: string | null;
  proof?: AmenityPaymentProof | null;
  rejection_reason: string | null;
  created_at: string;
};

export type AmenityPaymentRejectionCode =
  | "unclear_proof"
  | "amount_mismatch"
  | "incorrect_bill"
  | "invalid_receipt"
  | "other";

export type AmenityPaymentProof = {
  file_url: string | null;
  file_name: string | null;
  file_size?: number | null;
  file_size_label?: string | null;
  mime_type?: string | null;
  payment_date: string | null;
  payment_reference: string | null;
  payment_note: string | null;
  submitted_at?: string | null;
};

export type AmenityPaymentProofForm = {
  file: File | null;
  payment_date: string;
  payment_reference: string;
  payment_note: string;
};

export type AmenityMonthlyBillForm = {
  billing_month: string;
  title: string;
  description: string;
  amount_per_resident: string;
  due_date: string;
  file: File | null;
};

export async function fetchAdminAmenityBills(amenityId: number) {
  const res = await api.get(`/v1/admin/amenities/${amenityId}/bills`);
  return res.data.data as AmenityMonthlyBill[];
}

export async function publishAmenityMonthlyBill(amenityId: number, payload: AmenityMonthlyBillForm) {
  const form = new FormData();
  form.append("billing_month", payload.billing_month);
  form.append("title", payload.title.trim());
  if (payload.description.trim()) form.append("description", payload.description.trim());
  form.append("amount_per_resident", payload.amount_per_resident);
  form.append("due_date", payload.due_date);
  if (payload.file) form.append("file", payload.file);
  const res = await api.post(`/v1/admin/amenities/${amenityId}/bills`, form);
  return res.data.data as AmenityMonthlyBill;
}

export async function fetchAmenityBills(amenityId: number) {
  const res = await api.get(`/v1/amenities/${amenityId}/bills`);
  return res.data.data as AmenityMonthlyBill[];
}

export async function fetchAdminAmenityResidentBills(
  amenityId: number,
  monthlyBillId: number,
  status?: string,
) {
  const res = await api.get(`/v1/admin/amenities/${amenityId}/bills/${monthlyBillId}/residents`, {
    params: status && status !== "all" ? { status } : undefined,
  });
  return res.data.data as AmenityResidentPayment[];
}

export async function fetchAdminAmenityResidentBillReviews(amenityId: number, residentBillId: number) {
  const res = await api.get(`/v1/admin/amenities/${amenityId}/resident-bills/${residentBillId}/reviews`);
  return res.data.data as AmenityPaymentReview[];
}

export async function approveAmenityResidentPayment(amenityId: number, residentBillId: number) {
  const res = await api.patch(`/v1/admin/amenities/${amenityId}/resident-bills/${residentBillId}/approve`);
  return {
    data: res.data.data as AmenityResidentPayment,
    message: (res.data.message as string | undefined) ?? "Payment approved successfully.",
  };
}

export async function rejectAmenityResidentPayment(
  amenityId: number,
  residentBillId: number,
  payload: { rejection_code: AmenityPaymentRejectionCode; rejection_reason?: string },
) {
  const res = await api.patch(`/v1/admin/amenities/${amenityId}/resident-bills/${residentBillId}/reject`, payload);
  return {
    data: res.data.data as AmenityResidentPayment,
    message: (res.data.message as string | undefined) ?? "Payment rejected.",
  };
}

export async function submitAmenityBillProof(
  amenityId: number,
  residentBillId: number,
  payload: AmenityPaymentProofForm,
) {
  const form = new FormData();
  if (payload.file) form.append("file", payload.file);
  form.append("payment_date", payload.payment_date);
  if (payload.payment_reference.trim()) form.append("payment_reference", payload.payment_reference.trim());
  if (payload.payment_note.trim()) form.append("payment_note", payload.payment_note.trim());
  const res = await api.post(`/v1/amenities/${amenityId}/bills/${residentBillId}/proof`, form);
  return {
    data: res.data.data as AmenityMonthlyBill,
    message: (res.data.message as string | undefined) ?? "Payment proof submitted. Your Community Admin will review it.",
  };
}
