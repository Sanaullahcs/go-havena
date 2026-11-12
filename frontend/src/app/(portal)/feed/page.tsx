"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { formatAccountDisplayName } from "@/lib/user/email-display";
import { confirmDelete, toastSuccess, toastInfo, toastError } from "@/lib/alert";
import {
  fetchFeed, createPost, deletePost, likePost, voteOnPoll,
  fetchComments, addComment, deleteComment,
  type Post as ApiPost, type Comment as ApiComment,
} from "@/lib/api/feed";
import { apiError } from "@/lib/api/client";
import { PageLoader } from "@/components/shared/page-states";

const C = {
  navy: "#0A2A43",
  teal: "#0D9488",
  primary: "#14B8A6",
  mint: "#D1FAF5",
  canvas: "#F4F8FD",
  white: "#FFFFFF",
  muted: "rgba(10, 42, 67, 0.55)",
  soft: "rgba(10, 42, 67, 0.42)",
  border: "rgba(10, 42, 67, 0.10)",
  borderSoft: "rgba(10, 42, 67, 0.06)",
} as const;

const AVATAR_COLORS = [C.navy, C.teal, C.primary];
const ac = (i: number) => AVATAR_COLORS[i % AVATAR_COLORS.length];

const CAT_TONE: Record<string, { color: string }> = {
  general: { color: C.navy },
  event:   { color: C.primary },
  help:    { color: C.teal },
  sale:    { color: C.teal },
  update:  { color: C.primary },
};
const CAT_LABEL: Record<string, string> = {
  general: "General", event: "Event", help: "Help", sale: "For Sale", update: "Update",
  announcement: "Announcement", poll: "Poll",
};

function formatFeedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  if (diff >= 0 && diff < 60_000) return "Just now";
  if (diff >= 0 && diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff >= 0 && diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function initialsOf(name: string) {
  return name.split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

type FeedFilter = "all" | "events" | "updates" | "help";
const PREVIEW_REPLY_COUNT = 1;

type CommentDisplayRow =
  | { type: "comment"; comment: ApiComment }
  | { type: "view_all"; parentId: number; total: number }
  | { type: "hide"; parentId: number; total: number };

function buildCommentDisplayRows(
  comments: ApiComment[],
  expandedThreads: Set<number>
): CommentDisplayRow[] {
  const rows: CommentDisplayRow[] = [];
  let i = 0;
  while (i < comments.length) {
    const comment = comments[i];
    const depth = Math.max(0, Math.min(comment.depth ?? 0, 2));
    if (depth === 0) {
      rows.push({ type: "comment", comment });
      i += 1;
      const replies: ApiComment[] = [];
      while (i < comments.length) {
        const next = comments[i];
        const nextDepth = Math.max(0, Math.min(next.depth ?? 0, 2));
        if (nextDepth === 0) break;
        replies.push(next);
        i += 1;
      }
      const expanded = expandedThreads.has(comment.id);
      if (replies.length > PREVIEW_REPLY_COUNT && !expanded) {
        replies.slice(0, PREVIEW_REPLY_COUNT).forEach((reply) =>
          rows.push({ type: "comment", comment: reply })
        );
        rows.push({ type: "view_all", parentId: comment.id, total: replies.length });
      } else {
        replies.forEach((reply) => rows.push({ type: "comment", comment: reply }));
        if (expanded && replies.length > PREVIEW_REPLY_COUNT) {
          rows.push({ type: "hide", parentId: comment.id, total: replies.length });
        }
      }
    } else {
      rows.push({ type: "comment", comment });
      i += 1;
    }
  }
  return rows;
}

export default function FeedPage() {
  const user      = getUser();
  const searchParams = useSearchParams();
  const highlightPostId = searchParams.get("post");
  const myName    = formatAccountDisplayName(user, "You");
  const myInitials = myName.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();
  const highlightedRef = useRef<HTMLElement | null>(null);

  const [posts, setPosts]         = useState<ApiPost[]>([]);
  const [loading, setLoading]     = useState(true);
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  const [draft, setDraft]         = useState("");
  const [posting, setPosting]     = useState(false);

  const [expandedComments, setExpandedComments]     = useState<Set<number>>(new Set());
  const [commentsByPost, setCommentsByPost]         = useState<Record<number, ApiComment[]>>({});
  const [loadingComments, setLoadingComments]       = useState<Set<number>>(new Set());
  const [commentDraft, setCommentDraft]             = useState<Record<number, string>>({});
  const [replyToByPost, setReplyToByPost]           = useState<Record<number, { id: number; name: string } | null>>({});
  const [expandedThreadsByPost, setExpandedThreadsByPost] = useState<Record<number, Set<number>>>({});
  const commentInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const toggleThread = (postId: number, parentId: number) => {
    setExpandedThreadsByPost((prev) => {
      const current = new Set(prev[postId] ?? []);
      if (current.has(parentId)) current.delete(parentId);
      else current.add(parentId);
      return { ...prev, [postId]: current };
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {};
      if (feedFilter === "events")  params.category = "event";
      if (feedFilter === "updates") params.category = "update";
      if (feedFilter === "help")    params.category = "help";
      const res = await fetchFeed(params);
      setPosts(res.data);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, [feedFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!highlightPostId || loading) return;
    const postId = Number(highlightPostId);
    if (!Number.isFinite(postId) || postId <= 0) return;
    if (!posts.some((p) => p.id === postId)) return;

    setExpandedComments((prev) => {
      const next = new Set(prev);
      next.add(postId);
      return next;
    });

    if (!commentsByPost[postId] && !loadingComments.has(postId)) {
      setLoadingComments((s) => new Set(s).add(postId));
      fetchComments(postId)
        .then((comments) => {
          setCommentsByPost((prev) => ({ ...prev, [postId]: comments }));
        })
        .catch(() => {})
        .finally(() => {
          setLoadingComments((s) => {
            const n = new Set(s);
            n.delete(postId);
            return n;
          });
        });
    }

    const frame = window.requestAnimationFrame(() => {
      highlightedRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
    // Intentionally omit commentsByPost/loadingComments to avoid refetch loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightPostId, loading, posts]);

  /* toggle like (optimistic) */
  const toggleLike = async (postId: number) => {
    setPosts((prev) => prev.map((p) => {
      if (p.id !== postId) return p;
      const willLike = !p.liked_by_me;
      return { ...p, liked_by_me: willLike, likes_count: willLike ? p.likes_count + 1 : p.likes_count - 1 };
    }));
    try {
      await likePost(postId);
    } catch (err) {
      setPosts((prev) => prev.map((p) => {
        if (p.id !== postId) return p;
        const revert = !p.liked_by_me;
        return { ...p, liked_by_me: revert, likes_count: revert ? p.likes_count + 1 : p.likes_count - 1 };
      }));
      toastError(apiError(err));
    }
  };

  const vote = async (postId: number, optionId: number) => {
    try {
      const res = await voteOnPoll(postId, optionId);
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, ...res.data } : p)));
    } catch (err) {
      toastError(apiError(err));
    }
  };

  /* create post */
  const submitPost = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      await createPost({ body: draft.trim(), category: "general" });
      setDraft("");
      toastSuccess("Post published to your community feed.");
      load();
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setPosting(false);
    }
  };

  /* delete post */
  const handleDeletePost = async (postId: number) => {
    const r = await confirmDelete({ title: "Delete this post?", text: "It will be removed from the community feed.", confirmText: "Delete" });
    if (r.isConfirmed) {
      try {
        await deletePost(postId);
        setPosts((prev) => prev.filter((p) => p.id !== postId));
        toastSuccess("Post deleted.");
      } catch (err) {
        toastError(apiError(err));
      }
    }
  };

  /* toggle comments visibility + load */
  const toggleComments = async (postId: number) => {
    setExpandedComments((s) => {
      const n = new Set(s);
      n.has(postId) ? n.delete(postId) : n.add(postId);
      return n;
    });
    if (!commentsByPost[postId]) {
      setLoadingComments((s) => new Set(s).add(postId));
      try {
        const comments = await fetchComments(postId);
        setCommentsByPost((prev) => ({ ...prev, [postId]: comments }));
      } catch (err) {
        toastError(apiError(err));
      } finally {
        setLoadingComments((s) => { const n = new Set(s); n.delete(postId); return n; });
      }
    }
  };

  /* add comment / reply */
  const handleAddComment = async (postId: number) => {
    const body = (commentDraft[postId] ?? "").trim();
    if (!body) return;
    const parentId = replyToByPost[postId]?.id ?? null;
    try {
      await addComment(postId, body, parentId);
      setCommentDraft((d) => ({ ...d, [postId]: "" }));
      setReplyToByPost((d) => ({ ...d, [postId]: null }));
      const updated = await fetchComments(postId);
      setCommentsByPost((prev) => ({ ...prev, [postId]: updated }));
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p));
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const handleReply = (postId: number, comment: ApiComment) => {
    setReplyToByPost((d) => ({
      ...d,
      [postId]: { id: comment.id, name: comment.author_name },
    }));
    setExpandedComments((s) => new Set(s).add(postId));
    requestAnimationFrame(() => commentInputRefs.current[postId]?.focus());
  };

  /* delete comment */
  const handleDeleteComment = async (postId: number, commentId: number) => {
    try {
      await deleteComment(postId, commentId);
      const updated = await fetchComments(postId);
      setCommentsByPost((prev) => ({ ...prev, [postId]: updated }));
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, comments_count: Math.max(0, p.comments_count - 1) } : p));
    } catch (err) {
      toastError(apiError(err));
    }
  };

  const visible = posts.filter((p) => {
    if (feedFilter === "events")  return p.category === "event";
    if (feedFilter === "updates") return p.category === "update";
    if (feedFilter === "help")    return p.category === "help";
    return true;
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: C.teal }}>
          Resident Portal
        </p>
        <h2 className="mt-1 text-[22px] font-bold tracking-tight" style={{ color: C.navy }}>
          Community Feed
        </h2>
        <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: C.muted }}>
          Connect, share, and stay informed with your neighbors.
        </p>
      </div>

      <div
        className="flex items-center gap-1 rounded-2xl p-1"
        style={{ background: C.white, border: `1px solid ${C.border}`, boxShadow: "0 1px 2px rgba(10, 42, 67, 0.04)" }}
      >
        {(["all", "events", "updates", "help"] as FeedFilter[]).map((f) => {
          const active = feedFilter === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFeedFilter(f)}
              className={`flex-1 rounded-xl py-2 text-[12.5px] font-semibold transition-colors ${
                active ? "" : "hover:bg-[#D1FAF5] hover:text-[#0A2A43]"
              }`}
              style={
                active
                  ? { background: C.primary, color: C.white }
                  : { color: C.muted }
              }
            >
              {f === "all" ? "All posts" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          );
        })}
      </div>

      {/* Composer */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm" style={{ border: `1px solid ${C.border}` }}>
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ background: C.navy }}>
              {myInitials}
            </div>
            <div className="flex-1">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`What's on your mind, ${myName.split(" ")[0]}?`}
                rows={draft ? 3 : 1}
                className="w-full resize-none rounded-xl border border-[rgba(10,42,67,0.10)] bg-[#F4F8FD] px-3.5 py-2.5 text-[13.5px] text-[#0A2A43] outline-none transition placeholder:text-[rgba(10,42,67,0.42)] focus:border-[#14B8A6] focus:bg-white focus:shadow-[0_0_0_3px_#D1FAF5]"
              />
            </div>
          </div>
          {draft && (
            <div className="mt-3 flex items-center justify-between gap-3 pt-3" style={{ borderTop: `1px solid ${C.borderSoft}` }}>
              <div className="flex items-center gap-2">
                <ComposerBtn icon={<IcoImage />} label="Photo" onClick={() => toastInfo("Photo upload coming soon.")} />
                <ComposerBtn icon={<IcoCalendar />} label="Event" onClick={() => toastInfo("Event creation coming soon.")} />
              </div>
              <button
                onClick={submitPost}
                disabled={posting || !draft.trim()}
                className="flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition disabled:opacity-50"
                style={{ background: C.primary }}
              >
                <IcoSend /> {posting ? "Posting…" : "Post"}
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? <PageLoader variant="cards" /> : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white py-12 text-center shadow-sm" style={{ border: `1px solid ${C.border}` }}>
          <div className="flex h-12 w-12 items-center justify-center rounded-full [&_svg]:h-6 [&_svg]:w-6" style={{ background: C.mint, color: C.teal }}>
            <IcoFeed />
          </div>
          <p className="text-[13.5px] font-medium" style={{ color: C.muted }}>No posts in this category yet.</p>
          <p className="text-[12.5px]" style={{ color: C.soft }}>Be the first to share something!</p>
        </div>
      ) : visible.map((post, idx) => {
        const commentsOpen  = expandedComments.has(post.id);
        const comments      = commentsByPost[post.id] ?? [];
        const loadingCmts   = loadingComments.has(post.id);
        return (
          <article
            key={post.id}
            id={`feed-post-${post.id}`}
            ref={String(post.id) === highlightPostId ? highlightedRef : undefined}
            className="overflow-hidden rounded-2xl bg-white shadow-sm"
            style={{
              border: `1px solid ${String(post.id) === highlightPostId ? C.primary : C.border}`,
              boxShadow: String(post.id) === highlightPostId ? `0 0 0 3px ${C.mint}` : undefined,
            }}
          >
            {/* Post header */}
            <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[12.5px] font-bold text-white"
                  style={{ background: ac(idx) }}>
                  {initialsOf(post.author_name)}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[14px] font-semibold" style={{ color: C.navy }}>{post.author_name}</p>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                      style={{ background: C.mint, color: CAT_TONE[post.category]?.color ?? C.navy }}
                    >
                      {CAT_LABEL[post.category] ?? post.category}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px]" style={{ color: C.soft }}>
                    {post.author_unit ?? "Resident"} · {formatFeedDate(post.created_at)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {post.is_mine && (
                  <button
                    onClick={() => handleDeletePost(post.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-[#D1FAF5] hover:text-[#0A2A43] [&_svg]:h-3.5 [&_svg]:w-3.5"
                    style={{ color: C.soft }}
                    aria-label="Delete post"
                  >
                    <IcoTrash />
                  </button>
                )}
                <button
                  onClick={() => toastInfo("More options coming soon.")}
                  className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-[#F4F8FD] hover:text-[#0A2A43] [&_svg]:h-4 [&_svg]:w-4"
                  style={{ color: C.soft }}
                  aria-label="More options"
                >
                  <IcoDots />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="px-5 pb-3">
              {post.poll ? (
                <PollBlock post={post} onVote={(optionId) => vote(post.id, optionId)} />
              ) : (
                <p className="whitespace-pre-line text-[14px] leading-relaxed" style={{ color: C.navy }}>{post.body}</p>
              )}
            </div>

            {/* Image */}
            {post.image_url && (
              <div className="mx-5 mb-3 overflow-hidden rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={post.image_url} alt="Post attachment" className="w-full object-cover" style={{ maxHeight: "340px" }} />
              </div>
            )}

            {/* Counts */}
            <div className="flex items-center justify-between px-5 py-2" style={{ borderTop: `1px solid ${C.borderSoft}` }}>
              <div className="flex items-center gap-1.5">
                {post.liked_by_me && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full [&_svg]:h-2.5 [&_svg]:w-2.5" style={{ background: C.mint, color: C.teal }}>
                    <IcoHeart />
                  </span>
                )}
                <span className="text-[12.5px]" style={{ color: C.muted }}>{post.likes_count} {post.likes_count === 1 ? "like" : "likes"}</span>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => toggleComments(post.id)} className="text-[12.5px] transition hover:opacity-80" style={{ color: C.muted }}>
                  {post.comments_count} {post.comments_count === 1 ? "comment" : "comments"}
                </button>
              </div>
            </div>

            {/* Action bar */}
            <div className="flex items-center px-2" style={{ borderTop: `1px solid ${C.borderSoft}` }}>
              <ReactionBtn
                active={post.liked_by_me}
                onClick={() => toggleLike(post.id)}
                icon={<IcoHeart />}
                label="Like"
                activeColor={C.teal}
              />
              <ReactionBtn
                active={false}
                onClick={() => toggleComments(post.id)}
                icon={<IcoComment />}
                label="Comment"
              />
              <ReactionBtn
                active={false}
                onClick={() => toastSuccess("Link copied to clipboard.")}
                icon={<IcoShare />}
                label="Share"
              />
            </div>

            {/* Comments section */}
            {commentsOpen && (
              <div className="px-5 py-4 space-y-3" style={{ borderTop: `1px solid ${C.borderSoft}`, background: C.canvas }}>
                {loadingCmts ? (
                  <div className="py-4 text-center text-[12px]" style={{ color: C.soft }}>Loading comments…</div>
                ) : buildCommentDisplayRows(comments, expandedThreadsByPost[post.id] ?? new Set()).map((row) => {
                  if (row.type === "view_all" || row.type === "hide") {
                    return (
                      <button
                        key={`${row.type}-${row.parentId}`}
                        type="button"
                        onClick={() => toggleThread(post.id, row.parentId)}
                        className="text-left text-[12px] font-semibold hover:opacity-80"
                        style={{ color: C.teal, paddingLeft: 24 }}
                      >
                        {row.type === "hide"
                          ? "Hide replies"
                          : `View all ${row.total} replies`}
                      </button>
                    );
                  }
                  const c = row.comment;
                  const depth = Math.max(0, Math.min(c.depth ?? 0, 2));
                  return (
                  <div
                    key={c.id}
                    className="flex min-w-0 items-start gap-2.5"
                    style={{ paddingLeft: depth > 0 ? depth * 24 : 0 }}
                  >
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ background: C.navy }}
                    >
                      {initialsOf(c.author_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className="inline-block max-w-full rounded-2xl rounded-tl-sm px-3.5 py-2"
                        style={{ background: C.white, border: `1px solid ${C.border}` }}
                      >
                        <p className="text-[12px] font-semibold" style={{ color: C.navy }}>{c.author_name}</p>
                        {c.parent_author_name && depth > 0 ? (
                          <p className="mb-0.5 text-[11px]" style={{ color: C.soft }}>
                            Replying to <span className="font-semibold" style={{ color: C.teal }}>{c.parent_author_name}</span>
                          </p>
                        ) : null}
                        <p className="text-[13px] leading-snug" style={{ color: C.navy }}>{c.body}</p>
                      </div>
                      <div className="mt-1 flex items-center gap-2.5 px-1">
                        <p className="text-[11px]" style={{ color: C.soft }}>{formatFeedDate(c.created_at)}</p>
                        <button
                          type="button"
                          onClick={() => handleReply(post.id, c)}
                          className="text-[11px] font-semibold transition hover:opacity-80"
                          style={{ color: C.teal }}
                        >
                          Reply
                        </button>
                        {c.is_mine ? (
                          <button
                            type="button"
                            onClick={() => handleDeleteComment(post.id, c.id)}
                            className="text-[11px] transition hover:opacity-80"
                            style={{ color: C.soft }}
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  );
                })}

                {/* Write a comment / reply */}
                <div className="pt-1 space-y-2">
                  {replyToByPost[post.id] ? (
                    <div className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-[12px]" style={{ background: C.mint, color: C.navy }}>
                      <span className="flex-1 truncate">
                        Replying to <strong>{replyToByPost[post.id]?.name}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setReplyToByPost((d) => ({ ...d, [post.id]: null }))}
                        className="font-semibold hover:opacity-80"
                        style={{ color: C.teal }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: C.navy }}>
                      {myInitials}
                    </div>
                    <div
                      className="flex flex-1 items-center gap-2 rounded-full px-3.5 py-1.5"
                      style={{ background: C.white, border: `1px solid ${C.border}` }}
                    >
                      <input
                        ref={(el) => { commentInputRefs.current[post.id] = el; }}
                        type="text"
                        value={commentDraft[post.id] ?? ""}
                        onChange={(e) => setCommentDraft((d) => ({ ...d, [post.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") handleAddComment(post.id); }}
                        placeholder={
                          replyToByPost[post.id]
                            ? `Reply to ${replyToByPost[post.id]?.name}…`
                            : post.poll
                              ? "Add a thought..."
                              : "Write a comment…"
                        }
                        className="flex-1 bg-transparent text-[13px] outline-none"
                        style={{ color: C.navy }}
                      />
                      <button
                        onClick={() => handleAddComment(post.id)}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-white disabled:opacity-40 [&_svg]:h-2.5 [&_svg]:w-2.5"
                        style={{ background: C.primary }}
                        disabled={!(commentDraft[post.id] ?? "").trim()}
                        aria-label="Send comment"
                      >
                        <IcoSend />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </article>
        );
      })}

    </div>
  );
}

/* ─── Sub-components ─── */
function pollTimeLeft(endsAt: string, closed: boolean) {
  if (closed) return "Poll closed";
  const end = new Date(endsAt);
  const diff = end.getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return "Poll closed";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Less than a minute left";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} left`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} left`;
}

function PollBlock({ post, onVote }: { post: ApiPost; onVote: (optionId: number) => void }) {
  const poll = post.poll;
  const [selected, setSelected] = useState<number | null>(poll?.voted_option_id ?? null);
  if (!poll) return null;
  const isMultiple = poll.voting_method === "multiple";
  const votedIds = poll.voted_option_ids ?? [];
  const closed = poll.closed || pollTimeLeft(poll.ends_at, false) === "Poll closed";
  const showResults = poll.results_visible || closed;
  const time = pollTimeLeft(poll.ends_at, closed);
  return (
    <div className="space-y-3">
      <p className="text-[15px] font-semibold leading-snug" style={{ color: C.navy }}>{poll.question}</p>
      {poll.description ? <p className="text-[13.5px] leading-relaxed" style={{ color: C.navy }}>{poll.description}</p> : null}
      <p className="text-[12px]" style={{ color: C.soft }}>This poll is for community feedback.</p>
      <div className="space-y-2">
        {poll.options.map((option) => {
          const picked = isMultiple
            ? votedIds.includes(option.id)
            : selected === option.id || poll.voted_option_id === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={showResults}
              onClick={() => {
                if (isMultiple) {
                  onVote(option.id);
                  return;
                }
                setSelected(option.id);
              }}
              className="relative w-full overflow-hidden rounded-xl border px-3 py-2.5 text-left"
              style={{ borderColor: picked ? "#1B4F8A" : C.border }}
            >
              {showResults ? (
                <span className="absolute inset-y-0 left-0" style={{ width: `${option.percent ?? 0}%`, background: C.mint }} />
              ) : null}
              <span className="relative flex items-center justify-between gap-3 text-[13.5px]" style={{ color: C.navy }}>
                <span>{option.label}</span>
                {showResults ? <span className="font-semibold">{option.percent ?? 0}%</span> : null}
              </span>
            </button>
          );
        })}
      </div>
      {showResults ? (
        <p className="text-[12px]" style={{ color: C.soft }}>
          {poll.total_votes ?? 0} {(poll.total_votes ?? 0) === 1 ? "vote" : "votes"} · {closed ? "Poll closed" : time}
        </p>
      ) : isMultiple ? (
        <p className="text-[12px]" style={{ color: C.soft }}>
          {time} · Tap each option you agree with
        </p>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px]" style={{ color: C.soft }}>{time}</p>
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && onVote(selected)}
            className="rounded-lg px-4 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
            style={{ background: "#1B4F8A" }}
          >
            Vote
          </button>
        </div>
      )}
    </div>
  );
}

function ReactionBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  activeColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12.5px] font-semibold transition hover:bg-[#D1FAF5] [&_svg]:h-4 [&_svg]:w-4"
      style={{ color: active ? C.teal : C.muted }}
    >
      {icon} {label}
    </button>
  );
}

function ComposerBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition hover:bg-[#D1FAF5] hover:text-[#0A2A43] [&_svg]:h-4 [&_svg]:w-4"
      style={{ color: C.muted }}
    >
      {icon} {label}
    </button>
  );
}

/* ─── Icons ─── */
function IcoHeart()    { return <svg viewBox="0 0 24 24" fill="none"><path d="M12 21C8 18 3 14 3 8.5A4.5 4.5 0 0112 6a4.5 4.5 0 019 2.5c0 5.5-5 9.5-9 12.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>; }
function IcoComment()  { return <svg viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>; }
function IcoShare()    { return <svg viewBox="0 0 24 24" fill="none"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M16 6l-4-4-4 4M12 2v13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IcoImage()    { return <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.7"/><circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M21 15l-5-5-5 5.5L8 13l-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IcoCalendar() { return <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M8 2v4M16 2v4M3 10h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>; }
function IcoSend()     { return <svg viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M22 2L15 22l-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IcoFeed()     { return <svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8"/><path d="M3 20c0-3.3 2.7-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M15 12h6M15 16h4M15 20h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
function IcoTrash()    { return <svg viewBox="0 0 20 20" fill="none"><path d="M6 7h8M8 7V5h4v2M7 7l1 9h4l1-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IcoDots()     { return <svg viewBox="0 0 20 20" fill="currentColor"><circle cx="10" cy="4" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="10" cy="16" r="1.5"/></svg>; }
