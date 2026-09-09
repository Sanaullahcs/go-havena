import { apiRequest } from "./api-client";

export async function blockUser(userId) {
  const res = await apiRequest(`/users/${userId}/block`, { method: "POST" });
  return {
    message: res?.message ?? "User blocked successfully.",
    data: res?.data ?? null,
  };
}

export async function unblockUser(userId) {
  const res = await apiRequest(`/users/${userId}/block`, { method: "DELETE" });
  return {
    message: res?.message ?? "User unblocked.",
    data: res?.data ?? null,
  };
}

export async function fetchBlockedUsers() {
  const res = await apiRequest("/users/blocked");
  return res?.data ?? [];
}
