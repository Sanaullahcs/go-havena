"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminActionsMenu } from "@/components/admin/admin-actions-menu";
import { AdminBadge, StatTile, DataTable, DtTable, DtHead, DtRow, DtCell, DtPagination } from "@/components/admin/ui";
import { confirmAction, confirmRejectWithReason, toastSuccess, toastError } from "@/lib/alert";
import {
  fetchAdminPosts,
  approvePost,
  rejectPost,
  postStatusLabel,
  type AdminPost,
  type AdminPostStats,
  type PostStatus,
} from "@/lib/api/posts";
import { apiError } from "@/lib/api/client";
import { getManagedCommunityId, isSystemAdminUser } from "@/lib/auth/session";
import { PageLoader, PageError } from "@/components/shared/page-states";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ADMIN_TABLE_PAGE_SIZE } from "@/lib/admin/table-pagination";

type Filter = "all" | PostStatus;

const EMPTY_STATS: AdminPostStats = { total: 0, pending: 0, approved: 0, rejected: 0 };

const STATUS_META: Record<PostStatus, { tone: "green" | "amber" | "red"; label: string }> = {
  approved: { tone: "green", label: "Published" },
  pending:  { tone: "amber", label: "Pending" },
  rejected: { tone: "red",   label: "Rejected" },
};

