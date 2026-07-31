import { apiRequest } from "./api-client";

export async function fetchResidentStats() {
  const res = await apiRequest("/dashboard/stats");
  return res.data ?? {};
}
