import { API_BASE_URL } from "../constants/api-config";
import { apiRequest, ApiError } from "./api-client";
import { getCommunityId, getToken } from "./auth-session";
import { HOME_SECTION_CARD_LIMIT } from "../constants/home-sections";
import { guessImageMeta } from "../utils/upload-form-data";
import i18n from "../i18n";

export async function fetchAmenities() {
  const res = await apiRequest("/amenities");
  return res.data ?? [];
}

/** Latest approved community amenities for the home Property Management card. */
export function pickLatestApprovedAmenities(
  amenities = [],
  limit = HOME_SECTION_CARD_LIMIT,
) {
  return [...amenities]
    .filter(
      (amenity) =>
        (amenity?.review_status ?? "approved") === "approved" &&
        amenity?.status !== "closed",
    )
    .sort((a, b) => {
      const aKey = String(a?.updated_at ?? a?.created_at ?? "");
      const bKey = String(b?.updated_at ?? b?.created_at ?? "");
      if (aKey && bKey && aKey !== bKey) return bKey.localeCompare(aKey);
      return Number(b?.id ?? 0) - Number(a?.id ?? 0);
    })
    .slice(0, limit);
}

/** Create amenity (resident → pending review, admin → active). */
export async function submitAmenity(payload) {
  const res = await apiRequest("/amenities", {
    method: "POST",
    body: payload,
  });
  return { data: res.data, message: res.message };
}

export async function fetchAmenitySlots(amenityId, date) {
  const res = await apiRequest(`/amenities/${amenityId}/slots?date=${encodeURIComponent(date)}`);
  return {
    slots: res.data ?? [],
    closed: Boolean(res.closed),
    message: res.message,
    weekendsAvailable: res.weekends_available !== false,
    userAlreadyBooked: Boolean(res.user_already_booked),
  };
}

export async function fetchMyBookings() {
  const res = await apiRequest("/bookings");
  return res.data ?? [];
}

/** Bookings waiting on the current user (creator) or community admin. */
export async function fetchBookingInbox({ status } = {}) {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  const query = params.toString();
  const res = await apiRequest(`/bookings/inbox${query ? `?${query}` : ""}`);
  return res.data ?? [];
}

export async function bookAmenity({
  amenity_id,
  date,
  time_slot,
  notes,
  guests,
  paymentProof,
  paymentDate,
  paymentReference,
  paymentNote,
}) {
  if (paymentProof?.uri) {
    const token = await getToken();
    if (!token) throw new ApiError(i18n.t("imagePicker.signInRequired"), { status: 401 });

    const communityId = await getCommunityId();
    const { mimeType, fileName } = guessImageMeta(paymentProof.uri, paymentProof, "booking-proof");
    const formData = new FormData();
    formData.append("amenity_id", String(amenity_id));
    formData.append("date", date);
    if (time_slot) formData.append("time_slot", time_slot);
    if (notes) formData.append("notes", notes);
    if (guests != null) formData.append("guests", String(guests));
    if (paymentDate) formData.append("payment_date", paymentDate);
    if (paymentReference) formData.append("payment_reference", paymentReference);
    if (paymentNote) formData.append("payment_note", paymentNote);
    formData.append("payment_proof", { uri: paymentProof.uri, name: fileName, type: mimeType });

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    if (communityId) headers["X-Community-Id"] = String(communityId);
    if (API_BASE_URL.includes("loca.lt")) headers["Bypass-Tunnel-Reminder"] = "true";

    const response = await fetch(`${API_BASE_URL}/bookings`, {
      method: "POST",
      headers,
      body: formData,
    });
    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { message: text };
      }
    }
    if (!response.ok) {
      throw new ApiError(body?.message ?? i18n.t("propertyMgmt.couldNotBook"), {
        status: response.status,
        errors: body?.errors,
      });
    }
    return body?.data ?? null;
  }

  const body = { amenity_id, date };
  if (time_slot) body.time_slot = time_slot;
  if (notes) body.notes = notes;
  if (guests != null) body.guests = guests;
  const res = await apiRequest("/bookings", { method: "POST", body });
  return res.data;
}

export async function cancelBooking(id) {
  await apiRequest(`/bookings/${id}`, { method: "DELETE" });
}

export async function approveBooking(id) {
  return apiRequest(`/bookings/${id}/approve`, { method: "PATCH" });
}

export async function rejectBooking(id, reason) {
  return apiRequest(`/bookings/${id}/reject`, {
    method: "PATCH",
    body: reason ? { reason } : {},
  });
}

/* ── Admin amenities ── */

export async function fetchAdminAmenities({ status, review_status, search } = {}) {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  if (review_status && review_status !== "all") params.set("review_status", review_status);
  if (search?.trim()) params.set("search", search.trim());
  const query = params.toString();
  const res = await apiRequest(`/admin/amenities${query ? `?${query}` : ""}`);
  return {
    data: res.data ?? [],
    pendingReview: res.pending_review ?? 0,
  };
}

export async function createAmenity(payload) {
  const res = await apiRequest("/admin/amenities", {
    method: "POST",
    body: payload,
  });
  return res.data;
}

export async function updateAmenity(id, payload) {
  const res = await apiRequest(`/admin/amenities/${id}`, {
    method: "PATCH",
    body: payload,
  });
  return res.data;
}

export async function deleteAmenity(id) {
  return apiRequest(`/admin/amenities/${id}`, { method: "DELETE" });
}

export async function approveAmenity(id) {
  return apiRequest(`/admin/amenities/${id}/approve`, { method: "PATCH" });
}

export async function rejectAmenity(id, reason) {
  return apiRequest(`/admin/amenities/${id}/reject`, {
    method: "PATCH",
    body: reason ? { reason } : {},
  });
}

export async function fetchAmenityBills(amenityId) {
  const res = await apiRequest(`/amenities/${amenityId}/bills`);
  return res.data ?? [];
}

export async function submitAmenityBillProof(amenityId, residentBillId, { fileAsset, paymentDate, paymentReference, paymentNote }) {
  const token = await getToken();
  if (!token) throw new ApiError(i18n.t("imagePicker.signInRequired"), { status: 401 });

  const communityId = await getCommunityId();
  const { mimeType, fileName } = guessImageMeta(fileAsset?.uri, fileAsset ?? {}, "payment-proof");
  const formData = new FormData();
  if (paymentDate) formData.append("payment_date", paymentDate);
  if (paymentReference) formData.append("payment_reference", paymentReference);
  if (paymentNote) formData.append("payment_note", paymentNote);
  if (fileAsset?.uri) {
    formData.append("file", { uri: fileAsset.uri, name: fileName, type: mimeType });
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (communityId) headers["X-Community-Id"] = String(communityId);
  if (API_BASE_URL.includes("loca.lt")) headers["Bypass-Tunnel-Reminder"] = "true";

  const response = await fetch(
    `${API_BASE_URL}/amenities/${amenityId}/bills/${residentBillId}/proof`,
    { method: "POST", headers, body: formData },
  );
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }
  }
  if (!response.ok) {
    throw new ApiError(body?.message ?? i18n.t("propertyMgmt.couldNotSubmitProof"), {
      status: response.status,
      errors: body?.errors,
    });
  }
  return {
    data: body?.data ?? null,
    message: body?.message ?? i18n.t("propertyMgmt.paymentProofSubmitted"),
  };
}

/** @deprecated Prefer fetchBookingInbox — kept for older call sites. */
export async function fetchAdminBookings({ status } = {}) {
  return fetchBookingInbox({ status });
}