export default function AdminFeedPage() {
  const searchParams = useSearchParams();
  const highlightPostId = searchParams.get("post");
  const initialFilter = (searchParams.get("status") as Filter | null) ?? (highlightPostId ? "all" : "pending");
  const [filter, setFilter] = useState<Filter>(
    ["all", "approved", "pending", "rejected"].includes(initialFilter) ? initialFilter : "pending",
  );
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const [page, setPage] = useState(1);
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [stats, setStats] = useState<AdminPostStats>(EMPTY_STATS);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<number | null>(null);

  const runModeration = async (postId: number, fn: () => Promise<void>) => {
    if (actionId !== null) return;
    setActionId(postId);
    try {
      await fn();
      await load(true);
    } catch (err) {
      toastError(apiError(err));
    } finally {
      setActionId(null);
    }
  };

  const handleApprove = async (post: AdminPost) => {
    const isReapproval = post.status === "rejected";
    const r = await confirmAction({
      title: isReapproval ? "Re-approve this post?" : "Publish this post?",
      text: isReapproval
        ? `It will become visible again in ${post.community_name ?? "the community"} feed.`
        : `It will become visible to members of ${post.community_name ?? "the community"}.`,
      confirmText: isReapproval ? "Re-approve" : "Approve",
      color: "blue",
    });
    if (!r.isConfirmed) return;
    await runModeration(post.id, async () => {
      await approvePost(post.id);
      toastSuccess(isReapproval ? "Post re-approved and published." : "Post approved and published.");
    });
  };

  const handleReject = async (post: AdminPost) => {
    const isUnpublish = post.status === "approved";
    const r = await confirmRejectWithReason({
      title: isUnpublish ? "Remove this post from the feed?" : "Reject this post?",
      text: isUnpublish
        ? "The post will be hidden from the community feed. You can re-approve it later."
        : "The author will be notified. This post will not appear in the feed.",
      confirmText: isUnpublish ? "Remove from feed" : "Reject",
    });
    if (!r.isConfirmed) return;
    await runModeration(post.id, async () => {
      await rejectPost(post.id, String(r.value ?? "").trim() || undefined);
      toastSuccess(isUnpublish ? "Post removed from the feed." : "Post rejected.");
    });
  };

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    setError(null);
    try {
      const scopedCommunityId = isSystemAdminUser() ? "all" : getManagedCommunityId();
      const res = await fetchAdminPosts({
        page,
        per_page: ADMIN_TABLE_PAGE_SIZE,
        ...(scopedCommunityId ? { community_id: scopedCommunityId } : { community_id: "all" }),
        ...(filter !== "all" ? { status: filter } : {}),
        ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
      });
      setPosts(res.data);
      setTotal(res.meta.total);
      setLastPage(res.meta.last_page);
      if (res.meta.stats) setStats(res.meta.stats);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter, debouncedSearch, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [filter, debouncedSearch]);

  useEffect(() => {
    if (!highlightPostId || posts.length === 0) return;
    const el = document.getElementById(`feed-post-${highlightPostId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightPostId, posts]);

  const statTiles = useMemo(() => [
    { label: "Total Posts", value: String(stats.total), hint: "All communities", tone: "blue" as const, icon: <IcoFeed /> },
    { label: "Pending Review", value: String(stats.pending), hint: "Awaiting approval", tone: "amber" as const, icon: <IcoClock /> },
    { label: "Published", value: String(stats.approved), hint: "Live in feeds", tone: "green" as const, icon: <IcoCheck /> },
    { label: "Rejected", value: String(stats.rejected), hint: "Not published", tone: "slate" as const, icon: <IcoBan /> },
  ], [stats]);

  const filters = (["all", "pending", "approved", "rejected"] as Filter[]).map((f) => ({
    key: f,
    label: f === "all" ? "All" : STATUS_META[f as PostStatus]?.label ?? f,
    count: f === "all" ? stats.total : stats[f as keyof AdminPostStats] ?? 0,
  }));

  if (loading) return <PageLoader skeleton />;
  if (error) return <PageError message={error} onRetry={() => load()} />;

  return (
    <div className="space-y-6">
      <div>
        <p className="nl-eyebrow">Community</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Feed moderation</h2>
        <p className="mt-1 text-sm text-slate-500">
          Posts publish to the feed immediately. Remove posts that break guidelines, or re-approve posts you previously rejected.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statTiles.map((s) => <StatTile key={s.label} {...s} />)}
      </div>

      <DataTable
        title="Community posts"
        totalCount={total}
        visibleCount={posts.length}
        search={searchInput}
        onSearch={setSearchInput}
        searchPlaceholder="Search by author, community, or content…"
        filters={filters}
        activeFilter={filter}
        onFilter={(key) => setFilter(key as Filter)}
        isEmpty={posts.length === 0}
        empty="No posts match your filters."
        searching={refreshing}
      >
        <DtTable>
          <DtHead cols={[
            { label: "Post" },
            { label: "Community" },
            { label: "Category" },
            { label: "Submitted" },
            { label: "Status" },
            { label: "", right: true },
          ]} />
          <tbody>
            {posts.map((post) => {
              const st = STATUS_META[post.status] ?? STATUS_META.pending;
              const busy = actionId === post.id;
              const highlighted = highlightPostId && String(post.id) === highlightPostId;
              return (
                <DtRow
                  key={post.id}
                  id={`feed-post-${post.id}`}
                  muted={post.status === "rejected"}
                  className={highlighted ? "bg-blue-50/80 ring-2 ring-blue-200 ring-inset" : undefined}
                >
                  <DtCell first>
                    <p className="font-semibold text-slate-900">{post.author_name}</p>
                    <p className="mt-1 line-clamp-2 text-[12.5px] text-slate-500">{post.body}</p>
                  </DtCell>
                  <DtCell nowrap muted>{post.community_name ?? "—"}</DtCell>
                  <DtCell nowrap>{post.tag}</DtCell>
                  <DtCell nowrap muted>
                    {new Date(post.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </DtCell>
                  <DtCell>
                    <AdminBadge tone={st.tone}>{postStatusLabel(post.status)}</AdminBadge>
                  </DtCell>
                  <DtCell last right>
                    <AdminActionsMenu
                      disabled={busy}
                      actions={[
                        {
                          label: post.status === "rejected" ? "Re-approve" : "Approve",
                          icon: "approve",
                          tone: "primary",
                          hidden: !(post.status === "pending" || post.status === "rejected"),
                          onClick: () => handleApprove(post),
                        },
                        {
                          label: post.status === "approved" ? "Remove from feed" : "Reject",
                          icon: "ban",
                          tone: "danger",
                          hidden: !(post.status === "pending" || post.status === "approved"),
                          onClick: () => handleReject(post),
                        },
                      ]}
                    />
                  </DtCell>
                </DtRow>
              );
            })}
          </tbody>
        </DtTable>
        <DtPagination
          showing={posts.length}
          total={total}
          page={page}
          lastPage={lastPage}
          onPageChange={setPage}
        />
      </DataTable>
    </div>
  );
}

function IcoFeed()  { return <svg viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h10M4 18h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
function IcoClock() { return <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/><path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>; }
function IcoCheck() { return <svg viewBox="0 0 20 20" fill="none"><path d="M5 10l4 4 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
function IcoBan()   { return <svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6"/><path d="M5.5 5.5l9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>; }
