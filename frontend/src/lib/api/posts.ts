import api from "./client";

export type PostStatus = "pending" | "approved" | "rejected";

export interface AdminPost {
  id: number;
  community_id: number;
  community_name?: string | null;
  user_id: number;
  body: string;
  content: string;
  category: string;
  status: PostStatus;
  tag: string;
  image_url: string | null;
  likes_count: number;
  comments_count: number;
  author_name: string;
  author_avatar: string | null;
  author_unit: string | null;
  created_at: string;
  is_mine?: boolean;
}

export interface AdminPostStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

export interface AdminPostsQuery {
  page?: number;
  per_page?: number;
  status?: PostStatus | "all";
  search?: string;
  community_id?: number | "all";
}

export async function fetchAdminPosts(params: AdminPostsQuery = {}) {
  const res = await api.get("/v1/admin/posts", { params });
  return res.data as {
    data: AdminPost[];
    meta: {
      current_page: number;
      last_page: number;
      total: number;
      per_page: number;
      stats?: AdminPostStats;
    };
  };
}

export async function approvePost(id: number) {
  return api.patch(`/v1/admin/posts/${id}/approve`);
}

export async function rejectPost(id: number, reason?: string) {
  return api.patch(`/v1/admin/posts/${id}/reject`, reason ? { reason } : undefined);
}

export function postStatusLabel(status: PostStatus): string {
  switch (status) {
    case "pending":
      return "Pending review";
    case "approved":
      return "Published";
    case "rejected":
      return "Rejected";
    default:
      return status;
  }
}
