"use client";

import { AdminBadge } from "@/components/admin/ui";
import type { AdminPost } from "@/lib/api/posts";

export function FeedPostStatus({ post }: { post: AdminPost }) {
  const pending = !post.reports_restricted && (post.resident_reports_count ?? 0) > 0;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {post.is_sensitive ? (
        <AdminBadge tone="amber">Sensitive</AdminBadge>
      ) : (
        <AdminBadge tone="green">Published</AdminBadge>
      )}
      {pending ? <AdminBadge tone="red">Pending review</AdminBadge> : null}
    </div>
  );
}
