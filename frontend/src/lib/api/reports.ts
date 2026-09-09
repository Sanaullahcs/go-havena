import api from "./client";

export interface Report {
  id: number; type: string; title: string; description: string;
  status: string; severity: string; created_at: string;
  reporter_name: string; reporter_unit: string | null;
  reported_name: string | null; community_id: number;
  listing_id?: number | null; listing_title?: string | null;
  notice_id?: number | null; event_title?: string | null;
  reported_user_id?: number | null;
}

export async function fetchReports(params?: Record<string, unknown>) {
  const res = await api.get("/v1/admin/reports", { params });
  return res.data as { data: Report[]; meta: { current_page: number; last_page: number; total: number } };
}

export async function resolveReport(id: number, note?: string) {
  return api.patch(`/v1/admin/reports/${id}/resolve`, { resolution_note: note });
}

export async function escalateReport(id: number) {
  return api.patch(`/v1/admin/reports/${id}/escalate`);
}

export async function dismissReport(id: number) {
  return api.patch(`/v1/admin/reports/${id}/dismiss`);
}

export async function fileReport(data: { type: string; title: string; description: string; severity?: string }) {
  const res = await api.post("/v1/reports", data);
  return res.data;
}
