import api from "./client";

export interface Post {
  id: number; body: string; category: string; status?: "pending" | "approved" | "rejected"; image_url: string | null;
  likes_count: number; comments_count: number; liked_by_me: boolean;
  is_mine: boolean; created_at: string;
  author_name: string; author_avatar: string | null; author_unit: string | null;
}

export interface Comment {
  id: number;
  body: string;
  created_at: string;
  author_name: string;
  author_avatar: string | null;
  parent_id?: number | null;
  depth?: number;
  parent_author_name?: string | null;
  is_mine?: boolean;
  user_id?: number;
}

export async function fetchFeed(params?: Record<string, unknown>) {
  const res = await api.get("/v1/feed", { params });
  return res.data as { data: Post[]; meta: { current_page: number; last_page: number; total: number } };
}

export async function createPost(data: { body: string; category?: string }) {
  const res = await api.post("/v1/feed", data);
  return res.data;
}

export async function deletePost(id: number) {
  return api.delete(`/v1/feed/${id}`);
}

export async function likePost(id: number) {
  const res = await api.post(`/v1/feed/${id}/like`);
  return res.data as { liked: boolean };
}

export async function fetchComments(postId: number) {
  const res = await api.get(`/v1/feed/${postId}/comments`);
  return res.data.data as Comment[];
}

export async function addComment(postId: number, body: string, parentId?: number | null) {
  const res = await api.post(`/v1/feed/${postId}/comments`, {
    body,
    ...(parentId != null ? { parent_id: parentId } : {}),
  });
  return res.data;
}

export async function deleteComment(postId: number, commentId: number) {
  return api.delete(`/v1/feed/${postId}/comments/${commentId}`);
}
