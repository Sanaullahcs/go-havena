import api, { isProxyMethodBlocked } from "./client";

export type PostStatus = "pending" | "approved" | "rejected";

export interface AdminPoll {
  question: string;
  description?: string | null;
  duration_days?: number;
  duration_hours?: number | null;
  voting_method?: "single" | "multiple" | string;
  started_at?: string;
  ends_at?: string;
  closed?: boolean;
  active?: boolean;
  options_count?: number;
  total_votes?: number | null;
  results_visible?: boolean;
  vote_changes_allowed?: boolean;
  winning_option_ids?: number[];
  leading_option_ids?: number[];
  is_tie?: boolean;
  no_participation?: boolean;
  options?: {
    id: number;
    label: string;
    votes?: number;
    percent?: number;
    is_winner?: boolean;
    is_leading?: boolean;
  }[];
}

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
  sensitive_report_threshold?: number;
  reports_until_sensitive?: number;
  report_status?: "published" | "reported" | "sensitive";
  reports_restricted?: boolean;
  can_mark_sensitive?: boolean;
  can_remove_post?: boolean;
  author_role?: string | null;
  tag: string;
  image_url: string | null;
  likes_count: number;
  comments_count: number;
  author_name: string;
  author_avatar: string | null;
  author_unit: string | null;
  created_at: string;
  is_mine?: boolean;
  poll?: AdminPoll | null;
}

export interface AdminPostStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  sensitive?: number;
  reported?: number;
  poll_open?: number;
  poll_closed?: number;
}

export type AdminFeedType = "posts" | "poll";

export interface AdminPostsQuery {
  page?: number;
  per_page?: number;
  status?: PostStatus | "all";
  search?: string;
  community_id?: number | "all";
  feed_type?: AdminFeedType;
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
  status?: "pending_review" | "dismissed" | "resolved" | string | null;
  resolution?: string | null;
  review_queue?: string | null;
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

export type AdminPollVoterOption = {
  id: number;
  label: string;
  position?: number;
};

export type AdminPollVoter = {
  user_id: number;
  name: string;
  role?: string | null;
  unit_number?: string | null;
  avatar_url?: string | null;
  voted_at?: string;
  selected_options: AdminPollVoterOption[];
};

export type AdminPollVotersPayload = {
  post_id: number;
  poll_id: number;
  question: string;
  voting_method?: "single" | "multiple" | string;
  unique_voters_count: number;
  voters: AdminPollVoter[];
};

export type AdminPollVotersMeta = {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
};

export async function fetchAdminPollVoters(
  postId: number,
  params: { page?: number; per_page?: number } = {},
) {
  const res = await api.get(`/v1/admin/posts/${postId}/poll-voters`, { params });
  return res.data as { data: AdminPollVotersPayload; meta: AdminPollVotersMeta };
}

export async function deleteAdminPost(id: number) {
  try {
    return await api.delete(`/v1/admin/posts/${id}`);
  } catch (err: unknown) {
    if (isProxyMethodBlocked(err)) {
      return api.post(`/v1/admin/posts/${id}/delete`);
    }
    throw err;
  }
}

export async function approvePost(id: number) {
  return api.post(`/v1/admin/posts/${id}/approve`);
}

export async function rejectPost(id: number, reason?: string) {
  return api.post(`/v1/admin/posts/${id}/reject`, reason ? { reason } : undefined);
}

export async function reportAdminPost(id: number, reason: string, type = "other") {
  const res = await api.post(`/v1/admin/posts/${id}/report`, { reason, type });
  return res.data as {
    message: string;
    data: { post_id: number; is_sensitive: boolean; reports_count: number };
  };
}

export async function releaseAdminPostFromSensitive(id: number) {
  const res = await api.post(`/v1/admin/posts/${id}/release-sensitive`);
  return res.data as {
    message: string;
    data: { post_id: number; is_sensitive: boolean; report_status: string };
  };
}

export async function dismissAdminPostReport(postId: number, reportId: number) {
  const res = await api.post(`/v1/admin/posts/${postId}/reports/${reportId}/dismiss`);
  return res.data as {
    message: string;
    data: { report_id: number; status: string; post_status: string; is_sensitive: boolean };
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
