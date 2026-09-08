import { apiRequest } from "./api-client";

export async function fetchMyFamily() {
  const res = await apiRequest("/families/mine");
  return res.data ?? { state: "none" };
}

export async function fetchSuggestedFamilyNumber() {
  const res = await apiRequest("/families/suggest-number");
  return res.data ?? { family_number: "" };
}

export async function checkFamilyNumberAvailability(familyNumber) {
  const params = new URLSearchParams({ family_number: familyNumber });
  const res = await apiRequest(`/families/check-number?${params.toString()}`);
  return res.data ?? { available: false };
}

export async function ensureMyFamily(familyNumber) {
  const body = familyNumber ? { family_number: familyNumber } : {};
  if (__DEV__) {
    console.log("[family] POST /families/ensure", body);
  }
  try {
    const res = await apiRequest("/families/ensure", {
      method: "POST",
      body,
    });
    if (__DEV__) {
      console.log("[family] ensure response", res);
    }
    return res?.data ?? res ?? null;
  } catch (error) {
    if (__DEV__) {
      console.warn("[family] ensure failed", {
        status: error?.status,
        code: error?.code,
        message: error?.message,
        errors: error?.errors,
      });
    }
    throw error;
  }
}

export async function createFamily(name, familyNumber) {
  const body = {
    ...(name ? { name } : {}),
    ...(familyNumber ? { family_number: familyNumber } : {}),
  };
  if (__DEV__) {
    console.log("[family] POST /families", body);
  }
  try {
    const res = await apiRequest("/families", {
      method: "POST",
      body,
    });
    if (__DEV__) {
      console.log("[family] create response", res);
    }
    return res?.data ?? res;
  } catch (error) {
    if (__DEV__) {
      console.warn("[family] create failed", {
        status: error?.status,
        code: error?.code,
        message: error?.message,
        errors: error?.errors,
      });
    }
    throw error;
  }
}

export async function requestJoinFamily(familyNumber, message) {
  const res = await apiRequest("/families/join", {
    method: "POST",
    body: {
      family_number: familyNumber,
      ...(message ? { message } : {}),
    },
  });
  return res.data;
}

export async function leaveFamily() {
  return apiRequest("/families/leave", { method: "POST" });
}

export async function fetchPendingFamilyRequests() {
  const res = await apiRequest("/families/join-requests/pending");
  return {
    items: res.data ?? [],
    count: res.meta?.count ?? (res.data?.length ?? 0),
  };
}

export async function approveFamilyJoinRequest(id) {
  const res = await apiRequest(`/family-join-requests/${id}/approve`, { method: "PATCH" });
  return res.data;
}

export async function rejectFamilyJoinRequest(id, reason) {
  const res = await apiRequest(`/family-join-requests/${id}/reject`, {
    method: "PATCH",
    body: reason ? { reason } : {},
  });
  return res.data;
}

export async function cancelFamilyJoinRequest(id) {
  const res = await apiRequest(`/family-join-requests/${id}/cancel`, { method: "PATCH" });
  return res.data;
}

export async function suspendFamilyMember(userId) {
  const res = await apiRequest(`/families/members/${userId}/suspend`, { method: "PATCH" });
  return res.data;
}

export async function unsuspendFamilyMember(userId) {
  const res = await apiRequest(`/families/members/${userId}/unsuspend`, { method: "PATCH" });
  return res.data;
}

export async function removeFamilyMember(userId) {
  return apiRequest(`/families/members/${userId}`, { method: "DELETE" });
}

export async function blockFamilyMember(userId) {
  return apiRequest(`/families/members/${userId}/block`, { method: "PATCH" });
}

export async function submitAddFamilyMemberRequest(payload) {
  const res = await apiRequest("/families/add-member-requests", {
    method: "POST",
    body: payload,
  });
  return res.data;
}

export async function approveFamilyAddMemberRequest(id) {
  const res = await apiRequest(`/family-add-member-requests/${id}/approve`, { method: "PATCH" });
  return res.data;
}

export async function rejectFamilyAddMemberRequest(id, reason) {
  const res = await apiRequest(`/family-add-member-requests/${id}/reject`, {
    method: "PATCH",
    body: reason ? { reason } : {},
  });
  return res.data;
}
