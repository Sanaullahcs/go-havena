import api from "./client";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";

export type NotificationListMeta = {
  total: number;
  last_page: number;
  per_page: number;
  current_page: number;
  total_all: number;
  warning: number;
  message: number;
  system?: number;
  events?: number;
  notices?: number;
  amenities?: number;
  others?: number;
};

export type NotificationListResponse = {
  data: Record<string, unknown>[];
  unread: number;
  meta?: NotificationListMeta;
};

export async function fetchNotifications(params?: {
  page?: number;
  per_page?: number;
  type?: string;
  module?: string;
  unread_only?: boolean;
}): Promise<NotificationListResponse> {
  const res = await api.get("/v1/notifications", {
    params: {
      per_page: ADMIN_TABLE_PAGE_SIZE,
      ...params,
    },
  });
  return res.data as NotificationListResponse;
}

export async function markNotificationRead(id: number) {
  return api.post(`/v1/notifications/${id}/read`);
}

export async function markAllRead() {
  return api.post("/v1/notifications/read-all");
}
