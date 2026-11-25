"use client";

import { AdminBadge } from "@/components/admin/ui";
import type { AdminPost } from "@/lib/api/posts";

const ROW_BLOCK_CLASS = "flex min-h-[3.5rem] w-full min-w-0 items-center py-0.5";

/** Publication / sensitivity state only (reports live in FeedPostReportsCell). */
export function FeedPostStatus({ post }: { post: AdminPost }) {
  const isPoll = post.category === "poll" || Boolean(post.poll);

  if (post.is_sensitive) {
    return (
      <div className={ROW_BLOCK_CLASS}>
        <div className="flex min-w-0 flex-col gap-1">
          <AdminBadge tone="amber">Sensitive</AdminBadge>
          {isPoll ? (
            <span className="text-[10.5px] leading-4 text-slate-500">Voting paused</span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={ROW_BLOCK_CLASS}>
      <AdminBadge tone="green">Published</AdminBadge>
    </div>
  );
}
