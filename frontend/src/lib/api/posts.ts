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
  is_sensitive?: boolean;
  reports_count?: number | null;
  resident_reports_count?: number | null;
  report_status?: "published" | "reported" | "sensitive";
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
  sensitive?: number;
  reported?: number;
}

export interface AdminPostsQuery {
  page?: number;
  per_page?: number;
  status?: PostStatus | "all";
  search?: string;
  community_id?: number | "all";
}

export interface AdminPostComment {
  id: number;
  body: string;
  created_at: string;
  author_name: string;
  author_avatar: string | null;
  parent_id?: number | null;
  depth?: number;
  parent_author_name?: string | null;
  likes_count?: number;
}

export interface AdminPostReport {
  id: number;
  post_id: number;
  comment_id?: number | null;
  target?: "post" | "comment" | string;
  reporter_id: number;
  reporter_name: string;
  reporter_role?: string | null;
  reported_user_id?: number | null;
  comment_author_name?: string | null;
  comment_body?: string | null;
  source?: "resident" | "admin" | string;
  type?: string | null;
  reason: string;
  created_at: string;
}

export function postReportStatusLabel(post: Pick<AdminPost, "report_status" | "is_sensitive" | "resident_reports_count" | "reports_count">): "Published" | "Reported" | "Sensitive" {
  if (post.report_status === "sensitive" || post.is_sensitive) return "Sensitive";
  if (post.report_status === "reported" || (post.resident_reports_count ?? 0) > 0) return "Reported";
  return "Published";
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

export async function fetchAdminPostDetail(id: number) {
  const res = await api.get(`/v1/admin/posts/${id}`);
  return res.data as {
    data: AdminPost;
    comments: AdminPostComment[];
  };
}

export async function deleteAdminPost(id: number) {
  return api.delete(`/v1/admin/posts/${id}`);
}

export async function approvePost(id: number) {
  return api.patch(`/v1/admin/posts/${id}/approve`);
}

export async function rejectPost(id: number, reason?: string) {
  return api.patch(`/v1/admin/posts/${id}/reject`, reason ? { reason } : undefined);
}

export async function reportAdminPost(id: number, reason: string, type = "other") {
  const res = await api.post(`/v1/admin/posts/${id}/report`, { reason, type });
  return res.data as {
    message: string;
    data: { post_id: number; is_sensitive: boolean; reports_count: number };
  };
}

export async function fetchAdminPostReports(id: number) {
  const res = await api.get(`/v1/admin/posts/${id}/reports`);
  return res.data as {
    data: AdminPostReport[];
    meta: { total: number };
  };
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
