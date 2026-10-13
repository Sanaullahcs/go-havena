"use client";

import { X } from "lucide-react";
import { FeedPostStatus } from "@/components/admin/feed-post-status";
import type { AdminPost } from "@/lib/api/posts";
import { resolveMediaUrl } from "@/lib/media/resolve-url";

export function FeedPostViewModal({
  post,
  onClose,
}: {
  post: AdminPost | null;
  onClose: () => void;
}) {
  if (!post) return null;

  const imageUrl = resolveMediaUrl(post.image_url);
  const isPoll = post.category === "poll" || post.poll != null;
  const pollQuestion = (post.poll?.question || post.body || post.content || "").trim();
  const pollDescription = (post.poll?.description ?? "").trim();
  const avatarUrl = resolveMediaUrl(post.author_avatar);
  const submitted = new Date(post.created_at).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Post details</h3>
            <p className="mt-0.5 text-xs text-slate-500">Post #{post.id}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <FeedPostStatus post={post} />
            <span className="text-xs text-slate-500">{submitted}</span>
          </div>

          <section className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Author</p>
            <div className="mt-3 flex items-center gap-3">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full border border-slate-200 object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
                  {(post.author_name ?? "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{post.author_name}</p>
                {post.author_unit ? (
                  <p className="text-sm text-slate-500">{post.author_unit}</p>
                ) : null}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Community</p>
            <p className="mt-2 text-sm font-medium text-slate-800">{post.community_name ?? "—"}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Category</p>
            <p className="mt-2 text-sm font-medium text-slate-800">{post.tag}</p>
          </section>

          <section className="rounded-xl border border-slate-100 p-4">
            {isPoll ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Question</p>
                <p className="mt-2 whitespace-pre-wrap text-[16px] font-semibold leading-6 text-[#0A2A43]">
                  {pollQuestion}
                </p>
                {pollDescription ? (
                  <>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Description</p>
                    <p className="mt-2 whitespace-pre-wrap text-[15px] leading-6 text-slate-600">{pollDescription}</p>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Content</p>
                <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-slate-700">
                  {post.body || post.content}
                </p>
              </>
            )}
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt=""
                className="mt-4 max-h-64 w-full rounded-xl border border-slate-200 object-cover"
              />
            ) : null}
          </section>
        </div>

        <div className="border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} className="nl-btn-secondary w-full justify-center">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
